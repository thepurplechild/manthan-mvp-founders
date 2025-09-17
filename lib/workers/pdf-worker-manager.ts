// lib/workers/pdf-worker-manager.ts
import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs';

// Type declarations for runtime environment detection
declare global {
  const EdgeRuntime: string | undefined;
  const Deno: any;
  const Bun: any;
}

interface JobData {
  resolve: Function;
  reject: Function;
  timeout: NodeJS.Timeout;
  startTime: number;
  progressCallback?: (progress: { progress: number; step: string }) => void;
}

interface WorkerTelemetry {
  totalJobs: number;
  workerJobs: number;
  syncJobs: number;
  failedJobs: number;
  avgJobTime: number;
  lastWorkerSuccess: number | null;
  lastWorkerFailure: number | null;
  pathResolutionAttempts: string[];
  environmentDetection: {
    isServerless: boolean;
    platform: string;
    runtime: string;
    nodeVersion: string;
    supportsWorkers: boolean;
  };
}

class PdfWorkerManager {
  private workers: Map<string, Worker> = new Map();
  private activeJobs: Map<string, JobData> = new Map();
  private workerSupported: boolean | null = null;
  private resolvedWorkerPath: string | null = null;
  private telemetry: WorkerTelemetry = {
    totalJobs: 0,
    workerJobs: 0,
    syncJobs: 0,
    failedJobs: 0,
    avgJobTime: 0,
    lastWorkerSuccess: null,
    lastWorkerFailure: null,
    pathResolutionAttempts: [],
    environmentDetection: {
      isServerless: false,
      platform: process.platform,
      runtime: 'unknown',
      nodeVersion: process.version,
      supportsWorkers: false
    }
  };
  
  /**
   * Check if worker threads are supported and available
   */
  private isWorkerSupported(): boolean {
    if (this.workerSupported !== null) {
      return this.workerSupported;
    }

    try {
      // Detect runtime environment
      this.telemetry.environmentDetection.runtime = this.detectRuntime();
      
      // Check if we're in a serverless environment that might not support workers
      const isServerless = !!(
        process.env.VERCEL || 
        process.env.AWS_LAMBDA_FUNCTION_NAME || 
        process.env.NETLIFY ||
        process.env.FUNCTION_NAME || // Google Cloud Functions
        process.env.RAILWAY_ENVIRONMENT || // Railway
        process.env.REPLIT_ENVIRONMENT || // Replit
        process.env.SERVERLESS // Generic serverless indicator
      );
      
      this.telemetry.environmentDetection.isServerless = isServerless;
      
      // For Edge Runtime, workers are not supported
      if (this.telemetry.environmentDetection.runtime === 'edge') {
        console.log('[PDF Worker] Edge Runtime detected, disabling worker threads');
        this.workerSupported = false;
        return false;
      }

      // For Node.js runtime, we can try workers even in serverless
      if (this.telemetry.environmentDetection.runtime !== 'nodejs') {
        console.log('[PDF Worker] Non-Node.js runtime detected, disabling worker threads');
        this.workerSupported = false;
        return false;
      }

      // Try to resolve worker path
      const workerPath = this.resolveWorkerPath();
      if (!workerPath) {
        console.log('[PDF Worker] Could not resolve worker file path, falling back to sync processing');
        this.workerSupported = false;
        return false;
      }

      // Test worker creation with timeout
      const testWorker = new Worker(workerPath);
      testWorker.terminate().catch(() => {}); // Cleanup test worker
      
      this.workerSupported = true;
      this.telemetry.environmentDetection.supportsWorkers = true;
      console.log(`[PDF Worker] Workers enabled for ${this.telemetry.environmentDetection.runtime} runtime`);
      return true;
    } catch (error) {
      console.warn('[PDF Worker] Worker threads not supported:', error);
      this.workerSupported = false;
      this.telemetry.environmentDetection.supportsWorkers = false;
      return false;
    }
  }

  /**
   * Detect the current runtime environment
   */
  private detectRuntime(): string {
    // Check for Edge Runtime
    if (typeof EdgeRuntime !== 'undefined') {
      return 'edge';
    }
    
    // Check for Node.js runtime indicators
    if (typeof process !== 'undefined' && process.versions?.node) {
      return 'nodejs';
    }
    
    // Check for Deno
    if (typeof Deno !== 'undefined') {
      return 'deno';
    }
    
    // Check for Bun
    if (typeof Bun !== 'undefined') {
      return 'bun';
    }
    
    return 'unknown';
  }

