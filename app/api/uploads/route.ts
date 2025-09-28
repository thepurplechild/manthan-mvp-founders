import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { randomUUID, createHash } from 'crypto'
import { rateLimit } from '@/lib/rate-limit'
import { enqueueIngestionJob } from '@/lib/jobs/queue'
import { getAdminClient } from '@/lib/supabase/admin'

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'upload',
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ACCEPTED = new Set(['application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])

const inferMimeType = (file: File): string => {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'pdf':
      return 'application/pdf'
    case 'txt':
      return 'text/plain'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'doc':
      return 'application/msword'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    default:
      return 'application/octet-stream'
  }
}

const inferCategory = (mimeType: string, fileName: string): 'script' | 'document' | 'image' | 'other' => {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'document'
  if (['text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'].includes(mimeType)) {
    return 'script'
  }
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension) {
    if (['txt', 'md', 'fountain'].includes(extension)) return 'script'
    if (['pdf'].includes(extension)) return 'document'
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return 'image'
  }
  return 'other'
}

const computeChecksum = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex')

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  log('upload_request_start', {
    ip,
    user_agent: req.headers.get('user-agent'),
    content_length: req.headers.get('content-length'),
  });

  const rl = rateLimit(`upload:${ip}`, 10, 60000)
  if (!rl.allowed) {
    log('upload_rate_limited', {
      ip,
      retry_after: rl.retryAfter,
    });
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfter/1000)) } })
  }
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      }
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    log('upload_auth_failed', {
      ip,
      error: authError?.message || 'No user found',
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  log('upload_auth_success', {
    user_id: user.id,
    user_email: user.email,
  });

  const form = await req.formData()
  const file = form.get('file') as File | null
  const projectId = (form.get('project_id') as string) || null

  log('upload_file_received', {
    user_id: user.id,
    project_id: projectId,
    filename: file?.name,
    file_size: file?.size,
    file_type: file?.type,
  });

  // Validate project_id is provided
  if (!projectId) {
    log('upload_validation_failed', { user_id: user.id, reason: 'No project_id provided' });
    return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
  }

  // Validate project exists and user owns it
  log('project_validation_start', { user_id: user.id, project_id: projectId });

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, owner_id, title')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    log('project_validation_failed', {
      user_id: user.id,
      project_id: projectId,
      error: projectError?.message || 'Project not found',
      error_code: projectError?.code
    });
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
  }

  if (project.owner_id !== user.id) {
    log('project_ownership_failed', {
      user_id: user.id,
      project_id: projectId,
      project_owner: project.owner_id
    });
    return NextResponse.json({ error: 'Access denied - you do not own this project' }, { status: 403 })
  }

  log('project_validation_success', {
    user_id: user.id,
    project_id: projectId,
    project_title: project.title
  });

  if (!file) {
    log('upload_validation_failed', { user_id: user.id, reason: 'No file provided' });
    return NextResponse.json({ error: 'No file' }, { status: 400 })
  }
  if (file.size === 0) {
    log('upload_validation_failed', { user_id: user.id, reason: 'Empty file', filename: file.name });
    return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    log('upload_validation_failed', {
      user_id: user.id,
      reason: 'File too large',
      filename: file.name,
      file_size: file.size,
      max_size: MAX_SIZE
    });
    return NextResponse.json({ error: 'File too large' }, { status: 413 })
  }

  // Basic type validation (allow common aliases)
  const typeOk = ACCEPTED.has(file.type) || file.name.endsWith('.pdf') || file.name.endsWith('.txt') || file.name.endsWith('.docx')
  if (!typeOk) {
    log('upload_validation_failed', {
      user_id: user.id,
      reason: 'Unsupported file type',
      filename: file.name,
      file_type: file.type,
      accepted_types: Array.from(ACCEPTED)
    });
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }

  log('upload_validation_passed', {
    user_id: user.id,
    filename: file.name,
    file_size: file.size,
    file_type: file.type,
  });

  // Stub: content/virus scan would occur here

  const arrayBuf = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuf)
  const checksum = computeChecksum(buffer)
  const mimeType = inferMimeType(file)
  const category = inferCategory(mimeType, file.name)
  const id = randomUUID()
  const nowIso = new Date().toISOString()
  // File extension extraction is done via file.name directly in path
  const path = `scripts/${user.id}/${id}/${file.name}`

  // Upload to Supabase Storage (private bucket 'scripts')
  log('storage_upload_start', {
    user_id: user.id,
    path,
    buffer_size: buffer.length,
    content_type: mimeType,
  });

  const uploadRes = await supabase.storage.from('scripts').upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  })

  if (uploadRes.error) {
    log('storage_upload_failed', {
      user_id: user.id,
      path,
      error: uploadRes.error.message,
    });
    return NextResponse.json({ error: uploadRes.error.message }, { status: 500 })
  }

  log('storage_upload_success', {
    user_id: user.id,
    path,
    storage_path: uploadRes.data?.path,
  });

  // Create ingestion and step rows using admin client to bypass RLS
  log('ingestion_record_create_start', {
    user_id: user.id,
    project_id: projectId,
    source_file_url: path,
    mime_type: mimeType,
    using_admin_client: true,
  });

  const adminSupabase = getAdminClient();

  const { data: existingVersion, error: versionError } = await adminSupabase
    .from('script_uploads')
    .select('version')
    .eq('project_id', projectId)
    .eq('file_name', file.name)
    .order('version', { ascending: false })
    .limit(1)

  if (versionError) {
    log('script_upload_version_lookup_failed', {
      user_id: user.id,
      project_id: projectId,
      error: versionError.message,
    });
  }

  const nextVersion = ((existingVersion && existingVersion[0]?.version) || 0) + 1

  // Start database transaction by creating ingestion record
  const { data: ingestion, error } = await adminSupabase.from('ingestions').insert({
    user_id: user.id,
    project_id: projectId,
    source_file_url: path,
    mime_type: mimeType,
    status: 'queued',
    progress: 0,
  }).select('*').single()

  if (error) {
    log('ingestion_record_create_failed', {
      user_id: user.id,
      project_id: projectId,
      error: error.message,
      error_code: error.code,
      error_details: error.details,
      using_admin_client: true,
    });

    // Clean up uploaded file on database failure
    try {
      await supabase.storage.from('scripts').remove([path]);
      log('storage_cleanup_success', { user_id: user.id, path });
    } catch (cleanupError) {
      log('storage_cleanup_failed', {
        user_id: user.id,
        path,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  log('ingestion_record_created', {
    user_id: user.id,
    ingestion_id: ingestion.id,
    project_id: projectId,
    status: ingestion.status,
    created_at: ingestion.created_at,
    using_admin_client: true,
  });

  // Also create a script_uploads record for backward compatibility and UI display
  log('script_uploads_record_create_start', {
    user_id: user.id,
    project_id: projectId,
    file_path: path,
    file_name: file.name,
    file_size: file.size,
  });

  const { data: scriptUpload, error: scriptUploadError } = await adminSupabase
    .from('script_uploads')
    .insert({
      project_id: projectId,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: mimeType,
      status: 'queued',
      category,
      version: nextVersion,
      checksum,
      antivirus_status: 'pending',
      validation_status: 'pending',
      storage_bucket: 'scripts',
      storage_exists: true,
      last_verified_at: nowIso,
      uploaded_at: nowIso,
    })
    .select('*')
    .single();

  if (scriptUploadError) {
    log('script_uploads_record_create_failed', {
      user_id: user.id,
      project_id: projectId,
      error: scriptUploadError.message,
      error_code: scriptUploadError.code,
    });
    // Don't fail the entire upload for script_uploads creation errors
    // The ingestion record is the primary source of truth
  } else {
    log('script_uploads_record_created', {
      user_id: user.id,
      script_upload_id: scriptUpload.id,
      project_id: projectId,
      file_path: path,
    });
  }

  const steps = [
    'script_preprocess',
    'core_extraction',
    'character_bible',
    'visuals',
    'market_adaptation',
    'package_assembly',
    'final_package',
  ] as const

  const stepRows = steps.map((name) => ({ ingestion_id: ingestion.id, name, status: 'queued' as const }))

  log('ingestion_steps_create_start', {
    user_id: user.id,
    ingestion_id: ingestion.id,
    steps_count: stepRows.length,
    steps: steps,
  });

  const { error: stepsError } = await adminSupabase.from('ingestion_steps').insert(stepRows)

  if (stepsError) {
    log('ingestion_steps_create_failed', {
      user_id: user.id,
      ingestion_id: ingestion.id,
      error: stepsError.message,
    });
    // Don't fail the entire upload for step creation errors
  } else {
    log('ingestion_steps_created', {
      user_id: user.id,
      ingestion_id: ingestion.id,
      steps_count: stepRows.length,
    });
  }

  log('queue_enqueue_start', {
    user_id: user.id,
    ingestion_id: ingestion.id,
    project_id: projectId,
  });

  try {
    await enqueueIngestionJob({
      ingestionId: ingestion.id,
      projectId,
      userId: user.id,
    });

    log('queue_enqueue_success', {
      user_id: user.id,
      ingestion_id: ingestion.id,
      project_id: projectId,
    });
  } catch (queueError) {
    log('queue_enqueue_failed', {
      user_id: user.id,
      ingestion_id: ingestion.id,
      error: queueError instanceof Error ? queueError.message : String(queueError),
    });

    // For critical queue failures, consider marking ingestion as failed
    // But for now, continue - the cron job should pick it up from database
    // In production, you might want to implement more sophisticated retry logic

    // Update ingestion with queue failure note (non-blocking)
    try {
      await adminSupabase
        .from('ingestions')
        .update({
          error_message: `Queue enrollment failed: ${queueError instanceof Error ? queueError.message : String(queueError)}. Will retry via cron.`
        })
        .eq('id', ingestion.id);
    } catch {
      // Ignore update failures - the record is still valid
    }
  }

  const duration = Date.now() - startTime;

  log('upload_complete', {
    user_id: user.id,
    ingestion_id: ingestion.id,
    project_id: projectId,
    path,
    duration,
    filename: file.name,
    file_size: file.size,
  });

  return NextResponse.json({
    ingestion_id: ingestion.id,
    path,
    status: 'queued',
    created_at: ingestion.created_at
  })
}
