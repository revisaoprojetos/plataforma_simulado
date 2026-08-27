'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Anima abrir/fechar mantendo o elemento montado durante a animação de saída.
 * - `montado`: se deve estar no DOM (fica true até a animação de saída terminar).
 * - `aberto`: estado visual — alterne as classes de entrada/saída por ele.
 *
 * Uso: `if (!montado) return null` e `className={cn('transition', aberto ? 'opacity-100' : 'opacity-0')}`.
 */
export function useAbreFecha(open: boolean, ms = 180): { montado: boolean; aberto: boolean } {
  const [montado, setMontado] = useState(open)
  const [aberto, setAberto] = useState(open)
  const raf = useRef(0)

  useEffect(() => {
    if (open) {
      setMontado(true)
      // dois rAF: garante que o estado inicial (opacity-0) foi pintado antes de virar visível → a transição roda.
      raf.current = requestAnimationFrame(() => { raf.current = requestAnimationFrame(() => setAberto(true)) })
      return () => cancelAnimationFrame(raf.current)
    }
    setAberto(false)
    const t = setTimeout(() => setMontado(false), ms)
    return () => clearTimeout(t)
  }, [open, ms])

  return { montado, aberto }
}
