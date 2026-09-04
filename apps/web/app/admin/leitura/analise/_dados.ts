import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'

export interface LinhaDocumento {
  id: string
  titulo: string
  publicado: boolean
  iniciaram: number
  concluiram: number
  pctMedio: number
  tempoMedioMin: number
}

/** Resumo por documento (quem iniciou/concluiu, % médio, tempo médio). */
export async function relatorioLeitura(tenantId: string): Promise<LinhaDocumento[]> {
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
}

export interface LinhaAluno {
  estudanteId: string
  nome: string
  pct: number
  tempoMin: number
  concluido: boolean
  atualizadoEm: string | null
}

/** Detalhe de um documento: alunos que iniciaram, com % / tempo / conclusão. */
export async function detalheDocumento(tenantId: string, documentoId: string): Promise<{ titulo: string; alunos: LinhaAluno[] } | null> {
  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_documentos').select('titulo').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
  if (!doc) return null
  const prog = await fetchAll<any>(() =>
    svc.from('simulado_leitura_progresso').select('estudante_id, pct, tempo_seg, concluido_em, atualizado_em').eq('documento_id', documentoId).eq('tenant_id', tenantId).order('atualizado_em', { ascending: false }))
  const ids = [...new Set(prog.map((p) => p.estudante_id))]
  const nomePorId = new Map<string, string>()
  if (ids.length) {
    const ests = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_estudantes').select('id, nome, email').in('id', chunk))
    for (const e of ests) nomePorId.set(e.id, e.nome || e.email || 'Aluno')
  }
  return {
    titulo: (doc as any).titulo,
    alunos: prog.map((p) => ({
      estudanteId: p.estudante_id,
      nome: nomePorId.get(p.estudante_id) ?? 'Aluno',
      pct: Number(p.pct ?? 0),
      tempoMin: Math.round(Number(p.tempo_seg ?? 0) / 60),
      concluido: !!p.concluido_em,
      atualizadoEm: p.atualizado_em ?? null,
    })),
  }
}
