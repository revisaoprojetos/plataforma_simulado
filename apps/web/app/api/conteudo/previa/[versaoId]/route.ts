import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { carregarQuestoesSimulado, type QuestaoSim } from '@/lib/teste/simulado-dados'
import { computarPreviaDados, type TextosDesempenho } from '@/lib/conteudo/previa-compute'
import { carregarTextosDesempenho, salvarTextosDesempenho } from '@/lib/conteudo/textos-desempenho'

// ROTA DE API do Laboratório da PRÉVIA (Biblioteca) — substitui as server actions do lab.
// POR QUÊ: atrás do Traefik em domínio custom (MEQ/VND) o Next REJEITA server actions no check de origem
// (CSRF) ANTES do corpo rodar — "An error occurred in the Server Components render" — e nem allowedOrigins
// resolveu no runtime. Rotas de API NÃO passam por esse check (como o picker/preview, que já funcionam no
// MEQ). Mesma lógica de antes (previa-actions.ts), só que servida por rota. Tenant/permission validados aqui.
export const dynamic = 'force-dynamic'

async function tenantOk(): Promise<string | null> {
  if (!(await checkPermission('configuracoes:view'))) return null
  const a = await getCurrentAccess()
  return a.tenantId || null
}

// GET ?simulado=<id>  → disciplinas/questões (igual obterDisciplinasDoSimulado; tenant por host, sem auth
//                       como era na action). GET ?textos=1 → textos de desempenho do tenant.
export async function GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('textos')) {
    const tenantId = await tenantOk()
    if (!tenantId) return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
    return NextResponse.json({ ok: true, textos: await carregarTextosDesempenho(tenantId) })
  }
  const sim = url.searchParams.get('simulado') || ''
  try {
    return NextResponse.json(await carregarQuestoesSimulado(sim))
  } catch (e) {
    return NextResponse.json({ disciplinas: [], questoes: [], erro: `Falha ao ler disciplinas: ${(e as any)?.message || String(e)}` })
  }
}

// POST { op: 'aplicar' | 'resetar' | 'textos', payload?, textos? } — grava previa_dados / limpa / salva textos.
export async function POST(req: Request, { params }: { params: Promise<{ versaoId: string }> }) {
  const { versaoId } = await params
  const tenantId = await tenantOk()
  if (!tenantId) return NextResponse.json({ erro: 'Sem permissão.', version: String(Date.now()) }, { status: 403 })
  const svc = createAdminClient()
  let body: any = {}
  try { body = await req.json() } catch { /* corpo vazio */ }
  const op = body?.op

  if (op === 'resetar') {
    await svc.from('simulado_conteudo_versoes').update({ previa_dados: null }).eq('tenant_id', tenantId).eq('id', versaoId)
    return NextResponse.json({ ok: true, version: String(Date.now()) })
  }
  if (op === 'textos') {
    const r = await salvarTextosDesempenho(tenantId, body.textos as TextosDesempenho)
    return NextResponse.json(r)
  }
  // default = aplicar: calcula (fonte única) e grava em previa_dados da versão.
  try {
    const payload = (body.payload || {}) as { simuladoTitulo?: string; disciplinas: { nome: string; acertos: number; total: number }[]; questoes?: QuestaoSim[] }
    const textos = await carregarTextosDesempenho(tenantId)
    const data = computarPreviaDados({ ...payload, textos })
    const { error } = await svc.from('simulado_conteudo_versoes').update({ previa_dados: data }).eq('tenant_id', tenantId).eq('id', versaoId)
    if (error) return NextResponse.json({ version: String(Date.now()), erro: error.message })
    return NextResponse.json({ version: String(Date.now()) })
  } catch (e) {
    return NextResponse.json({ version: String(Date.now()), erro: `Falha ao aplicar: ${(e as any)?.message || String(e)}` })
  }
}
