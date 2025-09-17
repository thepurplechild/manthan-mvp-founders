/**
 * Project Manthan OS - Core Ingestion Engine Types
 * 
 * This file defines the core TypeScript interfaces and types for the
 * content ingestion system that processes scripts and documents.
 */

// Supported file types for ingestion
export const SUPPORTED_FILE_TYPES = [
  '.txt',
  '.pdf', 
  '.fdx',
  '.celtx',
  '.docx',
  '.pptx',
  '.ppt'
] as const;

export type SupportedFileType = typeof SUPPORTED_FILE_TYPES[number];

// Maximum file size (10MB)
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_SIZE_MB = 10;

// Content types that can be extracted from files
export type ContentType = 
  | 'script'           // Screenplay/script content
  | 'treatment'        // Treatment document
  | 'synopsis'         // Synopsis/summary
  | 'pitch_deck'       // Presentation slides
  | 'document'         // General document
  | 'unknown';         // Unclassified content

// Priority levels for content processing
export type ContentPriority = 'low' | 'medium' | 'high' | 'urgent';

// Processing status for ingested content
export type ProcessingStatus = 
  | 'pending'          // Awaiting processing
  | 'processing'       // Currently being processed
  | 'completed'        // Successfully processed
  | 'failed'           // Processing failed
  | 'cancelled';       // Processing cancelled

/**
 * Core interface for ingested content
 */
export interface IngestedContent {
  /** Unique identifier for the content */
  id: string;
  
  /** Original filename */
  filename: string;
  
  /** File extension */
  fileType: SupportedFileType;
  
  /** File size in bytes */
  fileSize: number;
  
  /** MIME type of the file */
  mimeType: string;
  
  /** Extracted text content from the file */
  textContent: string;
  
  /** Detected content type */
  contentType: ContentType;
  
  /** Processing priority */
  priority: ContentPriority;
  
  /** Current processing status */
  status: ProcessingStatus;
  
  /** Structured metadata extracted from content */
  metadata: {
    /** Detected title/heading */
    title?: string;
    
    /** Detected author/creator */
    author?: string;
    
    /** Creation date if available */
    createdDate?: Date;
    
    /** Last modified date if available */
    modifiedDate?: Date;
    
    /** Page count for documents */
    pageCount?: number;
    
    /** Word count estimate */
    wordCount?: number;
    
    /** Character count */
    charCount?: number;
    
    /** Detected language */
    language?: string;
    
    /** Genre if detectable (for scripts) */
    genre?: string;
    
    /** Format version (for specific file types) */
    formatVersion?: string;
    
    /** Additional custom properties */
    custom?: Record<string, unknown>;
  };
  
  /** Timestamp when content was ingested */
  ingestedAt: Date;
  
  /** Timestamp when processing started */
  processedAt?: Date;
  
  /** Checksum/hash for content integrity */
  checksum: string;
}

/**
 * Warning types that can occur during ingestion
 */
export type IngestionWarningType = 
  | 'large_file_size'          // File is large but within limits
  | 'unsupported_features'     // File contains unsupported features
  | 'partial_extraction'       // Could only extract partial content
  | 'encoding_issues'          // Character encoding problems
  | 'format_compatibility'     // Format version compatibility issues
  | 'metadata_incomplete'      // Incomplete metadata extraction
  | 'password_protected'       // File is password protected
  | 'corrupted_content'        // Some content appears corrupted
  | 'empty_content'            // File appears empty or has no extractable content
  | 'deprecated_format';       // File format is deprecated

/**
 * Individual warning with context
 */
export interface IngestionWarning {
  /** Type of warning */
  type: IngestionWarningType;
  
  /** Human-readable warning message */
  message: string;
  
  /** Detailed description for debugging */
  details?: string;
  
  /** Severity level */
  severity: 'low' | 'medium' | 'high';
  
  /** Suggestions for resolution */
  suggestions?: string[];
  
  /** Timestamp when warning occurred */
  timestamp: Date;
}

/**
 * Error types that can occur during ingestion
 */
