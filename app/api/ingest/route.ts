import { NextRequest, NextResponse } from 'next/server';
import { ingestFile, getSupportedFileTypes, getMaxFileSize } from '@/lib/ingestion/core';
import { IngestionResult, IngestionOptions } from '@/lib/ingestion/types';

/**
 * API Response types for proper TypeScript typing
 */
interface IngestionApiResponse {
  success: true;
  jobId: string;
  filename: string;
  fileSize: number;
  contentPreview: string;
  metadata: {
    pageCount?: number;
    author?: string;
    creationDate?: string;
    wordCount?: number;
    charCount?: number;
    contentType?: string;
    language?: string;
  };
  processingTime: string;
  ingestionId: string;
  result: IngestionResult;
}

interface IngestionApiError {
  success: false;
  error: {
    type: string;
    message: string;
    suggestions?: string[];
    retryable?: boolean;
    retryDelay?: number;
    debugInfo?: {
      step: string;
      timestamp: string;
      stackTrace?: string;
      memoryUsage?: NodeJS.MemoryUsage;
    };
  };
  ingestionId?: string;
}

/**
 * CORS headers for cross-origin requests
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Utility function to get current memory usage
 */
function getMemoryUsage(): NodeJS.MemoryUsage {
  return process.memoryUsage();
}

/**
 * Create content preview (first 500 characters)
 */
function createContentPreview(content: string): string {
  if (!content || content.length === 0) {
    return 'No text content extracted from file.';
  }

  const cleanedContent = content
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  if (cleanedContent.length <= 500) {
    return cleanedContent;
  }

  // Find the last complete word within 500 characters
  const truncated = cleanedContent.substring(0, 500);
  const lastSpaceIndex = truncated.lastIndexOf(' ');

  if (lastSpaceIndex > 400) { // Only break at word boundary if it's not too short
    return truncated.substring(0, lastSpaceIndex) + '...';
  }

  return truncated + '...';
}

/**
 * Format processing time to human-readable string
 */
