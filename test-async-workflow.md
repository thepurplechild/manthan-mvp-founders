# Async Job Processing Workflow Test Plan

## Overview
This document outlines how to test the newly implemented asynchronous step-chained workflow for file ingestion processing.

## System Architecture

### 1. Job Orchestrator (`/api/ingestions/run/route.ts`)
- **Purpose**: Creates processing jobs instead of processing files directly
- **Input**: `{ ingestionId: string }`
- **Output**: Confirmation that jobs were created
- **Processing Time**: < 1 second (no heavy processing)

### 2. Async Job Processor (`/api/cron/process-jobs/route.ts`)
- **Purpose**: Processes queued jobs from `processing_jobs` table
- **Runs**: Every minute via cron (configurable)
- **Processing Steps**:
  1. `extract_text` - File download and text extraction
  2. `generate_summary` - AI-powered content analysis
  3. `create_action_items` - Character development and market insights
  4. `finalize` - Document generation and asset upload

### 3. Progress Tracking (`/api/ingestions/[id]/status/route.ts`)
- **Purpose**: Real-time status updates with step-by-step breakdown
- **Features**: Progress percentage, current step, time estimates, retry functionality

## Database Changes

### New Table: `processing_jobs`
```sql
-- Run the migration script: processing_jobs_migration.sql
-- This creates the job queue table with proper indexing and RLS policies
```

## Testing Steps

### Prerequisites
1. **Database Migration**:
   ```bash
   # Run in Supabase SQL Editor
   # Execute: processing_jobs_migration.sql
   ```

2. **Environment Variables**:
   ```bash
   CRON_SECRET=your-secret-key
   ANTHROPIC_API_KEY=your-anthropic-key (optional)
   ```

### Test Scenario 1: Basic Workflow
1. **Upload a file** through the existing upload endpoint
2. **Trigger processing** via the orchestrator:
   ```bash
   curl -X POST "http://localhost:3000/api/ingestions/run" \
     -H "Content-Type: application/json" \
     -H "x-cron-secret: your-secret-key" \
     -d '{"ingestionId": "your-ingestion-id"}'
   ```
3. **Check job creation** in `processing_jobs` table
4. **Run cron processor** manually:
   ```bash
   curl -X POST "http://localhost:3000/api/cron/process-jobs" \
     -H "x-cron-secret: your-secret-key"
   ```
5. **Monitor progress**:
   ```bash
   curl "http://localhost:3000/api/ingestions/your-id/status"
   ```

### Test Scenario 2: Error Handling & Retry
1. **Create an ingestion** with invalid file URL
2. **Run the workflow** - should fail gracefully
3. **Check error messages** in status endpoint
4. **Test retry functionality**:
   ```bash
   curl -X PATCH "http://localhost:3000/api/ingestions/your-id/status" \
     -H "Content-Type: application/json" \
     -d '{"action": "retry"}'
   ```

### Test Scenario 3: Progress Tracking
1. **Start a large file processing**
2. **Poll status endpoint** every 5 seconds
3. **Verify step-by-step progress** updates
4. **Check time estimation** accuracy

## Expected Behavior

### Before (Monolithic)
- ❌ Frequent timeouts at 90% completion
- ❌ No visibility into processing steps
- ❌ No retry mechanism
- ❌ Single point of failure

### After (Async Workflow)
- ✅ Jobs complete within time limits
- ✅ Real-time step-by-step progress
- ✅ Automatic retry with exponential backoff
- ✅ Resilient to individual step failures
- ✅ Better resource utilization

## Monitoring

### Key Metrics to Track
1. **Job Success Rate**: % of jobs completing successfully
2. **Step Duration**: Average time per processing step
3. **Retry Rate**: % of jobs requiring retries
4. **Queue Depth**: Number of pending jobs
5. **Error Patterns**: Common failure reasons

### Logs to Monitor
- `scope: 'orchestrator'` - Job creation logs
- `scope: 'job_processor'` - Individual step processing
- Step-specific logs: `text_extraction_*`, `summary_generation_*`, etc.

## Deployment Notes

### Cron Configuration
```bash
# Vercel cron.yaml (if using Vercel Cron)
cron:
  - path: '/api/cron/process-jobs'
    schedule: '* * * * *'  # Every minute
```

### Performance Optimization
1. **Batch Size**: Process multiple jobs per cron run (limited by execution time)
2. **Concurrency**: Consider parallel processing for independent steps
3. **Caching**: Cache common AI responses to reduce API calls
4. **Queue Prioritization**: Prioritize newer uploads

## Rollback Plan

If issues arise, the system can be rolled back by:
1. **Reverting** `/api/ingestions/run/route.ts` to original monolithic version
2. **Disabling** the cron job processor
3. **Keeping** the database migration (for future use)

The old and new systems can coexist during transition.