/**
 * Project Manthan OS - Ingestion Engine
 * 
 * Main export file for the content ingestion system.
 * This provides a clean API for importing and using the ingestion engine.
 */

// Core functionality
export {
  ingestFile,
  ingestFileBatch,
  getSupportedFileTypes,
  isFileTypeSupported,
  getMaxFileSize
} from './core';

// Type definitions
export type {
  IngestionResult,
  IngestedContent,
  IngestionError,
  IngestionWarning,
  IngestionOptions,
  IngestionProgress,
  IngestionProgressCallback,
  BatchIngestionResult,
  SupportedFileType,
  ContentType,
  ContentPriority,
  ProcessingStatus,
  IngestionErrorType,
  IngestionWarningType
} from './types';

// Constants
export {
  SUPPORTED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB
} from './types';

// Logging utilities
export {
  defaultLogger,
  createIngestionLogger,
  logger,
  IngestionLogger
} from './logger';

export type {
  LogLevel,
  LogContext,
  LogEntry
} from './logger';

/**
 * Quick start example:
 * 
 * ```typescript
 * import { ingestFile, IngestionResult } from '@/lib/ingestion';
 * 
 * const result: IngestionResult = await ingestFile(
 *   'script.fdx',
 *   fileBuffer,
 *   'application/xml',
 *   {
 *     priority: 'high',
 *     extractMetadata: true,
 *     userContext: {
 *       userId: 'user123',
 *       projectId: 'project456'
 *     }
 *   },
 *   (progress) => {
 *     console.log(`${progress.progress}%: ${progress.currentStep}`);
 *   }
 * );
 * 
 * if (result.success && result.content) {
 *   console.log('Content extracted:', result.content.textContent);
 *   console.log('Metadata:', result.content.metadata);
 * } else {
 *   console.error('Ingestion failed:', result.error?.message);
 * }
 * ```
 */