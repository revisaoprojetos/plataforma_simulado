/** Tipos/constantes da config global de vídeo (sem 'server-only': usados também pela tela). */
export interface VideoConfigPublica {
  urlInterna: string
  prefixoPublico: string
  ativo: boolean
  chaveConfigurada: boolean
  chaveFim: string | null // últimos 4 caracteres
  adminEmail: string
  adminSenhaConfigurada: boolean
  atualizadoEm: string | null
}

export const URL_INTERNA_PADRAO = 'http://video-api:3000'
export const PREFIXO_PADRAO = '/video-api'

/** "/video-api/" => "/video-api"; garante barra inicial; vazio => padrão. */
export function normalizarPrefixo(p: string | null | undefined): string {
  const s = (p ?? '').trim().replace(/\/+$/, '')
  if (!s) return PREFIXO_PADRAO
  return s.startsWith('/') ? s : `/${s}`
}

export interface TesteConexaoVideo {
  ok: boolean
  mensagem: string
  db?: string
  redis?: string
  s3?: string
}
