# Project Ingestion Engine - Implementation Guide

## Overview

The Project Manthan MVP has been successfully transformed into a fully functional platform for the "Accelerated Path" user journey. This implementation provides a complete end-to-end Project Ingestion Engine and AI Pipeline that processes script uploads and generates comprehensive pitch materials.

## Architecture Overview

### Core Workflow
1. **Secure File Upload**: Creator uploads script via signed URLs (avoids Vercel payload limits)
2. **AI Processing Pipeline**: Multi-step AI analysis using Claude 3 Opus
3. **Asset Generation**: Creates formatted pitch deck documents
4. **Results Delivery**: Provides downloadable materials and status updates

### Technology Stack
- **Frontend**: Next.js 15 with TypeScript, React, Tailwind CSS
- **Backend**: Vercel Serverless Functions (Python) + Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage (for scripts and generated assets)
- **AI**: Anthropic Claude 3 Opus API
- **Document Generation**: python-docx library

## Implementation Components

### 1. Secure File Upload System

#### `/api/projects/request-upload-url/index.py`
- **Purpose**: Generates signed URLs for direct-to-storage uploads
- **Input**: `fileName`, `fileType`, `projectId`
- **Output**: `signedUrl`, `filePath`, `fileId`, `expiresIn`
- **Features**:
  - File type validation (PDF, TXT, DOCX)
  - 5-minute URL expiration
  - Unique file path generation

#### `/api/projects/finalize-upload/index.py`
- **Purpose**: Finalizes upload and triggers AI processing
- **Input**: `projectId`, `filePath`, `fileName`, `fileType`, `fileSize`
- **Actions**:
  1. Creates ingestion record in database
  2. Sets up processing steps
  3. Asynchronously triggers packaging agent
  4. Updates script_uploads table (backward compatibility)

### 2. AI Packaging Agent

#### `/api/projects/run-packaging-agent/index.py`
- **Purpose**: Multi-step AI processing pipeline
- **Timeout**: 300 seconds, 1536MB memory
- **Processing Steps**:

1. **Script Preprocessing**: Downloads and prepares script content
2. **Core Elements Extraction**:
   - Logline generation
   - One-page synopsis
   - Main themes identification
   - Character analysis
3. **Character Bible Generation**: Detailed profiles for each character
4. **Visual Concepts**: Placeholder for visual treatment ideas
5. **Market Adaptation**: 10-episode series outline with platform-specific elements
6. **Package Assembly**: Comprehensive pitch deck content synthesis
7. **Final Package**: DOCX document creation and storage

#### AI Prompt Engineering
- **Model**: Claude 3 Opus (highest quality)
- **Prompt Chaining**: Each step builds on previous results
- **JSON Structured Outputs**: Ensures consistent data extraction
- **Market Context**: Incorporates platform mandates from database

### 3. Frontend Integration

#### Updated Upload Flow (`app/projects/[id]/upload/page.tsx`)
1. **Request Signed URL**: Calls `/api/projects/request-upload-url`
2. **Direct Upload**: Uses signed URL to upload to Supabase Storage
3. **Finalize**: Calls `/api/projects/finalize-upload` to trigger processing
4. **Real-time Status**: Polls `/api/ingestions/status` for progress updates
5. **Results Display**: Shows completion status and links to generated materials

#### Progress Indicators
- Upload progress: 0% → 25% (signed URL) → 75% (file uploaded) → 100% (finalized)
- Processing status: queued → running → completed/failed
- Step-by-step visibility for all 7 processing phases

### 4. Database Schema Updates

#### New Tables and Columns
```sql
-- Enhanced generated_assets table
ALTER TABLE public.generated_assets ADD COLUMN ingestion_id UUID;
ALTER TABLE public.generated_assets ADD COLUMN file_path TEXT;
ALTER TABLE public.generated_assets ADD COLUMN file_name TEXT;
ALTER TABLE public.generated_assets ADD COLUMN status TEXT;
ALTER TABLE public.generated_assets ADD COLUMN metadata JSONB;
```

#### Security Policies
- Service role can insert/update generated assets
- Users can view their own project assets
- Founders can view all assets
- Row-level security enabled throughout

## Environment Variables Required

