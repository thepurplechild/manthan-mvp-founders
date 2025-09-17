# File Ingestion API

This API endpoint provides comprehensive file ingestion capabilities for Project Manthan OS.

## Endpoint

```
POST /api/ingest
```

## Request Format

The API accepts `multipart/form-data` with the following fields:

### Required Fields
- `file`: The file to be ingested (File object)

### Optional Fields
- `priority`: Processing priority (`low` | `medium` | `high` | `urgent`) - defaults to `medium`
- `userId`: User ID for tracking and analytics
- `projectId`: Project ID for organizing content
- `sessionId`: Session ID for debugging and analytics

## Supported File Types

- `.txt` - Plain text files
- `.pdf` - PDF documents
- `.docx` - Microsoft Word documents
- `.fdx` - Final Draft screenplay files
- `.celtx` - Celtx project files
- `.pptx` - PowerPoint presentations
- `.ppt` - Legacy PowerPoint presentations

## File Size Limits

Maximum file size: **10MB**

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "ingestionId": "ing_1a2b3c4d_e5f6g7h8",
  "result": {
    "ingestionId": "ing_1a2b3c4d_e5f6g7h8",
    "content": {
      "id": "content_1234567890abcdef",
      "filename": "example.pdf",
      "fileType": ".pdf",
      "fileSize": 1048576,
      "mimeType": "application/pdf",
      "textContent": "Extracted text content...",
      "contentType": "document",
      "priority": "medium",
      "status": "completed",
      "metadata": {
        "title": "Document Title",
        "author": "Author Name",
        "pageCount": 10,
        "wordCount": 2500,
        "charCount": 12500,
        "language": "en"
      },
      "ingestedAt": "2024-01-15T10:30:00.000Z",
      "processedAt": "2024-01-15T10:30:05.000Z",
      "checksum": "sha256_hash_here"
    },
    "warnings": [],
    "error": null,
    "success": true,
    "processingTime": 5000,
    "startedAt": "2024-01-15T10:30:00.000Z",
    "completedAt": "2024-01-15T10:30:05.000Z"
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "type": "file_too_large",
    "message": "File is too large. Maximum file size is 10MB.",
    "suggestions": [
      "Try compressing the file using a ZIP utility",
      "Convert the document to a more efficient format"
    ],
    "retryable": false
  },
  "ingestionId": "ing_1a2b3c4d_e5f6g7h8"
}
```

## Error Types

- `validation_error` (400) - Invalid request format or missing file
- `file_too_large` (413) - File exceeds size limit
- `unsupported_file_type` (400) - File type not supported
- `file_corrupted` (400) - File is corrupted or unreadable
- `extraction_failed` (500) - Content extraction failed
- `timeout_error` (408) - Processing timeout
- `internal_server_error` (500) - Unexpected server error

## Usage Examples

### JavaScript/TypeScript (Fetch API)

```javascript
async function ingestFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('priority', 'high');
  formData.append('userId', 'user123');
  formData.append('projectId', 'project456');

  try {
    const response = await fetch('/api/ingest', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('Ingestion successful:', result.result);
      return result.result;
    } else {
      console.error('Ingestion failed:', result.error);
      throw new Error(result.error.message);
    }
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// Usage
const fileInput = document.getElementById('fileInput');
const file = fileInput.files[0];
if (file) {
  ingestFile(file)
    .then(result => {
      // Handle successful ingestion
      console.log('Content:', result.content.textContent);
    })
    .catch(error => {
      // Handle error
      alert('Failed to process file: ' + error.message);
    });
}
```

### React Hook Example

```typescript
import { useState, useCallback } from 'react';

interface IngestionResult {
  success: boolean;
  ingestionId: string;
  result?: any;
  error?: {
    type: string;
    message: string;
    suggestions?: string[];
    retryable?: boolean;
  };
}

export function useFileIngestion() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ingestFile = useCallback(async (
    file: File,
    options: {
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      userId?: string;
      projectId?: string;
    } = {}
  ) => {
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    
    if (options.priority) formData.append('priority', options.priority);
    if (options.userId) formData.append('userId', options.userId);
    if (options.projectId) formData.append('projectId', options.projectId);

    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const result: IngestionResult = await response.json();
      
      if (!result.success) {
        setError(result.error?.message || 'Unknown error occurred');
        return null;
      }

      return result.result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { ingestFile, isLoading, error };
}
```

### cURL Example

```bash
curl -X POST http://localhost:3000/api/ingest \
  -F "file=@/path/to/your/document.pdf" \
  -F "priority=high" \
  -F "userId=user123" \
  -F "projectId=project456"
```

## CORS Support

The API includes CORS headers for cross-origin requests:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

## Rate Limiting

Currently no rate limiting is implemented. Consider adding rate limiting for production use.

## Security Considerations

1. **File Size Validation**: Files are limited to 10MB
2. **File Type Validation**: Only whitelisted file types are accepted
3. **Content Validation**: Files are validated before processing
4. **Error Handling**: Detailed error information is provided for debugging

## Storage

Currently using in-memory storage. Consider integrating with a database for production use:

- Store ingestion results in your database
- Implement file cleanup for temporary files
- Add user authentication and authorization
- Implement audit logging

## Monitoring

The API includes built-in logging and analytics:
- Ingestion start/completion events
- Processing time metrics
- Error tracking
- File type and size statistics

Access logs via the ingestion logger system for detailed monitoring and debugging.