// theme_vars do fluxo do simulado (spec 06 §0 "Temas" + §5.2). Tokens CSS por marca × tema.
// Os componentes aplicam via `simTokensStyle(brand, theme)` no root; usam `var(--xxx)` no CSS.
// Cores de marca são FIXAS por design (telas branded, como as de login/loading).

import type { Brand, SimTheme } from './types'

type Vars = Record<string, string>

// Chaves (spec §0): bg surface surface2 ink muted line line2 chip brand brand2 track
// selBg selLine selDot flag flagBg nAns nAnsInk peachBg goldBg goldInk fOn fOnInk tBg tOn tOnInk
const REV: Partial<Record<SimTheme, Vars>> = {
  claro: {
    bg: '#F5F3FC', surface: '#FFFFFF', surface2: '#F4F1FB', ink: '#1D1933', muted: '#6B6680',
    line: '#E5E1F0', line2: '#EEEAF7', chip: '#EDE8FB', brand: '#6449E0', brand2: '#8F75FF', track: '#E7E2F3',
    selBg: '#EFEBFF', selLine: '#8F75FF', selDot: '#6449E0', flag: '#F2B63B', flagBg: 'rgba(242,182,59,.16)',
    nAns: '#E7E0FA', nAnsInk: '#4B30BE', peachBg: '#FFE9DC', goldBg: '#FFF3D6', goldInk: '#9A7414',
    fOn: '#F2B63B', fOnInk: '#3A2A00', tBg: '#EEEAF7', tOn: '#FFFFFF', tOnInk: '#4B30BE',
  },
  escuro: {
    bg: '#0E0A24', surface: '#1C1440', surface2: '#171030', ink: '#F3F0FF', muted: '#9F97C7',
    line: 'rgba(185,168,255,.16)', line2: 'rgba(185,168,255,.1)', chip: 'rgba(185,168,255,.12)', brand: '#8F75FF', brand2: '#B9A8FF', track: 'rgba(255,255,255,.08)',
    selBg: 'rgba(143,117,255,.16)', selLine: '#8F75FF', selDot: '#B9A8FF', flag: '#F2B63B', flagBg: 'rgba(242,182,59,.18)',
    nAns: 'rgba(143,117,255,.22)', nAnsInk: '#E1D9FF', peachBg: 'rgba(255,196,163,.14)', goldBg: 'rgba(242,182,59,.14)', goldInk: '#F2B63B',
    fOn: '#F2B63B', fOnInk: '#3A2A00', tBg: 'rgba(255,255,255,.06)', tOn: '#2A2150', tOnInk: '#E1D9FF',
  },
}
const VND: Partial<Record<SimTheme, Vars>> = {
  claro: {
    bg: '#F5F8F6', surface: '#FFFFFF', surface2: '#F3F7F4', ink: '#101C16', muted: '#5C6B62',
    line: '#E1E8E3', line2: '#EDF2EE', chip: '#E4F0E9', brand: '#0F7A44', brand2: '#14924F', track: '#E1E8E3',
    selBg: '#E6F4EC', selLine: '#14924F', selDot: '#0F7A44', flag: '#F2B63B', flagBg: 'rgba(242,182,59,.16)',
    nAns: '#D7EFE0', nAnsInk: '#0C6E3C', peachBg: '#FFF3D6', goldBg: '#FBEFC9', goldInk: '#9A7414',
    fOn: '#F2B63B', fOnInk: '#3A2A00', tBg: '#EDF2EE', tOn: '#FFFFFF', tOnInk: '#0C6E3C',
  },
  escuro: {
    bg: '#061009', surface: '#0A1A10', surface2: '#081509', ink: '#E8F3EC', muted: '#8FB09E',
    line: 'rgba(120,230,170,.16)', line2: 'rgba(120,230,170,.1)', chip: 'rgba(120,230,170,.12)', brand: '#3FD58A', brand2: '#14924F', track: 'rgba(255,255,255,.08)',
    selBg: 'rgba(63,213,138,.14)', selLine: '#3FD58A', selDot: '#3FD58A', flag: '#E8C877', flagBg: 'rgba(232,200,119,.16)',
    nAns: 'rgba(63,213,138,.2)', nAnsInk: '#9BE9C0', peachBg: 'rgba(232,200,119,.14)', goldBg: 'rgba(232,200,119,.14)', goldInk: '#E8C877',
    fOn: '#E8C877', fOnInk: '#2A2000', tBg: 'rgba(255,255,255,.06)', tOn: '#113322', tOnInk: '#9BE9C0',
  },
}
const MEQ: Partial<Record<SimTheme, Vars>> = {
  claro: {
    bg: '#F6F9FE', surface: '#FFFFFF', surface2: '#F5F8FD', ink: '#171E3B', muted: '#5E6A88',
    line: '#DCE3F2', line2: '#E8EEF8', chip: '#E4ECF8', brand: '#306AB5', brand2: '#5ECEF0', track: '#E3EAF6',
    selBg: '#E7F0FB', selLine: '#3E7FE0', selDot: '#306AB5', flag: '#F2A93B', flagBg: 'rgba(242,169,59,.16)',
    nAns: '#DCE8F8', nAnsInk: '#1F4E9A', peachBg: '#FFF3D6', goldBg: '#FBEFC9', goldInk: '#9A7414',
    fOn: '#F2A93B', fOnInk: '#3A2A00', tBg: '#E8EEF8', tOn: '#FFFFFF', tOnInk: '#1F4E9A',
  },
  azul: {
    bg: '#2F64C8', surface: '#FFFFFF', surface2: '#EEF4FD', ink: '#0E1A3A', muted: '#3C5A8C',
    line: '#CBD9F0', line2: '#E0E9F8', chip: '#E4ECF8', brand: '#1F2A55', brand2: '#5ECEF0', track: '#D9E4F5',
    selBg: '#E7F0FB', selLine: '#3E7FE0', selDot: '#2F64C8', flag: '#F2A93B', flagBg: 'rgba(242,169,59,.16)',
    nAns: '#DCE8F8', nAnsInk: '#1F2A55', peachBg: '#FFF3D6', goldBg: '#FBEFC9', goldInk: '#9A7414',
    fOn: '#F2A93B', fOnInk: '#3A2A00', tBg: '#E0E9F8', tOn: '#FFFFFF', tOnInk: '#1F2A55',
  },
  escuro: {
    bg: '#0C1326', surface: '#141B38', surface2: '#101733', ink: '#E7EDFB', muted: '#8CA0CC',
    line: 'rgba(140,170,255,.2)', line2: 'rgba(140,170,255,.12)', chip: 'rgba(140,170,255,.14)', brand: '#4A8BEA', brand2: '#5ECEF0', track: 'rgba(255,255,255,.08)',
    selBg: 'rgba(74,139,234,.16)', selLine: '#4A8BEA', selDot: '#7FC3FF', flag: '#F2A93B', flagBg: 'rgba(242,169,59,.18)',
    nAns: 'rgba(74,139,234,.22)', nAnsInk: '#BFD8FF', peachBg: 'rgba(242,169,59,.14)', goldBg: 'rgba(242,169,59,.14)', goldInk: '#F2A93B',
    fOn: '#F2A93B', fOnInk: '#2A2000', tBg: 'rgba(255,255,255,.06)', tOn: '#1E2A52', tOnInk: '#BFD8FF',
  },
}