function formatProcessingTime(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  } else if (milliseconds < 60000) {
    return `${(milliseconds / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = ((milliseconds % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Clean up temporary files
 */
async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    const fs = await import('fs');
    await fs.promises.unlink(filePath);
    console.log(`[cleanup] Successfully deleted temporary file: ${filePath}`);
  } catch (error) {
    // Log but don't throw - cleanup failures shouldn't break the response
    console.warn(`[cleanup] Failed to delete temporary file ${filePath}:`, error);
  }
}

/**
 * Utility function to log with timestamp and memory info
 */
function logStep(step: string, data?: Record<string, unknown>, error?: Error) {
  const timestamp = new Date().toISOString();
  const memoryUsage = getMemoryUsage();
  const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

  const logData = {
    step,
    timestamp,
    memoryUsageMB: memoryMB,
    ...(data && { data }),
    ...(error && {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    })
  };

  if (error) {
    console.error(`ERROR-${step}:`, JSON.stringify(logData, null, 2));
  } else {
    console.log(`STEP-${step}:`, JSON.stringify(logData, null, 2));
  }
}

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  logStep('01-OPTIONS', { message: 'CORS preflight request received' });
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

/**
 * Handle file ingestion POST requests with comprehensive error handling
 */
export async function POST(request: NextRequest): Promise<NextResponse<IngestionApiResponse | IngestionApiError>> {
  const startTime = Date.now();
  let currentStep = '00-INIT';
  let ingestionId: string | undefined;

  try {
    logStep('01-START', {
      url: request.url,
      method: request.method,
      userAgent: request.headers.get('user-agent'),
      contentType: request.headers.get('content-type'),
      contentLength: request.headers.get('content-length')
    });

    // Step 1: Parse multipart form data
    currentStep = '02-PARSE-FORM';
    logStep(currentStep, { message: 'Starting form data parsing' });

    let formData: FormData;
    try {
      formData = await request.formData();
      logStep(currentStep, {
        message: 'Form data parsed successfully',
        formDataKeys: Array.from(formData.keys())
      });
    } catch (error) {
      logStep(currentStep, { message: 'Failed to parse form data' }, error as Error);
      return NextResponse.json<IngestionApiError>(
        {
          success: false,
          error: {
            type: 'invalid_request',
            message: 'Invalid multipart/form-data request. Please ensure you are sending a properly formatted multipart request.',
            suggestions: [
              'Verify Content-Type header is set to multipart/form-data',
              'Ensure the request body contains valid form data',
              'Check that the file upload is properly formatted'
            ],
            retryable: false,
            debugInfo: {
              step: currentStep,
              timestamp: new Date().toISOString(),
              stackTrace: (error as Error)?.stack,
              memoryUsage: getMemoryUsage()
            }
          }
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    // Step 2: Extract and validate file
    currentStep = '03-EXTRACT-FILE';
    const file = formData.get('file') as File;
    logStep(currentStep, {
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type
    });

    if (!file) {
      logStep(currentStep, { message: 'No file provided in request' });
      return NextResponse.json<IngestionApiError>(
        {
          success: false,
          error: {
            type: 'validation_error',
            message: 'No file provided in the request. Please include a file in the "file" field.',
            suggestions: [
              'Ensure you are sending a POST request with multipart/form-data',
              'Include a file in the form field named "file"',
              'Check that the file is not empty'
            ],
            retryable: false,
            debugInfo: {
              step: currentStep,
              timestamp: new Date().toISOString(),
              memoryUsage: getMemoryUsage()
            }
          }
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    // Step 3: Validate file properties
    currentStep = '04-VALIDATE-FILE';
    logStep(currentStep, {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      maxAllowedSize: getMaxFileSize()
    });

    if (!file.name || file.name.trim() === '') {
      logStep(currentStep, { message: 'File has no name' });
      return NextResponse.json<IngestionApiError>(
        {
          success: false,
          error: {
            type: 'validation_error',
            message: 'File must have a valid filename.',
            suggestions: [
              'Ensure the uploaded file has a proper filename with extension',
              'Check that the file is not corrupted'
            ],
            retryable: false,
            debugInfo: {
              step: currentStep,
              timestamp: new Date().toISOString(),
              memoryUsage: getMemoryUsage()
            }
          }
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    // Step 4: Check file size
    currentStep = '05-CHECK-SIZE';
    const maxFileSize = getMaxFileSize();
    if (file.size > maxFileSize) {
      logStep(currentStep, {
        message: 'File size exceeds limit',
        fileSize: file.size,
        maxFileSize: maxFileSize,
        fileSizeMB: (file.size / (1024 * 1024)).toFixed(2),
        maxFileSizeMB: (maxFileSize / (1024 * 1024)).toFixed(2)
      });

      return NextResponse.json<IngestionApiError>(
        {
          success: false,
          error: {
            type: 'file_too_large',
            message: `File "${file.name}" is too large. Maximum file size is ${maxFileSize / (1024 * 1024)}MB, but file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`,
            suggestions: [
              'Try compressing the file using a ZIP utility',
              'Convert the document to a more efficient format',
              'Remove unnecessary images or media from the document',
              'Split large documents into smaller sections'
            ],
            retryable: false,
            debugInfo: {
              step: currentStep,
              timestamp: new Date().toISOString(),
              memoryUsage: getMemoryUsage()
            }
          }
        },
        {
          status: 413,
          headers: corsHeaders
        }
      );
    }

    // Step 5: Validate file type
    currentStep = '06-VALIDATE-TYPE';
    const supportedTypes = getSupportedFileTypes();
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    logStep(currentStep, {
      fileExtension,
      supportedTypes,
      isSupported: supportedTypes.includes(fileExtension as (typeof supportedTypes)[number])
    });

    if (!supportedTypes.includes(fileExtension as (typeof supportedTypes)[number])) {
      logStep(currentStep, { message: 'Unsupported file type', fileExtension, supportedTypes });
      return NextResponse.json<IngestionApiError>(
        {
          success: false,
          error: {
            type: 'unsupported_file_type',
            message: `File type "${fileExtension}" is not supported. Please use one of the supported formats: ${supportedTypes.join(', ')}.`,
            suggestions: [
              'Convert your file to a supported format (.txt, .pdf, .docx, .fdx, .celtx)',
              'If this is a script, try exporting as Final Draft (.fdx) or PDF',
              'For presentations, use PowerPoint (.pptx) or convert to PDF'
            ],
            retryable: false,
            debugInfo: {
              step: currentStep,
              timestamp: new Date().toISOString(),
              memoryUsage: getMemoryUsage()
            }
          }
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    // Step 6: Convert file to buffer
    currentStep = '07-CONVERT-BUFFER';
    logStep(currentStep, { message: 'Converting file to buffer' });

    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(await file.arrayBuffer());
      logStep(currentStep, {
        message: 'Buffer conversion successful',
        bufferSize: fileBuffer.length,
        bufferSizeMB: (fileBuffer.length / (1024 * 1024)).toFixed(2)
      });
    } catch (error) {
      logStep(currentStep, { message: 'Buffer conversion failed' }, error as Error);
      return NextResponse.json<IngestionApiError>(
        {
          success: false,
          error: {
            type: 'file_corrupted',
            message: `Unable to read file "${file.name}". The file may be corrupted.`,
            suggestions: [
              'Try re-uploading the file',
              'Check if the file opens correctly in its native application',
              'Convert the file to a different format and try again'
            ],
            retryable: true,
            retryDelay: 5000,
            debugInfo: {
              step: currentStep,
              timestamp: new Date().toISOString(),
              stackTrace: (error as Error)?.stack,
              memoryUsage: getMemoryUsage()
            }
          }
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    // Step 7: Extract parameters
    currentStep = '08-EXTRACT-PARAMS';
    const priorityParam = formData.get('priority') as string;
    const userIdParam = formData.get('userId') as string;
    const projectIdParam = formData.get('projectId') as string;
    const sessionIdParam = formData.get('sessionId') as string;

    logStep(currentStep, {
      priority: priorityParam,
      userId: userIdParam ? '[REDACTED]' : null,
      projectId: projectIdParam,
      sessionId: sessionIdParam ? '[REDACTED]' : null
    });

    // Step 8: Setup ingestion options
    currentStep = '09-SETUP-OPTIONS';
    const options: IngestionOptions = {
      priority: ['low', 'medium', 'high', 'urgent'].includes(priorityParam)
        ? (priorityParam as 'low' | 'medium' | 'high' | 'urgent')
        : 'medium',
      extractMetadata: true,
      validateContent: true,
      performSecurityScan: false, // Disable for Vercel performance
      timeout: 25000, // Reduced timeout for Vercel serverless
      userContext: {
        ...(userIdParam && { userId: userIdParam }),
        ...(projectIdParam && { projectId: projectIdParam }),
        ...(sessionIdParam && { sessionId: sessionIdParam })
      }
    };

    logStep(currentStep, {
      priority: options.priority,
      timeout: options.timeout,
      extractMetadata: options.extractMetadata,
      validateContent: options.validateContent
    });

    // Step 9: Start ingestion
    currentStep = '10-START-INGESTION';
    logStep(currentStep, {
      message: 'Starting core ingestion process',
      fileName: file.name,
      fileSize: file.size
    });

    const ingestionResult = await ingestFile(
      file.name,
      fileBuffer,
      file.type || undefined,
      options
    );

    ingestionId = ingestionResult.ingestionId;

    // Step 10: Process ingestion result
    currentStep = '11-PROCESS-RESULT';
    logStep(currentStep, {
      success: ingestionResult.success,
      ingestionId: ingestionResult.ingestionId,
      hasError: !!ingestionResult.error,
      warningCount: ingestionResult.warnings?.length || 0,
      processingTime: ingestionResult.processingTime
    });

    if (!ingestionResult.success || ingestionResult.error) {
      logStep(currentStep, {
        message: 'Ingestion failed',
        errorType: ingestionResult.error?.type,
        errorMessage: ingestionResult.error?.message
      });

      return NextResponse.json<IngestionApiError>(
        {
          success: false,
          ingestionId: ingestionResult.ingestionId,
          error: {
            type: ingestionResult.error?.type || 'unknown_error',
            message: ingestionResult.error?.message || 'An unknown error occurred during file processing.',
            suggestions: ingestionResult.error?.suggestions,
            retryable: ingestionResult.error?.retryable,
            retryDelay: ingestionResult.error?.retryDelay,
            debugInfo: {
              step: currentStep,
              timestamp: new Date().toISOString(),
              memoryUsage: getMemoryUsage()
            }
          }
        },
        {
          status: ingestionResult.error?.type === 'file_too_large' ? 413 :
                  ingestionResult.error?.type === 'unsupported_file_type' ? 400 :
                  ingestionResult.error?.type === 'timeout_error' ? 408 :
                  ingestionResult.error?.retryable ? 503 : 500,
          headers: corsHeaders
        }
      );
    }

    // Step 11: Return success
    currentStep = '12-SUCCESS';
    const processingTime = Date.now() - startTime;
    const finalMemoryUsage = getMemoryUsage();

    // Create content preview and extract metadata
    const textContent = ingestionResult.content?.textContent || '';
    const contentPreview = createContentPreview(textContent);
    const ingestionMetadata = ingestionResult.content?.metadata || {};

    // Step 12: File cleanup (if applicable)
    currentStep = '13-CLEANUP';
    // Note: In this synchronous version, files are processed from buffer directly
    // No temporary files need cleanup as we're not using /tmp storage
    logStep(currentStep, { message: 'No temporary files to clean up (buffer processing)' });

    logStep('12-SUCCESS', {
      message: 'Ingestion completed successfully',
      processingTime,
      contentLength: textContent.length,
      memoryUsageMB: Math.round(finalMemoryUsage.heapUsed / 1024 / 1024),
      previewLength: contentPreview.length
    });

    return NextResponse.json<IngestionApiResponse>(
      {
        success: true,
        jobId: ingestionResult.ingestionId,
        filename: file.name,
        fileSize: file.size,
        contentPreview,
        metadata: {
          pageCount: ingestionMetadata.pageCount,
          author: ingestionMetadata.author,
          creationDate: ingestionMetadata.createdDate ? new Date(ingestionMetadata.createdDate).toISOString() : undefined,
          wordCount: ingestionMetadata.wordCount,
          charCount: ingestionMetadata.charCount,
          contentType: ingestionResult.content?.contentType,
          language: ingestionMetadata.language
        },
        processingTime: formatProcessingTime(processingTime),
        ingestionId: ingestionResult.ingestionId,
        result: ingestionResult
      },
      {
        status: 200,
        headers: corsHeaders
      }
    );

  } catch (error) {
    // Comprehensive error logging
    const processingTime = Date.now() - startTime;
    const errorDetails = {
      step: currentStep,
      processingTime,
      error: {
        name: (error as Error)?.name || 'UnknownError',
        message: (error as Error)?.message || 'Unknown error occurred',
        stack: (error as Error)?.stack
      },
      memoryUsage: getMemoryUsage(),
      timestamp: new Date().toISOString()
    };

    logStep('FATAL-ERROR', errorDetails, error as Error);

    // Return comprehensive error response
    return NextResponse.json<IngestionApiError>(
      {
        success: false,
        ingestionId,
        error: {
          type: 'internal_server_error',
          message: `A server error occurred during ${currentStep}. Our team has been notified and will investigate this issue.`,
          suggestions: [
            'Please try again in a few moments',
            'If the problem persists, try with a different file format',
            'Contact support with the ingestion ID if available',
            'Check that your file is not corrupted'
          ],
          retryable: true,
          retryDelay: 10000,
          debugInfo: {
            step: currentStep,
            timestamp: new Date().toISOString(),
            stackTrace: (error as Error)?.stack,
            memoryUsage: getMemoryUsage()
          }
        }
      },
      {
        status: 500,
        headers: corsHeaders
      }
    );
  }
}

/**
 * Handle unsupported HTTP methods with comprehensive logging
 */
export async function GET(request: NextRequest) {
  logStep('METHOD-GET', {
    message: 'GET method attempted on ingestion endpoint',
    url: request.url,
    userAgent: request.headers.get('user-agent'),
    referer: request.headers.get('referer')
  });

  return NextResponse.json<IngestionApiError>(
    {
      success: false,
      error: {
        type: 'method_not_allowed',
        message: 'GET method is not supported for this endpoint. Use POST to upload files.',
        suggestions: [
          'Use POST method to upload files',
          'Include the file in multipart/form-data format',
          'Check the API documentation for proper usage',
          'Ensure you are making requests to the correct endpoint'
        ],
        retryable: false,
        debugInfo: {
          step: 'METHOD-GET',
          timestamp: new Date().toISOString(),
          memoryUsage: getMemoryUsage()
        }
      }
    },
    {
      status: 405,
      headers: {
        ...corsHeaders,
        'Allow': 'POST, OPTIONS'
      }
    }
  );
}

/**
 * Handle PUT method
 */
export async function PUT(request: NextRequest) {
  logStep('METHOD-PUT', {
    message: 'PUT method attempted on ingestion endpoint',
    url: request.url
  });

  return NextResponse.json<IngestionApiError>(
    {
      success: false,
      error: {
        type: 'method_not_allowed',
        message: 'PUT method is not supported. Use POST to upload files.',
        suggestions: [
          'Use POST method instead',
          'Include the file in multipart/form-data format'
        ],
        retryable: false,
        debugInfo: {
          step: 'METHOD-PUT',
          timestamp: new Date().toISOString(),
          memoryUsage: getMemoryUsage()
        }
      }
    },
    {
      status: 405,
      headers: {
        ...corsHeaders,
        'Allow': 'POST, OPTIONS'
      }
    }
  );
}

/**
 * Handle DELETE method
 */
export async function DELETE(request: NextRequest) {
  logStep('METHOD-DELETE', {
    message: 'DELETE method attempted on ingestion endpoint',
    url: request.url
  });

  return NextResponse.json<IngestionApiError>(
    {
      success: false,
      error: {
        type: 'method_not_allowed',
        message: 'DELETE method is not supported. Use POST to upload files.',
        suggestions: [
          'Use POST method instead',
          'Include the file in multipart/form-data format'
        ],
        retryable: false,
        debugInfo: {
          step: 'METHOD-DELETE',
          timestamp: new Date().toISOString(),
          memoryUsage: getMemoryUsage()
        }
      }
    },
    {
      status: 405,
      headers: {
        ...corsHeaders,
        'Allow': 'POST, OPTIONS'
      }
    }
  );
}