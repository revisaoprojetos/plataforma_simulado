'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Indicador de carregamento de navegação: barra fina + spinner logo abaixo da topbar.
 * Aparece ao clicar em qualquer link (ou voltar/avançar) e some quando a nova rota
 * termina de carregar — evita a sensação de "tela travada" no App Router.
 */
export function NavProgress() {
  const pathname = usePathname()
  const search = useSearchParams()
  const [loading, setLoading] = useState(false)

  // Rota concluída (pathname/query mudaram) → esconde.
  useEffect(() => { setLoading(false) }, [pathname, search])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const start = () => {
      setLoading(true)
      clearTimeout(timer)
      // Trava de segurança: some sozinho se a navegação demorar/cancelar.
      timer = setTimeout(() => setLoading(false), 15000)
    }

    // Cliques em links same-origin que realmente trocam de rota.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement)?.closest?.('a') as HTMLAnchorElement | null
      if (!a) return
      const href = a.getAttribute('href')
      const target = a.getAttribute('target')
      if (!href || (target && target !== '_self') || a.hasAttribute('download')) return
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      try {
        const url = new URL(href, window.location.href)
        if (url.origin !== window.location.origin) return
        if (url.pathname === window.location.pathname && url.search === window.location.search) return
        start()
      } catch { /* href inválido */ }
    }
    const onPop = () => start()

    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPop)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPop)
      clearTimeout(timer)
    }
  }, [])

  if (!loading) return null
  return (
    <>
      <style>{'@keyframes navprog{0%{transform:translateX(-100%)}50%{transform:translateX(35%)}100%{transform:translateX(220%)}}'}</style>
      {/* Barra fina indeterminada, colada abaixo da topbar */}
      <div className="pointer-events-none absolute inset-x-0 top-14 z-50 h-[3px] overflow-hidden bg-primary/15">
        <div className="h-full w-2/5 rounded-full bg-primary" style={{ animation: 'navprog 1.1s ease-in-out infinite' }} />
      </div>
      {/* Pílula com o ícone girando */}
      <div className="pointer-events-none absolute right-4 top-[3.9rem] z-50">
        <span className="flex items-center gap-1.5 rounded-full border bg-card/90 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Carregando…
        </span>
      </div>
    </>
  )
}
