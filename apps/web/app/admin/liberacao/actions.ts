'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { validarRegra, normalizarStatus } from '@/lib/integracoes/liberacao/motor'
import {
  reconciliarRegra, reprocessarPendentes, pausarRegra, retomarRegra, cancelarRegra, simularPedido,
} from '@/lib/integracoes/liberacao/engine'
import { listarPedidos } from '@/lib/integracoes/liberacao/dados'
import type { RegraFiltros, InicioConfig, FimConfig, PedidoNormalizado, ClassificacaoStatus } from '@/lib/integracoes/liberacao/tipos'

async function guard(manage = false) {
  const access = await getCurrentAccess()
  const ok = access.isAdmin
    || access.permissions.includes(manage ? 'liberacao:manage' : 'liberacao:view')
    || access.permissions.includes('liberacao:manage')
  if (!ok) return { error: 'Sem permissão.' as const }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: access.tenantId, userId: access.userId }
}

// ───────── Regras (CRUD) ─────────
export interface SalvarRegraInput {
  id?: string
  nome: string
  status?: 'active' | 'paused'
  prioridade?: number
  filtros: RegraFiltros
  inicio: InicioConfig
  fim: FimConfig
  produtoIds: string[]
}

export async function salvarRegraAction(input: SalvarRegraInput) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const nome = (input.nome ?? '').trim()
  if (!nome) return { error: 'Informe o nome da regra.' }
  if (!input.produtoIds?.length) return { error: 'Selecione ao menos um produto que a regra concede.' }
  const v = validarRegra({ filtros: input.filtros, inicio: input.inicio, fim: input.fim })
  if (!v.ok) return { error: v.erros.join(' ') }

  const svc = createAdminClient()
  const campos = {
    tenant_id: g.tenantId, nome, status: input.status ?? 'active', prioridade: input.prioridade ?? 100,
    filtros: input.filtros, inicio: input.inicio, fim: input.fim, atualizado_em: new Date().toISOString(),
  }
  let regraId = input.id
  if (input.id) {
    const { error } = await svc.from('simulado_liberacao_regras').update(campos).eq('id', input.id).eq('tenant_id', g.tenantId)
    if (error) return { error: error.message }
  } else {
    const { data, error } = await svc.from('simulado_liberacao_regras').insert({ ...campos, criado_por: g.userId }).select('id').single()
    if (error) return { error: error.message }
    regraId = data.id
  }
  // Sincroniza os produtos concedidos (regra_produtos).
  await svc.from('simulado_liberacao_regra_produtos').delete().eq('regra_id', regraId).eq('tenant_id', g.tenantId)
  const { error: eProd } = await svc.from('simulado_liberacao_regra_produtos').insert(input.produtoIds.map((pid) => ({ tenant_id: g.tenantId, regra_id: regraId, produto_id: pid })))
  if (eProd) return { error: eProd.message }

  await registrarAudit({ operacao: input.id ? 'UPDATE' : 'INSERT', entidade: 'simulado_liberacao_regras', entidadeId: regraId, tenantId: g.tenantId, depois: { nome, status: campos.status, prioridade: campos.prioridade, produtos: input.produtoIds.length } }).catch(() => {})
  // Reconcilia: aplica a pedidos pendentes que passaram a casar + recalcula grants da regra editada.
  const resumo = await reconciliarRegra(g.tenantId, regraId!, { dry: false })
  revalidatePath('/admin/liberacao')
  return { ok: true as const, id: regraId, resumo }
}

export async function pausarRegraAction(id: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const r = await pausarRegra(g.tenantId, id)
  revalidatePath('/admin/liberacao')
  return r.ok ? { ok: true as const } : { error: r.error ?? 'Falha ao pausar.' }
}

export async function retomarRegraAction(id: string, aplicarDuranteaPausa: boolean, dry = false) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const r = await retomarRegra(g.tenantId, id, { aplicarDuranteaPausa, dry })
  if (!dry) revalidatePath('/admin/liberacao')
  return r.ok ? { ok: true as const, resumo: r } : { error: r.error ?? 'Falha ao retomar.' }
}

export async function cancelarRegraAction(id: string, dry = false) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const r = await cancelarRegra(g.tenantId, id, { dry })
  if (!dry) revalidatePath('/admin/liberacao')
  return r.ok ? { ok: true as const, resumo: r } : { error: r.error ?? 'Falha ao cancelar.' }
}

export async function excluirRegraAction(id: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  // Cancela antes (revoga os grants com segurança), depois remove a regra (grants ficam com regra_id NULL por FK).
  await cancelarRegra(g.tenantId, id, { dry: false })
  const { error } = await svc.from('simulado_liberacao_regras').delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_liberacao_regras', entidadeId: id, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/liberacao')
  return { ok: true as const }
}

// ───────── Reprocessamento ─────────
export async function reprocessarPendentesAction(dry: boolean) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const resumo = await reprocessarPendentes(g.tenantId, { dry })
  if (!dry) revalidatePath('/admin/liberacao')
  return { ok: true as const, resumo }
}

// ───────── Simulador (dry-run, não grava) ─────────
export async function simularPedidoAction(pedido: PedidoNormalizado) {
  const g = await guard(); if ('error' in g) return { error: g.error }
  return { ok: true as const, resultado: await simularPedido(g.tenantId, pedido) }
}

// ───────── Pedidos (leitura paginada) ─────────
export async function listarPedidosAction(opts: { estado?: string; q?: string; page?: number }) {
  const g = await guard(); if ('error' in g) return { error: g.error }
  return { ok: true as const, ...(await listarPedidos(g.tenantId, opts)) }
}

// ───────── Mapeamento de status ─────────
export async function salvarStatusMapAction(input: { provider: string; valor: string; classificacao: ClassificacaoStatus }) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const valor_normalizado = normalizarStatus(input.valor)
  if (!valor_normalizado) return { error: 'Informe o status.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_status_mappings').upsert(
    { tenant_id: g.tenantId, provider: (input.provider ?? '').trim(), valor_normalizado, classificacao: input.classificacao },
    { onConflict: 'tenant_id,provider,valor_normalizado' },
  )
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_status_mappings', tenantId: g.tenantId, depois: { provider: input.provider, valor_normalizado, classificacao: input.classificacao } }).catch(() => {})
  revalidatePath('/admin/liberacao')
  return { ok: true as const }
}

export async function removerStatusMapAction(id: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_status_mappings').delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { error: error.message }
  revalidatePath('/admin/liberacao')
  return { ok: true as const }
}
