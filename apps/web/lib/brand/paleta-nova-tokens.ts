/**
 * Ponte entre os mapas de tokens por marca (sim-tokens, interna-tokens, revisao-nova/tokens) e a paleta nova.
 * Cada chave vira `var(--pn-<ns>-<chave>, <valor legado>)`:
 *  - SEM o css da paleta (interruptor desligado / usuário fora do Workspace) a variável não existe → vale o legado, idêntico;
 *  - COM o css, vale a cor da paleta (gerada em lib/brand/paleta-nova.ts → varsPn()).
 * Puro e client-safe.
 */

/** Chaves do vocabulário do fluxo do simulado/telas internas (namespace `s`). Mantém em sincronia com varsPn(). */
export const CHAVES_PN_S = [
  'bg', 'surface', 'surface2', 'ink', 'muted', 'line', 'line2', 'chip', 'brand', 'brand2', 'track', 'selBg', 'selLine', 'selDot',
  'flag', 'flagBg', 'nAns', 'nAnsInk', 'peachBg', 'goldBg', 'goldInk', 'fOn', 'fOnInk', 'tBg', 'tOn', 'tOnInk',
  'gDone', 'sub', 'head', 'gCell', 'cyan', 'ok', 'warn', 'err',
] as const

/** Chaves do shell Revisão (namespace `r`). */
export const CHAVES_PN_R = [
  'bg', 'surface', 'surface2', 'ink', 'muted', 'muted2', 'line', 'line2', 'track', 'brand', 'brandLine', 'chip', 'accentInk',
  'peachBg', 'top', 'cnt', 'cntInk', 'fOn', 'fOnInk', 'hoverLine',
] as const

function envolver(vars: Record<string, string>, ns: 's' | 'r', chaves: readonly string[]): Record<string, string> {
  const out: Record<string, string> = { ...vars }
  for (const k of chaves) if (typeof vars[k] === 'string' && vars[k]) out[k] = `var(--pn-${ns}-${k},${vars[k]})`
  return out
}
export const pnS = (vars: Record<string, string>) => envolver(vars, 's', CHAVES_PN_S)
export const pnR = (vars: Record<string, string>) => envolver(vars, 'r', CHAVES_PN_R)

/** Valor com fallback legado p/ uma variável pontual da paleta (ex.: pn('r-side', 'linear-gradient(...)')). */
export const pn = (nome: string, legado: string) => `var(--pn-${nome},${legado})`
