'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { hospedarBase64 } from '@/lib/storage/hospedar-base64'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission, isSuperAdmin } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

export interface BannerInput {
  tipo: 'banner' | 'popup' | 'hero'
  titulo?: string | null
  mensagem?: string | null
  imagem_url?: string | null
  link?: string | null
  cor?: string | null
  ativo?: boolean
  ordem?: number
  // Config visual por-banner (só nos banners de simulado) — guardada em tema.banner_destaques[id].
  destaqueAtivo?: boolean
  destaqueTexto?: string | null
  fadeAtivo?: boolean
  fadeNivel?: number
  // Estilo do pop-up (guardado no mesmo mapa tema.banner_destaques[id]).
  popupEstilo?: 'classico' | 'sobre' | 'compacto'
  popupPontas?: 'arredondado' | 'quadrado'
  // Texto sobre o banner (banner/destaque): posição + cor + tamanho.
  bannerTextoPos?: string
  bannerTextoCor?: 'claro' | 'escuro'
  bannerTextoTam?: 'pequeno' | 'medio' | 'grande'
  bannerOcultarTitulo?: boolean
  bannerOcultarMensagem?: boolean
}

type DestaqueEntry = { ativo?: boolean; texto?: string; fadeAtivo?: boolean; fadeNivel?: number; popupEstilo?: string; popupPontas?: string; bannerTextoPos?: string; bannerTextoCor?: string; bannerTextoTam?: string; bannerOcultarTitulo?: boolean; bannerOcultarMensagem?: boolean }

/** Salva a config por-banner (rótulo "Em destaque" + degradê + estilo do pop-up) em
 *  tema.banner_destaques[bannerId], mesclando com o que já existir. */
async function salvarDestaque(
  svc: ReturnType<typeof createAdminClient>,
  tenantId: string,
  bannerId: string,
  data: Pick<BannerInput, 'destaqueAtivo' | 'destaqueTexto' | 'fadeAtivo' | 'fadeNivel' | 'popupEstilo' | 'popupPontas' | 'bannerTextoPos' | 'bannerTextoCor' | 'bannerTextoTam' | 'bannerOcultarTitulo' | 'bannerOcultarMensagem'>,
) {
  const nada = data.destaqueAtivo === undefined && data.destaqueTexto === undefined && data.fadeAtivo === undefined
    && data.fadeNivel === undefined && data.popupEstilo === undefined && data.popupPontas === undefined
    && data.bannerTextoPos === undefined && data.bannerTextoCor === undefined && data.bannerTextoTam === undefined
    && data.bannerOcultarTitulo === undefined && data.bannerOcultarMensagem === undefined
  if (nada) return
  const { data: t } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
  const tema = { ...(((t?.tema as Record<string, unknown>) ?? {})) }
  const mapa = { ...(((tema.banner_destaques as Record<string, unknown>) ?? {})) } as Record<string, DestaqueEntry>
  const atual = mapa[bannerId] ?? {}
  mapa[bannerId] = {
    ...atual,
    ...(data.destaqueAtivo !== undefined || data.destaqueTexto !== undefined || data.fadeAtivo !== undefined || data.fadeNivel !== undefined
      ? {
          ativo: data.destaqueAtivo !== false,
          texto: (data.destaqueTexto?.trim() || undefined),
          fadeAtivo: data.fadeAtivo !== false,
          fadeNivel: typeof data.fadeNivel === 'number' ? Math.max(0, Math.min(150, Math.round(data.fadeNivel))) : undefined,
        }
      : {}),
    ...(data.popupEstilo !== undefined ? { popupEstilo: data.popupEstilo } : {}),
    ...(data.popupPontas !== undefined ? { popupPontas: data.popupPontas } : {}),
    ...(data.bannerTextoPos !== undefined ? { bannerTextoPos: data.bannerTextoPos } : {}),
    ...(data.bannerTextoCor !== undefined ? { bannerTextoCor: data.bannerTextoCor } : {}),
    ...(data.bannerTextoTam !== undefined ? { bannerTextoTam: data.bannerTextoTam } : {}),
    ...(data.bannerOcultarTitulo !== undefined ? { bannerOcultarTitulo: data.bannerOcultarTitulo } : {}),
    ...(data.bannerOcultarMensagem !== undefined ? { bannerOcultarMensagem: data.bannerOcultarMensagem } : {}),
  }
  tema.banner_destaques = mapa
  await svc.from('simulado_tenants').update({ tema }).eq('id', tenantId)
}

