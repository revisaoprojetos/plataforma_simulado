import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { resolverEnunciadoUrls } from '@/lib/aluno/enunciado'

// GET /api/aluno/buscar-simulados?q=... — busca simulados do tenant do aluno pelo TÍTULO (ilike).
// Por ora a ferramenta de busca pesquisa SOMENTE simulados. Classifica cada resultado como JÁ FEITO
// (com nota/data) ou DISPONÍVEL (com link de fazer + caderno), espelhando "Simulados realizados".
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ resultados: [] })

  const svc = createAdminClient()
  const termo = q.replace(/[%_\\]/g, (m) => `\\${m}`) // ilike literal
  const { data: rows, error } = await svc
    .from('simulado_simulados')
    .select('id, titulo, embed_token, regras, status, data_inicio, data_fim, created_at')
    .eq('tenant_id', sessao.tenantId)
    .eq('deletado', false)
    .eq('status', 'publicado')
    .is('owner_estudante_id', null)
    .ilike('titulo', `%${termo}%`)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  const lista = (rows ?? []) as any[]
  if (!lista.length) return NextResponse.json({ resultados: [] })

  const ids = lista.map((s) => s.id)
  // Sessões do aluno nesses simulados + visual (capa/cor) + caderno (enunciado) — em paralelo.
  const [{ data: sess }, vis, enun] = await Promise.all([
    svc.from('simulado_sessoes_prova').select('id, simulado_id, status, nota, finalizado_em').eq('estudante_id', sessao.estudanteId).eq('is_teste', false).eq('deletado', false).in('simulado_id', ids),
    resolverVisualSimulados(svc, lista.map((s) => ({ id: s.id, regras: s.regras }))).catch(() => new Map()),
    resolverEnunciadoUrls(svc, lista.map((s) => ({ id: s.id, regras: s.regras }))).catch(() => new Map()),
  ])

  const sessPorSim = new Map<string, any[]>()
  for (const r of (sess ?? []) as any[]) { const a = sessPorSim.get(r.simulado_id) ?? []; a.push(r); sessPorSim.set(r.simulado_id, a) }

  // Progresso dos EM ANDAMENTO (questão atual / total / %) — igual a "Simulados realizados". 2 counts
  // leves, só para os simulados com sessão aberta entre os resultados.
  const emIds = lista.filter((s) => (sessPorSim.get(s.id) ?? []).some((x) => x.status !== 'finalizada')).map((s) => s.id)
  const openSessPorSim = new Map<string, string>()
  for (const s of lista) { const op = (sessPorSim.get(s.id) ?? []).find((x) => x.status !== 'finalizada'); if (op?.id) openSessPorSim.set(s.id, op.id) }
  const totalPorSim = new Map<string, number>(); const respPorSess = new Map<string, number>()
  if (emIds.length) {
    const openSessIds = [...openSessPorSim.values()]
    const [{ data: pqRows }, { data: rsRows }] = await Promise.all([
      svc.from('simulado_prova_questoes').select('simulado_id').in('simulado_id', emIds),
      openSessIds.length ? svc.from('simulado_respostas_objetivas').select('sessao_id').in('sessao_id', openSessIds) : Promise.resolve({ data: [] as any[] }),
    ])
    for (const r of (pqRows ?? []) as any[]) totalPorSim.set(r.simulado_id, (totalPorSim.get(r.simulado_id) ?? 0) + 1)
    for (const r of (rsRows ?? []) as any[]) respPorSess.set(r.sessao_id, (respPorSess.get(r.sessao_id) ?? 0) + 1)
  }

  const dm = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '')

  const resultados = lista.map((s) => {
    const v = (vis as Map<string, any>).get(s.id) ?? null
    const ss = sessPorSim.get(s.id) ?? []
    const finalizadas = ss.filter((x) => x.status === 'finalizada')
    const emAndamento = ss.some((x) => x.status !== 'finalizada')
    const notas = finalizadas.map((x) => (x.nota != null ? Number(x.nota) : null)).filter((n): n is number => n != null)
    const feito = finalizadas.length > 0
    const { notaLiberada } = resolverLiberacoes(s.regras, s)
    const ultimo = finalizadas.map((x) => x.finalizado_em).filter(Boolean).sort().pop() ?? null
    // Caderno (enunciado) p/ baixar — igual ao catálogo: PDF importado, ou caderno gerado via token.
    const info = (enun as Map<string, any>).get(s.id)
    const liberado = (s.regras as any)?.enunciado_liberado !== false
    const enunciadoUrl = !liberado ? null
      : info?.pdf ? info.pdf
      : (info?.temCaderno && s.embed_token) ? `/api/aluno/caderno-teste-questoes?token=${encodeURIComponent(s.embed_token)}` : null
    // Progresso (só faz sentido quando em andamento e NÃO feito).
    const total = totalPorSim.get(s.id) ?? 0
    const sessId = openSessPorSim.get(s.id)
    const resp = sessId ? (respPorSess.get(sessId) ?? 0) : 0
    const progresso = emAndamento && !feito ? { questaoAtual: Math.min(resp + 1, total || resp + 1), total, pct: total ? Math.round((resp / total) * 100) : 0 } : null
    return {
      id: s.id,
      titulo: s.titulo ?? 'Simulado',
      embedToken: s.embed_token ?? null,
      capa: v?.capa ?? v?.capaBanner ?? null,
      cor: v?.cor ?? null,
      feito,
      emAndamento,
      nota: notas.length ? Math.max(...notas) : null,
      notaLiberada: !!notaLiberada,
      data: dm(ultimo),
      enunciadoUrl,
      progresso,
    }
  })

  return NextResponse.json({ resultados })
}
