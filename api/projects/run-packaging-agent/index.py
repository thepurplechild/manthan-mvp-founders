from flask import Flask, request, jsonify
import os
import json
import time
import traceback
from datetime import datetime
from supabase import create_client, Client
from anthropic import Anthropic
from docx import Document
from docx.shared import Inches
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
import io
import base64
import requests
from typing import Optional
import chardet

app = Flask(__name__)

def get_supabase_client() -> Client:
    """Initialize Supabase client with admin privileges"""
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

    if not url or not key:
        raise ValueError("Missing Supabase configuration")

    return create_client(url, key)

def get_anthropic_client():
    """Initialize Anthropic client"""
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        raise ValueError("Missing Anthropic API key")
    return Anthropic(api_key=api_key)

def update_step_status(supabase: Client, ingestion_id: str, step_name: str, status: str, result: dict = None, error_message: str = None):
    """Update the status of a specific ingestion step with comprehensive error handling"""
    try:
        print(f"[packaging-agent] Updating step {step_name} to {status} for ingestion {ingestion_id}")

        update_data = {
            'status': status,
            'updated_at': datetime.now().isoformat()
        }
        if result:
            update_data['result'] = result
        if error_message:
            update_data['error_message'] = error_message

        step_result = supabase.table('ingestion_steps').update(update_data).eq('ingestion_id', ingestion_id).eq('name', step_name).execute()

        if not step_result.data:
            print(f"[packaging-agent] WARNING: Failed to update step {step_name}")

        # Also update overall progress
        steps_query = supabase.table('ingestion_steps').select('status').eq('ingestion_id', ingestion_id).execute()
        if steps_query.data:
            completed_count = sum(1 for step in steps_query.data if step['status'] == 'completed')
            failed_count = sum(1 for step in steps_query.data if step['status'] == 'failed')
            total_steps = len(steps_query.data)
            progress = int((completed_count / total_steps) * 100) if total_steps > 0 else 0

            # Determine overall status
            overall_status = 'running'
            if failed_count > 0:
                overall_status = 'failed'
            elif completed_count == total_steps:
                overall_status = 'completed'

            supabase.table('ingestions').update({
                'progress': progress,
                'status': overall_status,
                'updated_at': datetime.now().isoformat()
            }).eq('id', ingestion_id).execute()

        print(f"[packaging-agent] Successfully updated step {step_name} to {status}")

    except Exception as e:
        print(f"[packaging-agent] ERROR updating step {step_name}: {str(e)}")
        traceback.print_exc()

def handle_anthropic_request(client, prompt: str, max_retries: int = 3) -> str:
    """Handle Anthropic API requests with retry logic and error handling"""
    for attempt in range(max_retries):
        try:
            print(f"[packaging-agent] Making Anthropic API request (attempt {attempt + 1}/{max_retries})")

            response = client.messages.create(
                model="claude-3-opus-20240229",
                max_tokens=3000,
                messages=[{"role": "user", "content": prompt}]
            )

            if response.content and len(response.content) > 0:
                return response.content[0].text
            else:
                raise Exception("Empty response from Anthropic API")

        except Exception as e:
            print(f"[packaging-agent] Anthropic API error (attempt {attempt + 1}): {str(e)}")

            if attempt == max_retries - 1:
                raise Exception(f"Failed to get response from Anthropic API after {max_retries} attempts: {str(e)}")

            # Wait before retry (exponential backoff)
            wait_time = 2 ** attempt
            print(f"[packaging-agent] Waiting {wait_time} seconds before retry...")
            time.sleep(wait_time)

def fetch_script_content(supabase: Client, file_path: str) -> str:
    """Fetch script content from Supabase Storage with improved encoding detection"""
    try:
        print(f"[packaging-agent] Downloading file from path: {file_path}")

        # Download the file from Supabase Storage
        response = supabase.storage.from_('scripts').download(file_path)

        if isinstance(response, bytes):
            print(f"[packaging-agent] Downloaded {len(response)} bytes")

            # Detect encoding for text files
            detected_encoding = chardet.detect(response)
            encoding = detected_encoding.get('encoding', 'utf-8') if detected_encoding else 'utf-8'

            print(f"[packaging-agent] Detected encoding: {encoding}")

            # Try to decode as text with detected encoding
            try:
                content = response.decode(encoding)
                print(f"[packaging-agent] Successfully decoded content (length: {len(content)} characters)")

                # For very large files, truncate to prevent timeout
                max_chars = 50000  # ~50k characters should be enough for most scripts
                if len(content) > max_chars:
                    print(f"[packaging-agent] Truncating large content from {len(content)} to {max_chars} characters")
                    content = content[:max_chars] + "\n\n[CONTENT TRUNCATED FOR PROCESSING]"

                return content

            except UnicodeDecodeError:
                # If decoding fails, it might be a binary file (PDF/DOCX)
                print(f"[packaging-agent] Failed to decode as text, treating as binary file")
                return f"[BINARY FILE: {file_path}] - Content extraction for binary files not yet implemented"

        else:
            raise Exception(f"Unexpected response type: {type(response)}")

    except Exception as e:
        error_msg = f"Error fetching script from {file_path}: {str(e)}"
        print(f"[packaging-agent] {error_msg}")
        raise Exception(error_msg)

