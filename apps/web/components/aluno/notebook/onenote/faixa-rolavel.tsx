'use client'
// Faixa rolável na horizontal com indicadores: fade nas bordas com conteúdo escondido, setas (alvo >=40px) que rolam um bloco
// e dica única de rolagem (~24px) em toque. Estado das bordas via scroll + ResizeObserver (não recalcula no render).
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const CHAVE_DICA = 'onenote:dica-rolagem'

export function FaixaRolavel({ children, role, ariaLabel, className, style, wrapStyle, fundo = 'var(--surface)', chave, dica = false, onScroll, barra = false }: {
  children: React.ReactNode; role?: string; ariaLabel?: string; className?: string
  style?: React.CSSProperties; wrapStyle?: React.CSSProperties
  /** token de cor do fundo sob o fade */
  fundo?: string
  /** muda quando o conteúdo é trocado (reobserva os filhos) */
  chave?: string
  /** dica de rolagem uma vez por sessão, só em toque */
  dica?: boolean
  onScroll?: () => void
  /** barra de rolagem fina visível (só com estouro), roda do mouse e arrastar no vazio */
  barra?: boolean
}) {
  const el = useRef<HTMLDivElement>(null)
  const [b, setB] = useState({ esq: false, dir: false })

  const medir = useCallback(() => {
    const e = el.current; if (!e) return
    const esq = e.scrollLeft > 2, dir = e.scrollLeft + e.clientWidth < e.scrollWidth - 2
    setB((a) => (a.esq === esq && a.dir === dir ? a : { esq, dir }))
  }, [])

  useEffect(() => {
    const e = el.current; if (!e) return
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(e); Array.from(e.children).forEach((c) => ro.observe(c))
    return () => ro.disconnect()
  }, [medir, chave])

  useEffect(() => {
    if (!dica) return
    const e = el.current; if (!e) return
    let t = 0
    try {
      if (sessionStorage.getItem(CHAVE_DICA)) return
      if (!window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      t = window.setTimeout(() => {
        if (e.scrollWidth <= e.clientWidth + 2) return
        sessionStorage.setItem(CHAVE_DICA, '1')
        e.scrollTo({ left: 24, behavior: 'smooth' })
        window.setTimeout(() => e.scrollTo({ left: 0, behavior: 'smooth' }), 650)
      }, 350)
    } catch { /* sem storage */ }
    return () => window.clearTimeout(t)
  }, [dica])

  useEffect(() => {
    if (!barra) return
    const e = el.current; if (!e) return
    const roda = (ev: WheelEvent) => {
      if (e.scrollWidth <= e.clientWidth + 2) return
      const d = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY
      if (!d) return
      ev.preventDefault(); e.scrollLeft += d
    }
    e.addEventListener('wheel', roda, { passive: false })
    return () => e.removeEventListener('wheel', roda)
  }, [barra, chave])

  const arrasto = useRef<{ x: number; l: number } | null>(null)
  const baixo = (ev: React.PointerEvent<HTMLDivElement>) => {
    const e = el.current
    if (!barra || !e || ev.pointerType !== 'mouse' || ev.button !== 0 || e.scrollWidth <= e.clientWidth + 2) return
    if ((ev.target as HTMLElement).closest('button,input,select,[role=slider]')) return
    arrasto.current = { x: ev.clientX, l: e.scrollLeft }; e.setPointerCapture(ev.pointerId); e.style.cursor = 'grabbing'
  }
  const move = (ev: React.PointerEvent<HTMLDivElement>) => { const a = arrasto.current, e = el.current; if (a && e) e.scrollLeft = a.l - (ev.clientX - a.x) }
  const solta = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (!arrasto.current) return
    arrasto.current = null; const e = el.current; if (e) { e.style.cursor = ''; try { e.releasePointerCapture(ev.pointerId) } catch { /* já liberado */ } }
  }

  const rolar = (d: number) => el.current?.scrollBy({ left: d * Math.max(120, (el.current?.clientWidth ?? 0) * 0.7), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  const seta = (d: -1 | 1, on: boolean) => (
    <button type="button" aria-label={d < 0 ? 'Rolar para a esquerda' : 'Rolar para a direita'} aria-hidden={!on} tabIndex={on ? 0 : -1}
      onMouseDown={(e) => e.preventDefault()} onClick={() => rolar(d)} className="onenote-seta"
      style={{
        position: 'absolute', top: 0, bottom: barra ? 9 : 0, [d < 0 ? 'left' : 'right']: 0, width: 40, minHeight: 40, border: 0, outline: 'none', boxShadow: 'none', padding: 0, cursor: 'pointer', color: 'var(--muted)', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: d < 0 ? 'flex-start' : 'flex-end',
        background: `linear-gradient(to ${d < 0 ? 'right' : 'left'}, ${fundo} 55%, transparent)`,
        opacity: on ? 1 : 0, pointerEvents: on ? 'auto' : 'none', transition: 'opacity .15s ease',
      }}>
      <span className="onenote-seta-i" style={{ width: 32, height: 32, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 2px' }}>
        {d < 0 ? <ChevronLeft size={18} aria-hidden style={{ opacity: 0.75 }} /> : <ChevronRight size={18} aria-hidden style={{ opacity: 0.75 }} />}
      </span>
    </button>
  )
  return (
    <div style={{ position: 'relative', minWidth: 0, display: 'flex', ...wrapStyle }}>
      <div ref={el} role={role} aria-label={ariaLabel} className={`${barra ? 'onenote-barra' : 'onenote-noscroll'} ${className ?? ''}`} onScroll={() => { medir(); onScroll?.() }}
        onPointerDown={baixo} onPointerMove={move} onPointerUp={solta} onPointerCancel={solta}
        style={{ flex: 1, minWidth: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain', ...style }}>{children}</div>
      {seta(-1, b.esq)}
      {seta(1, b.dir)}
    </div>
  )
}
