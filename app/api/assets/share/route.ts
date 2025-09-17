import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Body = z.object({ projectId: z.string(), path: z.string(), expiresIn: z.number().optional() })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ code: 'unauthorized' }, { status: 401 })
  const body = Body.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ code: 'bad_request' }, { status: 400 })
  const { data: proj } = await supabase.from('projects').select('owner_id').eq('id', body.data.projectId).single()
  if (!proj || proj.owner_id !== user.id) return NextResponse.json({ code: 'forbidden' }, { status: 403 })
  const { data, error } = await supabase.storage.from('generated-assets').createSignedUrl(body.data.path, body.data.expiresIn || 3600)
  if (error) return NextResponse.json({ code: 'sign_failed', message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, url: data.signedUrl })
}
