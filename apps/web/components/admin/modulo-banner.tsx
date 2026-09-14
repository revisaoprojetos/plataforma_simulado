'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, Library } from 'lucide-react'

/**
 * Banner do módulo com collapse ATRELADO AO SCROLL (scroll-linked): o título + botão Voltar + tabs ficam
 * SEMPRE; conforme você rola os primeiros ~140px, o banner encolhe e o SUBTÍTULO + breadcrumb somem — na
 * exata medida do scroll (sem relógio próprio), então parece "encaixado" e não descolado. Ao voltar ao
 * topo, reaparecem. É sticky no topo do <main>; overflow-anchor:none (no container da página) evita que
 * encolher mexa no scrollTop.
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
  const colapsavelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const banner = bannerRef.current
    const col = colapsavelRef.current
    const root = (banner?.closest('main') as HTMLElement | null) ?? null
    if (!banner || !col || !root) return

    const DIST = 140 // px de scroll p/ recolher por completo
    const EXP = 240  // altura expandida (15rem)
    const COMP = 96  // altura recolhida (6rem) — cabe título + tabs sem cortar
    const padTop = parseFloat(getComputedStyle(root).paddingTop) || 0 // p-6 do <main> (referência do sticky)
    let raf = 0
    let naturalH = 0

    const medir = () => {
      const prev = col.style.maxHeight
      col.style.maxHeight = 'none'
      naturalH = col.scrollHeight
      col.style.maxHeight = prev
    }
    const aplicar = () => {
      raf = 0
      const t = Math.min(1, Math.max(0, root.scrollTop / DIST)) // 0 (topo) → 1 (recolhido)
      const h = EXP - (EXP - COMP) * t
      banner.style.minHeight = `${h}px`
      col.style.maxHeight = `${naturalH * (1 - t)}px`
      col.style.opacity = String(Math.max(0, 1 - t * 1.4)) // some um pouco antes → degradê mais forte
      col.style.transform = `translateY(${-6 * t}px)`
      // Publica o RODAPÉ REAL do banner (medido, relativo ao topo do content-box do <main>) p/ a toolbar
      // "Adicionar aula" grudar EXATAMENTE embaixo dele em qualquer ponto do scroll — mesmo espaçamento no
      // topo e recolhido, sem sobrepor. Medir (getBoundingClientRect) evita depender de offset "mágico".
      const bottom = banner.getBoundingClientRect().bottom - root.getBoundingClientRect().top - padTop
      root.style.setProperty('--lp-banner-bottom', `${bottom}px`)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(aplicar) }
    const onResize = () => { medir(); aplicar() }

    medir()
    aplicar()
    root.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      root.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      root.style.removeProperty('--lp-banner-bottom')
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={bannerRef}
      className="sticky -top-6 z-30 -mx-6 -mt-6 flex flex-col overflow-hidden bg-neutral-950 [overflow-anchor:none]"
      style={{ minHeight: '15rem' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
      {/* Degradê principal (topo→base) + reforço na base p/ fundir a imagem nas tabs (corte macio). */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />

      <div className="relative flex flex-1 flex-col px-6 pt-4 text-white">
        {/* Linha do título — SEMPRE visível (título + Voltar + ação). */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Link href="/admin/leitura" aria-label="Voltar aos módulos" title="Voltar aos módulos" className="mt-1 inline-flex shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/15 p-2 text-white shadow-sm backdrop-blur transition-colors hover:bg-white/25">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight drop-shadow"><Library className="h-6 w-6 shrink-0" /> {titulo}</h1>
          </div>
          {topoDireita && <div className="flex flex-wrap items-center justify-end gap-3">{topoDireita}</div>}
        </div>

        {/* Subtítulo + breadcrumb — encolhem/somem atrelados ao scroll (max-height + opacidade + subida). */}
        <div ref={colapsavelRef} className="overflow-hidden" style={{ willChange: 'max-height, opacity, transform' }}>
          <p className="pt-1 text-white/80 drop-shadow-sm">{subtitulo}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-sm text-white/75">{breadcrumb}</div>
        </div>

        {/* Tabs — SEMPRE, rente à base. */}
        <div className="mt-auto pt-3">{tabs}</div>
      </div>
    </div>
  )
}
