/**
 * Project Manthan OS - Core Ingestion Engine
 * 
 * Main ingestion function that validates file types, enforces size limits,
 * extracts content, and provides comprehensive error handling.
 */

import { createHash } from 'crypto';
import {
  IngestionResult,
  IngestedContent,
  IngestionError,
  IngestionWarning,
  IngestionOptions,
  IngestionProgressCallback,
  SupportedFileType,
  ContentType,
  SUPPORTED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  IngestionErrorType,
  IngestionWarningType
} from './types';
import { logger, createIngestionLogger } from './logger';

/**
 * Generate a unique ingestion ID
 */
function generateIngestionId(): string {
  const timestamp = Date.now().toString(36);
  const randomBytes = createHash('sha256')
    .update(Math.random().toString() + timestamp)
    .digest('hex')
    .substring(0, 8);
  return `ing_${timestamp}_${randomBytes}`;
}

/**
 * Generate a unique content ID
 */
function generateContentId(): string {
  return createHash('sha256')
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex')
    .substring(0, 16);
}

/**
 * Generate checksum for content integrity
 */
function generateChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Detect file type from filename or MIME type
 */
function detectFileType(filename: string, mimeType?: string): SupportedFileType | null {
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.')) as SupportedFileType;
  
  if (SUPPORTED_FILE_TYPES.includes(extension)) {
    return extension;
  }
  
  // Fallback to MIME type detection
  if (mimeType) {
    const mimeTypeMap: Record<string, SupportedFileType> = {
      'text/plain': '.txt',
      'application/pdf': '.pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
      'application/vnd.ms-powerpoint': '.ppt',
    };
    
    return mimeTypeMap[mimeType] || null;
  }
  
  return null;
}

/**
 * Detect content type from filename and content
 */
function detectContentType(filename: string, content: string): ContentType {
  const lowerFilename = filename.toLowerCase();
  const lowerContent = content.toLowerCase();
  
  // Script formats
  if (lowerFilename.includes('.fdx') || lowerFilename.includes('.celtx')) {
    return 'script';
  }
  
  // Look for script indicators in content
  if (lowerContent.includes('fade in:') || 
      lowerContent.includes('ext.') || 
      lowerContent.includes('int.') ||
      lowerContent.includes('screenplay') ||
      lowerContent.includes('written by')) {
    return 'script';
  }
  
  // Treatment indicators
  if (lowerContent.includes('treatment') || 
      lowerContent.includes('logline') ||
      lowerFilename.includes('treatment')) {
    return 'treatment';
  }
  
  // Synopsis indicators
  if (lowerContent.includes('synopsis') || 
      lowerFilename.includes('synopsis') ||
      lowerFilename.includes('summary')) {
    return 'synopsis';
  }
  
  // Presentation formats
  if (lowerFilename.includes('.ppt') || lowerFilename.includes('.pptx')) {
    return 'pitch_deck';
  }
  
  // Default to document
  if (lowerFilename.includes('.docx') || lowerFilename.includes('.doc')) {
    return 'document';
  }
  
  return 'unknown';
}

/**
 * Create user-friendly error messages
 */
