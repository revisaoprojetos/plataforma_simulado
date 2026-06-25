'use client'

import { useTheme } from 'next-themes'
import { useEffect } from 'react'

export { useTheme }

interface BrandTheme {
  cor_primaria?: string
  cor_secundaria?: string
  cor_accent?: string
  logo_url?: string
  logo_dark_url?: string
  fonte?: string
}

export function useBrandTheme(tema?: BrandTheme) {
  useEffect(() => {
    if (!tema) return

    const root = document.documentElement

    if (tema.cor_primaria) {
      root.style.setProperty('--brand-primary', tema.cor_primaria)
    }
    if (tema.cor_secundaria) {
      root.style.setProperty('--brand-secondary', tema.cor_secundaria)
    }
    if (tema.cor_accent) {
      root.style.setProperty('--brand-accent', tema.cor_accent)
    }

    return () => {
      root.style.removeProperty('--brand-primary')
      root.style.removeProperty('--brand-secondary')
      root.style.removeProperty('--brand-accent')
    }
  }, [tema])
}
