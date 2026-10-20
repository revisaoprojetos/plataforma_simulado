import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/server'
import { guardarOriginal, converterParaHtml } from '@/lib/conteudo/ingestao'
import { reconciliarVersao } from '@/lib/conteudo/reconciliacao'
import { gerarThumbDocumento } from '@/lib/conteudo/thumb'

// Hosts de onde o Document Server pode servir o .docx editado (anti-SSRF: `body.url` tem que vir dele).
function hostsPermitidos(): Set<string> {
  const urls = [process.env.NEXT_PUBLIC_ONLYOFFICE_URL || 'http://localhost:8082', process.env.ONLYOFFICE_INTERNAL_URL, process.env.CONTEUDO_DOCSERVER_URL].filter(Boolean) as string[]
  const s = new Set<string>()
  for (const u of urls) { try { s.add(new URL(u).host) } catch { /* ignora inválido */ } }
  return s
}
function urlDoDocServer(url: string): boolean {
  try { return hostsPermitidos().has(new URL(url).host) } catch { return false }
}
// Se ONLYOFFICE_JWT_SECRET está setado, o callback TEM que vir assinado (body.token). Sem segredo,
// cai no allowlist de host apenas.
async function jwtOk(body: any, authHeader: string | null): Promise<boolean> {
  const segredo = process.env.ONLYOFFICE_JWT_SECRET
  if (!segredo) return true
  const token = body?.token || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null)
  if (!token) return false
  try { await jwtVerify(token, new TextEncoder().encode(segredo), { algorithms: ['HS256'] }); return true } catch { return false }
}

// OnlyOffice · callback do CONTEÚDO (Fase 4). Server-to-server (sem sessão): resolve tenant pela versão.
// Ao salvar (status 2/6), baixa o .docx editado, grava como arquivo da versão e RE-RECONCILIA o rascunho
// contra a versão-pai (carrega uids → grifos sobrevivem). Responder { error: 0 } sempre.
export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ versaoId: string }> }) {
  const { versaoId } = await params
  const body = await request.json().catch(() => ({} as any))
  if (!(await jwtOk(body, request.headers.get('authorization')))) return NextResponse.json({ error: 1 }, { status: 403 })
  if (!(body?.status === 2 || body?.status === 6) || typeof body?.url !== 'string') return NextResponse.json({ error: 0 })
  if (!urlDoDocServer(body.url)) { console.error('[conteudo/callback] url fora do Document Server:', body.url); return NextResponse.json({ error: 1 }, { status: 400 }) }
  try {
    const svc = createAdminClient()
    const { data: v } = await svc.from('simulado_conteudo_versoes')
      .select('id, tenant_id, documento_id, numero').eq('id', versaoId).maybeSingle()
    if (!v) return NextResponse.json({ error: 0 })

    const r = await fetch(body.url)
    const bytes = Buffer.from(await r.arrayBuffer())

    const guardado = await guardarOriginal({ tenantId: v.tenant_id, documentoId: v.documento_id, numeroVersao: v.numero, tipo: 'docx', data: bytes, nome: 'edicao.docx' })
    if ('erro' in guardado) { console.error('[conteudo/callback] storage:', guardado.erro); return NextResponse.json({ error: 1 }) }
    await svc.from('simulado_conteudo_versoes').update({ arquivo_key: guardado.arquivoKey, hash_arquivo: guardado.hash }).eq('id', v.id)

    const { html } = await converterParaHtml(bytes, 'docx')
    const { data: anterior } = await svc.from('simulado_conteudo_versoes')
      .select('id, numero').eq('tenant_id', v.tenant_id).eq('documento_id', v.documento_id).lt('numero', v.numero)
      .order('numero', { ascending: false }).limit(1).maybeSingle()
    if (html.trim()) await reconciliarVersao({ documentoId: v.documento_id, versaoNovaId: v.id, versaoAnteriorId: anterior?.id ?? null, html, forcar: true, tenantId: v.tenant_id })
    // Edição salva → regenera a miniatura FIEL do card (conteúdo/hash mudaram).
    await gerarThumbDocumento(v.tenant_id, v.documento_id, { forcar: true }).catch(() => {})
  } catch (e) {
    console.error('[conteudo/callback] falha:', (e as Error).message)
    return NextResponse.json({ error: 1 })
  }
  return NextResponse.json({ error: 0 })
}

export async function GET() { return NextResponse.json({ error: 0 }) }
