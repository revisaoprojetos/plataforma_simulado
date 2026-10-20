import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { emitirEvento } from './outbox'

// VÍNCULOS (Fase 3) — ligam o documento-mãe a um produto (curso/trilha/aula/pasta…) em modo:
//   'ultima'  → o produto sempre mostra a versão ATUAL do documento (versao_atual_id);
//   'fixada'  → o produto mostra uma versão APROVADA (versao_fixada_id), imune a edições futuras.
// É o vínculo que o desafio (Fase 5) aponta (A3) — por isso a versão efetiva é resolvida AQUI.

const T_VINC = 'simulado_conteudo_vinculos'
const T_DOC = 'simulado_conteudo_documentos'
const T_DESAFIO = 'simulado_conteudo_desafios'

export type ModoVinculo = 'ultima' | 'fixada'
export interface Vinculo {
  id: string; documento_id: string; produto_tipo: string; produto_ref_id: string
  modo: ModoVinculo; versao_fixada_id: string | null; ordem: number; criado_em: string
}

/** Cria/atualiza o vínculo (único por documento+produto). 'fixada' exige versao_fixada_id. */
export async function vincularDocumento(input: {
  documentoId: string; produtoTipo: string; produtoRefId: string
  modo: ModoVinculo; versaoFixadaId?: string | null; ordem?: number
}): Promise<{ id: string } | { erro: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { erro: 'tenant não resolvido' }
  if (input.modo === 'fixada' && !input.versaoFixadaId) return { erro: 'modo "fixada" exige uma versão' }
  const svc = createAdminClient()
  const { data, error } = await svc.from(T_VINC).upsert({
    tenant_id: tenantId, documento_id: input.documentoId, produto_tipo: input.produtoTipo, produto_ref_id: input.produtoRefId,
    modo: input.modo, versao_fixada_id: input.modo === 'fixada' ? input.versaoFixadaId : null, ordem: input.ordem ?? 0,
  }, { onConflict: 'documento_id,produto_tipo,produto_ref_id' }).select('id').single()
  if (error || !data) return { erro: error?.message || 'falha ao vincular' }
  await emitirEvento(svc, tenantId, 'documento.atualizado', { documento_id: input.documentoId, vinculo: data.id })
  return { id: data.id }
}

export async function desvincular(vinculoId: string): Promise<{ ok: boolean; erro?: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, erro: 'tenant não resolvido' }
  const svc = createAdminClient()
  const { error } = await svc.from(T_VINC).delete().eq('tenant_id', tenantId).eq('id', vinculoId)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

export async function listarVinculosDoDocumento(documentoId: string): Promise<Vinculo[]> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return []
  const svc = createAdminClient()
  const rows = await fetchAll<Vinculo>(() => svc.from(T_VINC)
    .select('id, documento_id, produto_tipo, produto_ref_id, modo, versao_fixada_id, ordem, criado_em')
    .eq('tenant_id', tenantId).eq('documento_id', documentoId).order('id', { ascending: true }))
  return rows ?? []
}

/** Documentos vinculados a um produto, já com a VERSÃO EFETIVA resolvida (ultima vs fixada). */
export async function documentosDoProduto(produtoTipo: string, produtoRefId: string): Promise<{ documentoId: string; titulo: string; versaoEfetivaId: string | null; modo: ModoVinculo; ordem: number }[]> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return []
  const svc = createAdminClient()
  const vincs = await fetchAll<Vinculo>(() => svc.from(T_VINC)
    .select('id, documento_id, produto_tipo, produto_ref_id, modo, versao_fixada_id, ordem, criado_em')
    .eq('tenant_id', tenantId).eq('produto_tipo', produtoTipo).eq('produto_ref_id', produtoRefId).order('ordem', { ascending: true }).order('id', { ascending: true }))
  if (!vincs?.length) return []
  const ids = [...new Set(vincs.map((v) => v.documento_id))]
  const docs = await fetchAll<any>(() => svc.from(T_DOC)
    .select('id, titulo, versao_atual_id, status').eq('tenant_id', tenantId).in('id', ids))
  const porId = new Map((docs ?? []).map((d) => [d.id, d]))
  return vincs.map((v) => {
    const d = porId.get(v.documento_id)
    return { documentoId: v.documento_id, titulo: d?.titulo ?? '—', modo: v.modo, ordem: v.ordem,
      versaoEfetivaId: v.modo === 'fixada' ? v.versao_fixada_id : (d?.versao_atual_id ?? null) }
  }).filter((x) => x.versaoEfetivaId) // só entrega o que tem versão publicada
}

// ── Desafios (Fase 5) — apontam para um vínculo (A3). As REGRAS ficam em conteudo/desafios-regras. ──
export async function criarDesafio(input: { vinculoId: string; titulo: string; criadoPor?: string | null }): Promise<{ id: string } | { erro: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { erro: 'tenant não resolvido' }
  const svc = createAdminClient()
  const { data, error } = await svc.from(T_DESAFIO).insert({
    tenant_id: tenantId, vinculo_id: input.vinculoId, titulo: input.titulo.trim(), criado_por: input.criadoPor ?? null,
  }).select('id').single()
  if (error || !data) return { erro: error?.message || 'falha ao criar desafio' }
  return { id: data.id }
}

export async function listarDesafios(vinculoId: string): Promise<{ id: string; titulo: string; criado_em: string }[]> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return []
  const svc = createAdminClient()
  const rows = await fetchAll<any>(() => svc.from(T_DESAFIO)
    .select('id, titulo, criado_em').eq('tenant_id', tenantId).eq('vinculo_id', vinculoId).order('id', { ascending: true }))
  return rows ?? []
}