export type IngestionErrorType =
  | 'file_too_large'           // File exceeds size limit
  | 'unsupported_file_type'    // File type not supported
  | 'file_corrupted'           // File is corrupted or unreadable
  | 'extraction_failed'        // Text extraction failed
  | 'parsing_error'            // File parsing error
  | 'network_error'            // Network-related error
  | 'storage_error'            // Storage/disk error
  | 'permission_denied'        // Insufficient permissions
  | 'quota_exceeded'           // Storage or processing quota exceeded
  | 'timeout_error'            // Processing timeout
  | 'validation_failed'        // Content validation failed
  | 'virus_detected'           // Security scan detected threats
  | 'unknown_error';           // Unexpected error

/**
 * Detailed error information
 */
export interface IngestionError {
  /** Type of error */
  type: IngestionErrorType;
  
  /** User-friendly error message */
  message: string;
  
  /** Technical error details for debugging */
  details?: string;
  
  /** Error code for programmatic handling */
  code?: string;
  
  /** Original error object if available */
  originalError?: Error;
  
  /** Stack trace for debugging */
  stack?: string;
  
  /** Timestamp when error occurred */
  timestamp: Date;
  
  /** Whether the error is retryable */
  retryable: boolean;
  
  /** Suggested retry delay in milliseconds */
  retryDelay?: number;
  
  /** User-friendly suggestions for resolution */
  suggestions?: string[];
}

/**
 * Result of the ingestion process
 */
export interface IngestionResult {
  /** Unique identifier for this ingestion attempt */
  ingestionId: string;
  
  /** Successfully ingested content (null if ingestion failed) */
  content: IngestedContent | null;
  
  /** List of warnings that occurred during ingestion */
  warnings: IngestionWarning[];
  
  /** Error information if ingestion failed */
  error: IngestionError | null;
  
  /** Overall success status */
  success: boolean;
  
  /** Processing duration in milliseconds */
  processingTime: number;
  
  /** Timestamp when ingestion started */
  startedAt: Date;
  
  /** Timestamp when ingestion completed */
  completedAt: Date;
  
  /** Additional debug information */
  debug?: {
    /** File processing steps taken */
    steps: string[];
    
    /** Performance metrics */
    metrics: Record<string, number>;
    
    /** Internal processing details */
    internal: Record<string, unknown>;
  };
}

/**
 * Configuration options for ingestion
 */
export interface IngestionOptions {
  /** Maximum file size to accept (defaults to MAX_FILE_SIZE_BYTES) */
  maxFileSize?: number;
  
  /** File types to accept (defaults to SUPPORTED_FILE_TYPES) */
  allowedFileTypes?: SupportedFileType[];
  
  /** Priority for processing this content */
  priority?: ContentPriority;
  
  /** Whether to perform virus/security scanning */
  performSecurityScan?: boolean;
  
  /** Timeout for processing in milliseconds */
  timeout?: number;
  
  /** Whether to extract detailed metadata */
  extractMetadata?: boolean;
  
  /** Whether to validate content structure */
  validateContent?: boolean;
  
  /** Custom processing options */
  customOptions?: Record<string, unknown>;
  
  /** User context for logging and analytics */
  userContext?: {
    userId?: string;
    projectId?: string;
    sessionId?: string;
  };
}

/**
 * Progress callback for long-running ingestion operations
 */
export interface IngestionProgress {
  /** Current step being processed */
  currentStep: string;
  
  /** Progress percentage (0-100) */
  progress: number;
  
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
  
  /** Additional status information */
  details?: string;
}

export type IngestionProgressCallback = (progress: IngestionProgress) => void;

/**
 * Batch ingestion result for multiple files
 */
export interface BatchIngestionResult {
  /** Overall batch identifier */
  batchId: string;
  
  /** Individual ingestion results */
  results: IngestionResult[];
  
  /** Overall batch statistics */
  statistics: {
    totalFiles: number;
    successfulFiles: number;
    failedFiles: number;
    totalWarnings: number;
    totalErrors: number;
    totalProcessingTime: number;
  };
  
  /** Batch-level warnings and errors */
  batchWarnings: IngestionWarning[];
  batchErrors: IngestionError[];
  
  /** Timestamp when batch started */
  startedAt: Date;
  
  /** Timestamp when batch completed */
  completedAt: Date;
}