function createUserFriendlyError(
  type: IngestionErrorType,
  filename: string,
  details?: string
): IngestionError {
  const errorMessages: Record<IngestionErrorType, { message: string; suggestions: string[] }> = {
    file_too_large: {
      message: `File "${filename}" is too large. The maximum file size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
      suggestions: [
        'Try compressing the file using a ZIP utility',
        'Convert the document to a more efficient format',
        'Remove unnecessary images or media from the document',
        'Split large documents into smaller sections'
      ]
    },
    unsupported_file_type: {
      message: `File type not supported for "${filename}". Please use one of the supported formats: ${SUPPORTED_FILE_TYPES.join(', ')}.`,
      suggestions: [
        'Convert your file to a supported format (.txt, .pdf, .docx, .fdx, .celtx)',
        'If this is a script, try exporting as Final Draft (.fdx) or PDF',
        'For presentations, use PowerPoint (.pptx) or convert to PDF'
      ]
    },
    file_corrupted: {
      message: `File "${filename}" appears to be corrupted or unreadable.`,
      suggestions: [
        'Try re-downloading or re-exporting the file',
        'Check if the file opens correctly in its native application',
        'Convert the file to a different format and try again'
      ]
    },
    extraction_failed: {
      message: `Unable to extract content from "${filename}". The file may be password-protected or corrupted.`,
      suggestions: [
        'Remove password protection from the file',
        'Try saving the file in a different format',
        'Ensure the file is not corrupted by opening it in its native application'
      ]
    },
    parsing_error: {
      message: `Error parsing the content of "${filename}". The file structure may be invalid.`,
      suggestions: [
        'Try re-saving the file in its native application',
        'Convert to a simpler format like .txt or .pdf',
        'Check if the file was created with an older version of the software'
      ]
    },
    network_error: {
      message: 'Network error occurred during file processing. Please check your internet connection.',
      suggestions: [
        'Check your internet connection',
        'Try uploading the file again',
        'If the problem persists, try again later'
      ]
    },
    storage_error: {
      message: 'Storage error occurred while processing the file.',
      suggestions: [
        'Try again in a few moments',
        'Check if you have sufficient storage space',
        'Contact support if the problem persists'
      ]
    },
    permission_denied: {
      message: 'Permission denied while accessing the file.',
      suggestions: [
        'Check file permissions',
        'Ensure the file is not locked by another application',
        'Try copying the file to a different location and uploading again'
      ]
    },
    quota_exceeded: {
      message: 'Upload quota exceeded. Please try again later or upgrade your plan.',
      suggestions: [
        'Wait for your quota to reset',
        'Delete old projects to free up space',
        'Consider upgrading your plan for more storage'
      ]
    },
    timeout_error: {
      message: `Processing timeout for "${filename}". The file may be too complex or large.`,
      suggestions: [
        'Try uploading a smaller file',
        'Simplify the document structure',
        'Split complex documents into smaller parts'
      ]
    },
    validation_failed: {
      message: `Content validation failed for "${filename}". The file content may be invalid.`,
      suggestions: [
        'Check that the file contains valid content',
        'Ensure the file is not empty',
        'Try re-creating the file with proper formatting'
      ]
    },
    virus_detected: {
      message: `Security scan detected potential threats in "${filename}".`,
      suggestions: [
        'Scan the file with your antivirus software',
        'Download the file from a trusted source',
        'Contact support if you believe this is a false positive'
      ]
    },
    unknown_error: {
      message: `An unexpected error occurred while processing "${filename}".`,
      suggestions: [
        'Try uploading the file again',
        'Convert the file to a different format',
        'Contact support with details about your file'
      ]
    }
  };
  
  const errorInfo = errorMessages[type];
  
  return {
    type,
    message: errorInfo.message,
    details,
    timestamp: new Date(),
    retryable: ['network_error', 'storage_error', 'timeout_error', 'unknown_error'].includes(type),
    retryDelay: type === 'network_error' ? 5000 : 10000,
    suggestions: errorInfo.suggestions
  };
}

/**
 * Create warning messages
 */
function createWarning(
  type: IngestionWarningType,
  message: string,
  severity: 'low' | 'medium' | 'high' = 'medium',
  suggestions: string[] = []
): IngestionWarning {
  return {
    type,
    message,
    severity,
    suggestions,
    timestamp: new Date()
  };
}

/**
 * Validate file before processing
 */
function validateFile(
  filename: string,
  fileSize: number,
  mimeType?: string,
  options: IngestionOptions = {}
): { valid: boolean; error?: IngestionError; warnings: IngestionWarning[] } {
  const warnings: IngestionWarning[] = [];
  const maxSize = options.maxFileSize || MAX_FILE_SIZE_BYTES;
  const allowedTypes = options.allowedFileTypes || SUPPORTED_FILE_TYPES;
  
  // Check file size
  if (fileSize > maxSize) {
    return {
      valid: false,
      error: createUserFriendlyError('file_too_large', filename),
      warnings
    };
  }
  
  // Warn about large files
  if (fileSize > maxSize * 0.8) {
    warnings.push(createWarning(
      'large_file_size',
      `File "${filename}" is quite large (${Math.round(fileSize / (1024 * 1024) * 100) / 100}MB). Processing may take longer.`,
      'medium',
      ['Consider optimizing the file size for faster processing']
    ));
  }
  
  // Check file type
  const detectedType = detectFileType(filename, mimeType);
  if (!detectedType || !allowedTypes.includes(detectedType)) {
    return {
      valid: false,
      error: createUserFriendlyError('unsupported_file_type', filename),
      warnings
    };
  }
  
  return { valid: true, warnings };
}

/**
 * Extract text content from file using appropriate parser
 */
async function extractTextContent(
  filename: string,
  fileType: SupportedFileType,
  fileBuffer: Buffer,
  progressCallback?: IngestionProgressCallback
): Promise<{ content: string; warnings: IngestionWarning[]; structuredContent?: unknown; enhancedMetadata?: unknown }> {
  const { parseFile } = await import('./parsers');
  
  try {
    const parseResult = await parseFile(filename, fileBuffer, fileType, progressCallback);
    
    return {
      content: parseResult.textContent,
      warnings: parseResult.warnings,
      structuredContent: parseResult.structuredContent,
      enhancedMetadata: parseResult.metadata
    };
    
  } catch (error) {
    throw new Error(`Content extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract metadata from content and filename
 */
function extractMetadata(
  filename: string,
  content: string
): IngestedContent['metadata'] {
  const words = content.split(/\s+/).filter(word => word.length > 0);
  const lines = content.split('\n');
  
  // Try to detect title from first few lines
  let title: string | undefined;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i].trim();
    if (line && line.length > 3 && line.length < 100) {
      title = line;
      break;
    }
  }
  
  // Try to detect author
  let author: string | undefined;
  const authorPatterns = [
    /(?:by|written by|author|created by)[\s:]+([^\n\r]+)/i,
    /^([A-Z][a-z]+ [A-Z][a-z]+)$/m
  ];
  
  for (const pattern of authorPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      author = match[1].trim();
      break;
    }
  }
  
  // Detect language (basic English detection)
  const englishWords = ['the', 'and', 'of', 'to', 'a', 'in', 'for', 'is', 'on', 'that', 'by', 'this', 'with', 'from', 'they', 'we', 'you', 'or', 'an', 'be'];
  const contentWords = words.slice(0, 100).map(word => word.toLowerCase().replace(/[^\w]/g, ''));
  const englishWordCount = contentWords.filter(word => englishWords.includes(word)).length;
  const language = englishWordCount > contentWords.length * 0.1 ? 'en' : undefined;
  
  return {
    title,
    author,
    pageCount: Math.ceil(content.length / 2500), // Rough estimate
    wordCount: words.length,
    charCount: content.length,
    language,
    formatVersion: '1.0'
  };
}

