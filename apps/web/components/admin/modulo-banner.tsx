'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, Library } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Banner do módulo: UMA imagem edge-to-edge com as tabs na base. Colapsa por CSS puro (sticky com top
 * negativo → a parte de cima sobe e sobra a base com as tabs). Quando colapsado, aparece um cabeçalho
 * COMPACTO (Voltar + título, sem descrição) na faixa. O "colapsado" é detectado por IntersectionObserver
 * (alterna só a OPACIDADE de overlays absolutos → sem mexer no layout/scroll → sem flicker).
 */
export function ModuloBanner({ banner, titulo, subtitulo, topoDireita, breadcrumb, tabs }: {
  banner: string
  titulo: string
  subtitulo: string
  topoDireita?: ReactNode
  breadcrumb: ReactNode
  tabs: ReactNode
}) {
  const topoRef = useRef<HTMLDivElement>(null)
  const [compacto, setCompacto] = useState(false)

  useEffect(() => {
    const el = topoRef.current
    const root = (el?.closest('main') as HTMLElement | null) ?? null
    if (!el || !root) return
    // compacto = o bloco do topo (título/descrição) saiu da viewport (rolou pra cima).
    const io = new IntersectionObserver(([e]) => setCompacto(!e.isIntersecting), { root, threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div className="sticky -top-[11.5rem] z-30 -mx-6 -mt-6 flex h-[15rem] overflow-hidden bg-neutral-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/15" />

      <div className="relative flex w-full flex-col px-6 pt-4 text-white">
        {/* Bloco do TOPO (some/rola quando colapsa) — título + descrição + ação + breadcrumb. */}
        <div ref={topoRef} className={cn('transition-opacity duration-200', compacto && 'opacity-0')}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Link href="/admin/leitura" aria-label="Voltar aos módulos" title="Voltar aos módulos" className="mt-1 inline-flex shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/15 p-2 text-white shadow-sm backdrop-blur transition-colors hover:bg-white/25">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight drop-shadow"><Library className="h-6 w-6" /> {titulo}</h1>
                <p className="text-white/80 drop-shadow-sm">{subtitulo}</p>
              </div>
            </div>
            {topoDireita && <div className="flex flex-wrap items-center justify-end gap-3">{topoDireita}</div>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-sm text-white/75">{breadcrumb}</div>
        </div>

        {/* Tabs na BASE (sempre visíveis; ficam na faixa que permanece grudada ao rolar). */}
        <div className="mt-auto pt-3">{tabs}</div>
      </div>

      {/* Cabeçalho COMPACTO (Voltar + título, sem descrição) — aparece SÓ quando colapsado, na faixa,
          logo acima das tabs. Absoluto → não empurra layout (sem feedback de scroll/flicker). */}
      <div className={cn('absolute inset-x-0 bottom-[2.85rem] z-10 flex items-center gap-2 px-6 text-white transition-opacity duration-200', compacto ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        <Link href="/admin/leitura" aria-label="Voltar aos módulos" title="Voltar aos módulos" className="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/15 p-1.5 text-white shadow-sm backdrop-blur transition-colors hover:bg-white/25">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h2 className="flex items-center gap-1.5 truncate text-base font-bold tracking-tight drop-shadow"><Library className="h-4 w-4 shrink-0" /> {titulo}</h2>
      </div>
    </div>
  )
}
