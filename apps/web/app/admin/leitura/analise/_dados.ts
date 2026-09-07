import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'

export interface LinhaDocumento {
  id: string
  titulo: string
  publicado: boolean
  iniciaram: number
  concluiram: number
  pctMedio: number
  tempoMedioMin: number
}

/**
 * Resumo por documento (quem iniciou/concluiu, % médio, tempo médio).
 * A agregação varre TODAS as linhas de progresso do tenant — pesado à medida que a base cresce
 * (mesma classe do egress já incidente). Fica MEMOIZADO no Redis (TTL) — no cache-hit não toca no
 * banco; degrada sozinho sem Redis. Reflete até ~30min de atraso, aceitável p/ tela analítica.
 */
export async function relatorioLeitura(tenantId: string): Promise<LinhaDocumento[]> {
  return remember<LinhaDocumento[]>(chaveRelatorio(tenantId, 'leitura', 'resumo'), TTL_RELATORIO, async () => {
    const svc = createAdminClient()
    const docs = await fetchAll<any>(() =>
      svc.from('simulado_documentos').select('id, titulo, publicado').eq('tenant_id', tenantId).eq('deletado', false).order('atualizado_em', { ascending: false }))
    if (!docs.length) return []
    const ids = docs.map((d) => d.id)
    const prog = await fetchAllByIn<any>(ids, (chunk) =>
      svc.from('simulado_leitura_progresso').select('documento_id, pct, tempo_seg, concluido_em').in('documento_id', chunk))

    const agg = new Map<string, { n: number; concl: number; somaPct: number; somaTempo: number }>()
    for (const p of prog) {
      const a = agg.get(p.documento_id) ?? { n: 0, concl: 0, somaPct: 0, somaTempo: 0 }
      a.n += 1
      if (p.concluido_em) a.concl += 1
      a.somaPct += Number(p.pct ?? 0)
      a.somaTempo += Number(p.tempo_seg ?? 0)
      agg.set(p.documento_id, a)
    }
    return docs.map((d) => {
      const a = agg.get(d.id)
      return {
        id: d.id, titulo: d.titulo, publicado: !!d.publicado,
        iniciaram: a?.n ?? 0,
        concluiram: a?.concl ?? 0,
        pctMedio: a && a.n ? Math.round(a.somaPct / a.n) : 0,
        tempoMedioMin: a && a.n ? Math.round(a.somaTempo / a.n / 60) : 0,
      }
    })
  })
}

export interface LinhaAluno {
  estudanteId: string
  nome: string
  pct: number
  tempoMin: number
  concluido: boolean
  atualizadoEm: string | null
}

export const DETALHE_POR_PAGINA = 50

/** Detalhe de um documento: alunos que iniciaram, com % / tempo / conclusão — paginado server-side. */
export async function detalheDocumento(tenantId: string, documentoId: string, pagina = 1): Promise<{ titulo: string; alunos: LinhaAluno[]; total: number; pagina: number; porPagina: number } | null> {
  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_documentos').select('titulo').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
  if (!doc) return null
  const p = Math.max(1, pagina)
  const desde = (p - 1) * DETALHE_POR_PAGINA
  const { data: prog, count } = await svc.from('simulado_leitura_progresso')
    .select('estudante_id, pct, tempo_seg, concluido_em, atualizado_em', { count: 'exact' })
    .eq('documento_id', documentoId).eq('tenant_id', tenantId)
    .order('atualizado_em', { ascending: false })
    .range(desde, desde + DETALHE_POR_PAGINA - 1)
  const rows = (prog ?? []) as any[]
  const ids = [...new Set(rows.map((r) => r.estudante_id))]
  const nomePorId = new Map<string, string>()
  if (ids.length) {
    const ests = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_estudantes').select('id, nome, email').in('id', chunk))
    for (const e of ests) nomePorId.set(e.id, e.nome || e.email || 'Aluno')
  }
  return {
    titulo: (doc as any).titulo,
    alunos: rows.map((r) => ({
      estudanteId: r.estudante_id,
      nome: nomePorId.get(r.estudante_id) ?? 'Aluno',
      pct: Number(r.pct ?? 0),
      tempoMin: Math.round(Number(r.tempo_seg ?? 0) / 60),
      concluido: !!r.concluido_em,
      atualizadoEm: r.atualizado_em ?? null,
    })),
    total: count ?? rows.length,
    pagina: p,
    porPagina: DETALHE_POR_PAGINA,
  }
}
