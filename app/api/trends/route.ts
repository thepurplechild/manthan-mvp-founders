import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function etagOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 'W/"' + h.toString(16) + '"';
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )

  const page = parseInt(req.nextUrl.searchParams.get('page') || '1')
  const pageSize = Math.min(parseInt(req.nextUrl.searchParams.get('pageSize') || '10'), 50)
  const region = req.nextUrl.searchParams.get('region') || undefined
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase.from('indian_market_trends').select('id,region,trending_genres,seasonal_prefs,platform_patterns,updated_at', { count: 'exact' })
  if (region) query = query.eq('region', region)
  const { data, error, count } = await query.range(from, to)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 's-maxage=30' } })
  const body = JSON.stringify({ page, pageSize, count, data })
  const etag = etagOf(body)
  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { 'ETag': etag, 'Cache-Control': 's-maxage=60' } })
  }
  return new NextResponse(body, { status: 200, headers: { 'Content-Type': 'application/json', 'ETag': etag, 'Cache-Control': 's-maxage=60' } })
}
