'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'

/**
 * Espelha o tema atual do next-themes num cookie `theme`, para que os Server
 * Components (login/simulado) já renderizem no tema certo no SSR — sem piscar.
 */
export function ThemeCookieSync() {
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    if (!resolvedTheme) return
    try {
      document.cookie = `theme=${resolvedTheme};path=/;max-age=31536000;samesite=lax`
    } catch {}
  }, [resolvedTheme])
  return null
}
