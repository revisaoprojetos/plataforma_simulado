'use client'

// Resolve o tema das telas internas no CLIENTE, seguindo a classe aplicada em <html> pelo next-themes
// (`.dark` → escuro; `.theme-azul` → azul; senão → claro). Reage ao TOGGLE ao vivo (MutationObserver),
// o que os tokens inline por-prop (server) não faziam. Fallback = o tema vindo do servidor (preview).

import { useEffect, useState } from 'react'
import type { InternaTheme } from './interna-tokens'

function lerClasse(fallback: InternaTheme): InternaTheme {
  if (typeof document === 'undefined') return fallback
  const cl = document.documentElement.classList
  if (cl.contains('dark')) return 'escuro'
  // O MEQ aplica `.theme-azul` no wrapper `.app` (não no <html>) → procura em qualquer lugar.
  if (cl.contains('theme-azul') || document.querySelector('.theme-azul')) return 'azul'
  // Sem classe de tema → mantém o fallback (ex.: preview claro/escuro por query).
  return fallback === 'escuro' ? 'claro' : fallback
}

export function useTemaInterno(fallback: InternaTheme): InternaTheme {
  const [tema, setTema] = useState<InternaTheme>(fallback)
  useEffect(() => {
    const atualizar = () => setTema((prev) => { const t = lerClasse(fallback); return t === prev ? prev : t })
    atualizar()
    // subtree:true → também pega a troca de `.theme-azul` no `.app` (toggle do tema ao vivo), não só o <html>.
    const obs = new MutationObserver(atualizar)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'], subtree: true })
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback])
  return tema
}