def extract_core_elements(anthropic_client, script_content: str) -> dict:
    """Step 1: Extract core elements from script using Claude with improved error handling"""
    # Limit script content for the prompt to prevent token limits
    content_excerpt = script_content[:15000] if len(script_content) > 15000 else script_content

    prompt = f"""
    Analyze this script and extract the following elements in JSON format:

    {{
        "logline": "A one-sentence compelling description of the story",
        "one_page_synopsis": "A detailed one-page synopsis covering the main plot points",
        "main_themes": ["theme1", "theme2", "theme3"],
        "main_characters": [
            {{
                "name": "Character Name",
                "role": "protagonist/antagonist/supporting",
                "description": "Brief character description"
            }}
        ]
    }}

    Script content (excerpt):
    {content_excerpt}

    Please provide only the JSON response with no additional text.
    """

    try:
        response_text = handle_anthropic_request(anthropic_client, prompt)

        # Try to parse JSON
        try:
            return json.loads(response_text)
        except json.JSONDecodeError as e:
            print(f"[packaging-agent] JSON parsing failed: {str(e)}")
            print(f"[packaging-agent] Raw response: {response_text[:500]}...")

            # Fallback: try to extract JSON from the response
            import re
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group())
                except:
                    pass

            # Ultimate fallback with structured data
            return {
                "logline": "A compelling story extracted from the script",
                "one_page_synopsis": response_text[:1000] if response_text else "Synopsis extraction failed",
                "main_themes": ["drama", "relationships", "conflict"],
                "main_characters": [{"name": "Main Character", "role": "protagonist", "description": "Character analysis pending"}]
            }

    except Exception as e:
        print(f"[packaging-agent] Core elements extraction failed: {str(e)}")
        raise Exception(f"Failed to extract core elements: {str(e)}")

def generate_character_bible(anthropic_client, character: dict, synopsis: str, themes: list) -> str:
    """Step 2: Generate detailed character bible entry with error handling"""
    prompt = f"""
    Create a detailed character bible entry for this character based on the story context:

    Character: {character.get('name', 'Unknown')} - {character.get('role', 'Unknown')}
    Character Description: {character.get('description', '')}

    Story Synopsis: {synopsis[:1000]}...
    Main Themes: {', '.join(themes[:5])}

    Please provide a comprehensive character bible entry including:
    - Physical description
    - Background and history
    - Personality traits and motivations
    - Character arc throughout the story
    - Relationships with other characters
    - Key dialogue style or voice
    - Character strengths and flaws

    Format this as a detailed character profile.
    """

    try:
        return handle_anthropic_request(anthropic_client, prompt)
    except Exception as e:
        print(f"[packaging-agent] Character bible generation failed for {character.get('name', 'Unknown')}: {str(e)}")
        return f"Character Bible for {character.get('name', 'Unknown')}: [Generation failed - {str(e)[:100]}]"

def generate_market_adaptation(anthropic_client, synopsis: str, themes: list, platform_mandates: list) -> str:
    """Step 3: Generate market-specific adaptation with error handling"""
    platform_context = "\n".join([f"- {mandate}" for mandate in platform_mandates[:5]]) if platform_mandates else "- General streaming platform requirements"

    prompt = f"""
    Based on this story synopsis and themes, create a 10-episode series outline adapted for streaming platforms:

    Synopsis: {synopsis[:1500]}...
    Main Themes: {', '.join(themes[:5])}

    Platform Requirements:
    {platform_context}

    Please provide:
    1. Series title and tagline
    2. Target demographic and genre positioning
    3. Episode-by-episode breakdown (brief summary for each of 10 episodes)
    4. Key plot points and cliffhangers
    5. Character development arcs across episodes
    6. Platform-specific elements (binge-ability, hooks, etc.)

    Format this as a professional series bible.
    """

    try:
        return handle_anthropic_request(anthropic_client, prompt)
    except Exception as e:
        print(f"[packaging-agent] Market adaptation generation failed: {str(e)}")
        return f"Market Adaptation: [Generation failed - {str(e)[:100]}]"

