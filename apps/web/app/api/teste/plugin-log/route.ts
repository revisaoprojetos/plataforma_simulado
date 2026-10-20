import { NextResponse } from 'next/server'

// SPIKE — buffer de diagnóstico do plugin do OnlyOffice. O plugin (iframe) faz POST do seu estado
// (plugins.js carregou? init disparou?) e eu leio via GET — já que não dá pra ver o console do navegador.
export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*' }
const buf: unknown[] = ((globalThis as Record<string, unknown>).__pluginLog as unknown[]) ?? ((globalThis as Record<string, unknown>).__pluginLog = [] as unknown[])

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}))
  buf.push({ t: new Date().toISOString(), ...(b as object) })
  if (buf.length > 200) buf.shift()
  return NextResponse.json({ ok: true }, { headers: CORS })
}

export async function GET() {
  return NextResponse.json({ log: buf }, { headers: CORS })
}

export async function DELETE() {
  buf.length = 0
  return NextResponse.json({ ok: true }, { headers: CORS })
}
