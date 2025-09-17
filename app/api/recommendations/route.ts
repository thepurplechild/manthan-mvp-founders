import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function etagOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 'W/"' + h.toString(16) + '"';
}

export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get('region') || ''
  const language = req.nextUrl.searchParams.get('language') || ''
  const genre = req.nextUrl.searchParams.get('genre') || ''

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )

  // Prefer RPC if function exists
  const { data, error } = await supabase.rpc('recommend_content', { region, language, genre })
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 's-maxage=30' } })
  const body = JSON.stringify(data)
  const etag = etagOf(body)
  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { 'ETag': etag, 'Cache-Control': 's-maxage=120' } })
  }
  return new NextResponse(body, { status: 200, headers: { 'Content-Type': 'application/json', 'ETag': etag, 'Cache-Control': 's-maxage=120' } })
}