/**
 * Main ingestion function
 */
export async function ingestFile(
  filename: string,
  fileBuffer: Buffer,
  mimeType?: string,
  options: IngestionOptions = {},
  progressCallback?: IngestionProgressCallback
): Promise<IngestionResult> {
  const startTime = Date.now();
  const ingestionId = generateIngestionId();
  const fileSize = fileBuffer.length;
  
  // Create logger for this ingestion session
  const sessionLogger = createIngestionLogger({
    ingestionId,
    filename,
    fileSize,
    ...options.userContext
  });
  
  sessionLogger.info('Ingestion started', { filename, fileSize });
  logger.analytics.ingestionStarted(ingestionId, options.userContext);
  
  const result: IngestionResult = {
    ingestionId,
    content: null,
    warnings: [],
    error: null,
    success: false,
    processingTime: 0,
    startedAt: new Date(),
    completedAt: new Date(),
    debug: {
      steps: [],
      metrics: {},
      internal: {}
    }
  };
  
  try {
    progressCallback?.({
      currentStep: 'Validating file',
      progress: 5,
      details: 'Checking file type and size'
    });
    
    // Step 1: Validate file
    result.debug!.steps.push('File validation');
    const validation = validateFile(filename, fileSize, mimeType, options);
    
    if (!validation.valid || validation.error) {
      result.error = validation.error || createUserFriendlyError('validation_failed', filename);
      result.warnings = validation.warnings;
      logger.validation.failed(filename, result.error.message, options.userContext);
      return result;
    }
    
    result.warnings.push(...validation.warnings);
    logger.validation.passed(filename, ['file_type', 'file_size'], options.userContext);
    
    // Step 2: Detect file type
    const detectedFileType = detectFileType(filename, mimeType)!;
    logger.validation.fileType(filename, detectedFileType, [...SUPPORTED_FILE_TYPES], options.userContext);
    
    progressCallback?.({
      currentStep: 'Processing file',
      progress: 20,
      details: `Processing ${detectedFileType} file`
    });
    
    // Step 3: Extract content
    result.debug!.steps.push('Content extraction');
    logger.extraction.started(filename, `${detectedFileType}_parser`, options.userContext);
    
    const { content, warnings: extractionWarnings } = await extractTextContent(
      filename,
      detectedFileType,
      fileBuffer,
      progressCallback
    );
    
    result.warnings.push(...extractionWarnings);
    logger.extraction.completed(filename, content.length, options.userContext);
    
    progressCallback?.({
      currentStep: 'Analyzing content',
      progress: 80,
      details: 'Extracting metadata and analyzing content'
    });
    
    // Step 4: Create ingested content
    result.debug!.steps.push('Metadata extraction');
    const contentType = detectContentType(filename, content);
    const metadata = extractMetadata(filename, content);
    const checksum = generateChecksum(content);
    
    const ingestedContent: IngestedContent = {
      id: generateContentId(),
      filename,
      fileType: detectedFileType,
      fileSize,
      mimeType: mimeType || 'application/octet-stream',
      textContent: content,
      contentType,
      priority: options.priority || 'medium',
      status: 'completed',
      metadata,
      ingestedAt: new Date(),
      processedAt: new Date(),
      checksum
    };
    
    result.content = ingestedContent;
    result.success = true;
    
    progressCallback?.({
      currentStep: 'Complete',
      progress: 100,
      details: 'File processing completed successfully'
    });
    
    sessionLogger.info('Ingestion completed successfully', {
      contentType,
      contentLength: content.length,
      warningCount: result.warnings.length
    });
    
  } catch (error) {
    const ingestionError = error instanceof Error ? error : new Error('Unknown error');
    result.error = createUserFriendlyError('unknown_error', filename, ingestionError.message);
    result.debug!.steps.push('Error occurred');
    
    sessionLogger.error('Ingestion failed', { errorMessage: ingestionError.message }, ingestionError);
    logger.fileProcessing.failed(filename, ingestionError, options.userContext);
    
  } finally {
    const endTime = Date.now();
    result.processingTime = endTime - startTime;
    result.completedAt = new Date();
    
    result.debug!.metrics = {
      processingTime: result.processingTime,
      fileSize,
      contentLength: result.content?.textContent.length || 0,
      warningCount: result.warnings.length
    };
    
    logger.analytics.ingestionCompleted(
      ingestionId, 
      result.processingTime, 
      result.success, 
      options.userContext
    );
  }
  
  return result;
}

