'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, Library, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_TRILHA_DEGRADE, type TrilhaDegrade } from '@/lib/leitura/trilha-aparencia'

/**
 * Banner do módulo com collapse ATRELADO AO SCROLL (scroll-linked): o título + botão Voltar + tabs ficam
 * SEMPRE; conforme você rola os primeiros ~140px, o banner encolhe e o SUBTÍTULO + breadcrumb somem — na
 * exata medida do scroll (sem relógio próprio), então parece "encaixado" e não descolado. Ao voltar ao
 * topo, reaparecem. É sticky no topo do <main>; overflow-anchor:none (no container da página) evita que
 * encolher mexa no scrollTop.
 *
 * Reutilizável: `banner` pode ser null (cai no degradê de `cor`); `voltarHref`/`voltarLabel`/`icone`
 * configuram o cabeçalho; `tituloBadges` adiciona selos ao lado do título (sempre visíveis).
 */
export function ModuloBanner({ banner, cor, titulo, subtitulo, topoDireita, breadcrumb, tabs, voltarHref = '/admin/leitura', voltarLabel = 'Voltar aos módulos', icone: Icone = Library, tituloBadges, degrade, spacerEscuro = false, className }: {
  banner: string | null
  cor?: string | null
  titulo: string
  subtitulo?: string
  topoDireita?: ReactNode
  breadcrumb: ReactNode
  tabs: ReactNode
  voltarHref?: string
  voltarLabel?: string
  icone?: LucideIcon | null
  tituloBadges?: ReactNode
  /** Degradê escuro sobre o banner (liga/desliga + intensidade). */
  degrade?: TrilhaDegrade
  /** Spacer com fundo escuro (mesma cor do banner) — evita "faixa branca" quando o conteúdo abaixo é
   * uma imagem full-bleed escura (ex.: trilha personalizada do aluno) durante o recolher/expandir. */
  spacerEscuro?: boolean
  /** Override do "bleed" (margens negativas/sticky) p/ casar com o padding do <main> do contexto
   * (admin = p-6; aluno = p-4 md:p-6). Default segue o admin. */
  className?: string
}) {
  const bannerRef = useRef<HTMLDivElement>(null)
  const colapsavelRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const banner = bannerRef.current
    const col = colapsavelRef.current
    const spacerEl = spacerRef.current
    const root = (banner?.closest('main') as HTMLElement | null) ?? null
    if (!banner || !col || !spacerEl || !root) return

    const DIST = 140 // px de scroll p/ recolher por completo (≤ EXP-COMP p/ o conteúdo nunca ser tampado)
    const EXP = 240  // altura expandida (15rem)
    const COMP = 96  // altura recolhida (6rem) — cabe título + tabs sem cortar
    const padTop = parseFloat(getComputedStyle(root).paddingTop) || 0 // p-6 do <main> (referência do sticky)
    const padBottom0 = parseFloat(getComputedStyle(root).paddingBottom) || 0
    let raf = 0
    let naturalH = 0
    let rootTop = 0 // topo do <main> na viewport (constante durante o scroll) — cacheado p/ não ler no frame

    const medir = () => {
      rootTop = root.getBoundingClientRect().top
      const prev = col.style.maxHeight
      col.style.maxHeight = 'none'
      naturalH = col.scrollHeight
      col.style.maxHeight = prev
      // Garante rolagem suficiente p/ recolher por completo (DIST) mesmo em página curta. O espaço extra
      // vai no FIM (padding-bottom do <main>), longe do topo, então não tampa nada. Como o fluxo é constante
      // (banner + spacer = EXP sempre), medir com banner=EXP/spacer=0 dá o mesmo scrollHeight de uso.
      banner.style.minHeight = `${EXP}px`; spacerEl.style.height = '0px'
      root.style.paddingBottom = `${padBottom0}px`
      const maxScroll = root.scrollHeight - root.clientHeight
      root.style.paddingBottom = `${padBottom0 + Math.max(0, DIST + 8 - maxScroll)}px`
    }
    const aplicar = () => {
      raf = 0
      // LEITURA primeiro (usa o layout já pintado do frame anterior) → NÃO força reflow no meio do frame.
      // O `bottom` (p/ a toolbar do LegProc) fica 1 frame atrás, imperceptível. Depois só ESCRITAS.
      const bottom = banner.getBoundingClientRect().bottom - rootTop - padTop
      const t = Math.min(1, Math.max(0, root.scrollTop / DIST)) // 0 (topo) → 1 (recolhido)
      root.style.setProperty('--lp-banner-bottom', `${bottom}px`)
      banner.style.minHeight = `${EXP - (EXP - COMP) * t}px`
      // Spacer logo após o banner CRESCE na mesma medida que o banner encolhe → o topo do conteúdo fica
      // SEMPRE reservado em EXP (não sobe por baixo do banner) e o fluxo não muda de tamanho (sem flicker).
      spacerEl.style.height = `${(EXP - COMP) * t}px`
      col.style.maxHeight = `${naturalH * (1 - t)}px`
      col.style.opacity = String(Math.max(0, 1 - t * 1.4)) // some um pouco antes → degradê mais forte
      col.style.transform = `translateY(${-6 * t}px)`
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
      root.style.paddingBottom = ''
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <>
    <div
      ref={bannerRef}
      className={cn('sticky -top-6 z-30 -mx-6 -mt-6 flex flex-col overflow-hidden bg-neutral-950 [overflow-anchor:none]', className)}
      style={{ minHeight: '15rem' }}
    >
      {/* Fundo: imagem do banner alocado OU degradê da cor da marca (quando não há banner). */}
      {banner
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover object-[center_86%]" />
        : <div className="absolute inset-0" style={cor ? { background: `linear-gradient(140deg, ${cor} 0%, #0a0a0a 130%)` } : undefined} />}
      {/* Degradê GERAL controlado (liga/desliga + intensidade) — some mais claro que antes. */}
      {(() => { const d = degrade ?? DEFAULT_TRILHA_DEGRADE; const k = d.ativo ? d.intensidade / 100 : 0; return (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #000 0%, rgba(0,0,0,0.42) 55%, rgba(0,0,0,0.28) 100%)', opacity: k }} />
      ) })()}
      {/* Scrims de borda LEVES sempre ativos (garantem legibilidade do título/tabs mesmo com degradê off). */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />

      {/* Título + subtítulo no TOPO; tabs rente à base (mt-auto). Ao recolher, a imagem mostra a parte de
          baixo (object-position) e o subtítulo colapsa. */}
      <div className="relative flex flex-1 flex-col px-6 pt-4 text-white">
        {/* Linha do título — SEMPRE visível (título + Voltar + ação). */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Link href={voltarHref} aria-label={voltarLabel} title={voltarLabel} className="mt-1 inline-flex shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/15 p-2 text-white shadow-sm backdrop-blur transition-colors hover:bg-white/25">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {Icone ? <Icone className="h-6 w-6 shrink-0 drop-shadow" /> : null}
              <h1 className="text-2xl font-bold tracking-tight drop-shadow">{titulo}</h1>
              {tituloBadges}
            </div>
          </div>
          {topoDireita && <div className="flex flex-wrap items-center justify-end gap-2">{topoDireita}</div>}
        </div>

        {/* Subtítulo + breadcrumb — encolhem/somem atrelados ao scroll (max-height + opacidade + subida). */}
        <div ref={colapsavelRef} className="overflow-hidden" style={{ willChange: 'max-height, opacity, transform' }}>
          {subtitulo ? <p className="pt-1 text-white/80 drop-shadow-sm">{subtitulo}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-sm text-white/75">{breadcrumb}</div>
        </div>

        {/* Tabs — SEMPRE, rente à base. */}
        <div className="mt-auto pt-3">{tabs}</div>
      </div>
    </div>
    {/* Spacer que reserva no fluxo a altura que o banner perde ao recolher → conteúdo do topo nunca é
        tampado e o fluxo fica constante (sem flicker). Altura controlada via JS (aplicar). */}
    <div ref={spacerRef} aria-hidden className={cn('shrink-0 [overflow-anchor:none]', spacerEscuro && '-mx-4 bg-neutral-950 md:-mx-6')} />
    </>
  )
}
