import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { chavesAtuais } from './remap-as-server'
import { auditarPlano, contarPorTipo, type Anomalia, type LinhaAuditoria, type TipoAnomalia } from './auditar-plano'
import type { Grade } from './remap-as'

// INTEGRIDADE dos planos do Cronograma Adaptativo (admin, SOMENTE LEITURA). Backend-first: o cálculo roda aqui (cache de 45 min por tenant),
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

/** Resultado (stale-while-revalidate): fica 24 h no cache; considerado "velho" após 45 min e recalculado em segundo plano. */
export const TTL_INTEGRIDADE_SEG = 45 * 60
const TTL_ARMAZENA_SEG = 24 * 3600
const MAX_CALCULANDO_MS = 15 * 60 * 1000
export const chaveIntegridade = (tenantId: string) => `crono-integridade:${tenantId}`
export const chaveEstadoIntegridade = (tenantId: string) => `crono-integridade-estado:${tenantId}`

type EstadoJob = { estado: 'calculando'; desde: number } | { estado: 'erro'; msg: string; em: number }
export type LeituraIntegridade =
  | { tipo: 'pronto'; r: ResumoIntegridade; velho: boolean }
  | { tipo: 'calculando'; desde: number }
  | { tipo: 'erro'; msg: string; em: number }
  | { tipo: 'vazio' }

// remember() com cálculo "undefined" = só espiar o cache (nunca grava).
const espiar = <T,>(chave: string) => remember<T | undefined>(chave, 1, async () => undefined)
async function gravar<T>(chave: string, ttl: number, v: T) { await esquecer(chave); await remember<T>(chave, ttl, async () => v) }

/** LEITURA RÁPIDA (só cache): nunca varre planos. Quem calcula é `dispararAuditoria`, fora do caminho crítico da página. */
export async function lerIntegridade(tenantId: string): Promise<LeituraIntegridade> {
  const r = await espiar<ResumoIntegridade>(chaveIntegridade(tenantId))
  if (r) return { tipo: 'pronto', r, velho: Date.now() - Date.parse(r.geradoEm) > TTL_INTEGRIDADE_SEG * 1000 }
  const e = await espiar<EstadoJob>(chaveEstadoIntegridade(tenantId))
  if (e?.estado === 'calculando' && Date.now() - e.desde < MAX_CALCULANDO_MS) return { tipo: 'calculando', desde: e.desde }
  if (e?.estado === 'erro') return { tipo: 'erro', msg: e.msg, em: e.em }
  return { tipo: 'vazio' }
}

/** Calcula e grava no cache (chamar dentro de `after()`). Idempotente: se já há um cálculo recente em curso, não duplica. */
export async function dispararAuditoria(svc: SupabaseClient, tenantId: string): Promise<void> {
  const e = await espiar<EstadoJob>(chaveEstadoIntegridade(tenantId))
  if (e?.estado === 'calculando' && Date.now() - e.desde < MAX_CALCULANDO_MS) return
  // Backoff: após falha, não re-audita (varredura pesada + queries que erram) por 10 min — cada visita/refresh disparava de novo.
  if (e?.estado === 'erro' && Date.now() - e.em < 10 * 60 * 1000) return
  await gravar<EstadoJob>(chaveEstadoIntegridade(tenantId), 900, { estado: 'calculando', desde: Date.now() })
  try {
    const r = await calcular(svc, tenantId)
    await gravar(chaveIntegridade(tenantId), TTL_ARMAZENA_SEG, r)
    await esquecer(chaveEstadoIntegridade(tenantId))
  } catch (err) {
    console.error('[integridade] falha ao auditar', err)
    await gravar<EstadoJob>(chaveEstadoIntegridade(tenantId), 3600, { estado: 'erro', msg: err instanceof Error ? err.message : 'Falha ao ler os planos.', em: Date.now() })
  }
}

async function calcular(svc: SupabaseClient, tenantId: string): Promise<ResumoIntegridade> {
  const atual = await chavesAtuais(svc, tenantId)
  const vazio: ResumoIntegridade = { geradoEm: new Date().toISOString(), planosAuditados: 0, planosComAnomalia: 0, porTipo: contarPorTipo([]), temAulaKey: false, catalogoVazio: atual.vazio || !atual.chaves.length, planos: [] }
  if (vazio.catalogoVazio) return vazio // sem AS confiável não há referência para auditar

  const ids = (await fetchAll<{ id: string }>(
    () => svc.from(T_PLANO).select('id').eq('tenant_id', tenantId).eq('arquivada', false).eq('exemplo', false).order('id', { ascending: true }), 1000, 'integridade:ids')).map((r) => r.id)

  let temAulaKey = true
  const achados: Array<{ id: string; estudanteId: string; titulo: string | null; anomalias: Anomalia[] }> = []
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += LOTE) lotes.push(ids.slice(i, i + LOTE))
  const auditarLote = async (lote: string[]) => {
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
  // 4 lotes em paralelo (cada lote já é paginado): ~4x mais rápido que sequencial, sem estourar o pooler.
  let prox = 0
  await Promise.all(Array.from({ length: Math.min(4, lotes.length) }, async () => { while (prox < lotes.length) await auditarLote(lotes[prox++]) }))

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

