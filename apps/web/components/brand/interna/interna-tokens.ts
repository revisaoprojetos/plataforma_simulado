// Tokens das TELAS INTERNAS (spec 05: Perfil / Resultado-interno / Cronograma) por marca × tema.
// Reusa a paleta do fluxo do simulado (sim-tokens) e adiciona os extras citados na spec §0
// (sub, head, gCell, gDone, cyan). Cores de marca fixas por design (telas branded no preview).
//
// Produção não é afetada: estas telas só aparecem em /interna/preview (mock) nesta fase.

import { simVars } from '@/components/brand/simulado/sim-tokens'
import type { Brand, SimTheme } from '@/components/brand/simulado/types'

export type { Brand }
export type InternaTheme = SimTheme // 'claro' | 'escuro' | 'azul' (azul só MEQ)

/** Raio de card por marca (spec 05 §0): Rev 20, VND 24, MEQ 14. */
export const INTERNA_RADIUS: Record<Brand, number> = { revisao: 20, vnd: 24, meq: 14 }

export const INTERNA_FONT: Record<Brand, string> = {
  revisao: "'Plus Jakarta Sans',sans-serif",
  vnd: "'Plus Jakarta Sans',sans-serif",
  meq: "'Sora',sans-serif",
}

const ehEscuro = (theme: InternaTheme) => theme === 'escuro'

/** Mapa cru de tokens (sem prefixo `--`) — base do simulado + extras das telas internas. */
export function internaVars(brand: Brand, theme: InternaTheme): Record<string, string> {
  const base = simVars(brand, theme)
  const dark = ehEscuro(theme)
  return {
    ...base,
    sub: base.muted, // texto secundário
    head: base.ink, // títulos
    gCell: base.surface2, // célula de grade (cronograma)
    gDone: dark ? 'rgba(34,181,115,.18)' : '#E7F7EE', // célula concluída
    cyan: brand === 'meq' ? base.brand2 : base.selDot,
    // Semânticos usados nas telas (nota/aprovação): verde/âmbar/vermelho fixos.
    ok: '#1FA868',
    warn: '#F2A93B',
    err: '#E5484D',
  }
}

/** Estilo pronto p/ o root: injeta `--xxx` + `--r` (raio) + cor/fundo/fonte. */
export function internaTokensStyle(brand: Brand, theme: InternaTheme): React.CSSProperties {
  const vars = internaVars(brand, theme)
  const style: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars)) style[`--${k}`] = v
  style['--r'] = `${INTERNA_RADIUS[brand]}px`
  return { ...(style as React.CSSProperties), background: vars.bg, color: vars.ink, fontFamily: INTERNA_FONT[brand] }
}
