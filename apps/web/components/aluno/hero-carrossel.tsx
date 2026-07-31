'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

export type HeroBanner = { id: string; imagem_url: string | null; link: string | null; titulo?: string | null; mensagem?: string | null }

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
}

type Slide = ({ kind: 'img' } & HeroBanner) | HeroSimSlide

/**
 * Carrossel de banners de DESTAQUE no topo da home do aluno. Mistura banners de imagem
 * (tipo 'hero' em simulado_banners) com simulados em destaque renderizados COMO banner
 * (fundo = capa/cor do próprio simulado + título e CTA). Auto-rotaciona; setas no hover e
 * bolinhas quando há mais de um. Proporção larga (16:5).
 */
export function HeroCarrossel({ banners, simulados = [] }: { banners: HeroBanner[]; simulados?: HeroSimSlide[] }) {
  const slides: Slide[] = [
    ...simulados,
    ...banners.filter((b) => b.imagem_url).map((b) => ({ kind: 'img' as const, ...b })),
  ]
  const n = slides.length
  const [i, setI] = useState(0)
  const ir = useCallback((idx: number) => setI(((idx % n) + n) % n), [n])

  useEffect(() => {
    if (n <= 1) return
    const t = setInterval(() => setI((p) => (p + 1) % n), 6000)
    return () => clearInterval(t)
  }, [n])

  if (n === 0) return null

  return (
    <div className="group relative aspect-[16/5] w-full overflow-hidden">
      {slides.map((b, idx) => (
        <div key={b.id} className={cn('absolute inset-0 transition-opacity duration-700 ease-out', idx === i ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0')}>
          {b.kind === 'sim' ? <SimSlide s={b} /> : (
            b.link ? (
              // eslint-disable-next-line @next/next/no-img-element
              <Link href={b.link} aria-label={b.titulo ?? 'Abrir'} className="absolute inset-0"><img src={b.imagem_url!} alt={b.titulo ?? ''} className="absolute inset-0 h-full w-full object-cover" /></Link>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.imagem_url!} alt={b.titulo ?? ''} className="absolute inset-0 h-full w-full object-cover" />
            )
          )}
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
            {slides.map((b, idx) => (
              <button key={b.id} type="button" onClick={() => ir(idx)} aria-label={`Ir para ${idx + 1}`}
                className={cn('h-1.5 rounded-full bg-white/60 transition-all', idx === i ? 'w-6 bg-white' : 'w-1.5 hover:bg-white/80')} />
            ))}
          </div>
        </>
      )}
    </div>
  )
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
