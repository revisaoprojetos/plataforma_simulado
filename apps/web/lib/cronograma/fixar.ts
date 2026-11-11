import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// PLANO FIXADO (foco do aluno) ENTRE os dois tipos de cronograma: 'adaptativo' (simulado_cronograma_adaptativo_plano)
// e 'revisao' (emissões legadas, simulado_cronograma_emissoes). Só 1 fixado por aluno. A troca é ATÔMICA
// (RPC cronograma_fixar_plano — migração 20261114010000). Sem a migração aplicada, o código degrada:
// adaptativo continua fixando como antes; revisão devolve 'migracao_pendente' e nada quebra.

export type TipoPlano = 'adaptativo' | 'revisao'
export type PlanoFixado = { tipo: TipoPlano; id: string; titulo: string | null; formulario?: Record<string, unknown> | null }

const T_ADAPT = 'simulado_cronograma_adaptativo_plano'
const T_EMISSAO = 'simulado_cronograma_emissoes'

const rpcAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /cronograma_fixar_plano|could not find the function/i.test(e.message || ''))
const colunaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42703' || /fixado/i.test(e.message || ''))

/** Fixa o plano e desfixa os demais (dos dois tipos) num único comando. */
export async function fixarCronograma(svc: SupabaseClient, tenantId: string, estId: string, tipo: TipoPlano, id: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await svc.rpc('cronograma_fixar_plano', { p_tenant: tenantId, p_estudante: estId, p_tipo: tipo, p_id: id })
  if (!error) return data === true ? { ok: true } : { ok: false, error: 'nao_encontrado' }
  if (!rpcAusente(error)) return { ok: false, error: error.message }
  // Migração pendente: só o adaptativo tem coluna `fixado` → comportamento antigo (2 updates).
  if (tipo !== 'adaptativo') return { ok: false, error: 'migracao_pendente' }
  const { data: ok } = await svc.from(T_ADAPT).select('id').eq('tenant_id', tenantId).eq('estudante_id', estId).eq('id', id).eq('arquivada', false).maybeSingle()
  if (!ok) return { ok: false, error: 'nao_encontrado' }
  await svc.from(T_ADAPT).update({ fixado: false }).eq('tenant_id', tenantId).eq('estudante_id', estId).eq('fixado', true)
  const { error: e2 } = await svc.from(T_ADAPT).update({ fixado: true, atualizado_em: new Date().toISOString() }).eq('id', id)
  return e2 ? { ok: false, error: e2.message } : { ok: true }
}

/** Há alguma emissão (Revisão) fixada? Tolera coluna ausente (→ false). */
export async function emissaoFixada(svc: SupabaseClient, tenantId: string, estId: string): Promise<{ id: string; titulo: string | null; formulario: Record<string, unknown> | null } | null> {
  const { data, error } = await svc.from(T_EMISSAO).select('id, titulo, cronograma_nome, formulario')
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('fixado', true).eq('arquivada', false).limit(1).maybeSingle()
  if (error || !data) return null
  const r = data as { id: string; titulo?: string | null; cronograma_nome?: string | null; formulario?: Record<string, unknown> | null }
  return { id: r.id, titulo: (r.titulo || r.cronograma_nome || null), formulario: r.formulario ?? null }
}

/** Esta emissão é a fixada? (decide se vale recomputar o snapshot ao marcar uma meta). */
export async function emissaoEhFixada(svc: SupabaseClient, tenantId: string, emissaoId: string): Promise<boolean> {
  const { data, error } = await svc.from(T_EMISSAO).select('fixado').eq('tenant_id', tenantId).eq('id', emissaoId).maybeSingle()
  return !error && !!(data as { fixado?: boolean } | null)?.fixado
}

/** Plano em foco (qualquer tipo). Adaptativo tem prioridade se (por legado) houver os dois. */
export async function planoFixado(svc: SupabaseClient, tenantId: string, estId: string): Promise<PlanoFixado | null> {
  const { data: ad } = await svc.from(T_ADAPT).select('id, titulo')
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('fixado', true).eq('arquivada', false).limit(1).maybeSingle()
  if (ad) return { tipo: 'adaptativo', id: (ad as { id: string }).id, titulo: (ad as { titulo?: string | null }).titulo ?? null }
  const em = await emissaoFixada(svc, tenantId, estId)
  return em ? { tipo: 'revisao', id: em.id, titulo: em.titulo, formulario: em.formulario } : null
}

/** Existe fixado em qualquer dos dois tipos? */
export async function temFixado(svc: SupabaseClient, tenantId: string, estId: string): Promise<boolean> {
  return !!(await planoFixado(svc, tenantId, estId))
}

/** Desfixa as emissões do aluno (usado quando um plano ADAPTATIVO novo assume o foco sem passar pela RPC). */
export async function desfixarEmissoes(svc: SupabaseClient, tenantId: string, estId: string): Promise<void> {
  const { error } = await svc.from(T_EMISSAO).update({ fixado: false }).eq('tenant_id', tenantId).eq('estudante_id', estId).eq('fixado', true)
  if (error && !colunaAusente(error)) console.error('[cronograma] desfixarEmissoes:', error.message)
}

/** Após arquivar o plano fixado: promove o mais recente restante (de qualquer tipo), via RPC. */
export async function promoverProximoFixado(svc: SupabaseClient, tenantId: string, estId: string): Promise<void> {
  const [{ data: ad }, em] = await Promise.all([
    svc.from(T_ADAPT).select('id, criado_em').eq('tenant_id', tenantId).eq('estudante_id', estId).eq('arquivada', false).order('criado_em', { ascending: false }).limit(1).maybeSingle(),
    svc.from(T_EMISSAO).select('id, criado_em').eq('tenant_id', tenantId).eq('estudante_id', estId).eq('arquivada', false).order('criado_em', { ascending: false }).limit(1).maybeSingle(),
  ])
  const a = ad as { id: string; criado_em: string } | null
  const e = (em.error ? null : em.data) as { id: string; criado_em: string } | null
  const alvo = a && e ? (a.criado_em >= e.criado_em ? { t: 'adaptativo' as const, id: a.id } : { t: 'revisao' as const, id: e.id }) : a ? { t: 'adaptativo' as const, id: a.id } : e ? { t: 'revisao' as const, id: e.id } : null
  if (alvo) await fixarCronograma(svc, tenantId, estId, alvo.t, alvo.id).catch(() => {})
}
