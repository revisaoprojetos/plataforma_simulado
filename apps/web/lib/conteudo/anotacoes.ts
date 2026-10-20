import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'

// ANOTAÇÕES/GRIFOS do aluno (Fase 6) — camada UNIFICADA: a mesma anotação serve a Biblioteca e ao
// Desafio, ancorada por (documento_id, trecho_uid, offsets). NUNCA é apagada por atualização do
// documento (R4): a reconciliação (reconciliacao.ts) a marca 'alterada'/'orfa'. O grifo salvo do
// aluno reaparece ao reabrir a leitura — aqui é o load/save; o posicionamento no texto é no leitor.

const T_AN = 'simulado_conteudo_anotacoes'
const T_AV = 'simulado_conteudo_avisos'

export type TipoAnotacao = 'destaque' | 'nota' | 'riscado' | 'insercao'
export type EstadoAnotacao = 'ativa' | 'alterada' | 'orfa'
export interface Anotacao {
  id: string; aluno_id: string; documento_id: string; trecho_uid: string
  tipo: TipoAnotacao; inicio_offset: number; fim_offset: number; texto_ancora: string
  contexto_antes: string | null; contexto_depois: string | null; conteudo: any
  estado: EstadoAnotacao; criada_em: string; atualizada_em: string
}

/** Grifos/anotações do aluno num documento (para repintar no leitor). */
export async function listarAnotacoes(documentoId: string, alunoId: string): Promise<Anotacao[]> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !documentoId || !alunoId) return []
  const svc = createAdminClient()
  const rows = await fetchAll<Anotacao>(() => svc.from(T_AN)
    .select('id, aluno_id, documento_id, trecho_uid, tipo, inicio_offset, fim_offset, texto_ancora, contexto_antes, contexto_depois, conteudo, estado, criada_em, atualizada_em')
    .eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('aluno_id', alunoId).order('id', { ascending: true }))
  return rows ?? []
}

/** Cria uma anotação ancorada ao uid do trecho. `versaoCriadaId` registra em que versão nasceu. */
export async function salvarAnotacao(input: {
  documentoId: string; alunoId: string; trechoUid: string; tipo: TipoAnotacao
  inicioOffset: number; fimOffset: number; textoAncora: string
  contextoAntes?: string | null; contextoDepois?: string | null; conteudo?: any; versaoCriadaId?: string | null
}): Promise<{ id: string } | { erro: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { erro: 'tenant não resolvido' }
  if (!input.trechoUid) return { erro: 'trecho (uid) obrigatório' }
  const svc = createAdminClient()
  const { data, error } = await svc.from(T_AN).insert({
    tenant_id: tenantId, aluno_id: input.alunoId, documento_id: input.documentoId, trecho_uid: input.trechoUid,
    tipo: input.tipo, inicio_offset: input.inicioOffset, fim_offset: input.fimOffset, texto_ancora: input.textoAncora,
    contexto_antes: input.contextoAntes ?? null, contexto_depois: input.contextoDepois ?? null,
    conteudo: input.conteudo ?? null, versao_criada_id: input.versaoCriadaId ?? null, versao_validada_id: input.versaoCriadaId ?? null, estado: 'ativa',
  }).select('id').single()
  if (error || !data) return { erro: error?.message || 'falha ao salvar anotação' }
  return { id: data.id }
}

export async function removerAnotacao(id: string, alunoId: string): Promise<{ ok: boolean; erro?: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, erro: 'tenant não resolvido' }
  const svc = createAdminClient()
  const { error } = await svc.from(T_AN).delete().eq('tenant_id', tenantId).eq('id', id).eq('aluno_id', alunoId)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

/** Avisos (trecho alterado/órfão) pendentes do aluno — "sua anotação mudou de contexto". */
export async function avisosPendentes(alunoId: string): Promise<{ id: string; anotacao_id: string; documento_id: string | null; status: string; criado_em: string }[]> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return []
  const svc = createAdminClient()
  // junta anotação (do aluno) → aviso pendente
  const anots = await fetchAll<any>(() => svc.from(T_AN).select('id, documento_id').eq('tenant_id', tenantId).eq('aluno_id', alunoId))
  const ids = (anots ?? []).map((a) => a.id)
  if (!ids.length) return []
  const docDe = new Map((anots ?? []).map((a) => [a.id, a.documento_id]))
  const avisos = await fetchAll<any>(() => svc.from(T_AV)
    .select('id, anotacao_id, status, criado_em').eq('tenant_id', tenantId).eq('status', 'pendente').in('anotacao_id', ids).order('id', { ascending: true }))
  return (avisos ?? []).map((v) => ({ id: v.id, anotacao_id: v.anotacao_id, documento_id: docDe.get(v.anotacao_id) ?? null, status: v.status, criado_em: v.criado_em }))
}

export async function marcarAvisoVisto(avisoId: string, alunoId: string): Promise<{ ok: boolean }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !alunoId) return { ok: false }
  const svc = createAdminClient()
  // L3: só o DONO da anotação pode marcar o aviso como visto — confere a posse antes de atualizar.
  const { data: av } = await svc.from(T_AV).select('id, anotacao_id').eq('tenant_id', tenantId).eq('id', avisoId).maybeSingle()
  if (!av) return { ok: false }
  const { data: an } = await svc.from(T_AN).select('id').eq('tenant_id', tenantId).eq('id', av.anotacao_id).eq('aluno_id', alunoId).maybeSingle()
  if (!an) return { ok: false }
  await svc.from(T_AV).update({ status: 'visto' }).eq('tenant_id', tenantId).eq('id', avisoId)
  return { ok: true }
}
