'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Banner do módulo com collapse no SCROLL (estilo header de site pro): ao rolar o conteúdo PARA BAIXO
 * o banner encolhe e mostra só um pouco da base + as tabs; ao rolar PARA CIMA (ou perto do topo)
 * reaparece inteiro. Sticky no topo do <main>. Só colapsa quando a página realmente tem scroll.
 */
export function ModuloBanner({ banner, topo, tabs }: { banner: string; topo: ReactNode; tabs: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [compacto, setCompacto] = useState(false)

  useEffect(() => {
    const sc = (ref.current?.closest('main') as HTMLElement | null) ?? null
    if (!sc) return
    let ultimo = sc.scrollTop
    const onScroll = () => {
      const y = sc.scrollTop
      if (y < 64) setCompacto(false)               // perto do topo → inteiro
      else if (y > ultimo + 4) setCompacto(true)    // rolando p/ baixo → encolhe
      else if (y < ultimo - 4) setCompacto(false)   // rolando p/ cima → reaparece
      ultimo = y
    }
    sc.addEventListener('scroll', onScroll, { passive: true })
    return () => sc.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div
      ref={ref}
      className="sticky -top-6 z-30 -mx-6 -mt-6 overflow-hidden bg-neutral-950 transition-[min-height] duration-300 ease-out"
      style={{ minHeight: compacto ? '3.25rem' : '15rem' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover transition-[object-position] duration-300" style={{ objectPosition: compacto ? 'center bottom' : 'center' }} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/15" />
      <div className="relative flex h-full min-h-[3.25rem] w-full flex-col px-6 text-white">
        {/* Topo (título/subtítulo/breadcrumb/ações) — recolhe no modo compacto (grid-rows 0fr↔1fr). */}
        <div className={cn('grid transition-all duration-300 ease-out', compacto ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100 pt-4')}>
          <div className="overflow-hidden">{topo}</div>
        </div>
        {/* Tabs — sempre visíveis, rente à base. */}
        <div className="mt-auto pt-2">{tabs}</div>
      </div>
    </div>
  )
}
