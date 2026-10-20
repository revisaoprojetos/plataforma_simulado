import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/server'
import { salvarDocxEditado } from '@/lib/leitura/office'

// Callback do OnlyOffice (beta Leitura). Server-to-server: resolve o tenant pelo documento. Só guarda o
// docx editado no storage (NÃO escreve na Leitura — o admin importa explicitamente depois). JWT opcional
// + allowlist de host (anti-SSRF), igual ao callback da Biblioteca.
export const dynamic = 'force-dynamic'

function hostsPermitidos(): Set<string> {
  const urls = [process.env.NEXT_PUBLIC_ONLYOFFICE_URL || 'http://localhost:8082', process.env.ONLYOFFICE_INTERNAL_URL, process.env.CONTEUDO_DOCSERVER_URL].filter(Boolean) as string[]
  const s = new Set<string>()
  for (const u of urls) { try { s.add(new URL(u).host) } catch { /* ignora */ } }
  return s
}
function urlDoDocServer(url: string): boolean { try { return hostsPermitidos().has(new URL(url).host) } catch { return false } }
async function jwtOk(body: any, authHeader: string | null): Promise<boolean> {
  const segredo = process.env.ONLYOFFICE_JWT_SECRET
  if (!segredo) return true
  const token = body?.token || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null)
  if (!token) return false
  try { await jwtVerify(token, new TextEncoder().encode(segredo), { algorithms: ['HS256'] }); return true } catch { return false }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({} as any))
  if (!(await jwtOk(body, request.headers.get('authorization')))) return NextResponse.json({ error: 1 }, { status: 403 })
  if (!(body?.status === 2 || body?.status === 6) || typeof body?.url !== 'string') return NextResponse.json({ error: 0 })
  if (!urlDoDocServer(body.url)) { console.error('[leitura/office/callback] url fora do Document Server:', body.url); return NextResponse.json({ error: 1 }, { status: 400 }) }
  try {
    const svc = createAdminClient()
    const { data: doc } = await svc.from('simulado_documentos').select('id, tenant_id').eq('id', id).maybeSingle()
    if (!doc) return NextResponse.json({ error: 0 })
    const r = await fetch(body.url)
    const bytes = Buffer.from(await r.arrayBuffer())
    await salvarDocxEditado((doc as any).tenant_id, id, bytes)
  } catch (e) {
    console.error('[leitura/office/callback] falha:', (e as Error).message)
    return NextResponse.json({ error: 1 })
  }
  return NextResponse.json({ error: 0 })
}

export async function GET() { return NextResponse.json({ error: 0 }) }
