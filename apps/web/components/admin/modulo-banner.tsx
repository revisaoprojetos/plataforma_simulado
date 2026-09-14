'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, Library } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Banner do módulo com collapse suave no scroll: o TÍTULO + botão Voltar + tabs ficam SEMPRE; ao rolar
 * para baixo, o SUBTÍTULO + breadcrumb somem (fade/altura) e o banner encolhe; ao voltar ao topo,
 * reaparecem. É sticky no topo do <main>. A detecção usa uma SENTINELA fora do sticky (IntersectionObserver
 * → só alterna um booleano; sem loops de scroll → sem flicker).
 */
export function ModuloBanner({ banner, titulo, subtitulo, topoDireita, breadcrumb, tabs }: {
  banner: string
  titulo: string
  subtitulo: string
  topoDireita?: ReactNode
  breadcrumb: ReactNode
  tabs: ReactNode
}) {
  const bannerRef = useRef<HTMLDivElement>(null)
  const [compacto, setCompacto] = useState(false)

  useEffect(() => {
    const root = (bannerRef.current?.closest('main') as HTMLElement | null) ?? null
    if (!root) return
    // Modo compacto por posição de scroll do <main>, com HISTERESE (zona morta 30–90px): recolhe ao passar
    // de 90px e só volta abaixo de 30px → nada de liga/desliga na borda. Como o container tem
    // overflow-anchor:none, encolher não mexe no scrollTop → sem feedback/flicker. No topo (0) = expandido.
    const onScroll = () => { const y = root.scrollTop; setCompacto((c) => (c ? y > 30 : y > 90)) }
    onScroll()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <div
        ref={bannerRef}
        className="sticky -top-6 z-30 -mx-6 -mt-6 flex flex-col overflow-hidden bg-neutral-950 transition-[min-height] duration-[450ms] ease-in-out [overflow-anchor:none]"
        style={{ minHeight: compacto ? '5rem' : '15rem' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        {/* Degradê mais forte (topo→base) p/ o título/tabs lerem bem e o encolher não ficar "seco". */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30" />
        {/* Reforço extra na BASE — funde a imagem nas tabs (degradê mais suave no corte). */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />

        <div className="relative flex flex-1 flex-col px-6 pt-4 text-white">
          {/* Linha do título — SEMPRE visível (título + Voltar + ação). */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Link href="/admin/leitura" aria-label="Voltar aos módulos" title="Voltar aos módulos" className="mt-1 inline-flex shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/15 p-2 text-white shadow-sm backdrop-blur transition-colors hover:bg-white/25">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight drop-shadow"><Library className="h-6 w-6 shrink-0" /> {titulo}</h1>
                {/* Subtítulo — some (altura + opacidade + leve subida) no modo compacto → degradê suave. */}
                <div className={cn('grid transition-all duration-[450ms] ease-in-out', compacto ? 'grid-rows-[0fr] -translate-y-1 opacity-0' : 'grid-rows-[1fr] translate-y-0 opacity-100')}>
                  <p className="overflow-hidden text-white/80 drop-shadow-sm">{subtitulo}</p>
                </div>
              </div>
            </div>
            {topoDireita && <div className="flex flex-wrap items-center justify-end gap-3">{topoDireita}</div>}
          </div>

          {/* Breadcrumb — some junto com o subtítulo. */}
          <div className={cn('grid transition-all duration-[450ms] ease-in-out', compacto ? 'grid-rows-[0fr] -translate-y-1 opacity-0' : 'mt-1.5 grid-rows-[1fr] translate-y-0 opacity-100')}>
            <div className="flex flex-wrap items-center gap-1 overflow-hidden text-sm text-white/75">{breadcrumb}</div>
          </div>

          {/* Tabs — SEMPRE, rente à base. */}
          <div className="mt-auto pt-3">{tabs}</div>
        </div>
      </div>
    </>
  )
}
