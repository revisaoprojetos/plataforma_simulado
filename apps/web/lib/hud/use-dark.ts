'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'

/**
 * Tema claro/escuro do simulado — usa o MESMO tema global do app (next-themes),
 * para ficar consistente em todas as páginas (admin/aluno/simulado).
 *
 * `inicial` vem do servidor (cookie sincronizado do next-themes), para o SSR já
 * renderizar no tema certo e não piscar claro→escuro.
 */
export function useDarkMode(inicial = false): [boolean, () => void] {
  const { resolvedTheme, setTheme } = useTheme()
  const [dark, setDark] = useState(inicial)

  // Após montar, segue o tema resolvido pelo next-themes (fonte única da verdade).
  useEffect(() => {
    if (resolvedTheme) setDark(resolvedTheme === 'dark')
  }, [resolvedTheme])

  return [dark, () => setTheme(dark ? 'light' : 'dark')]
}
