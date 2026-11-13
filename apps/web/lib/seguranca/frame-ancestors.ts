/**
 * frame-ancestors do /embed: FALHA FECHADA com fallback seguro (nunca `*` em erro de resolução).
 *
 * Quando a resolução das origens permitidas (tenant/simulado_embed_config) FALHA, a ordem é:
 *  1. último valor bom ("last known good") do MESMO host, em memória da instância;
 *  2. senão, união das origens de todos os hosts já resolvidos nesta instância;
 *  3. + env FRAME_ANCESTORS_FALLBACK (lista separada por espaço/vírgula) + origens conhecidas da Curseduca (abaixo);
 *  4. sempre com 'self'. Se nada além de 'self' existir, fica só 'self'.
 * O caminho de SUCESSO não muda (origens configuradas; lista vazia = comportamento legado `*`, tratado pelo chamador).
 */

/** Origens da Curseduca conhecidas (iguais às sugeridas no comentário histórico do proxy). Ajuste via FRAME_ANCESTORS_FALLBACK. */
const ORIGENS_CURSEDUCA_CONHECIDAS = ['https://*.curseduca.pro', 'https://membros.revisaoensinojuridico.com.br']

const lastKnownGood = new Map<string, string[]>()
const MAX_HOSTS = 200

// Fonte de host-source do CSP: esquema://host[:porta] ou *.dominio; rejeita qualquer coisa com aspas/;/espaço (injeção de diretiva).
const ORIGEM_VALIDA = /^(https?:\/\/)(\*\.)?[a-z0-9.-]+(:\d{1,5})?$/i

export function sanearOrigens(lista: unknown): string[] {
  if (!Array.isArray(lista)) return []
  return lista.map((o) => String(o).trim().replace(/\/+$/, '')).filter((o) => ORIGEM_VALIDA.test(o))
}

/** Registra as origens resolvidas com sucesso (para o fallback futuro). */
export function registrarOrigensBoas(host: string, origens: string[]): void {
  if (!host || origens.length === 0) return
  if (!lastKnownGood.has(host) && lastKnownGood.size >= MAX_HOSTS) {
    const primeiro = lastKnownGood.keys().next().value
    if (primeiro) lastKnownGood.delete(primeiro)
  }
  lastKnownGood.set(host, origens)
}

/** Monta o valor CSP `frame-ancestors ...` para o caso de FALHA na resolução. Nunca retorna `*`. */
export function frameAncestorsFallback(host: string, motivo: string): string {
  const fonte = new Set<string>()
  const doHost = lastKnownGood.get(host)
  let origem = 'conhecidas'
  if (doHost && doHost.length) {
    doHost.forEach((o) => fonte.add(o))
    origem = 'last-known-good do host'
  } else {
    lastKnownGood.forEach((l) => l.forEach((o) => fonte.add(o)))
    if (fonte.size) origem = 'last-known-good (união dos hosts)'
  }
  sanearOrigens((process.env.FRAME_ANCESTORS_FALLBACK ?? '').split(/[\s,]+/)).forEach((o) => fonte.add(o))
  ORIGENS_CURSEDUCA_CONHECIDAS.forEach((o) => fonte.add(o))
  const valor = `frame-ancestors 'self' ${[...fonte].join(' ')}`.trim()
  console.warn(`[frame-ancestors] FALLBACK (${motivo}) host=${host || '?'} fonte=${origem} -> ${valor}`)
  return valor
}
