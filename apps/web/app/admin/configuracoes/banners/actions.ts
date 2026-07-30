'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

export interface BannerInput {
  tipo: 'banner' | 'popup'
  titulo?: string | null
  mensagem?: string | null
  imagem_url?: string | null
  link?: string | null
  cor?: string | null
  ativo?: boolean
  ordem?: number
}

async function ctx() {
  if (!(await checkPermission('configuracoes:manage'))) return { ok: false as const, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId, svc: createAdminClient() }
}

export async function criarBannerAction(data: BannerInput): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx(); if (!c.ok) return c
  const tipo = data.tipo === 'popup' ? 'popup' : 'banner'
  const { error } = await c.svc.from('simulado_banners').insert({
    tenant_id: c.tenantId, tipo,
    titulo: data.titulo?.trim() || null,
    mensagem: data.mensagem?.trim() || null,
    imagem_url: data.imagem_url?.trim() || null,
    link: data.link?.trim() || null,
    cor: data.cor?.trim() || null,
    ativo: data.ativo ?? true,
    ordem: data.ordem ?? 0,
  })
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_banners', depois: { tipo, titulo: data.titulo } })
  revalidatePath('/admin/configuracoes/banners')
  return { ok: true }
}

export async function atualizarBannerAction(id: string, data: BannerInput): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx(); if (!c.ok) return c
  const { error } = await c.svc.from('simulado_banners').update({
    tipo: data.tipo === 'popup' ? 'popup' : 'banner',
    titulo: data.titulo?.trim() || null,
    mensagem: data.mensagem?.trim() || null,
    imagem_url: data.imagem_url?.trim() || null,
    link: data.link?.trim() || null,
    cor: data.cor?.trim() || null,
    ativo: data.ativo ?? true,
    ordem: data.ordem ?? 0,
    atualizado_em: new Date().toISOString(),
  }).eq('id', id).eq('tenant_id', c.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/configuracoes/banners')
  return { ok: true }
}

export async function toggleBannerAction(id: string, ativo: boolean): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx(); if (!c.ok) return c
  const { error } = await c.svc.from('simulado_banners').update({ ativo, atualizado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', c.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/configuracoes/banners')
  return { ok: true }
}

export async function excluirBannerAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx(); if (!c.ok) return c
  const { error } = await c.svc.from('simulado_banners').delete().eq('id', id).eq('tenant_id', c.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_banners', entidadeId: id })
  revalidatePath('/admin/configuracoes/banners')
  return { ok: true }
}