  /**
   * Resolve the correct worker file path for current environment
   */
  private resolveWorkerPath(): string | null {
    // Return cached path if already resolved
    if (this.resolvedWorkerPath) {
      return this.resolvedWorkerPath;
    }

    // Priority order: compiled JS first, then development TS, then build outputs
    const possiblePaths = [
      // Compiled JavaScript worker (guaranteed to exist)
      path.resolve(__dirname, 'pdf-worker.compiled.js'),
      path.resolve(process.cwd(), 'lib/workers/pdf-worker.compiled.js'),
      
      // Development paths
      path.resolve(__dirname, 'pdf-worker.js'),
      path.resolve(__dirname, 'pdf-worker.ts'),
      
      // Next.js production build paths
      path.resolve(process.cwd(), '.next/server/chunks/pdf-worker.js'),
      path.resolve(process.cwd(), '.next/server/lib/workers/pdf-worker.js'),
      path.resolve(process.cwd(), '.next/server/app/lib/workers/pdf-worker.js'),
      
      // Built output directory
      path.resolve(process.cwd(), 'dist/lib/workers/pdf-worker.js'),
      path.resolve(process.cwd(), 'lib/workers/pdf-worker.js'),
      
      // Module resolution paths
      ...module.paths.map(p => path.join(p, 'lib/workers/pdf-worker.js')),
      ...module.paths.map(p => path.join(p, 'lib/workers/pdf-worker.compiled.js'))
    ];

    // Record all attempts for telemetry
    this.telemetry.pathResolutionAttempts = [];

    for (const workerPath of possiblePaths) {
      try {
        this.telemetry.pathResolutionAttempts.push(workerPath);
        if (fs.existsSync(workerPath)) {
          console.log(`[PDF Worker] Found worker at: ${workerPath}`);
          this.resolvedWorkerPath = workerPath;
          return workerPath;
        }
      } catch (error) {
        // Continue to next path
        console.debug(`[PDF Worker] Failed to check path ${workerPath}:`, error);
      }
    }

    console.warn('[PDF Worker] Could not find worker file in any of the expected locations:');
    console.warn('[PDF Worker] Attempted paths:', this.telemetry.pathResolutionAttempts);
    return null;
  }

  /**
   * Create worker with proper error handling
   */
  private createWorker(): Worker | null {
    if (!this.isWorkerSupported()) {
      return null;
    }

    const workerPath = this.resolveWorkerPath();
    if (!workerPath) {
      return null;
    }

    try {
      return new Worker(workerPath);
    } catch (error) {
      console.warn('[PDF Worker] Failed to create worker:', error);
      // Mark workers as unsupported to avoid further attempts
      this.workerSupported = false;
      this.telemetry.lastWorkerFailure = Date.now();
      return null;
    }
  }

  /**
   * Update telemetry with job completion data
   */
  private updateTelemetry(startTime: number, success: boolean, usedWorker: boolean) {
    const duration = Date.now() - startTime;
    this.telemetry.totalJobs++;
    
    if (usedWorker) {
      this.telemetry.workerJobs++;
      if (success) {
        this.telemetry.lastWorkerSuccess = Date.now();
      } else {
        this.telemetry.lastWorkerFailure = Date.now();
      }
    } else {
      this.telemetry.syncJobs++;
    }
    
    if (!success) {
      this.telemetry.failedJobs++;
    }
    
    // Update average job time
    this.telemetry.avgJobTime = (this.telemetry.avgJobTime * (this.telemetry.totalJobs - 1) + duration) / this.telemetry.totalJobs;
  }

