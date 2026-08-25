'use client'

import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { SetaDegrade } from '@/components/seta-degrade'

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
      <div className="group relative">
        {/* py-2 dá folga vertical: overflow-x-auto também recorta na vertical, então sem isso o
            card cortaria no topo ao subir no hover (-translate-y). O -my-2 mantém o alinhamento. */}
        <div ref={ref} className="-my-2 flex gap-4 overflow-x-auto px-0.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
        {/* Setas DEPOIS dos cards no DOM → a cascata de entrada dá índice ALTO (entram junto/depois dos
            cards, não antes). insetY inset-y-2 casa o degradê com a altura real dos cards (desconta o py-2). */}
        {canL && <SetaDegrade dir="left" onClick={() => rolar(-1)} label="Ver anteriores" insetY="inset-y-2" />}
        {canR && <SetaDegrade dir="right" onClick={() => rolar(1)} label="Ver próximos" insetY="inset-y-2" />}
      </div>
    </section>
  )
}
