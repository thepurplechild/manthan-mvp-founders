/**
 * Enhanced Job System Logger
 * Provides structured logging specifically for the job recovery system
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';
export type LogCategory =
  | 'JOB_RECOVERY'
  | 'JOB_PROCESSING'
  | 'CRON_EXECUTION'
  | 'HEALTH_CHECK'
  | 'API_REQUEST'
  | 'DATABASE_OPERATION'
  | 'SYSTEM_PERFORMANCE';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  metadata?: Record<string, any>;
  correlation_id?: string;
  user_id?: string;
  job_id?: string;
  project_id?: string;
  execution_context?: {
    function_name?: string;
    duration_ms?: number;
    memory_usage_mb?: number;
    region?: string;
  };
  error_details?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export class JobSystemLogger {
  private static instance: JobSystemLogger;
  private correlationId: string;
  private startTime: number;

  private constructor() {
    this.correlationId = this.generateCorrelationId();
    this.startTime = Date.now();
  }

  static getInstance(): JobSystemLogger {
    if (!JobSystemLogger.instance) {
      JobSystemLogger.instance = new JobSystemLogger();
    }
    return JobSystemLogger.instance;
  }

  /**
   * Generate a new correlation ID for tracking related operations
   */
  newCorrelationId(): string {
    this.correlationId = this.generateCorrelationId();
    return this.correlationId;
  }

  /**
   * Get the current correlation ID
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Log debug information
   */
  debug(
    category: LogCategory,
    message: string,
    metadata?: Record<string, any>
  ): void {
    this.log('debug', category, message, metadata);
  }

  /**
   * Log general information
   */
  info(
    category: LogCategory,
    message: string,
    metadata?: Record<string, any>
  ): void {
    this.log('info', category, message, metadata);
  }

  /**
   * Log warnings
   */
  warn(
    category: LogCategory,
    message: string,
    metadata?: Record<string, any>
  ): void {
    this.log('warn', category, message, metadata);
  }

  /**
   * Log errors
   */
  error(
    category: LogCategory,
    message: string,
    error?: Error,
    metadata?: Record<string, any>
  ): void {
    const errorDetails = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    } : undefined;

    this.log('error', category, message, { ...metadata, error_details: errorDetails });
  }

  /**
   * Log critical system issues
   */
  critical(
    category: LogCategory,
    message: string,
    error?: Error,
    metadata?: Record<string, any>
  ): void {
    const errorDetails = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    } : undefined;

    this.log('critical', category, message, { ...metadata, error_details: errorDetails });
  }

  /**
   * Log job recovery operations
   */
  recovery(
    operation: 'started' | 'completed' | 'failed',
    details: {
      job_count?: number;
      recovered_count?: number;
      failed_count?: number;
      execution_time_ms?: number;
      trigger_type?: 'manual' | 'cron' | 'alert';
      stuck_job_ids?: string[];
    }
  ): void {
    this.info('JOB_RECOVERY', `Job recovery ${operation}`, {
      recovery_operation: operation,
      ...details
    });
  }

  /**
   * Log cron job executions
   */
  cronExecution(
    status: 'started' | 'completed' | 'failed',
    details: {
      cron_type?: string;
      execution_time_ms?: number;
      jobs_processed?: number;
      errors_encountered?: number;
    }
  ): void {
    this.info('CRON_EXECUTION', `Cron job ${status}`, {
      cron_status: status,
      ...details
    });
  }

  /**
   * Log API requests with performance metrics
   */
  apiRequest(
    method: string,
    path: string,
    status: number,
    details: {
      user_id?: string;
      duration_ms?: number;
      response_size_bytes?: number;
      request_size_bytes?: number;
    }
  ): void {
    this.info('API_REQUEST', `${method} ${path} - ${status}`, {
      http_method: method,
      http_path: path,
      http_status: status,
      ...details
    });
  }

  /**
   * Log database operations
   */
  databaseOperation(
    operation: string,
    table: string,
    details: {
      rows_affected?: number;
      execution_time_ms?: number;
      query_type?: 'select' | 'insert' | 'update' | 'delete' | 'rpc';
      success?: boolean;
    }
  ): void {
    this.debug('DATABASE_OPERATION', `${operation} on ${table}`, {
      db_operation: operation,
      db_table: table,
      ...details
    });
  }

  /**
   * Log performance metrics
   */
  performance(
    metric_name: string,
    value: number,
    unit: string,
    metadata?: Record<string, any>
  ): void {
    this.info('SYSTEM_PERFORMANCE', `Performance metric: ${metric_name}`, {
      metric_name,
      metric_value: value,
      metric_unit: unit,
      ...metadata
    });
  }

  /**
   * Log job state changes
   */
  jobStateChange(
    job_id: string,
    job_type: 'ai_processing' | 'ingestion',
    from_status: string,
    to_status: string,
    details?: {
      project_id?: string;
      ingestion_id?: string;
      error_message?: string;
      processing_duration_ms?: number;
      retry_count?: number;
    }
  ): void {
    this.info('JOB_PROCESSING', `Job state change: ${from_status} → ${to_status}`, {
      job_id,
      job_type,
      previous_status: from_status,
      new_status: to_status,
      ...details
    });
  }

  /**
   * Log health check results
   */
  healthCheck(
    status: 'healthy' | 'degraded' | 'unhealthy',
    details: {
      check_duration_ms?: number;
      issues_found?: string[];
      metrics?: Record<string, number>;
    }
  ): void {
    this.info('HEALTH_CHECK', `System health check: ${status}`, {
      health_status: status,
      ...details
    });
  }

  /**
   * Start a timed operation
   */
  startTimer(operation_name: string): () => void {
    const startTime = Date.now();
    this.debug('SYSTEM_PERFORMANCE', `Starting operation: ${operation_name}`, {
      operation_name,
      start_time: startTime
    });

    return () => {
      const duration = Date.now() - startTime;
      this.performance(operation_name, duration, 'milliseconds', {
        operation_completed: true
      });
    };
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    metadata?: Record<string, any>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      correlation_id: this.correlationId,
      execution_context: {
        duration_ms: Date.now() - this.startTime,
        memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        region: process.env.VERCEL_REGION || 'unknown'
      },
      ...metadata
    };

    // Output to appropriate stream based on level
    const output = level === 'error' || level === 'critical' ? console.error : console.log;
    output(JSON.stringify(entry));

    // For critical errors, also send to error reporting if available
    if (level === 'critical') {
      this.reportCriticalError(entry);
    }
  }

  /**
   * Generate a unique correlation ID
   */
  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Report critical errors to external monitoring (placeholder)
   */
  private reportCriticalError(entry: LogEntry): void {
    // In a production environment, this would send to:
    // - Sentry
    // - DataDog
    // - CloudWatch
    // - Custom monitoring service

    // For now, just ensure it's visible in logs
    console.error('🚨 CRITICAL ERROR DETECTED:', JSON.stringify(entry, null, 2));
  }
}

