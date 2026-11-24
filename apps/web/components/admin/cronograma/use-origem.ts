'use client'

import { usePathname, useSearchParams } from 'next/navigation'

/** Caminho + query atuais (origem do `?voltar=` ao navegar para uma tela de edição). Use com `comVoltar(href, origem)`. */
export function useOrigem(): string {
  const pathname = usePathname()
  const qs = useSearchParams().toString()
  return qs ? `${pathname}?${qs}` : pathname
}
