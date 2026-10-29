import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Reporte, Avaliacao, StatusReporte, TipoReporte } from './tipos'

// DEMANDAS (material) — camada de dados (I/O). Reportes + avaliações do Leitor. Tipos puros em ./tipos.
// Migração: supabase/migrations/20261027020000_demandas_material.sql. RLS por tenant_id.

export type { Reporte, Avaliacao, StatusReporte, TipoReporte } from './tipos'
export { TIPOS_REPORTE, STATUS_REPORTE_LABEL, precisaDeVoce } from './tipos'

const T_REP = 'simulado_material_reportes'
const T_AVA = 'simulado_material_avaliacoes'
const SEL_REP = 'id, estudante_id, documento_id, versao_id, pagina, tipo, descricao, status, resposta, resolvido_em, criado_em'
const SEL_AVA = 'id, estudante_id, documento_id, nota, comentario, criado_em'

// ───────────────────────────── Aluno ─────────────────────────────

export async function criarReporte(
  svc: SupabaseClient,
  input: { tenantId: string; estudanteId: string; documentoId: string; tipo: TipoReporte; descricao: string; pagina?: number | null; versaoId?: string | null },
): Promise<{ id: string } | { erro: string }> {
  const descricao = input.descricao?.trim()
  if (!input.tenantId || !input.estudanteId || !input.documentoId) return { erro: 'parâmetros inválidos' }
  if (!descricao) return { erro: 'descreva o problema' }
  const { data, error } = await svc.from(T_REP).insert({
    tenant_id: input.tenantId, estudante_id: input.estudanteId, documento_id: input.documentoId,
    tipo: input.tipo, descricao, pagina: input.pagina ?? null, versao_id: input.versaoId ?? null, status: 'aberto',
  }).select('id').single()
  if (error || !data) return { erro: error?.message || 'falha ao enviar o reporte' }
  return { id: data.id }
}

/** Avalia o material (upsert por aluno+material). nota 1..5. */
export async function avaliarMaterial(
  svc: SupabaseClient,
  input: { tenantId: string; estudanteId: string; documentoId: string; nota: number; comentario?: string | null },
): Promise<{ ok: boolean; erro?: string }> {
  if (!input.tenantId || !input.estudanteId || !input.documentoId) return { ok: false, erro: 'parâmetros inválidos' }
  const nota = Math.round(input.nota)
  if (!(nota >= 1 && nota <= 5)) return { ok: false, erro: 'nota deve ser de 1 a 5' }
  const agora = new Date().toISOString()
  const { error } = await svc.from(T_AVA).upsert({
    tenant_id: input.tenantId, estudante_id: input.estudanteId, documento_id: input.documentoId,
    nota, comentario: input.comentario?.trim() || null, atualizado_em: agora,
  }, { onConflict: 'estudante_id,documento_id' })
  return error ? { ok: false, erro: error.message } : { ok: true }
}

/** A avaliação que o aluno já deu a um material (p/ pré-preencher as estrelas). */
export async function minhaAvaliacao(
  svc: SupabaseClient, tenantId: string, estudanteId: string, documentoId: string,
): Promise<Avaliacao | null> {
  if (!tenantId || !estudanteId || !documentoId) return null
  const { data } = await svc.from(T_AVA).select(SEL_AVA)
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('documento_id', documentoId).maybeSingle()
  return (data as Avaliacao) ?? null
}

// ───────────────────────────── Admin (Central de Demandas) ─────────────────────────────

export async function listarReportesAdmin(
  svc: SupabaseClient, tenantId: string, filtro?: { status?: StatusReporte },
): Promise<Reporte[]> {
  if (!tenantId) return []
  const rows = await fetchAll<Reporte>(() => {
    let q = svc.from(T_REP).select(SEL_REP).eq('tenant_id', tenantId)
    if (filtro?.status) q = q.eq('status', filtro.status)
    return q.order('criado_em', { ascending: false }).order('id', { ascending: false })
  })
  return rows ?? []
}

/** Admin responde e/ou muda o status do reporte. */
export async function resolverReporte(
  svc: SupabaseClient,
  input: { tenantId: string; id: string; status?: StatusReporte; resposta?: string | null; resolvidoPor?: string | null },
): Promise<{ ok: boolean; erro?: string }> {
  if (!input.tenantId || !input.id) return { ok: false, erro: 'parâmetros inválidos' }
  const { data: r } = await svc.from(T_REP).select('id').eq('tenant_id', input.tenantId).eq('id', input.id).maybeSingle()
  if (!r) return { ok: false, erro: 'reporte não encontrado' }
  const agora = new Date().toISOString()
  const upd: Record<string, unknown> = { atualizado_em: agora }
  if (input.status) {
    upd.status = input.status
    if (input.status === 'resolvido') { upd.resolvido_em = agora; upd.resolvido_por = input.resolvidoPor ?? null }
  }
  if (input.resposta != null) upd.resposta = input.resposta.trim()
  const { error } = await svc.from(T_REP).update(upd).eq('tenant_id', input.tenantId).eq('id', input.id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

/** Avaliações baixas (1–2 estrelas) = fila "Precisa de você". */
export async function listarAvaliacoesBaixas(
  svc: SupabaseClient, tenantId: string,
): Promise<Avaliacao[]> {
  if (!tenantId) return []
  const rows = await fetchAll<Avaliacao>(() => svc.from(T_AVA).select(SEL_AVA)
    .eq('tenant_id', tenantId).lte('nota', 2).order('criado_em', { ascending: false }).order('id', { ascending: false }))
  return rows ?? []
}

/** Média e total de avaliações por material (para a visão do admin). */
export async function resumoAvaliacoesPorMaterial(
  svc: SupabaseClient, tenantId: string,
): Promise<Map<string, { media: number; total: number }>> {
  const out = new Map<string, { media: number; total: number; soma?: number }>()
  if (!tenantId) return out as Map<string, { media: number; total: number }>
  const rows = await fetchAll<{ documento_id: string; nota: number }>(() => svc.from(T_AVA)
    .select('documento_id, nota').eq('tenant_id', tenantId).order('id', { ascending: true }))
  const acc = new Map<string, { soma: number; total: number }>()
  for (const r of rows ?? []) {
    const a = acc.get(r.documento_id) ?? { soma: 0, total: 0 }
    a.soma += r.nota; a.total += 1; acc.set(r.documento_id, a)
  }
  const res = new Map<string, { media: number; total: number }>()
  for (const [doc, a] of acc) res.set(doc, { media: a.total ? a.soma / a.total : 0, total: a.total })
  return res
}
