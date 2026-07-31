'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type HeroBanner = { id: string; imagem_url: string | null; link: string | null; titulo?: string | null; mensagem?: string | null }

/**
 * Carrossel de banners de DESTAQUE no topo da home do aluno (tipo 'hero' em
 * simulado_banners, configurados no console). Auto-rotaciona; setas no hover e
 * bolinhas quando há mais de um. Proporção larga (16:5 ≈ 1920×600).
 */
export function HeroCarrossel({ banners }: { banners: HeroBanner[] }) {
  const slides = banners.filter((b) => b.imagem_url)
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
      {slides.map((b, idx) => {
        const img = (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={b.imagem_url!}
            alt={b.titulo ?? ''}
            className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out', idx === i ? 'opacity-100' : 'opacity-0')}
          />
        )
        return b.link ? (
          <Link key={b.id} href={b.link} aria-label={b.titulo ?? 'Abrir'} className={cn('absolute inset-0', idx === i ? 'z-10' : 'pointer-events-none z-0')}>{img}</Link>
        ) : (
          <div key={b.id} className="absolute inset-0">{img}</div>
        )
      })}

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
