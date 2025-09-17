// Next.js App Router: proxy to FastAPI (optional, if you keep same-origin)
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const base = process.env.NEXT_PUBLIC_API_BASE;
  if (!base) {
    return NextResponse.json({ error: 'Missing NEXT_PUBLIC_API_BASE' }, { status: 500 });
  }
  const r = await fetch(`${base}/api/ingestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return new NextResponse(text, { status: r.status });
}

