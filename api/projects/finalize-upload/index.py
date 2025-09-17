from flask import Flask, request, jsonify
import os
import json
import asyncio
import threading
from supabase import create_client, Client
import requests

app = Flask(__name__)

def get_supabase_client() -> Client:
    """Initialize Supabase client with admin privileges"""
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')  # Admin key for database operations

    if not url or not key:
        raise ValueError("Missing Supabase configuration")

    return create_client(url, key)

def trigger_packaging_agent_async(project_id: str, ingestion_id: str):
    """Asynchronously trigger the packaging agent"""
    def trigger():
        try:
            # Get the base URL for the API call
            base_url = os.environ.get('NEXT_PUBLIC_API_BASE', 'https://manthan-mvp.vercel.app')
            url = f"{base_url}/api/projects/run-packaging-agent"

            # Make non-blocking call to packaging agent
            requests.post(
                url,
                json={'projectId': project_id, 'ingestionId': ingestion_id},
                timeout=5  # Short timeout since this is fire-and-forget
            )
        except Exception as e:
            print(f"Error triggering packaging agent: {str(e)}")

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
        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid request body'}), 400

        project_id = data.get('projectId')
        file_path = data.get('filePath')
        file_name = data.get('fileName')
        file_type = data.get('fileType')
        file_size = data.get('fileSize', 0)

        if not project_id or not file_path:
            return jsonify({'error': 'projectId and filePath are required'}), 400

        # Initialize Supabase client
        supabase = get_supabase_client()

        # Create ingestion record
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

        # Insert ingestion record
        ingestion_result = supabase.table('ingestions').insert(ingestion_data).execute()

        if not ingestion_result.data:
            return jsonify({'error': 'Failed to create ingestion record'}), 500

        ingestion_record = ingestion_result.data[0]
        ingestion_id = ingestion_record['id']

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
        supabase.table('ingestion_steps').insert(step_records).execute()

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
        trigger_packaging_agent_async(project_id, ingestion_id)

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