/**
 * Utility function to ingest multiple files in batch
 */
export async function ingestFileBatch(
  files: Array<{ filename: string; buffer: Buffer; mimeType?: string }>,
  options: IngestionOptions = {},
  progressCallback?: (overall: number, current: string) => void
): Promise<IngestionResult[]> {
  const results: IngestionResult[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileProgress = (i / files.length) * 100;
    
    progressCallback?.(fileProgress, `Processing ${file.filename}`);
    
    const result = await ingestFile(
      file.filename,
      file.buffer,
      file.mimeType,
      options,
      (progress) => {
        const overallProgress = fileProgress + (progress.progress / files.length);
        progressCallback?.(overallProgress, `${file.filename}: ${progress.currentStep}`);
      }
    );
    
    results.push(result);
  }
  
  progressCallback?.(100, 'Batch processing complete');
  return results;
}

/**
 * Get supported file types
 */
export function getSupportedFileTypes(): readonly SupportedFileType[] {
  return SUPPORTED_FILE_TYPES;
}

/**
 * Check if a file type is supported
 */
export function isFileTypeSupported(filename: string): boolean {
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return SUPPORTED_FILE_TYPES.includes(extension as SupportedFileType);
}

/**
 * Get maximum file size
 */
export function getMaxFileSize(): number {
  return MAX_FILE_SIZE_BYTES;
}