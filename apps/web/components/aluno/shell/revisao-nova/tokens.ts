// Tokens EXATOS da marca Revisão (spec 03 §1.1) por tema claro/escuro.
// A paleta do interna-tokens diverge da spec 03, então estes valores sobrescrevem
// o que internaTokensStyle() injeta no root do shell.

import type { CSSProperties } from 'react'

export type ShellTheme = 'claro' | 'escuro'

/** Mapa cru de tokens da marca Revisão (sem o prefixo `--`), spec 03 §1.1. */
function revVars(theme: ShellTheme): Record<string, string> {
  if (theme === 'escuro') {
    return {
      bg: '#18181D',
      surface: '#232329',
      surface2: '#2C2C34',
      ink: '#FFFFFF',
      muted: '#BDBBCB',
      muted2: '#73717F',
      line: 'rgba(255,255,255,.1)',
      line2: 'rgba(255,255,255,.18)',
      track: 'rgba(255,255,255,.12)',
      brand: '#B3A1FF',
      brandLine: 'rgba(179,161,255,.45)',
      chip: 'rgba(143,117,255,.2)',
      accentInk: '#F1C232',
      peachBg: 'rgba(241,194,50,.12)',
      top: 'rgba(24,16,56,.96)',
      cnt: 'rgba(143,117,255,.22)',
      cntInk: '#D2C6FF',
      fOn: '#F1C232',
      fOnInk: '#2A1A55',
      hoverLine: 'rgba(179,161,255,.45)',
    }
  }
  return {
    bg: '#F4F2FA',
    surface: '#FFFFFF',
    surface2: '#F6F4FC',
    ink: '#1D1933',
    muted: '#6E6886',
    muted2: '#B3ADC7',
    line: '#EAE6F4',
    line2: '#D9D2F0',
    track: '#ECE8F6',
    brand: '#5B3FD0',
    brandLine: 'rgba(91,63,208,.3)',
    chip: '#EFEBFD',
    accentInk: '#9A7400',
    peachBg: '#FDF5D8',
    top: 'rgba(244,242,250,.85)',
    cnt: '#EFEBFD',
    cntInk: '#5B3FD0',
    fOn: '#2E1F7A',
    fOnInk: '#FFFFFF',
    hoverLine: 'rgba(91,63,208,.35)',
  }
}

/** Estilo inline com os tokens da marca Revisão para o root do shell. */
export function revTokensStyle(theme: ShellTheme): CSSProperties {
  const vars = revVars(theme)
  const style: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars)) style[`--${k}`] = v
  return style as CSSProperties
}

/** Gradiente de fundo da sidebar por tema (spec 03 §1.1). */
export const SIDEBAR_GRAD: Record<ShellTheme, string> = {
  claro: 'linear-gradient(180deg,#2E1F7A,#3A27A0 60%,#4A31B8)',
  escuro: 'linear-gradient(180deg,#160F36,#22184F)',
}

/** Gradiente do cabeçalho dos menus (conta/notificações). */
export const MENU_HEADER_GRAD = 'radial-gradient(120% 140% at 100% 0%,#6449E0,#3B1E8F 60%,#241047)'

/** Fundo do botão de recolher por tema. */
export const COLLAPSE_BTN_BG: Record<ShellTheme, string> = { claro: '#3A27A0', escuro: '#2A1D66' }

/** Gradiente da top bar roxa no mobile. */
export const MOBILE_TOPBAR_GRAD: Record<ShellTheme, string> = {
  claro: 'linear-gradient(120deg,#2E1F7A,#4A31B8)',
  escuro: 'linear-gradient(180deg,#160F36,#22184F)',
}

/** Fundo da down bar flutuante por tema. */
export const DOWNBAR_BG: Record<ShellTheme, string> = { claro: '#2E1F7A', escuro: '#22184F' }

export const AMARELO = '#F1C232'
export const AMARELO_INK = '#2A1A55'
