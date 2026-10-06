'use client'

import { useCallback, useEffect, useState } from 'react'

const COLLAPSE_KEY = 'shr:sidebar-collapsed'
const FS_KEY = 'shr:font-scale'
const THEME_KEY = 'shr:theme-pref'

/** Escalas de fonte (spec §2.6: Pequeno/Padrão/Grande/Extra grande). */
export const FONT_SCALES = [0.875, 1, 1.125, 1.25] as const
export type FontIdx = 0 | 1 | 2 | 3
export type ThemePref = 'claro' | 'escuro' | 'auto'

/** Estado da sidebar recolhida, persistido em localStorage. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
    } catch {}
  }, [])
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {}
      return next
    })
  }, [])
  return [collapsed, toggle] as const
}

/** Escala de fonte global via `--font-scale` no <html>, persistida. */
export function useFontScale() {
  const [idx, setIdx] = useState<FontIdx>(1)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FS_KEY)
      if (raw != null) {
        const n = Number(raw)
        if (n >= 0 && n <= 3) setIdx(n as FontIdx)
      }
    } catch {}
  }, [])
  const apply = useCallback((next: FontIdx) => {
    setIdx(next)
    try {
      localStorage.setItem(FS_KEY, String(next))
    } catch {}
    try {
      document.documentElement.style.setProperty('--font-scale', String(FONT_SCALES[next]))
    } catch {}
  }, [])
  return [idx, apply] as const
}

/** Preferência de tema (claro/escuro/auto), persistida. Visual-only aqui — o tema
 * efetivo é controlado pelo orquestrador/layout; guardamos a escolha do usuário. */
export function useThemePref(atual: 'claro' | 'escuro') {
  const [pref, setPref] = useState<ThemePref>(atual)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(THEME_KEY) as ThemePref | null
      if (raw === 'claro' || raw === 'escuro' || raw === 'auto') setPref(raw)
    } catch {}
  }, [])
  const apply = useCallback((next: ThemePref) => {
    setPref(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {}
  }, [])
  return [pref, apply] as const
}

/** Fecha ao apertar Esc. */
export function useEscClose(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}
