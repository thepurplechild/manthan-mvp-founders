/**
 * Asynchronous Job Processing Types for Vercel Infrastructure
 *
 * This module defines types for the async file ingestion system using
 * Vercel Blob for storage, KV for queuing, and cron for processing.
 */

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retrying' | 'dead_letter';

export interface JobMetadata {
  /** Unique job identifier */
  jobId: string;

  /** Current job status */
  status: JobStatus;

  /** File information */
  file: {
    name: string;
    size: number;
    type: string;
    blobUrl: string; // Vercel Blob URL
  };

  /** Processing options */
  options: {
    priority: 'low' | 'medium' | 'high' | 'urgent';
    userId?: string;
    projectId?: string;
    sessionId?: string;
  };

  /** Timestamps */
  createdAt: string;
  startedAt?: string;
  completedAt?: string;

  /** Progress tracking */
  progress: {
    currentStep: string;
    percentage: number;
    details?: string;
  };

  /** Error handling */
  error?: {
    type: string;
    message: string;
    stackTrace?: string;
    retryable: boolean;
    retryCount: number;
    lastRetryAt?: string;
  };

  /** Processing results */
  result?: {
    ingestionId: string;
    contentId: string;
    contentType: string;
    extractedText?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface QueueJob {
  jobId: string;
  priority: number; // 1=urgent, 2=high, 3=medium, 4=low
  createdAt: string;
  retryCount: number;
}

export interface JobProcessingResult {
  success: boolean;
  jobId: string;
  error?: string;
  shouldRetry?: boolean;
  retryAfter?: number; // seconds
  retryable?: boolean;
  result?: unknown; // Processing result data
}

// Job queue management
export const JOB_PRIORITIES = {
  urgent: 1,
  high: 2,
  medium: 3,
  low: 4
} as const;

export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_DELAY_BASE = 60; // seconds
export const JOB_TIMEOUT = 30000; // 30 seconds
export const QUEUE_BATCH_SIZE = 5; // Process up to 5 jobs per cron run

// KV Keys
export const KV_KEYS = {
  QUEUE: 'ingestion:queue',
  JOB_STATUS: (jobId: string) => `ingestion:job:${jobId}`,
  PROCESSING_LOCK: 'ingestion:processing:lock',
  STATS: 'ingestion:stats',
  DEAD_LETTER_QUEUE: 'ingestion:dlq',
  METRICS: 'ingestion:metrics',
  HEALTH: 'ingestion:health',
  CLEANUP_LOCK: 'ingestion:cleanup:lock'
} as const;

export interface IngestionStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  pendingJobs: number;
  lastProcessedAt: string;
  oldestJobCreated?: string;
}

// API Response types
export interface StartIngestionResponse {
  success: true;
  jobId: string;
  message: string;
  estimatedProcessingTime: string;
  statusUrl: string;
}

export interface StartIngestionError {
  success: false;
  error: {
    type: string;
    message: string;
    suggestions?: string[];
  };
}

export interface JobStatusResponse {
  success: true;
  jobId: string;
  status: JobStatus;
  progress: JobMetadata['progress'];
  file: {
    name: string;
    size: number;
    type: string;
  };
  timestamps: {
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
  };
  result?: JobMetadata['result'];
  error?: JobMetadata['error'];
}

export interface JobStatusError {
  success: false;
  error: {
    type: string;
    message: string;
  };
}

// Dead Letter Queue Types
export interface DeadLetterJob {
  /** Original job metadata */
  originalJob: JobMetadata;

  /** Failure details */
  failureInfo: {
    totalRetries: number;
    lastError: string;
    failedAt: string;
    processingHistory: Array<{
      attemptNumber: number;
      failedAt: string;
      error: string;
      processingTimeMs?: number;
    }>;
  };

  /** Debugging information */
  debugInfo: {
    memoryUsage?: NodeJS.MemoryUsage;
    systemLoad?: number;
    nodeVersion: string;
    vercelRegion?: string;
  };
}

// Job Metrics and Monitoring Types
export interface JobMetrics {
  /** Processing statistics */
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  retriedJobs: number;
  deadLetterJobs: number;

  /** Timing metrics */
  averageProcessingTime: number;
  medianProcessingTime: number;
  p95ProcessingTime: number;

  /** Queue metrics */
  currentQueueSize: number;
  oldestJobAge: number; // in milliseconds

  /** Error patterns */
  commonErrors: Array<{
    errorType: string;
    count: number;
    lastSeen: string;
  }>;

  /** System health */
  lastProcessedAt: string;
  systemHealth: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number; // in milliseconds
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  metrics: JobMetrics;
  checks: {
    kvConnection: boolean;
    blobAccess: boolean;
    queueProcessing: boolean;
    cronJobActive: boolean;
  };
  alerts?: Array<{
    level: 'warning' | 'error' | 'critical';
    message: string;
    component: string;
    timestamp: string;
  }>;
}

// Admin Interface Types
export interface AdminJobsResponse {
  success: true;
  data: {
    deadLetterJobs: DeadLetterJob[];
    totalCount: number;
    pagination: {
      page: number;
      pageSize: number;
      totalPages: number;
    };
    filters?: {
      dateRange?: [string, string];
      errorType?: string;
      originalStatus?: JobStatus;
    };
  };
}

export interface AdminJobsError {
  success: false;
  error: {
    type: string;
    message: string;
  };
}