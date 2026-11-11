import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { criptografar, tentarDescriptografar } from '@/lib/crypto'
import { normalizarPrefixo, PREFIXO_PADRAO } from './config-tipos'

/**
 * Config GLOBAL do serviço de vídeo (tabela video_config, 1 linha), com cache de 60 s e FALLBACK às env
 * (VIDEO_API_URL, VIDEO_PUBLIC_API_URL, VIDEO_INTEGRATION_KEY[__SLUG], VIDEO_ADMIN_EMAIL/PASSWORD[__SLUG]).
 * Usa a linha do banco só quando `ativo = true` e há URL; senão cai nas env (nada já configurado quebra).
 * Segredos decifrados NUNCA saem do servidor.
 */
export interface ConfigVideo {
  fonte: 'banco' | 'env'
  urlInterna: string
  prefixoPublico: string
  /** Só no modo env: origem pública fixa (VIDEO_PUBLIC_API_URL). No modo banco é sempre <origin do request><prefixo>. */
  publicaFixa: string | null
  chave: string | null
  adminEmail: string | null
  adminSenha: string | null
}

const TTL_MS = 60_000
let cache: { exp: number; valor: ConfigVideo | null } | null = null

export function invalidarConfigVideo() { cache = null }

export interface LinhaVideoConfig {
  url_interna: string | null
  prefixo_publico: string | null
  chave_integracao_enc: string | null
  admin_email: string | null
  admin_senha_enc: string | null
  ativo: boolean
  atualizado_em: string | null
}

/** Leitura crua e tolerante da linha (tabela inexistente / erro => null). */
export async function lerLinhaVideoConfig(): Promise<LinhaVideoConfig | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('video_config')
      .select('url_interna, prefixo_publico, chave_integracao_enc, admin_email, admin_senha_enc, ativo, atualizado_em')
      .eq('id', true)
      .maybeSingle()
    if (error || !data) return null
    return data as LinhaVideoConfig
  } catch {
    return null
  }
}

function daEnv(): ConfigVideo | null {
  const url = process.env.VIDEO_API_URL
  if (!url) return null
  return {
    fonte: 'env',
    urlInterna: url,
    prefixoPublico: PREFIXO_PADRAO,
    publicaFixa: process.env.VIDEO_PUBLIC_API_URL || null,
    chave: null, adminEmail: null, adminSenha: null, // resolvidos por empresa em segredosVideo()
  }
}

export async function carregarConfigVideo(): Promise<ConfigVideo | null> {
  if (cache && cache.exp > Date.now()) return cache.valor
  const l = await lerLinhaVideoConfig()
  let valor: ConfigVideo | null
  if (l?.ativo && l.url_interna?.trim()) {
    valor = {
      fonte: 'banco',
      urlInterna: l.url_interna.trim(),
      prefixoPublico: normalizarPrefixo(l.prefixo_publico),
      publicaFixa: null,
      chave: tentarDescriptografar(l.chave_integracao_enc) || null,
      adminEmail: l.admin_email?.trim() || null,
      adminSenha: tentarDescriptografar(l.admin_senha_enc) || null,
    }
  } else valor = daEnv()
  cache = { exp: Date.now() + TTL_MS, valor }
  return valor
}

/** Env por empresa (`BASE__SLUG`) com fallback à global (`BASE`). */
export function envSlug(base: string, slug: string): string | undefined {
  const suf = slug.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return process.env[`${base}__${suf}`] || process.env[base] || undefined
}

/** Segredos efetivos p/ uma empresa: valor do banco (global) se houver; senão env por empresa. */
export async function segredosVideo(slug: string): Promise<{ chave: string | null; adminEmail: string | null; adminSenha: string | null }> {
  const c = await carregarConfigVideo()
  return {
    chave: c?.chave || envSlug('VIDEO_INTEGRATION_KEY', slug) || null,
    adminEmail: c?.adminEmail || envSlug('VIDEO_ADMIN_EMAIL', slug) || null,
    adminSenha: c?.adminSenha || envSlug('VIDEO_ADMIN_PASSWORD', slug) || null,
  }
}

export const cifrarSegredoVideo = (s: string) => criptografar(s)
