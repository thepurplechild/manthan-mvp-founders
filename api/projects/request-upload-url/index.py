from flask import Flask, request, jsonify
import os
import json
from supabase import create_client, Client
from datetime import datetime, timedelta
import uuid

app = Flask(__name__)

def get_supabase_client() -> Client:
    """Initialize Supabase client with admin privileges"""
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')  # Admin key for signed URLs

    if not url or not key:
        raise ValueError("Missing Supabase configuration")

    return create_client(url, key)

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

        file_name = data.get('fileName')
        file_type = data.get('fileType')
        project_id = data.get('projectId')

        if not file_name or not file_type:
            return jsonify({'error': 'fileName and fileType are required'}), 400

        # Validate file type
        allowed_types = [
            'application/pdf',
            'text/plain',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ]
        allowed_extensions = ['.pdf', '.txt', '.docx']

        if file_type not in allowed_types and not any(file_name.lower().endswith(ext) for ext in allowed_extensions):
            return jsonify({'error': 'Unsupported file type'}), 400

        # Generate unique file path
        file_id = str(uuid.uuid4())
        # For now, we'll use a generic user path - in production this should use authenticated user ID
        file_path = f"scripts/uploads/{file_id}/{file_name}"

        # Initialize Supabase client
        supabase = get_supabase_client()

        # Generate signed URL (valid for 5 minutes)
        expiration = int((datetime.now() + timedelta(minutes=5)).timestamp())

        # Create signed URL for upload
        signed_url_response = supabase.storage.from_('scripts').create_signed_upload_url(file_path)

        if not signed_url_response or 'signedURL' not in signed_url_response:
            return jsonify({'error': 'Failed to generate signed URL'}), 500

        return jsonify({
            'signedUrl': signed_url_response['signedURL'],
            'filePath': file_path,
            'fileId': file_id,
            'expiresIn': 300  # 5 minutes in seconds
        }), 200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }

    except Exception as e:
        print(f"Error in request-upload-url: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }

# Vercel expects the app to be available for import
if __name__ == '__main__':
    app.run()