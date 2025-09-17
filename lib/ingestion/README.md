# Project Manthan OS - Core Ingestion Engine

A comprehensive file ingestion system designed specifically for Project Manthan OS to process scripts, documents, and other content types with robust validation, error handling, and analytics.

## Features

- ✅ **File Type Validation**: Supports `.txt`, `.pdf`, `.fdx`, `.celtx`, `.docx`, `.pptx`, `.ppt`
- ✅ **Size Limits**: Configurable file size limits (default 10MB)
- ✅ **Content Extraction**: Intelligent text extraction from various file formats
- ✅ **Metadata Analysis**: Automatic detection of title, author, content type, and more
- ✅ **Error Handling**: User-friendly error messages with actionable suggestions
- ✅ **Progress Tracking**: Real-time progress callbacks for long operations
- ✅ **Logging & Analytics**: Comprehensive logging for debugging and monitoring
- ✅ **TypeScript Support**: Full type safety with detailed interfaces
- ✅ **Batch Processing**: Handle multiple files efficiently

## Quick Start

```typescript
import { ingestFile } from '@/lib/ingestion';

// Basic file ingestion
const result = await ingestFile('script.fdx', fileBuffer);

if (result.success && result.content) {
  console.log('Content:', result.content.textContent);
  console.log('Type:', result.content.contentType);
  console.log('Metadata:', result.content.metadata);
}
```

## API Reference

### Core Functions

#### `ingestFile(filename, fileBuffer, mimeType?, options?, progressCallback?)`

Main ingestion function that processes a single file.

**Parameters:**
- `filename: string` - Name of the file being processed
- `fileBuffer: Buffer` - File content as a Buffer
- `mimeType?: string` - MIME type of the file (optional)
- `options?: IngestionOptions` - Configuration options (optional)
- `progressCallback?: IngestionProgressCallback` - Progress updates (optional)

**Returns:** `Promise<IngestionResult>`

**Example:**
```typescript
const result = await ingestFile(
  'my-script.fdx',
  fileBuffer,
  'application/xml',
  {
    priority: 'high',
    extractMetadata: true,
    userContext: {
      userId: 'user123',
      projectId: 'project456'
    }
  },
  (progress) => {
    console.log(`${progress.progress}%: ${progress.currentStep}`);
  }
);
```

#### `ingestFileBatch(files, options?, progressCallback?)`

Process multiple files in batch.

**Parameters:**
- `files: Array<{filename: string, buffer: Buffer, mimeType?: string}>` - Files to process
- `options?: IngestionOptions` - Configuration options (optional)
- `progressCallback?: (overall: number, current: string) => void` - Progress updates (optional)

**Returns:** `Promise<IngestionResult[]>`

### Utility Functions

#### `getSupportedFileTypes()`
Returns array of supported file extensions.

#### `isFileTypeSupported(filename)`
Check if a file type is supported.

#### `getMaxFileSize()`
Get maximum allowed file size in bytes.

## Configuration Options

```typescript
interface IngestionOptions {
  maxFileSize?: number;              // Custom size limit
  allowedFileTypes?: SupportedFileType[];  // Allowed file types
  priority?: ContentPriority;        // Processing priority
  performSecurityScan?: boolean;     // Enable security scanning
  timeout?: number;                  // Processing timeout
  extractMetadata?: boolean;         // Extract detailed metadata
  validateContent?: boolean;         // Validate content structure
  userContext?: {                    // User context for logging
    userId?: string;
    projectId?: string;
    sessionId?: string;
  };
}
```

## Content Types

The engine automatically detects and categorizes content:

- `script` - Screenplays and scripts (.fdx, .celtx, or detected format)
- `treatment` - Treatment documents
- `synopsis` - Synopsis or summary documents
- `pitch_deck` - Presentation files (.pptx, .ppt)
- `document` - General documents (.docx)
- `unknown` - Unclassified content

## Error Handling

All errors include user-friendly messages and actionable suggestions:

```typescript
if (!result.success && result.error) {
  console.log('Error:', result.error.message);
  console.log('Suggestions:', result.error.suggestions);
  console.log('Retryable:', result.error.retryable);
}
```

### Common Error Types

- `file_too_large` - File exceeds size limit
- `unsupported_file_type` - File type not supported
- `file_corrupted` - File is corrupted or unreadable
- `extraction_failed` - Text extraction failed
- `parsing_error` - File parsing error
- `timeout_error` - Processing timeout

## Warnings

Non-fatal issues that don't prevent processing:

- `large_file_size` - File is large but within limits
- `partial_extraction` - Only partial content extracted
- `encoding_issues` - Character encoding problems
- `empty_content` - No extractable content found

## Logging

Comprehensive logging system for debugging and analytics:

```typescript
import { logger, createIngestionLogger } from '@/lib/ingestion';

// Use default logger
logger.fileProcessing.started('file.txt', 1024);

// Create session-specific logger
const sessionLogger = createIngestionLogger({
  ingestionId: 'ing_123',
  userId: 'user456'
});

sessionLogger.info('Processing started');
```

## Testing

Visit `/test-ingestion` for a comprehensive test interface that allows you to:

- Upload files and test the ingestion process
- Create test files with different content types
- View detailed results and debug information
- Monitor progress and logs in real-time

## File Format Support

### Current Support
- **.txt** - Plain text files ✅
- **.pdf** - PDF documents (placeholder implementation)
- **.fdx** - Final Draft scripts (placeholder implementation)
- **.celtx** - Celtx scripts (placeholder implementation)
- **.docx** - Microsoft Word documents (placeholder implementation)
- **.pptx/.ppt** - PowerPoint presentations (placeholder implementation)

### Implementation Notes

This is a demo implementation with placeholder parsers for most file types. In a production environment, you would integrate:

- **PDF**: `pdf-parse`, `pdf2pic`
- **Final Draft**: Custom XML parser for `.fdx` format
- **Celtx**: Custom parser for Celtx format
- **Word**: `mammoth.js`, `docx-parser`
- **PowerPoint**: `pptx-parser`, custom extraction

## Architecture

```
lib/ingestion/
├── types.ts       # TypeScript interfaces and types
├── core.ts        # Main ingestion logic
├── logger.ts      # Logging infrastructure
├── index.ts       # Main exports
└── README.md      # This documentation
```

## Integration Example

```typescript
// In your upload handler
import { ingestFile } from '@/lib/ingestion';

export async function handleFileUpload(file: File, projectId: string) {
  const buffer = Buffer.from(await file.arrayBuffer());
  
  const result = await ingestFile(
    file.name,
    buffer,
    file.type,
    {
      priority: 'high',
      userContext: { projectId }
    }
  );

  if (result.success) {
    // Save to database
    await saveIngestedContent(result.content);
    return { success: true, content: result.content };
  } else {
    return { success: false, error: result.error };
  }
}
```

## Performance Considerations

- Files are processed in memory (suitable for files up to 10MB)
- For larger files, consider streaming processing
- Batch processing is more efficient for multiple files
- Progress callbacks help with UX for long operations

## Security

- File type validation prevents malicious uploads
- Size limits prevent DoS attacks
- Content validation ensures file integrity
- Logging captures security-relevant events
- Optional virus scanning support

## Future Enhancements

- [ ] Real file format parsers for all supported types
- [ ] Streaming processing for large files
- [ ] Advanced content analysis (sentiment, genre detection)
- [ ] OCR support for image-based PDFs
- [ ] Custom file format plugins
- [ ] Cloud storage integration
- [ ] Advanced metadata extraction