// Com `tenantIdAlvo` (só super-admin) opera na plataforma-alvo a partir do console; senão exige
// `configuracoes:manage` e usa o tenant da sessão.
async function ctx(tenantIdAlvo?: string) {
  // Sessão expirada (token do Supabase venceu com a página aberta) leva a getUser()=null e faria
  // isSuperAdmin/checkPermission caírem em "Sem permissão." — mensagem enganosa. Detecta e avisa.
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return { ok: false as const, error: 'Sessão expirada. Recarregue a página (F5) e entre novamente.' }
  if (tenantIdAlvo && (await isSuperAdmin())) return { ok: true as const, tenantId: tenantIdAlvo, ehSuper: true, svc: createAdminClient() }
  if (!(await checkPermission('configuracoes:manage'))) return { ok: false as const, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId, ehSuper: false, svc: createAdminClient() }
}
function reval(tenantId: string, ehSuper: boolean) {
  revalidatePath('/admin/configuracoes/banners')
  if (ehSuper) revalidatePath(`/super/plataformas/${tenantId}`)
}

export async function criarBannerAction(data: BannerInput, tenantIdAlvo?: string): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx(tenantIdAlvo); if (!c.ok) return c
  const tipo = data.tipo === 'popup' ? 'popup' : data.tipo === 'hero' ? 'hero' : 'banner'
  // base64 → sobe pro storage e guarda só a URL (evita base64 gigante na linha do banco).
  const imagemUrl = await hospedarBase64(data.imagem_url, c.svc)
  const { data: novo, error } = await c.svc.from('simulado_banners').insert({
    tenant_id: c.tenantId, tipo,
    titulo: data.titulo?.trim() || null,
    mensagem: data.mensagem?.trim() || null,
    imagem_url: imagemUrl,
    link: data.link?.trim() || null,
    cor: data.cor?.trim() || null,
    ativo: data.ativo ?? true,
    ordem: data.ordem ?? 0,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }
  if (novo?.id) await salvarDestaque(c.svc, c.tenantId, novo.id, data)
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_banners', tenantId: c.tenantId, depois: { tipo, titulo: data.titulo } })
  reval(c.tenantId, c.ehSuper)
  return { ok: true }
}

export async function atualizarBannerAction(id: string, data: BannerInput, tenantIdAlvo?: string): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx(tenantIdAlvo); if (!c.ok) return c
  const imagemUrl = await hospedarBase64(data.imagem_url, c.svc)
  const { error } = await c.svc.from('simulado_banners').update({
    tipo: data.tipo === 'popup' ? 'popup' : data.tipo === 'hero' ? 'hero' : 'banner',
    titulo: data.titulo?.trim() || null,
    mensagem: data.mensagem?.trim() || null,
    imagem_url: imagemUrl,
    link: data.link?.trim() || null,
    cor: data.cor?.trim() || null,
    ativo: data.ativo ?? true,
    ordem: data.ordem ?? 0,
    atualizado_em: new Date().toISOString(),
  }).eq('id', id).eq('tenant_id', c.tenantId)
  if (error) return { ok: false, error: error.message }
  await salvarDestaque(c.svc, c.tenantId, id, data)
  reval(c.tenantId, c.ehSuper)
  return { ok: true }
}

export async function toggleBannerAction(id: string, ativo: boolean, tenantIdAlvo?: string): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx(tenantIdAlvo); if (!c.ok) return c
  const { error } = await c.svc.from('simulado_banners').update({ ativo, atualizado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', c.tenantId)
  if (error) return { ok: false, error: error.message }
  reval(c.tenantId, c.ehSuper)
  return { ok: true }
}

export async function reordenarBannersAction(ordens: { id: string; ordem: number }[], tenantIdAlvo?: string): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx(tenantIdAlvo); if (!c.ok) return c
  for (const o of ordens) {
    const { error } = await c.svc.from('simulado_banners').update({ ordem: o.ordem, atualizado_em: new Date().toISOString() }).eq('id', o.id).eq('tenant_id', c.tenantId)
    if (error) return { ok: false, error: error.message }
  }
  reval(c.tenantId, c.ehSuper)
  return { ok: true }
}

/**
 * Liga/desliga o painel de desempenho do aluno (Simulados/Nota média/Melhor nota) que aparece
 * no canto inferior direito dos banners de simulado. Guardado em `simulado_tenants.tema.banners_desempenho`
 * (jsonb, sem migração). Default = desligado (a UI trata ausência/false como oculto).
 */
export async function toggleBannerDesempenhoAction(ativo: boolean, tenantIdAlvo?: string): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx(tenantIdAlvo); if (!c.ok) return c
  const { data: t } = await c.svc.from('simulado_tenants').select('tema').eq('id', c.tenantId).maybeSingle()
  const tema = { ...(((t?.tema as Record<string, unknown>) ?? {})), banners_desempenho: ativo }
  const { error } = await c.svc.from('simulado_tenants').update({ tema }).eq('id', c.tenantId)
  if (error) return { ok: false, error: error.message }
  reval(c.tenantId, c.ehSuper)
  return { ok: true }
}

export async function excluirBannerAction(id: string, tenantIdAlvo?: string): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx(tenantIdAlvo); if (!c.ok) return c
  const { error } = await c.svc.from('simulado_banners').delete().eq('id', id).eq('tenant_id', c.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_banners', entidadeId: id, tenantId: c.tenantId })
  reval(c.tenantId, c.ehSuper)
  return { ok: true }
}
