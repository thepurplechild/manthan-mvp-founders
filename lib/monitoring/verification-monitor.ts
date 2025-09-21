/**
 * 📊 Verification & Rights Acceptance Monitoring System
 *
 * Centralized logging, error tracking, and performance monitoring
 * for email verification and terms acceptance workflows.
 */

export interface MonitoringEvent {
  eventType: 'verification_attempt' | 'rights_acceptance' | 'error' | 'performance';
  timestamp: string;
  userId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  data: Record<string, any>;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'auth' | 'api' | 'frontend' | 'system';
}

export interface VerificationMetrics {
  totalAttempts: number;
  successfulVerifications: number;
  failedVerifications: number;
  expiredTokens: number;
  invalidTokens: number;
  averageProcessingTime: number;
  errorRate: number;
}

export interface RightsAcceptanceMetrics {
  totalAttempts: number;
  successfulAcceptances: number;
  failedAcceptances: number;
  retryAttempts: number;
  averageRetryCount: number;
  mostCommonErrors: Array<{ error: string; count: number }>;
}

class VerificationMonitor {
  private events: MonitoringEvent[] = [];
  private readonly maxEvents = 1000; // Keep last 1000 events in memory

  /**
   * Log a verification attempt
   */
  logVerificationAttempt(data: {
    userId?: string;
    hasCode: boolean;
    hasTokenHash: boolean;
    type?: string;
    ip?: string;
    userAgent?: string;
    success: boolean;
    error?: string;
    processingTime?: number;
    redirectTo?: string;
  }): void {
    const event: MonitoringEvent = {
      eventType: 'verification_attempt',
      timestamp: new Date().toISOString(),
      userId: data.userId,
      ip: data.ip,
      userAgent: data.userAgent,
      data: {
        hasCode: data.hasCode,
        hasTokenHash: data.hasTokenHash,
        type: data.type,
        success: data.success,
        error: data.error,
        processingTime: data.processingTime,
        redirectTo: data.redirectTo,
        verificationMethod: data.hasCode ? 'pkce' : 'legacy'
      },
      severity: data.success ? 'info' : (data.error?.includes('expired') ? 'warning' : 'error'),
      category: 'auth'
    };

    this.addEvent(event);
    this.logToConsole(event);

    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      this.sendToExternalService(event);
    }
  }

  /**
   * Log a rights acceptance attempt
   */
  logRightsAcceptance(data: {
    userId: string;
    version: string;
    ip?: string;
    userAgent?: string;
    success: boolean;
    error?: string;
    retryAttempt: number;
    processingTime?: number;
    acceptanceId?: string;
  }): void {
    const event: MonitoringEvent = {
      eventType: 'rights_acceptance',
      timestamp: new Date().toISOString(),
      userId: data.userId,
      ip: data.ip,
      userAgent: data.userAgent,
      data: {
        version: data.version,
        success: data.success,
        error: data.error,
        retryAttempt: data.retryAttempt,
        processingTime: data.processingTime,
        acceptanceId: data.acceptanceId,
        isRetry: data.retryAttempt > 0
      },
      severity: data.success ? 'info' : (data.retryAttempt >= 3 ? 'error' : 'warning'),
      category: 'auth'
    };

    this.addEvent(event);
    this.logToConsole(event);

    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      this.sendToExternalService(event);
    }
  }

  /**
   * Log a general error
   */
  logError(data: {
    error: Error | string;
    context: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
    additionalData?: Record<string, any>;
  }): void {
    const errorMessage = typeof data.error === 'string' ? data.error : data.error.message;
    const errorStack = typeof data.error === 'string' ? undefined : data.error.stack;

    const event: MonitoringEvent = {
      eventType: 'error',
      timestamp: new Date().toISOString(),
      userId: data.userId,
      ip: data.ip,
      userAgent: data.userAgent,
      data: {
        error: errorMessage,
        stack: errorStack,
        context: data.context,
        ...data.additionalData
      },
      severity: 'error',
      category: 'system'
    };

    this.addEvent(event);
    this.logToConsole(event);

    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      this.sendToExternalService(event);
    }
  }

  /**
   * Log performance metrics
   */
  logPerformance(data: {
    operation: string;
    duration: number;
    userId?: string;
    success: boolean;
    additionalMetrics?: Record<string, any>;
  }): void {
    const event: MonitoringEvent = {
      eventType: 'performance',
      timestamp: new Date().toISOString(),
      userId: data.userId,
      data: {
        operation: data.operation,
        duration: data.duration,
        success: data.success,
        ...data.additionalMetrics
      },
      severity: data.duration > 5000 ? 'warning' : 'info', // Warn if operation takes >5s
      category: 'system'
    };

    this.addEvent(event);

    // Only log slow operations to console to reduce noise
    if (data.duration > 2000) {
      this.logToConsole(event);
    }

    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      this.sendToExternalService(event);
    }
  }

  /**
   * Get verification metrics
   */
  getVerificationMetrics(): VerificationMetrics {
    const verificationEvents = this.events.filter(e => e.eventType === 'verification_attempt');

    const total = verificationEvents.length;
    const successful = verificationEvents.filter(e => e.data.success).length;
    const failed = total - successful;
    const expired = verificationEvents.filter(e => e.data.error?.includes('expired')).length;
    const invalid = verificationEvents.filter(e => e.data.error?.includes('invalid')).length;

    const processingTimes = verificationEvents
      .map(e => e.data.processingTime)
      .filter(time => typeof time === 'number');

    const avgProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
      : 0;

    return {
      totalAttempts: total,
      successfulVerifications: successful,
      failedVerifications: failed,
      expiredTokens: expired,
      invalidTokens: invalid,
      averageProcessingTime: avgProcessingTime,
      errorRate: total > 0 ? (failed / total) * 100 : 0
    };
  }

  /**
   * Get rights acceptance metrics
   */
  getRightsAcceptanceMetrics(): RightsAcceptanceMetrics {
    const rightsEvents = this.events.filter(e => e.eventType === 'rights_acceptance');

    const total = rightsEvents.length;
    const successful = rightsEvents.filter(e => e.data.success).length;
    const failed = total - successful;
    const retryEvents = rightsEvents.filter(e => e.data.isRetry);

    const retryAttempts = rightsEvents.reduce((sum, e) => sum + (e.data.retryAttempt || 0), 0);
    const avgRetryCount = total > 0 ? retryAttempts / total : 0;

    // Count error frequencies
    const errorCounts: Record<string, number> = {};
    rightsEvents.filter(e => !e.data.success && e.data.error).forEach(e => {
      const error = e.data.error;
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    });

    const mostCommonErrors = Object.entries(errorCounts)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalAttempts: total,
      successfulAcceptances: successful,
      failedAcceptances: failed,
      retryAttempts: retryEvents.length,
      averageRetryCount: avgRetryCount,
      mostCommonErrors
    };
  }

  /**
   * Get recent events for debugging
   */
  getRecentEvents(limit: number = 50): MonitoringEvent[] {
    return this.events
      .slice(-limit)
      .reverse(); // Most recent first
  }

  /**
   * Get events by severity
   */
  getEventsBySeverity(severity: MonitoringEvent['severity']): MonitoringEvent[] {
    return this.events.filter(e => e.severity === severity);
  }

  /**
   * Generate monitoring report
   */
  generateReport(): {
    verification: VerificationMetrics;
    rightsAcceptance: RightsAcceptanceMetrics;
    recentErrors: MonitoringEvent[];
    summary: {
      totalEvents: number;
      errorCount: number;
      warningCount: number;
      timeRange: { start: string; end: string };
    };
  } {
    const verification = this.getVerificationMetrics();
    const rightsAcceptance = this.getRightsAcceptanceMetrics();
    const recentErrors = this.getEventsBySeverity('error').slice(-10);

    const errorCount = this.events.filter(e => e.severity === 'error').length;
    const warningCount = this.events.filter(e => e.severity === 'warning').length;

    const timestamps = this.events.map(e => e.timestamp).sort();
    const timeRange = {
      start: timestamps[0] || new Date().toISOString(),
      end: timestamps[timestamps.length - 1] || new Date().toISOString()
    };

    return {
      verification,
      rightsAcceptance,
      recentErrors,
      summary: {
        totalEvents: this.events.length,
        errorCount,
        warningCount,
        timeRange
      }
    };
  }

  /**
   * Add event to memory store
   */
  private addEvent(event: MonitoringEvent): void {
    this.events.push(event);

    // Keep only the most recent events to prevent memory bloat
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  /**
   * Log event to console with proper formatting
   */
  private logToConsole(event: MonitoringEvent): void {
    const emoji = this.getSeverityEmoji(event.severity);
    const timestamp = new Date(event.timestamp).toLocaleTimeString();

    console.log(
      `${emoji} [${timestamp}] ${event.eventType.toUpperCase()} - ${event.category}`,
      JSON.stringify({
        userId: event.userId,
        severity: event.severity,
        data: event.data
      }, null, 2)
    );
  }

  /**
   * Send event to external monitoring service
   */
  private async sendToExternalService(event: MonitoringEvent): Promise<void> {
    try {
      // TODO: Implement integration with monitoring services
      // Examples: Sentry, LogRocket, DataDog, New Relic, etc.

      // For now, we'll just prepare the data structure
      const payload = {
        ...event,
        environment: process.env.NODE_ENV,
        service: 'manthan-auth',
        version: process.env.npm_package_version || '1.0.0'
      };

      // Example integrations:

      // Sentry
      // Sentry.captureMessage(event.data.error || 'Event', event.severity);

      // Custom API
      // await fetch('/api/monitoring/events', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(payload)
      // });

      console.debug('📊 Event prepared for monitoring service:', payload);
    } catch (error) {
      console.error('Failed to send event to monitoring service:', error);
    }
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: MonitoringEvent['severity']): string {
    switch (severity) {
      case 'info': return '📋';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      case 'critical': return '🚨';
      default: return '📝';
    }
  }
}

// Export singleton instance
export const verificationMonitor = new VerificationMonitor();

// Export utility functions for common monitoring tasks
export const monitoring = {
  /**
   * Wrapper for measuring function execution time
   */
  measurePerformance: async <T>(
    operation: string,
    fn: () => Promise<T>,
    userId?: string
  ): Promise<T> => {
    const startTime = performance.now();
    let success = false;
    let error: Error | undefined;

    try {
      const result = await fn();
      success = true;
      return result;
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      throw err;
    } finally {
      const duration = performance.now() - startTime;

      verificationMonitor.logPerformance({
        operation,
        duration,
        userId,
        success,
        additionalMetrics: error ? { error: error.message } : undefined
      });
    }
  },

  /**
   * Track user actions with context
   */
  trackUserAction: (
    action: string,
    userId: string,
    data?: Record<string, any>
  ): void => {
    verificationMonitor.logPerformance({
      operation: `user_action_${action}`,
      duration: 0, // Instant action
      userId,
      success: true,
      additionalMetrics: data
    });
  }
};