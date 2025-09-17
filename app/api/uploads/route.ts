import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import { rateLimit } from '@/lib/rate-limit'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ACCEPTED = new Set(['application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = rateLimit(`upload:${ip}`, 10, 60000)
  if (!rl.allowed) {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const projectId = (form.get('project_id') as string) || null

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large' }, { status: 413 })

  // Basic type validation (allow common aliases)
  const typeOk = ACCEPTED.has(file.type) || file.name.endsWith('.pdf') || file.name.endsWith('.txt') || file.name.endsWith('.docx')
  if (!typeOk) return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })

  // Stub: content/virus scan would occur here

  const arrayBuf = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuf)
  const id = randomUUID()
  // File extension extraction is done via file.name directly in path
  const path = `scripts/${user.id}/${id}/${file.name}`

  // Upload to Supabase Storage (private bucket 'scripts')
  const uploadRes = await supabase.storage.from('scripts').upload(path, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (uploadRes.error) return NextResponse.json({ error: uploadRes.error.message }, { status: 500 })

  // Create ingestion and step rows
  const { data: ingestion, error } = await supabase.from('ingestions').insert({
    user_id: user.id,
    project_id: projectId,
    source_file_url: path,
    mime_type: file.type || null,
    status: 'queued',
    progress: 0,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
  await supabase.from('ingestion_steps').insert(stepRows)

  // Fire-and-forget run trigger (best effort)
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE || ''
    const url = base ? `${base}/api/ingestions/run` : `${new URL(req.url).origin}/api/ingestions/run`
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingestion_id: ingestion.id }) }).catch(() => {})
  } catch {}

  return NextResponse.json({ ingestion_id: ingestion.id, path })
}