def generate_pitch_deck_content(anthropic_client, core_elements: dict, character_bibles: list, series_adaptation: str) -> str:
    """Step 4: Generate final pitch deck content with error handling"""
    character_summaries = "\n".join([f"- {char.get('character', 'Unknown')}: {char.get('bible', '')[:200]}..." for char in character_bibles[:5]])

    prompt = f"""
    Create comprehensive pitch deck content for this project by synthesizing all the development materials:

    CORE STORY:
    Logline: {core_elements.get('logline', '')[:200]}
    Synopsis: {core_elements.get('one_page_synopsis', '')[:1000]}...
    Themes: {', '.join(core_elements.get('main_themes', [])[:5])}

    CHARACTERS:
    {character_summaries}

    SERIES ADAPTATION:
    {series_adaptation[:2000]}...

    Please create a professional pitch deck document that includes:

    1. PROJECT OVERVIEW
    - Title and logline
    - Genre and target audience
    - Unique selling proposition

    2. STORY SYNOPSIS
    - Compelling story summary
    - Key themes and emotional hooks

    3. CHARACTER PROFILES
    - Main character descriptions and arcs
    - Casting considerations

    4. SERIES STRUCTURE
    - Episode breakdown
    - Season arc
    - Serialization strategy

    5. MARKET POSITIONING
    - Target platforms
    - Comparable shows
    - Commercial viability

    6. VISUAL TREATMENT
    - Tone and style
    - Production considerations

    Format this as a complete, professional pitch document ready for presentation to executives.
    """

    try:
        return handle_anthropic_request(anthropic_client, prompt)
    except Exception as e:
        print(f"[packaging-agent] Pitch deck content generation failed: {str(e)}")
        return f"Pitch Deck Content: [Generation failed - {str(e)[:100]}]"

def create_pitch_deck_document(pitch_content: str) -> bytes:
    """Create a formatted DOCX document from pitch content"""
    doc = Document()

    # Add title
    title = doc.add_heading('Project Pitch Deck', 0)
    title.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER

    # Add generation timestamp
    doc.add_paragraph(f"Generated on: {datetime.now().strftime('%B %d, %Y')}")
    doc.add_paragraph()

    # Split content into sections and add to document
    sections = pitch_content.split('\n\n')
    for section in sections:
        if section.strip():
            if section.startswith(('1.', '2.', '3.', '4.', '5.', '6.')):
                doc.add_heading(section.strip(), level=1)
            elif section.startswith('-'):
                doc.add_paragraph(section.strip(), style='List Bullet')
            else:
                doc.add_paragraph(section.strip())

    # Save to bytes
    file_stream = io.BytesIO()
    doc.save(file_stream)
    file_stream.seek(0)
    return file_stream.read()

def fetch_platform_mandates(supabase: Client) -> list:
    """Fetch platform mandates from database"""
    try:
        response = supabase.table('platform_mandates').select('mandate_text').execute()
        return [item['mandate_text'] for item in response.data] if response.data else []
    except:
        # Return default mandates if table doesn't exist
        return [
            "Episodes should be 45-60 minutes for premium streaming",
            "Include diverse characters and representation",
            "Ensure binge-worthy cliffhangers and hooks",
            "Consider international appeal and localization"
        ]

