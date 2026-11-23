import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember } from '@/lib/cache/relatorio-cache'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { chavesAtuais } from './remap-as-server'
import { auditarPlano, contarPorTipo, type Anomalia, type LinhaAuditoria, type TipoAnomalia } from './auditar-plano'
import type { Grade } from './remap-as'

// INTEGRIDADE dos planos do Cronograma Adaptativo (admin, SOMENTE LEITURA). Backend-first: o cálculo roda aqui (cache de 60 s por tenant),
// em lotes de 80 planos (planos + metas por .in em chunk) — nunca uma consulta por plano. A página só lista o que esta função devolve.

const T_PLANO = 'simulado_cronograma_adaptativo_plano'
const T_META = 'simulado_cronograma_adaptativo_meta'
const LOTE = 80
const MAX_ANOMALIAS_POR_PLANO = 120

export interface PlanoComAnomalias {
  planoId: string
  estudanteId: string
  nome: string
  email: string
  titulo: string | null
  total: number
  porTipo: Partial<Record<TipoAnomalia, number>>
  anomalias: Anomalia[]
}
export interface ResumoIntegridade {
  geradoEm: string
  planosAuditados: number
  planosComAnomalia: number
  porTipo: Record<TipoAnomalia, number>
  /** false = migração 20261129000000 pendente (sem aula_key o auditor não detecta 'progresso em aula diferente'). */
  temAulaKey: boolean
  catalogoVazio: boolean
  planos: PlanoComAnomalias[]
}

export async function carregarIntegridade(svc: SupabaseClient, tenantId: string): Promise<ResumoIntegridade> {
  return remember<ResumoIntegridade>(`crono-integridade:${tenantId}`, 60, () => calcular(svc, tenantId))
}

async function calcular(svc: SupabaseClient, tenantId: string): Promise<ResumoIntegridade> {
  const atual = await chavesAtuais(svc, tenantId)
  const vazio: ResumoIntegridade = { geradoEm: new Date().toISOString(), planosAuditados: 0, planosComAnomalia: 0, porTipo: contarPorTipo([]), temAulaKey: false, catalogoVazio: atual.vazio || !atual.chaves.length, planos: [] }
  if (vazio.catalogoVazio) return vazio // sem AS confiável não há referência para auditar

  const ids = (await fetchAll<{ id: string }>(
    () => svc.from(T_PLANO).select('id').eq('tenant_id', tenantId).eq('arquivada', false).eq('exemplo', false).order('id', { ascending: true }), 1000, 'integridade:ids')).map((r) => r.id)

  let temAulaKey = true
  const achados: Array<{ id: string; estudanteId: string; titulo: string | null; anomalias: Anomalia[] }> = []
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE)
    const { data: planos, error } = await svc.from(T_PLANO).select('id,estudante_id,titulo,cfg,plano').eq('tenant_id', tenantId).in('id', lote)
    if (error) throw error
    const lerMetas = (cols: string) => fetchAllByIn<LinhaAuditoria & { plano_id: string }>(lote,
      (c) => svc.from(T_META).select(cols).eq('tenant_id', tenantId).in('plano_id', c).order('plano_id', { ascending: true }).order('meta_id', { ascending: true }) as never, { chunk: LOTE, rotulo: 'integridade:metas' })
    let metas: Array<LinhaAuditoria & { plano_id: string }>
    try { metas = await lerMetas('plano_id,meta_id,estado,concluido_em,atualizado_em,aula_key') } catch {
      temAulaKey = false
      try { metas = await lerMetas('plano_id,meta_id,estado,concluido_em,atualizado_em') } catch { metas = await lerMetas('plano_id,meta_id,estado,atualizado_em') }
    }
    const porPlano = new Map<string, LinhaAuditoria[]>()
    for (const m of metas) { const l = porPlano.get(m.plano_id); if (l) l.push(m); else porPlano.set(m.plano_id, [m]) }
    for (const p of (planos ?? []) as Array<{ id: string; estudante_id: string; titulo: string | null; cfg: Record<string, unknown> | null; plano: Grade | null }>) {
      const anomalias = auditarPlano({ grade: p.plano, cfg: p.cfg, linhas: porPlano.get(p.id) ?? [], atual })
      if (anomalias.length) achados.push({ id: p.id, estudanteId: p.estudante_id, titulo: p.titulo ?? null, anomalias })
    }
  }

  // nome/e-mail dos alunos com anomalia (1 leitura em lotes, nunca por plano)
  const estIds = [...new Set(achados.map((a) => a.estudanteId))]
  const est = new Map<string, { nome: string; email: string }>()
  if (estIds.length) {
    const rows = await fetchAllByIn<{ id: string; nome: string | null; email: string | null }>(estIds,
      (c) => svc.from('simulado_estudantes').select('id,nome,email').eq('tenant_id', tenantId).in('id', c).order('id', { ascending: true }) as never, { chunk: LOTE, rotulo: 'integridade:estudantes' })
    for (const r of rows) est.set(r.id, { nome: r.nome ?? '', email: r.email ?? '' })
  }

  const planos: PlanoComAnomalias[] = achados.map((a) => {
    const porTipo: Partial<Record<TipoAnomalia, number>> = {}
    for (const x of a.anomalias) porTipo[x.tipo] = (porTipo[x.tipo] ?? 0) + 1
    const e = est.get(a.estudanteId)
    return { planoId: a.id, estudanteId: a.estudanteId, nome: e?.nome ?? '', email: e?.email ?? '', titulo: a.titulo, total: a.anomalias.length, porTipo, anomalias: a.anomalias.slice(0, MAX_ANOMALIAS_POR_PLANO) }
  })
  return { geradoEm: new Date().toISOString(), planosAuditados: ids.length, planosComAnomalia: planos.length, porTipo: contarPorTipo(achados.map((a) => a.anomalias)), temAulaKey, catalogoVazio: false, planos }
}

