/**
 * Project Manthan OS - Ingestion Engine Logging Infrastructure
 * 
 * Provides structured logging for debugging, analytics, and monitoring
 * of the content ingestion system.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  ingestionId?: string;
  userId?: string;
  projectId?: string;
  sessionId?: string;
  filename?: string;
  fileType?: string;
  fileSize?: number;
  step?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: Error;
  stack?: string;
  duration?: number;
}

class IngestionLogger {
  private logs: LogEntry[] = [];
  private readonly maxLogs = 1000;
  
  constructor(private defaultContext: LogContext = {}) {}
  
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error,
    duration?: number
  ): LogEntry {
    return {
      timestamp: new Date(),
      level,
      message,
      context: { ...this.defaultContext, ...context },
      error,
      stack: error?.stack,
      duration
    };
  }
  
  private addLog(entry: LogEntry): void {
    this.logs.push(entry);
    
    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    
    // Console output in development
    if (process.env.NODE_ENV === 'development') {
      this.outputToConsole(entry);
    }
    
    // In production, you might want to send to external logging service
    if (process.env.NODE_ENV === 'production') {
      this.sendToExternalService(entry);
    }
  }
  
  private outputToConsole(entry: LogEntry): void {
    const contextStr = entry.context ? ` [${JSON.stringify(entry.context)}]` : '';
    const durationStr = entry.duration ? ` (${entry.duration}ms)` : '';
    const message = `[${entry.level.toUpperCase()}] ${entry.message}${contextStr}${durationStr}`;
    
    switch (entry.level) {
      case 'debug':
        console.debug(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'warn':
        console.warn(message);
        if (entry.error) console.warn(entry.error);
        break;
      case 'error':
      case 'fatal':
        console.error(message);
        if (entry.error) console.error(entry.error);
        break;
    }
  }
  
  private async sendToExternalService(entry: LogEntry): Promise<void> {
    // In a real implementation, you would send logs to services like:
    // - DataDog, New Relic, Sentry, LogRocket, etc.
    // - Your own analytics endpoint
    // - Cloud logging services (AWS CloudWatch, Google Cloud Logging, etc.)
    
    try {
      // Example implementation (disabled by default)
      if (process.env.MANTHAN_LOGGING_ENDPOINT) {
        await fetch(process.env.MANTHAN_LOGGING_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(entry),
        });
      }
    } catch (error) {
      // Don't let logging errors break the main flow
      console.error('Failed to send log to external service:', error);
    }
  }
  
  debug(message: string, context?: LogContext): void {
    this.addLog(this.createLogEntry('debug', message, context));
  }
  
  info(message: string, context?: LogContext): void {
    this.addLog(this.createLogEntry('info', message, context));
  }
  
  warn(message: string, context?: LogContext, error?: Error): void {
    this.addLog(this.createLogEntry('warn', message, context, error));
  }
  
  error(message: string, context?: LogContext, error?: Error): void {
    this.addLog(this.createLogEntry('error', message, context, error));
  }
  
  fatal(message: string, context?: LogContext, error?: Error): void {
    this.addLog(this.createLogEntry('fatal', message, context, error));
  }
  
  // Performance logging
  time(label: string, context?: LogContext): () => void {
    const start = Date.now();
    this.debug(`Timer started: ${label}`, context);
    
    return () => {
      const duration = Date.now() - start;
      this.info(`Timer finished: ${label} (${duration}ms)`, context);
    };
  }
  
  // Create a child logger with additional context
  child(additionalContext: LogContext): IngestionLogger {
    return new IngestionLogger({ ...this.defaultContext, ...additionalContext });
  }
  
  // Get all logs for debugging
  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      const levels = ['debug', 'info', 'warn', 'error', 'fatal'];
      const minLevelIndex = levels.indexOf(level);
      return this.logs.filter(log => levels.indexOf(log.level) >= minLevelIndex);
    }
    return [...this.logs];
  }
  
  // Clear logs
  clearLogs(): void {
    this.logs = [];
  }
  
  // Get logs as formatted string for export
  exportLogs(level?: LogLevel): string {
    const logs = this.getLogs(level);
    return logs.map(log => {
      const contextStr = log.context ? ` ${JSON.stringify(log.context)}` : '';
      const durationStr = log.duration ? ` (${log.duration}ms)` : '';
      return `${log.timestamp.toISOString()} [${log.level.toUpperCase()}] ${log.message}${contextStr}${durationStr}`;
    }).join('\n');
  }
}

// Create default logger instance
export const defaultLogger = new IngestionLogger();

// Create a logger for a specific ingestion session
export function createIngestionLogger(context: LogContext): IngestionLogger {
  return new IngestionLogger(context);
}

// Utility functions for common logging patterns
export const logger = {
  // File processing logs
  fileProcessing: {
    started: (filename: string, fileSize: number, context?: LogContext) => {
      defaultLogger.info(`File processing started: ${filename} (${fileSize} bytes)`, {
        ...context,
        filename,
        fileSize,
        step: 'file_processing_start'
      });
    },
    
    completed: (filename: string, duration: number, context?: LogContext) => {
      defaultLogger.info(`File processing completed: ${filename} (${duration}ms)`, {
        ...context,
        filename,
        step: 'file_processing_complete'
      });
    },
    
    failed: (filename: string, error: Error, context?: LogContext) => {
      defaultLogger.error(`File processing failed: ${filename}`, {
        ...context,
        filename,
        step: 'file_processing_error'
      }, error);
    }
  },
  
  // Validation logs
  validation: {
    fileType: (filename: string, detected: string, expected: string[], context?: LogContext) => {
      defaultLogger.debug(`File type validation: ${filename} detected as ${detected}`, {
        ...context,
        filename,
        detectedType: detected,
        expectedTypes: expected,
        step: 'validation_file_type'
      });
    },
    
    fileSize: (filename: string, size: number, limit: number, context?: LogContext) => {
      defaultLogger.debug(`File size validation: ${filename} is ${size} bytes (limit: ${limit})`, {
        ...context,
        filename,
        fileSize: size,
        sizeLimit: limit,
        step: 'validation_file_size'
      });
    },
    
    passed: (filename: string, validations: string[], context?: LogContext) => {
      defaultLogger.info(`Validation passed: ${filename} (${validations.join(', ')})`, {
        ...context,
        filename,
        validations,
        step: 'validation_passed'
      });
    },
    
    failed: (filename: string, reason: string, context?: LogContext) => {
      defaultLogger.warn(`Validation failed: ${filename} - ${reason}`, {
        ...context,
        filename,
        validationError: reason,
        step: 'validation_failed'
      });
    }
  },
  
  // Content extraction logs
  extraction: {
    started: (filename: string, method: string, context?: LogContext) => {
      defaultLogger.debug(`Content extraction started: ${filename} using ${method}`, {
        ...context,
        filename,
        extractionMethod: method,
        step: 'extraction_start'
      });
    },
    
    progress: (filename: string, progress: number, context?: LogContext) => {
      defaultLogger.debug(`Content extraction progress: ${filename} ${progress}%`, {
        ...context,
        filename,
        progress,
        step: 'extraction_progress'
      });
    },
    
    completed: (filename: string, contentLength: number, context?: LogContext) => {
      defaultLogger.info(`Content extraction completed: ${filename} (${contentLength} characters)`, {
        ...context,
        filename,
        contentLength,
        step: 'extraction_complete'
      });
    },
    
    warning: (filename: string, warning: string, context?: LogContext) => {
      defaultLogger.warn(`Content extraction warning: ${filename} - ${warning}`, {
        ...context,
        filename,
        extractionWarning: warning,
        step: 'extraction_warning'
      });
    }
  },
  
  // Performance and analytics
  analytics: {
    ingestionStarted: (ingestionId: string, context?: LogContext) => {
      defaultLogger.info(`Ingestion session started`, {
        ...context,
        ingestionId,
        step: 'ingestion_start'
      });
    },
    
    ingestionCompleted: (ingestionId: string, duration: number, success: boolean, context?: LogContext) => {
      defaultLogger.info(`Ingestion session completed (${success ? 'success' : 'failed'}) in ${duration}ms`, {
        ...context,
        ingestionId,
        success,
        step: 'ingestion_complete'
      });
    },
    
    performanceMetric: (metric: string, value: number, unit: string, context?: LogContext) => {
      defaultLogger.debug(`Performance metric: ${metric} = ${value} ${unit}`, {
        ...context,
        metric,
        value,
        unit,
        step: 'performance_metric'
      });
    }
  }
};

export { IngestionLogger };