const TABELA: Record<Brand, Partial<Record<SimTheme, Vars>>> = { revisao: REV, vnd: VND, meq: MEQ }

/** Raio de card por marca (spec §0): Rev 16, VND 18, MEQ 12. */
export const SIM_RADIUS: Record<Brand, number> = { revisao: 16, vnd: 18, meq: 12 }

/** Fonte por marca. Rev/VND Plus Jakarta Sans; MEQ Sora. */
export const SIM_FONT: Record<Brand, string> = {
  revisao: "'Plus Jakarta Sans',sans-serif",
  vnd: "'Plus Jakarta Sans',sans-serif",
  meq: "'Sora',sans-serif",
}

function temaValido(brand: Brand, theme: SimTheme): SimTheme {
  if (theme === 'azul' && brand !== 'meq') return 'claro'
  return TABELA[brand][theme] ? theme : 'claro'
}

/** Mapa cru de tokens (sem prefixo `--`). */
export function simVars(brand: Brand, theme: SimTheme): Vars {
  const t = temaValido(brand, theme)
  return TABELA[brand][t] ?? REV.claro!
}

/** Estilo pronto p/ o root: injeta `--bg`, `--surface`, … + `--r` (raio) + fonte. */
export function simTokensStyle(brand: Brand, theme: SimTheme): React.CSSProperties {
  const vars = simVars(brand, theme)
  const style: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars)) style[`--${k}`] = v
  style['--r'] = `${SIM_RADIUS[brand]}px`
  return { ...(style as React.CSSProperties), background: vars.bg, color: vars.ink, fontFamily: SIM_FONT[brand] }
}