  /**
   * Synchronous PDF processing fallback
   */
  private async processPdfSync(
    buffer: Buffer, 
    filename: string,
    progressCallback?: (progress: { progress: number; step: string }) => void
  ): Promise<any> {
    const startTime = Date.now();
    try {
      progressCallback?.({
        progress: 20,
        step: 'Loading PDF parser (sync mode)'
      });

      // Dynamic import to avoid bundling issues
      const pdfParse = await import('pdf-parse');
      
      progressCallback?.({
        progress: 40,
        step: 'Parsing PDF content (sync mode)'
      });

      const pdfData = await pdfParse.default(buffer);
      
      progressCallback?.({
        progress: 80,
        step: `Extracted text from ${pdfData.numpages} pages (sync mode)`
      });

      progressCallback?.({
        progress: 100,
        step: 'PDF parsing complete (sync mode)'
      });

      this.updateTelemetry(startTime, true, false);
      return pdfData;
    } catch (error) {
      this.updateTelemetry(startTime, false, false);
      throw new Error(`Synchronous PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Synchronous OCR processing fallback
   */
  private async processOcrSync(
    buffer: Buffer, 
    filename: string,
    progressCallback?: (progress: { progress: number; step: string }) => void
  ): Promise<string> {
    const startTime = Date.now();
    try {
      progressCallback?.({
        progress: 20,
        step: 'Initializing OCR processing (sync mode)'
      });

      // Check if we're in a server environment
      if (typeof window !== 'undefined') {
        throw new Error('OCR processing is only available on server environment');
      }

      // Dynamic imports for server-only dependencies
      const { loadPdfjs } = await import('../pdf/loader');
      const { createCanvas } = await import('canvas');
      const Tesseract = await import('tesseract.js');
      
      progressCallback?.({
        progress: 30,
        step: 'Loading PDF for OCR (sync mode)'
      });

      // Initialize PDF.js
      const pdfjsLib = await loadPdfjs();
      const loadingTask = pdfjsLib.getDocument({ 
        data: buffer, 
        isEvalSupported: false, 
        useSystemFonts: false 
      });
      const pdf = await loadingTask.promise;
      
      let ocrText = '';
      const totalPages = pdf.numPages || 0;
      
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const progressPercent = Math.min(40 + Math.floor((pageNum - 1) / Math.max(1, totalPages) * 40), 85);
        
        progressCallback?.({
          progress: progressPercent,
          step: `OCR processing page ${pageNum}/${totalPages} (sync mode)`
        });
        
        const page = await pdf.getPage(pageNum) as any;
        const scale = 2.0;
        const viewport = page.getViewport({ scale });
        
        // Create canvas for rendering
        const canvas = createCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          throw new Error(`Failed to create canvas context for page ${pageNum}`);
        }
        
        // Render PDF page to canvas
        const renderContext = {
          canvasContext: ctx as unknown,
          viewport,
        };
        
        await (page as any).render(renderContext).promise;
        
        // Generate image buffer
        const imgBuffer = canvas.toBuffer('image/png');
        
        // Perform OCR
        const ocrResult = await Tesseract.recognize(imgBuffer, 'eng');
        const pageText = ocrResult.data.text.trim();
        
        if (pageText) {
          ocrText += pageText + '\n\n';
        }
      }
      
      progressCallback?.({
        progress: 95,
        step: 'OCR processing complete (sync mode)'
      });
      
      this.updateTelemetry(startTime, true, false);
      return ocrText.trim();
      
    } catch (error) {
      this.updateTelemetry(startTime, false, false);
      throw new Error(`Synchronous OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async processPdf(
    buffer: Buffer, 
    filename: string,
    progressCallback?: (progress: { progress: number; step: string }) => void
  ): Promise<any> {
    // Try worker processing first, fall back to synchronous if needed
    if (this.isWorkerSupported()) {
      try {
        const result = await this.processPdfWorker(buffer, filename, progressCallback);
        console.log(`[PDF Worker] Successfully processed ${filename} using worker`);
        return result;
      } catch (error) {
        console.warn('[PDF Worker] Worker processing failed, falling back to sync:', error);
        // Disable workers for future requests
        this.workerSupported = false;
      }
    }

    // Fallback to synchronous processing
    console.log(`[PDF Worker] Using synchronous processing for ${filename}`);
    return await this.processPdfSync(buffer, filename, progressCallback);
  }

  async processOcr(
    buffer: Buffer, 
    filename: string,
    progressCallback?: (progress: { progress: number; step: string }) => void
  ): Promise<string> {
    // Try worker processing first, fall back to synchronous if needed
    if (this.isWorkerSupported()) {
      try {
        const result = await this.processOcrWorker(buffer, filename, progressCallback);
        console.log(`[PDF Worker] Successfully processed OCR for ${filename} using worker`);
        return result;
      } catch (error) {
        console.warn('[PDF Worker] OCR worker processing failed, falling back to sync:', error);
        // Disable workers for future requests
        this.workerSupported = false;
      }
    }

    // Fallback to synchronous processing
    console.log(`[PDF Worker] Using synchronous OCR processing for ${filename}`);
    return await this.processOcrSync(buffer, filename, progressCallback);
  }

  /**
   * Process PDF using worker thread
   */
  private async processPdfWorker(
    buffer: Buffer, 
    filename: string,
    progressCallback?: (progress: { progress: number; step: string }) => void
  ): Promise<any> {
    const taskId = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const worker = this.createWorker();
      
      if (!worker) {
        this.updateTelemetry(startTime, false, true);
        reject(new Error('Failed to create worker - falling back to synchronous processing'));
        return;
      }
      
      // 90-second timeout for PDF processing (generous for large files)
      const timeout = setTimeout(() => {
        this.cleanupJob(taskId, worker);
        this.updateTelemetry(startTime, false, true);
        reject(new Error(`PDF processing timeout - job took longer than 90 seconds. File: ${filename}`));
      }, 90000);
      
      this.activeJobs.set(taskId, { 
        resolve: (result: any) => {
          this.updateTelemetry(startTime, true, true);
          resolve(result);
        }, 
        reject: (error: Error) => {
          this.updateTelemetry(startTime, false, true);
          reject(error);
        }, 
        timeout, 
        startTime,
        progressCallback 
      });
      this.workers.set(taskId, worker);
      
      worker.on('message', (message) => this.handleWorkerMessage(taskId, message));
      worker.on('error', (error) => this.handleWorkerError(taskId, error));
      worker.on('exit', (code) => {
        if (code !== 0) {
          this.handleWorkerError(taskId, new Error(`Worker stopped with exit code ${code}`));
        }
      });
      
      // Start PDF processing
      worker.postMessage({ type: 'parse', buffer, filename, taskId });
    });
  }
  
  /**
   * Process OCR using worker thread
   */
  private async processOcrWorker(
    buffer: Buffer, 
    filename: string,
    progressCallback?: (progress: { progress: number; step: string }) => void
  ): Promise<string> {
    const taskId = `ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const worker = this.createWorker();
      
      if (!worker) {
        this.updateTelemetry(startTime, false, true);
        reject(new Error('Failed to create OCR worker - falling back to synchronous processing'));
        return;
      }
      
      // 180-second timeout for OCR (more time-intensive)
      const timeout = setTimeout(() => {
        this.cleanupJob(taskId, worker);
        this.updateTelemetry(startTime, false, true);
        reject(new Error(`OCR processing timeout - job took longer than 3 minutes. File: ${filename}`));
      }, 180000);
      
      this.activeJobs.set(taskId, { 
        resolve: (result: string) => {
          this.updateTelemetry(startTime, true, true);
          resolve(result);
        }, 
        reject: (error: Error) => {
          this.updateTelemetry(startTime, false, true);
          reject(error);
        }, 
        timeout, 
        startTime,
        progressCallback 
      });
      this.workers.set(taskId, worker);
      
      worker.on('message', (message) => this.handleWorkerMessage(taskId, message));
      worker.on('error', (error) => this.handleWorkerError(taskId, error));
      worker.on('exit', (code) => {
        if (code !== 0) {
          this.handleWorkerError(taskId, new Error(`OCR worker stopped with exit code ${code}`));
        }
      });
      
      // Start OCR processing
      worker.postMessage({ type: 'ocr', buffer, filename, taskId });
    });
  }
  
  private handleWorkerMessage(taskId: string, message: any) {
    const job = this.activeJobs.get(taskId);
    if (!job) return;
    
    if (message.type === 'result') {
      this.cleanupJob(taskId);
      job.resolve(message.data.result);
    } else if (message.type === 'error') {
      this.cleanupJob(taskId);
      job.reject(new Error(message.data.error));
    } else if (message.type === 'progress' && job.progressCallback) {
      // Forward progress updates to callback
      job.progressCallback({
        progress: message.data.progress,
        step: message.data.step
      });
    }
  }
  
  private handleWorkerError(taskId: string, error: Error) {
    const job = this.activeJobs.get(taskId);
    if (job) {
      this.cleanupJob(taskId);
      job.reject(new Error(`Worker error: ${error.message}`));
    }
  }
  
  private cleanupJob(taskId: string, worker?: Worker) {
    const job = this.activeJobs.get(taskId);
    if (job) {
      clearTimeout(job.timeout);
      this.activeJobs.delete(taskId);
    }
    
    const workerInstance = worker || this.workers.get(taskId);
    if (workerInstance) {
      try {
        workerInstance.terminate();
      } catch (error) {
        console.warn(`Failed to terminate worker ${taskId}:`, error);
      }
      this.workers.delete(taskId);
    }
  }
  
  // Get comprehensive stats for monitoring
  getStats() {
    return {
      activeJobs: this.activeJobs.size,
      activeWorkers: this.workers.size,
      workerSupported: this.workerSupported,
      resolvedWorkerPath: this.resolvedWorkerPath,
      telemetry: this.telemetry,
      jobDetails: Array.from(this.activeJobs.entries()).map(([taskId, job]) => ({
        taskId,
        runTime: Date.now() - job.startTime,
        startTime: new Date(job.startTime).toISOString()
      }))
    };
  }

  // Get telemetry data for logging/monitoring
  getTelemetry(): WorkerTelemetry {
    return { ...this.telemetry };
  }
  
  // Cleanup stuck jobs manually if needed
  cleanupStuckJobs(maxAgeMs = 300000) { // 5 minutes default
    const now = Date.now();
    const stuckJobs = Array.from(this.activeJobs.entries())
      .filter(([_, job]) => now - job.startTime > maxAgeMs);
    
    stuckJobs.forEach(([taskId, _]) => {
      console.warn(`Cleaning up stuck job: ${taskId}`);
      this.cleanupJob(taskId);
    });
    
    return stuckJobs.length;
  }

  // Force disable workers (for testing fallback)
  disableWorkers() {
    this.workerSupported = false;
    console.log('[PDF Worker] Workers forcibly disabled');
  }

  // Check if workers are currently enabled
  areWorkersEnabled(): boolean {
    return this.workerSupported === true;
  }

  // Log comprehensive telemetry
  logTelemetry() {
    console.log('[PDF Worker] Telemetry Report:', {
      environment: this.telemetry.environmentDetection,
      performance: {
        totalJobs: this.telemetry.totalJobs,
        workerJobs: this.telemetry.workerJobs,
        syncJobs: this.telemetry.syncJobs,
        failedJobs: this.telemetry.failedJobs,
        successRate: this.telemetry.totalJobs > 0 ? ((this.telemetry.totalJobs - this.telemetry.failedJobs) / this.telemetry.totalJobs * 100).toFixed(2) + '%' : 'N/A',
        workerUsageRate: this.telemetry.totalJobs > 0 ? (this.telemetry.workerJobs / this.telemetry.totalJobs * 100).toFixed(2) + '%' : 'N/A',
        avgJobTime: Math.round(this.telemetry.avgJobTime) + 'ms'
      },
      timestamps: {
        lastWorkerSuccess: this.telemetry.lastWorkerSuccess ? new Date(this.telemetry.lastWorkerSuccess).toISOString() : null,
        lastWorkerFailure: this.telemetry.lastWorkerFailure ? new Date(this.telemetry.lastWorkerFailure).toISOString() : null
      },
      pathResolution: {
        resolvedPath: this.resolvedWorkerPath,
        attemptedPaths: this.telemetry.pathResolutionAttempts
      }
    });
  }
}

// Singleton instance
export const pdfWorkerManager = new PdfWorkerManager();

// Cleanup function for graceful shutdown
export function shutdownWorkers() {
  const stats = pdfWorkerManager.getStats();
  console.log(`Shutting down ${stats.activeWorkers} PDF workers...`);
  
  // Log final telemetry
  pdfWorkerManager.logTelemetry();
  
  // Force cleanup of all jobs
  stats.jobDetails.forEach(job => {
    pdfWorkerManager.cleanupStuckJobs(0); // Force cleanup all
  });
}

// Register cleanup on process exit
process.on('exit', shutdownWorkers);
process.on('SIGINT', () => {
  shutdownWorkers();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdownWorkers();
  process.exit(0);
});