/** Normalização de rota p/ o rastreio da EQUIPE (pura; cliente e servidor). Sem query/hash; ids → :id. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function segmentos(limpo: string): string {
  const partes = limpo.split('/').filter(Boolean).slice(0, 10).map((seg) => {
    if (UUID.test(seg) || /^\d{2,}$/.test(seg) || (seg.length > 24 && /\d/.test(seg)) || /^[A-Za-z0-9_-]{20,}$/.test(seg)) return ':id'
    return seg.replace(/[^\w\-.:]/g, '').slice(0, 40)
  })
  return '/' + partes.join('/')
}

/** Página do painel (`/admin…`). Qualquer outra coisa → null. */
export function normalizarRotaAdmin(path: unknown): string | null {
  if (typeof path !== 'string') return null
  const limpo = path.split('?')[0].split('#')[0].trim()
  if (!/^\/admin(\/|$)/.test(limpo)) return null
  const r = segmentos(limpo)
  return r.length <= 160 ? r : null
}

/** Rota de API (`/api/…`), sem query e com ids → :id. */
export function normalizarRotaApi(path: unknown): string | null {
  if (typeof path !== 'string') return null
  const limpo = path.split('?')[0].split('#')[0].trim()
  if (!/^\/api(\/|$)/.test(limpo)) return null
  const r = segmentos(limpo)
  return r.length <= 160 ? r : null
}

/** Pathname de uma URL absoluta/relativa (ex.: Referer) → caminho normalizado do admin; null se fora do /admin. */
export function rotaDeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try { return normalizarRotaAdmin(new URL(url, 'http://x').pathname) } catch { return null }
}

export const TIPOS_CLIENTE_ADMIN = ['pagina_vista', 'tempo_pagina', 'heartbeat'] as const
export type TipoClienteAdmin = (typeof TIPOS_CLIENTE_ADMIN)[number]

/** Módulo legível a partir da rota (/admin/<modulo>/…). */
export function moduloDaRota(rota: string | null | undefined): string {
  const m = /^\/admin\/([^/]+)/.exec(rota ?? '')
  return m ? m[1] : 'painel'
}
