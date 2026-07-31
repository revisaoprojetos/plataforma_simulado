'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X, Megaphone, ChevronLeft, ChevronRight, Play, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export type BannerPortal = {
  id: string; tipo: 'banner' | 'popup' | 'hero'; titulo: string | null; mensagem: string | null
  imagem_url: string | null; link: string | null; cor: string | null
}

/** Slide de um simulado em destaque, renderizado COMO banner (fundo do próprio simulado). */
export type HeroSimSlide = {
  id: string
  kind: 'sim'
  capa: string | null
  cor: string
  titulo: string
  quando: string | null
  link: string | null
  acao: string
  chip?: string | null // ex.: "5 simulados" quando o banner aponta para uma pasta
}

type Slide = ({ kind: 'img' } & BannerPortal) | HeroSimSlide

/**
 * Área de banners do topo da home do aluno. Um ÚNICO carrossel (estilo propaganda/Netflix,
 * um por vez) que reúne: banners de imagem (tipo 'banner'/'hero') E simulados em destaque
 * (fundo do próprio simulado + CTA). Também exibe o pop-up (modal 1x por navegador).
 */
export function BannersPortal({ banners, simulados = [] }: { banners: BannerPortal[]; simulados?: HeroSimSlide[] }) {
  const [popup, setPopup] = useState<BannerPortal | null>(null)

  useEffect(() => {
    const pop = banners.find((b) => b.tipo === 'popup' && !localStorage.getItem('popup-visto-' + b.id))
    if (pop) setPopup(pop)
  }, [banners])

  function fecharPopup() {
    if (popup) localStorage.setItem('popup-visto-' + popup.id, '1')
    setPopup(null)
  }

  // Um carrossel só: banners de imagem (banner/destaque) + simulados em destaque.
  const slides: Slide[] = [
    ...banners.filter((b) => b.tipo === 'banner' || b.tipo === 'hero').map((b) => ({ kind: 'img' as const, ...b })),
    ...simulados,
  ]

  return (
    <>
      {slides.length > 0 && (
        // FULL-BLEED: cancela o padding do <main> (p-6) → ocupa até as laterais e cola no topo.
        <div className="-mx-6 -mt-6 mb-5">
          <Carrossel slides={slides} />
        </div>
      )}

      {popup && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={fecharPopup}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            {popup.imagem_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={popup.imagem_url} alt="" className="max-h-56 w-full object-cover" />
            )}
            <div className="space-y-3 p-5">
              <div className="flex items-start gap-2">
                <span className="h-1 w-10 rounded-full" style={{ background: popup.cor ?? '#6366f1' }} />
                <button type="button" onClick={fecharPopup} className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              {popup.titulo && <h3 className="text-lg font-bold tracking-tight">{popup.titulo}</h3>}
              {popup.mensagem && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{popup.mensagem}</p>}
              <div className="flex justify-end gap-2 pt-1">
                {popup.link && <Link href={popup.link} onClick={fecharPopup} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">Ver mais</Link>}
                <button type="button" onClick={fecharPopup} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Fechar</button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Carrossel único (um slide por vez), auto-rotativo, molde 1920×500. Slides = imagem ou simulado. */
function Carrossel({ slides }: { slides: Slide[] }) {
  const n = slides.length
  const [i, setI] = useState(0)
  const ir = (idx: number) => setI(((idx % n) + n) % n)

  useEffect(() => {
    if (n <= 1) return
    const t = setInterval(() => setI((p) => (p + 1) % n), 6000)
    return () => clearInterval(t)
  }, [n])

  return (
    <div className="group relative aspect-[1920/500] w-full overflow-hidden">
      {slides.map((s, idx) => (
        <div key={s.id} className={cn('absolute inset-0 transition-opacity duration-700 ease-out', idx === i ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0')}>
          {s.kind === 'sim' ? <SimSlide s={s} /> : <ImgSlide b={s} />}
        </div>
      ))}

      {n > 1 && (
        <>
          <button type="button" onClick={() => ir(i - 1)} aria-label="Anterior"
            className="absolute left-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur transition hover:bg-black/55 group-hover:opacity-100">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => ir(i + 1)} aria-label="Próximo"
            className="absolute right-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur transition hover:bg-black/55 group-hover:opacity-100">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-1.5">
            {slides.map((s, idx) => (
              <button key={s.id} type="button" onClick={() => ir(idx)} aria-label={`Ir para ${idx + 1}`}
                className={cn('h-1.5 rounded-full bg-white/60 transition-all', idx === i ? 'w-6 bg-white' : 'w-1.5 hover:bg-white/80')} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Banner de imagem (ou faixa colorida com texto quando não há imagem). */
function ImgSlide({ b }: { b: BannerPortal }) {
  const cor = b.cor ?? '#6366f1'
  const conteudo = b.imagem_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.imagem_url} alt={b.titulo ?? ''} className="absolute inset-0 h-full w-full object-cover" />
  ) : (
    <div className="absolute inset-0 flex items-center gap-3 p-4" style={{ background: cor + '14' }}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: cor + '22', color: cor }}><Megaphone className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        {b.titulo && <p className="text-sm font-semibold">{b.titulo}</p>}
        {b.mensagem && <p className="text-xs text-muted-foreground">{b.mensagem}</p>}
      </div>
    </div>
  )
  return b.link ? <Link href={b.link} aria-label={b.titulo ?? 'Abrir'} className="absolute inset-0">{conteudo}</Link> : <>{conteudo}</>
}

/** Simulado em destaque como banner: capa/cor de fundo + overlay com título e CTA. */
function SimSlide({ s }: { s: HeroSimSlide }) {
  const body = (
    <>
      {s.capa
        ? <img src={s.capa} alt="" className="absolute inset-0 h-full w-full object-cover" /> // eslint-disable-line @next/next/no-img-element
        : <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${s.cor} 0%, #1a1030 75%, #0f0a1e 120%)` }} />}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(10,7,20,0.92) 2%, rgba(10,7,20,0.66) 38%, rgba(10,7,20,0.12) 74%, rgba(10,7,20,0.5) 100%)' }} />
      <div className="relative flex h-full max-w-2xl flex-col justify-center p-6 sm:p-9 md:p-11">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 10px 1px rgba(52,211,153,.7)' }} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] sm:text-[11px]" style={{ color: 'var(--brand-accent)' }}>Em destaque para você</span>
        </div>
        <h2 className="text-2xl font-extrabold leading-[1.04] tracking-tight text-white drop-shadow-sm sm:text-4xl">{s.titulo}</h2>
        {s.quando && <p className="mt-1.5 line-clamp-1 max-w-lg text-xs text-white/70 sm:text-sm">{s.quando}.</p>}
        {s.chip && (
          <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
            <BookOpen className="h-3.5 w-3.5" /> {s.chip}
          </span>
        )}
        {s.link && (
          <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold shadow-lg ring-1 ring-white/15 transition-transform group-hover:scale-[1.02]"
            style={{ background: `linear-gradient(135deg, ${s.cor}, color-mix(in oklab, ${s.cor} 62%, #f5e6b8))`, color: '#1b1036' }}>
            <Play className="h-4 w-4 fill-current" /> {s.acao}
          </span>
        )}
      </div>
    </>
  )
  return s.link
    ? <Link href={s.link} aria-label={s.acao} className="absolute inset-0">{body}</Link>
    : <div className="absolute inset-0">{body}</div>
}
