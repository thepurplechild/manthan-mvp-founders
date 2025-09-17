from flask import Flask, request, jsonify
import os
import json
import time
from datetime import datetime
from supabase import create_client, Client
from anthropic import Anthropic
from docx import Document
from docx.shared import Inches
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
import io
import base64

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

def update_step_status(supabase: Client, ingestion_id: str, step_name: str, status: str, result: dict = None):
    """Update the status of a specific ingestion step"""
    try:
        update_data = {
            'status': status,
            'updated_at': datetime.now().isoformat()
        }
        if result:
            update_data['result'] = result

        supabase.table('ingestion_steps').update(update_data).eq('ingestion_id', ingestion_id).eq('name', step_name).execute()

        # Also update overall progress
        if status == 'completed':
            # Count completed steps to calculate progress
            steps = supabase.table('ingestion_steps').select('status').eq('ingestion_id', ingestion_id).execute()
            completed_count = sum(1 for step in steps.data if step['status'] == 'completed')
            total_steps = len(steps.data)
            progress = int((completed_count / total_steps) * 100) if total_steps > 0 else 0

            supabase.table('ingestions').update({
                'progress': progress,
                'status': 'completed' if completed_count == total_steps else 'running'
            }).eq('id', ingestion_id).execute()

        print(f"Updated step {step_name} to {status} for ingestion {ingestion_id}")
    except Exception as e:
        print(f"Error updating step {step_name}: {str(e)}")

def fetch_script_content(supabase: Client, file_path: str) -> str:
    """Fetch script content from Supabase Storage"""
    try:
        # Download the file from Supabase Storage
        response = supabase.storage.from_('scripts').download(file_path)

        if isinstance(response, bytes):
            # Try to decode as text (for .txt files)
            try:
                return response.decode('utf-8')
            except:
                # For binary files like PDF/DOCX, return base64 encoded
                return base64.b64encode(response).decode('utf-8')
        else:
            raise Exception("Failed to download file")
    except Exception as e:
        raise Exception(f"Error fetching script: {str(e)}")

def extract_core_elements(anthropic_client, script_content: str) -> dict:
    """Step 1: Extract core elements from script using Claude"""
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

    Script content:
    {script_content[:10000]}...

    Please provide only the JSON response with no additional text.
    """

    response = anthropic_client.messages.create(
        model="claude-3-opus-20240229",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )

    try:
        return json.loads(response.content[0].text)
    except:
        # Fallback if JSON parsing fails
        return {
            "logline": "A compelling story extracted from the script",
            "one_page_synopsis": response.content[0].text,
            "main_themes": ["drama", "relationships", "conflict"],
            "main_characters": []
        }

def generate_character_bible(anthropic_client, character: dict, synopsis: str, themes: list) -> str:
    """Step 2: Generate detailed character bible entry"""
    prompt = f"""
    Create a detailed character bible entry for this character based on the story context:

    Character: {character.get('name', 'Unknown')} - {character.get('role', 'Unknown')}
    Character Description: {character.get('description', '')}

    Story Synopsis: {synopsis}
    Main Themes: {', '.join(themes)}

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

    response = anthropic_client.messages.create(
        model="claude-3-opus-20240229",
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}]
    )

    return response.content[0].text

def generate_market_adaptation(anthropic_client, synopsis: str, themes: list, platform_mandates: list) -> str:
    """Step 3: Generate market-specific adaptation"""
    platform_context = "\n".join([f"- {mandate}" for mandate in platform_mandates]) if platform_mandates else "- General streaming platform requirements"

    prompt = f"""
    Based on this story synopsis and themes, create a 10-episode series outline adapted for streaming platforms:

    Synopsis: {synopsis}
    Main Themes: {', '.join(themes)}

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

    response = anthropic_client.messages.create(
        model="claude-3-opus-20240229",
        max_tokens=3000,
        messages=[{"role": "user", "content": prompt}]
    )

    return response.content[0].text

def generate_pitch_deck_content(anthropic_client, core_elements: dict, character_bibles: list, series_adaptation: str) -> str:
    """Step 4: Generate final pitch deck content"""
    character_summaries = "\n".join([f"- {char['name']}: {char['description']}" for char in core_elements.get('main_characters', [])])

    prompt = f"""
    Create comprehensive pitch deck content for this project by synthesizing all the development materials:

    CORE STORY:
    Logline: {core_elements.get('logline', '')}
    Synopsis: {core_elements.get('one_page_synopsis', '')}
    Themes: {', '.join(core_elements.get('main_themes', []))}

    CHARACTERS:
    {character_summaries}

    SERIES ADAPTATION:
    {series_adaptation}

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

    response = anthropic_client.messages.create(
        model="claude-3-opus-20240229",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )

    return response.content[0].text

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
        update_step_status(supabase, ingestion_id, 'script_preprocess', 'running')
        script_content = fetch_script_content(supabase, file_path)
        update_step_status(supabase, ingestion_id, 'script_preprocess', 'completed')

        update_step_status(supabase, ingestion_id, 'core_extraction', 'running')
        core_elements = extract_core_elements(anthropic_client, script_content)
        update_step_status(supabase, ingestion_id, 'core_extraction', 'completed', core_elements)

        # Step 2: Character Bible Generation
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
                'character': character['name'],
                'bible': bible_entry
            })
        update_step_status(supabase, ingestion_id, 'character_bible', 'completed', {'character_bibles': character_bibles})

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