/**
 * Singleton logger instance
 */
export const jobLogger = JobSystemLogger.getInstance();

/**
 * Utility functions for common logging patterns
 */
export const logJobRecovery = {
  started: (jobCount: number, trigger: 'manual' | 'cron' | 'alert') =>
    jobLogger.recovery('started', { job_count: jobCount, trigger_type: trigger }),

  completed: (recoveredCount: number, executionTimeMs: number, stuckJobIds: string[]) =>
    jobLogger.recovery('completed', {
      recovered_count: recoveredCount,
      execution_time_ms: executionTimeMs,
      stuck_job_ids: stuckJobIds
    }),

  failed: (error: Error, executionTimeMs: number) =>
    jobLogger.error('JOB_RECOVERY', 'Job recovery operation failed', error, {
      execution_time_ms: executionTimeMs
    })
};

export const logCronJob = {
  started: (cronType: string) =>
    jobLogger.cronExecution('started', { cron_type: cronType }),

  completed: (cronType: string, executionTimeMs: number, jobsProcessed: number) =>
    jobLogger.cronExecution('completed', {
      cron_type: cronType,
      execution_time_ms: executionTimeMs,
      jobs_processed: jobsProcessed
    }),

  failed: (cronType: string, error: Error, executionTimeMs: number) =>
    jobLogger.error('CRON_EXECUTION', `Cron job ${cronType} failed`, error, {
      execution_time_ms: executionTimeMs
    })
};

export const logApiCall = {
  request: (method: string, path: string, userId?: string) => {
    const timer = jobLogger.startTimer(`api_${method.toLowerCase()}_${path.replace(/\//g, '_')}`);
    return {
      end: (status: number, responseSizeBytes?: number) => {
        timer();
        jobLogger.apiRequest(method, path, status, {
          user_id: userId,
          response_size_bytes: responseSizeBytes
        });
      }
    };
  }
};

export const logDatabase = {
  query: (operation: string, table: string, rowsAffected?: number, executionTimeMs?: number) =>
    jobLogger.databaseOperation(operation, table, {
      rows_affected: rowsAffected,
      execution_time_ms: executionTimeMs,
      success: true
    }),

  error: (operation: string, table: string, error: Error, executionTimeMs?: number) =>
    jobLogger.error('DATABASE_OPERATION', `Database ${operation} failed on ${table}`, error, {
      db_operation: operation,
      db_table: table,
      execution_time_ms: executionTimeMs,
      success: false
    })
};