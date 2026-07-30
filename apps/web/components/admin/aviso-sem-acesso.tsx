'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

/**
 * Mostra um aviso quando o gate de rota do /admin barrou o acesso a uma área (o layout redireciona
 * para `/admin?erro=sem-acesso`). Dispara um toast uma única vez e limpa o parâmetro da URL.
 */
export function AvisoSemAcesso() {
  const search = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const jaAvisou = useRef(false)

  useEffect(() => {
    if (search.get('erro') !== 'sem-acesso' || jaAvisou.current) return
    jaAvisou.current = true
    toast.error('Sem acesso a essa área', {
      description: 'Seu cargo não tem permissão para acessá-la. Fale com um administrador se precisar de acesso.',
    })
    // Remove o parâmetro para o aviso não repetir ao recarregar/navegar.
    const params = new URLSearchParams(Array.from(search.entries()))
    params.delete('erro')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [search, router, pathname])

  return null
}
