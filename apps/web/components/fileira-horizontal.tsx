'use client'

import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Fileira horizontal estilo Netflix (reutilizável admin + aluno): rola exatamente UM card por
 * clique; setas cinza com degradê que fundem na borda dos cards e expandem no hover. Os cards
 * (children) definem a própria largura — normalmente via `basis-[...]` para espiar o próximo.
 */
export function FileiraHorizontal({ titulo, count, children }: {
  titulo?: string; count?: number; children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [canL, setCanL] = useState(false)
  const [canR, setCanR] = useState(false)
  const atualiza = () => {
    const el = ref.current
    if (!el) return
    setCanL(el.scrollLeft > 4)
    setCanR(Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth - 4)
  }
  useEffect(() => {
    atualiza()
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', atualiza, { passive: true })
    window.addEventListener('resize', atualiza)
    // Reavalia quando o conteúdo muda de tamanho (imagens carregando, etc.).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(atualiza) : null
    ro?.observe(el)
    return () => { el.removeEventListener('scroll', atualiza); window.removeEventListener('resize', atualiza); ro?.disconnect() }
  }, [])
  // Rola exatamente UM card por vez (largura do 1º card + gap de 1rem).
  const rolar = (dir: -1 | 1) => {
    const el = ref.current
    if (!el) return
    const primeiro = el.firstElementChild as HTMLElement | null
    const passo = primeiro ? primeiro.offsetWidth + 16 : el.clientWidth
    el.scrollBy({ left: dir * passo, behavior: 'smooth' })
  }
  return (
    <section className="space-y-2">
      {titulo && (
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          {titulo}{count != null && <span className="text-xs font-normal text-muted-foreground">({count})</span>}
        </h3>
      )}
      <div className="relative">
        {canL && (
          <button type="button" aria-label="Ver anteriores" onClick={() => rolar(-1)}
            className="absolute left-0 top-1/2 z-20 hidden h-28 w-14 sm:flex origin-left -translate-y-1/2 items-center justify-start rounded-r-xl bg-gradient-to-r from-neutral-700/95 via-neutral-700/75 to-transparent pl-2 text-white shadow-lg transition duration-200 ease-out hover:scale-x-125 hover:scale-y-110 hover:from-neutral-600 hover:via-neutral-600/80">
            <ChevronLeft className="h-7 w-7" />
          </button>
        )}
        {/* py-2 dá folga vertical: overflow-x-auto também recorta na vertical, então sem isso o
            card cortaria no topo ao subir no hover (-translate-y). O -my-2 mantém o alinhamento. */}
        <div ref={ref} className="-my-2 flex gap-4 overflow-x-auto px-0.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
        {canR && (
          <button type="button" aria-label="Ver próximos" onClick={() => rolar(1)}
            className="absolute right-0 top-1/2 z-20 hidden h-28 w-14 sm:flex origin-right -translate-y-1/2 items-center justify-end rounded-l-xl bg-gradient-to-l from-neutral-700/95 via-neutral-700/75 to-transparent pr-2 text-white shadow-lg transition duration-200 ease-out hover:scale-x-125 hover:scale-y-110 hover:from-neutral-600 hover:via-neutral-600/80">
            <ChevronRight className="h-7 w-7" />
          </button>
        )}
      </div>
    </section>
  )
}
