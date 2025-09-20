from flask import Flask, request, jsonify
import os
import json
import asyncio
import threading
from supabase import create_client, Client
import requests
import jwt
from datetime import datetime

app = Flask(__name__)

def get_supabase_client() -> Client:
    """Initialize Supabase client with admin privileges"""
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')  # Admin key for database operations

    if not url or not key:
        raise ValueError("Missing Supabase configuration")

    return create_client(url, key)

def get_user_from_auth_header(auth_header: str, supabase: Client) -> str:
    """Extract user ID from Authorization header"""
    if not auth_header or not auth_header.startswith('Bearer '):
        raise ValueError("Missing or invalid Authorization header")

    token = auth_header[7:]  # Remove 'Bearer ' prefix

    # Verify the JWT token with Supabase
    try:
        user_response = supabase.auth.get_user(token)
        if user_response.user:
            return user_response.user.id
        else:
            raise ValueError("Invalid token")
    except Exception as e:
        raise ValueError(f"Token verification failed: {str(e)}")

def trigger_packaging_agent_async(project_id: str, ingestion_id: str):
    """Asynchronously trigger the packaging agent"""
    def trigger():
        try:
            # Get the base URL for the API call - use environment or determine from request
            base_url = os.environ.get('NEXT_PUBLIC_API_BASE') or os.environ.get('VERCEL_URL')
            if base_url and not base_url.startswith('http'):
                base_url = f"https://{base_url}"
            elif not base_url:
                base_url = "https://manthan-mvp.vercel.app"  # fallback

            url = f"{base_url}/api/projects/run-packaging-agent"

            print(f"[finalize-upload] Triggering AI agent at: {url}")

            # Make non-blocking call to packaging agent
            response = requests.post(
                url,
                json={'projectId': project_id, 'ingestionId': ingestion_id},
                timeout=10,  # Increased timeout for better reliability
                headers={'Content-Type': 'application/json'}
            )

            if response.status_code == 200:
                print(f"[finalize-upload] Successfully triggered AI agent for ingestion {ingestion_id}")
            else:
                print(f"[finalize-upload] AI agent trigger failed with status {response.status_code}: {response.text}")

        except Exception as e:
            print(f"[finalize-upload] Error triggering packaging agent: {str(e)}")

    # Start in background thread
    thread = threading.Thread(target=trigger)
    thread.daemon = True
    thread.start()

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
        print(f"[finalize-upload] Processing request at {datetime.now().isoformat()}")

        # Get request data
        data = request.get_json()
        if not data:
            print("[finalize-upload] ERROR: Invalid request body")
            return jsonify({'error': 'Invalid request body'}), 400

        project_id = data.get('projectId')
        file_path = data.get('filePath')
        file_name = data.get('fileName')
        file_type = data.get('fileType')
        file_size = data.get('fileSize', 0)

        print(f"[finalize-upload] Request data: projectId={project_id}, filePath={file_path}, fileName={file_name}")

        if not project_id or not file_path:
            print("[finalize-upload] ERROR: Missing required fields")
            return jsonify({'error': 'projectId and filePath are required'}), 400

        # Initialize Supabase client
        supabase = get_supabase_client()

        # For now, we'll use a default user_id since authentication is not fully implemented
        # In production, this should extract user_id from the Authorization header
        user_id = None
        auth_header = request.headers.get('Authorization')
        if auth_header:
            try:
                user_id = get_user_from_auth_header(auth_header, supabase)
                print(f"[finalize-upload] Authenticated user: {user_id}")
            except Exception as e:
                print(f"[finalize-upload] Auth failed: {str(e)}")

        # Create ingestion record with user_id
        ingestion_data = {
            'project_id': project_id,
            'source_file_url': file_path,
            'mime_type': file_type or 'application/octet-stream',
            'status': 'queued',
            'progress': 0,
            'metadata': {
                'file_name': file_name or 'unknown',
                'file_size': file_size,
                'uploaded_via': 'signed_url'
            }
        }

        # Only add user_id if we have it (for backward compatibility)
        if user_id:
            ingestion_data['user_id'] = user_id

        print(f"[finalize-upload] Creating ingestion record: {ingestion_data}")

        # Insert ingestion record
        ingestion_result = supabase.table('ingestions').insert(ingestion_data).execute()

        if not ingestion_result.data:
            print(f"[finalize-upload] ERROR: Failed to create ingestion record. Error: {getattr(ingestion_result, 'error', 'Unknown error')}")
            return jsonify({'error': 'Failed to create ingestion record'}), 500

        ingestion_record = ingestion_result.data[0]
        ingestion_id = ingestion_record['id']
        print(f"[finalize-upload] Created ingestion record with ID: {ingestion_id}")

        # Create ingestion steps
        steps = [
            'script_preprocess',
            'core_extraction',
            'character_bible',
            'visuals',
            'market_adaptation',
            'package_assembly',
            'final_package'
        ]

        step_records = []
        for step_name in steps:
            step_records.append({
                'ingestion_id': ingestion_id,
                'name': step_name,
                'status': 'queued'
            })

        # Insert step records
        steps_result = supabase.table('ingestion_steps').insert(step_records).execute()
        if steps_result.data:
            print(f"[finalize-upload] Created {len(steps_result.data)} ingestion steps")
        else:
            print(f"[finalize-upload] WARNING: Failed to create ingestion steps. Error: {getattr(steps_result, 'error', 'Unknown error')}")

        # Update script_uploads table if it exists (for backward compatibility)
        try:
            supabase.table('script_uploads').insert({
                'project_id': project_id,
                'file_path': file_path,
                'file_name': file_name or 'unknown',
                'file_type': file_type,
                'file_size': file_size,
                'ingestion_id': ingestion_id,
                'status': 'uploaded'
            }).execute()
        except:
            # Table might not exist, continue without error
            pass

        # Trigger packaging agent asynchronously
        print(f"[finalize-upload] Triggering AI packaging agent for ingestion {ingestion_id}")
        trigger_packaging_agent_async(project_id, ingestion_id)

        print(f"[finalize-upload] Successfully completed upload finalization for {file_name}")

        return jsonify({
            'success': True,
            'ingestionId': ingestion_id,
            'message': 'File upload finalized and AI processing initiated'
        }), 200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }

    except Exception as e:
        print(f"Error in finalize-upload: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }

# Vercel expects the app to be available for import
if __name__ == '__main__':
    app.run()