'use server'

/**
 * Estúdio de Conteúdo · Oferta FINA (sobre regras de liberação).
 * Reusa `lib/integracoes/liberacao` (tabelas regras + regra_produtos + motor). Sem preço/checkout.
 */

import { revalidatePath } from 'next/cache'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { salvarOfertaDb, obterOferta, type SalvarOfertaInput } from '@/lib/integracoes/liberacao/ofertas'
import { reconciliarRegra, cancelarRegra } from '@/lib/integracoes/liberacao/engine'

async function guard(manage = false) {
  const a = await getCurrentAccess()
  const ok = a.isAdmin || a.permissions.includes('liberacao:manage') || (!manage && a.permissions.includes('liberacao:view'))
  if (!ok) return { error: 'Sem permissão.' as const }
  if (!a.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: a.tenantId, userId: a.userId }
}

export async function salvarOfertaAction(input: SalvarOfertaInput) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const res = await salvarOfertaDb(g.tenantId, g.userId, input)
  if (!res.ok) return { error: res.error }

  await registrarAudit({ operacao: input.id ? 'UPDATE' : 'INSERT', entidade: 'simulado_liberacao_regras', entidadeId: res.id, tenantId: g.tenantId, depois: { oferta: true, nome: input.nome, produtos: input.produtoIds.length, publicada: !!input.publicar } }).catch(() => {})
  // Se o motor estiver ligado, aplica a oferta aos pedidos pendentes/recalcula grants (best-effort).
  let resumo: unknown = null
  try { resumo = await reconciliarRegra(g.tenantId, res.id, { dry: false }) } catch { /* motor off / schema ausente */ }
  revalidatePath('/admin/conteudos/ofertas')
  return { ok: true as const, id: res.id, resumo }
}

export async function excluirOfertaAction(id: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  // Garante que é uma oferta do tenant (tolerante a `oferta` ausente → trata como não encontrada).
  try {
    const { data } = await svc.from('simulado_liberacao_regras').select('id').eq('id', id).eq('tenant_id', g.tenantId).eq('oferta', true).maybeSingle()
    if (!data) return { error: 'Oferta não encontrada.' }
  } catch { return { error: 'Ofertas indisponíveis neste ambiente.' } }

  try { await cancelarRegra(g.tenantId, id, { dry: false }) } catch { /* revoga grants com segurança, se houver */ }
  const { error } = await svc.from('simulado_liberacao_regras').delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_liberacao_regras', entidadeId: id, tenantId: g.tenantId, depois: { oferta: true } }).catch(() => {})
  revalidatePath('/admin/conteudos/ofertas')
  return { ok: true as const }
}

/** Duplica a oferta como RASCUNHO ("... (cópia)"): mesmos produtos, descrição e janela de acesso. Não copia acessos já concedidos. */
export async function duplicarOfertaAction(id: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const o = await obterOferta(g.tenantId, id)
  if (!o) return { error: 'Oferta não encontrada.' }
  const res = await salvarOfertaDb(g.tenantId, g.userId, { nome: `${o.nome} (cópia)`, descricao: o.descricao, produtoIds: o.produtoIds, fim: o.fim, publicar: false })
  if (!res.ok) return { error: res.error }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_liberacao_regras', entidadeId: res.id, tenantId: g.tenantId, depois: { oferta: true, duplicada_de: id } }).catch(() => {})
  revalidatePath('/admin/conteudos/ofertas')
  return { ok: true as const, id: res.id }
}