### Supabase Configuration
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Anthropic AI
```env
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### Optional
```env
NEXT_PUBLIC_API_BASE=https://your-domain.vercel.app (for production)
```

## Deployment Instructions

### 1. Database Setup
```bash
# Run in Supabase SQL Editor
psql -f database-setup.sql
psql -f database-update-generated-assets.sql
```

### 2. Environment Variables
```bash
# Set in Vercel Dashboard or via CLI
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add ANTHROPIC_API_KEY
```

### 3. Deploy to Vercel
```bash
npm run build  # Test locally first
vercel deploy --prod
```

### 4. Supabase Storage Setup
- Ensure 'scripts' bucket exists
- Set appropriate RLS policies for file access
- Configure storage quotas as needed

## Feature Highlights

### File Upload Improvements
- **Signed URLs**: Bypasses Vercel 10MB payload limits
- **Direct Storage**: Files uploaded directly to Supabase Storage
- **Progress Tracking**: Real-time upload progress indicators
- **Error Handling**: Comprehensive error messages and retry logic

### AI Processing Pipeline
- **Multi-step Processing**: 7 distinct AI analysis phases
- **Step Tracking**: Database-backed progress monitoring
- **Timeout Handling**: 5-minute processing window for complex scripts
- **Structured Data**: JSON-based data extraction and storage

### Generated Assets
- **Professional Documents**: Formatted DOCX pitch decks
- **Comprehensive Content**: Loglines, synopses, character bibles, series outlines
- **Market Positioning**: Platform-specific adaptations
- **Version Control**: Timestamped asset generation

### User Experience
- **Visual Feedback**: Progress bars and status indicators
- **Real-time Updates**: WebSocket-like polling for status
- **Error Recovery**: Automatic retry mechanisms for stuck jobs
- **Success Actions**: Clear links to generated materials

## API Endpoints Summary

| Endpoint | Method | Purpose | Timeout |
|----------|--------|---------|---------|
| `/api/projects/request-upload-url` | POST | Get signed upload URL | 30s |
| `/api/projects/finalize-upload` | POST | Complete upload, trigger AI | 60s |
| `/api/projects/run-packaging-agent` | POST | AI processing pipeline | 300s |
| `/api/ingestions/status` | GET | Check processing status | 30s |

## Performance Considerations

### Optimizations Implemented
- **Asynchronous Processing**: Non-blocking AI pipeline execution
- **Progress Tracking**: Database-backed status updates
- **Memory Management**: Appropriate memory allocation for AI functions
- **Error Handling**: Graceful failure recovery and user notification

### Scalability Notes
- Python serverless functions scale automatically with Vercel
- Supabase handles database connections and storage scaling
- Claude API has built-in rate limiting and retry logic
- Generated documents stored efficiently in Supabase Storage

## Testing and Validation

### Functional Tests
1. **Upload Flow**: Test with PDF, TXT, and DOCX files
2. **AI Processing**: Verify all 7 steps complete successfully
3. **Error Handling**: Test network failures and timeouts
4. **Document Generation**: Validate DOCX output quality

### Integration Tests
1. **Database Operations**: Verify all CRUD operations work
2. **Storage Access**: Test file upload and download
3. **API Endpoints**: Validate all endpoint responses
4. **Status Polling**: Confirm real-time updates work

## Troubleshooting

### Common Issues
1. **Upload Failures**: Check Supabase Storage permissions and quotas
2. **AI Timeouts**: Verify Anthropic API key and rate limits
3. **Database Errors**: Ensure all migrations are applied
4. **Missing Assets**: Check generated_assets table and file paths

### Debug Tools
- Vercel Function logs for Python serverless functions
- Supabase logs for database operations
- Browser dev tools for frontend debugging
- Anthropic dashboard for API usage monitoring

## Future Enhancements

### Potential Improvements
1. **Visual Generation**: Add DALL-E integration for concept art
2. **Multiple Formats**: Support for PowerPoint and PDF pitch decks
3. **Collaboration**: Multi-user project editing capabilities
4. **Templates**: Industry-specific pitch deck templates
5. **Analytics**: Usage tracking and success metrics

This implementation provides a robust, scalable foundation for the Project Manthan MVP with comprehensive AI-powered script analysis and pitch material generation capabilities.