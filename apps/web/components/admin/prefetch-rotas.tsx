'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Aquece rotas em SEGUNDO PLANO (router.prefetch) ao montar — deixa a navegação entre as áreas
 * de um mesmo documento LegProc (Conteúdo · Questões · Alterações) instantânea. Não renderiza nada.
 */
export function PrefetchRotas({ rotas }: { rotas: string[] }) {
  const router = useRouter()
  useEffect(() => {
    for (const r of rotas) { try { router.prefetch(r) } catch { /* ignora */ } }
  }, [router, rotas])
  return null
}