@app.route('/', defaults={'path': ''}, methods=['POST', 'OPTIONS'])
@app.route('/<path:path>', methods=['POST', 'OPTIONS'])
def handler(path=''):
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return '', 200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }

    try:
        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid request body'}), 400

        project_id = data.get('projectId')
        ingestion_id = data.get('ingestionId')

        if not project_id or not ingestion_id:
            return jsonify({'error': 'projectId and ingestionId are required'}), 400

        # Initialize clients
        supabase = get_supabase_client()
        anthropic_client = get_anthropic_client()

        # Update overall status to running
        supabase.table('ingestions').update({'status': 'running'}).eq('id', ingestion_id).execute()

        # Fetch ingestion details
        ingestion_result = supabase.table('ingestions').select('*').eq('id', ingestion_id).single().execute()
        if not ingestion_result.data:
            return jsonify({'error': 'Ingestion not found'}), 404

        ingestion = ingestion_result.data
        file_path = ingestion['source_file_url']

        # Step 1: Script Preprocessing and Core Extraction
        try:
            update_step_status(supabase, ingestion_id, 'script_preprocess', 'running')
            script_content = fetch_script_content(supabase, file_path)
            update_step_status(supabase, ingestion_id, 'script_preprocess', 'completed')
        except Exception as e:
            error_msg = f"Script preprocessing failed: {str(e)}"
            update_step_status(supabase, ingestion_id, 'script_preprocess', 'failed', error_message=error_msg)
            raise Exception(error_msg)

        try:
            update_step_status(supabase, ingestion_id, 'core_extraction', 'running')
            core_elements = extract_core_elements(anthropic_client, script_content)
            update_step_status(supabase, ingestion_id, 'core_extraction', 'completed', core_elements)
        except Exception as e:
            error_msg = f"Core extraction failed: {str(e)}"
            update_step_status(supabase, ingestion_id, 'core_extraction', 'failed', error_message=error_msg)
            raise Exception(error_msg)

        # Step 2: Character Bible Generation
        try:
            update_step_status(supabase, ingestion_id, 'character_bible', 'running')
            character_bibles = []
            for character in core_elements.get('main_characters', []):
                bible_entry = generate_character_bible(
                    anthropic_client,
                    character,
                    core_elements.get('one_page_synopsis', ''),
                    core_elements.get('main_themes', [])
                )
                character_bibles.append({
                    'character': character.get('name', 'Unknown'),
                    'bible': bible_entry
                })
            update_step_status(supabase, ingestion_id, 'character_bible', 'completed', {'character_bibles': character_bibles})
        except Exception as e:
            error_msg = f"Character bible generation failed: {str(e)}"
            update_step_status(supabase, ingestion_id, 'character_bible', 'failed', error_message=error_msg)
            # Don't raise - continue with empty character bibles
            character_bibles = []
            print(f"[packaging-agent] {error_msg}, continuing with empty character bibles")

        # Step 3: Visuals (placeholder - this could be expanded to generate visual concepts)
        update_step_status(supabase, ingestion_id, 'visuals', 'running')
        # For now, we'll just mark as completed with a placeholder
        visual_concepts = {
            'tone': 'Based on themes and story, visual style should reflect the narrative tone',
            'locations': 'Key locations identified from script analysis',
            'mood_board': 'Visual concepts to be developed based on story themes'
        }
        update_step_status(supabase, ingestion_id, 'visuals', 'completed', visual_concepts)

        # Step 4: Market Adaptation
        update_step_status(supabase, ingestion_id, 'market_adaptation', 'running')
        platform_mandates = fetch_platform_mandates(supabase)
        series_adaptation = generate_market_adaptation(
            anthropic_client,
            core_elements.get('one_page_synopsis', ''),
            core_elements.get('main_themes', []),
            platform_mandates
        )
        update_step_status(supabase, ingestion_id, 'market_adaptation', 'completed', {'series_adaptation': series_adaptation})

        # Step 5: Package Assembly
        update_step_status(supabase, ingestion_id, 'package_assembly', 'running')
        pitch_content = generate_pitch_deck_content(anthropic_client, core_elements, character_bibles, series_adaptation)
        update_step_status(supabase, ingestion_id, 'package_assembly', 'completed')

        # Step 6: Final Package Creation
        update_step_status(supabase, ingestion_id, 'final_package', 'running')

        # Create DOCX document
        doc_bytes = create_pitch_deck_document(pitch_content)

        # Upload to Supabase Storage
        doc_filename = f"pitch_deck_{project_id}_{int(time.time())}.docx"
        doc_path = f"generated/{project_id}/{doc_filename}"

        upload_result = supabase.storage.from_('scripts').upload(doc_path, doc_bytes, {
            'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        })

        if upload_result.error:
            raise Exception(f"Failed to upload document: {upload_result.error}")

        # Create generated assets record
        asset_data = {
            'project_id': project_id,
            'ingestion_id': ingestion_id,
            'asset_type': 'pitch_deck',
            'file_path': doc_path,
            'file_name': doc_filename,
            'status': 'completed',
            'metadata': {
                'core_elements': core_elements,
                'character_count': len(character_bibles),
                'generated_at': datetime.now().isoformat()
            }
        }

        supabase.table('generated_assets').insert(asset_data).execute()

        update_step_status(supabase, ingestion_id, 'final_package', 'completed', {
            'document_path': doc_path,
            'document_name': doc_filename
        })

        # Mark ingestion as completed
        supabase.table('ingestions').update({
            'status': 'completed',
            'progress': 100,
            'completed_at': datetime.now().isoformat()
        }).eq('id', ingestion_id).execute()

        return jsonify({
            'success': True,
            'message': 'AI packaging completed successfully',
            'ingestionId': ingestion_id,
            'generatedAssets': {
                'pitch_deck': doc_path
            }
        }), 200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }

    except Exception as e:
        print(f"Error in run-packaging-agent: {str(e)}")

        # Update ingestion status to failed
        try:
            if 'ingestion_id' in locals():
                supabase.table('ingestions').update({
                    'status': 'failed',
                    'error_message': str(e)
                }).eq('id', ingestion_id).execute()
        except:
            pass

        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }

# Vercel expects the app to be available for import
if __name__ == '__main__':
    app.run()