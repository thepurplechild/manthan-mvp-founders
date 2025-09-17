import { NextRequest, NextResponse } from 'next/server';
import { parseFile } from '@/lib/ingestion/parsers';
import { SUPPORTED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from '@/lib/ingestion/types';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_FILE_TYPES.includes(fileExtension as import('@/lib/ingestion/types').SupportedFileType)) {
      return NextResponse.json(
        { 
          error: `Unsupported file type: ${fileExtension}. Supported types: ${SUPPORTED_FILE_TYPES.join(', ')}` 
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { 
          error: `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size: ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB` 
        },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Parse the file
    const parseResult = await parseFile(
      file.name,
      fileBuffer,
      fileExtension as import('@/lib/ingestion/types').SupportedFileType,
      (progress) => {
        // Progress callback - in a real app you might use WebSockets or Server-Sent Events
        console.log(`Parse progress: ${progress.currentStep} - ${progress.progress}%`);
      }
    );

    return NextResponse.json({
      success: true,
      textContent: parseResult.textContent,
      structuredContent: parseResult.structuredContent,
      metadata: parseResult.metadata,
      warnings: parseResult.warnings.map(w => w.message),
    });

  } catch (error) {
    console.error('Test ingestion error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        success: false 
      },
      { status: 500 }
    );
  }
}
