'use client'
// Modal do padrão Revisão (superfície roxa via tokens). Substitui window.prompt/confirm nas telas novas.
// Fecha com Esc e clique no fundo; foco vai para o painel ao abrir. Compatível com iframe (position: fixed no próprio frame).
import * as React from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/nova/icons'

export function NovaModal({ titulo, sub, onClose, children, w = 520 }: { titulo: React.ReactNode; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode; w?: number }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // Portal no <body>: o fundo escurecido cobre a TELA INTEIRA (um ancestral com transform/filter/overflow prendia o
  // position:fixed dentro do card). Só monta no cliente.
  // Os tokens (--surface, --ink, --brand…) são ESCOPADOS (.novaplat + style inline da marca) e não chegam ao <body>:
  // copiamos classe, data-theme e as custom properties inline dos ancestrais para o invólucro do portal.
  const ancora = React.useRef<HTMLSpanElement>(null)
  const [escopo, setEscopo] = React.useState<{ className: string; tema: string | null; vars: Record<string, string>; fonte: string } | null>(null)
  React.useEffect(() => {
    const a = ancora.current
    const raiz = a?.closest('.novaplat') as HTMLElement | null
    const vars: Record<string, string> = {}
    for (let el = a?.parentElement ?? null; el; el = el.parentElement) {
      for (let i = el.style.length - 1; i >= 0; i--) {
        const p = el.style.item(i)
        if (p.startsWith('--') && !(p in vars)) vars[p] = el.style.getPropertyValue(p)
      }
    }
    setEscopo({
      className: raiz?.className ?? 'novaplat',
      tema: raiz?.getAttribute('data-theme') ?? null,
      vars,
      fonte: a ? getComputedStyle(a.parentElement ?? a).fontFamily : '',
    })
  }, [])
  if (!escopo) return <span ref={ancora} hidden />
  return <>
    <span ref={ancora} hidden />
    {createPortal(
    <div className={escopo.className} {...(escopo.tema ? { 'data-theme': escopo.tema } : {})} style={{ ...(escopo.vars as React.CSSProperties), fontFamily: escopo.fonte || undefined, background: 'transparent', minHeight: 0, padding: 0 }}>
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', padding: '20px 16px', background: 'color-mix(in srgb,var(--pn-140c37,#140C37) 45%,transparent)', overflowY: 'auto' }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ margin: 'auto', width: '100%', maxWidth: w, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 22, boxShadow: '0 40px 80px -30px color-mix(in srgb,var(--pn-140c37,#140C37) 50%,transparent)', display: 'flex', flexDirection: 'column', gap: 16, outline: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <b style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{titulo}</b>
            {sub ? <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>{sub}</span> : null}
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <Icon n="x" size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
    </div>,
    document.body,
    )}
  </>
}
