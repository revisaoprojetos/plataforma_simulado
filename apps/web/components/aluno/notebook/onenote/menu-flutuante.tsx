'use client'
// Popover/menu flutuante (position: fixed, sem portal — mantém os tokens do .novaplat). Fecha ao clicar fora/Esc/rolar.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, type LucideIcon } from 'lucide-react'
import { FONTE_UI } from './tipos'

export type ItemMenu =
  | { separador: true }
  | { titulo: string }
  | { rotulo: string; icone?: LucideIcon; atalho?: string; onClick?: () => void; desabilitado?: boolean; perigo?: boolean; marcado?: boolean }

export function Popover({ x, y, onFechar, children, minWidth }: { x: number; y: number; onFechar: () => void; children: React.ReactNode; minWidth?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) })
  }, [x, y])
  useEffect(() => {
    const fora = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onFechar() }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onFechar() } }
    const rolar = (e: Event) => { if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return; onFechar() }
    document.addEventListener('pointerdown', fora, true)
    document.addEventListener('keydown', tecla, true)
    window.addEventListener('resize', onFechar)
    window.addEventListener('scroll', rolar, true)
    return () => {
      document.removeEventListener('pointerdown', fora, true); document.removeEventListener('keydown', tecla, true)
      window.removeEventListener('resize', onFechar); window.removeEventListener('scroll', rolar, true)
    }
  }, [onFechar])
  return (
    <div ref={ref} role="menu" style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 80, minWidth: minWidth ?? 180, maxWidth: 'calc(100vw - 8px)', maxHeight: 'min(70vh, calc(100dvh - 16px))', overflowY: 'auto',
      background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 6, padding: 4, fontFamily: FONTE_UI,
      boxShadow: '0 8px 28px -8px color-mix(in srgb, var(--ink) 45%, transparent)',
    }}>{children}</div>
  )
}

export function MenuFlutuante({ x, y, itens, onFechar, minWidth }: { x: number; y: number; itens: ItemMenu[]; onFechar: () => void; minWidth?: number }) {
  return (
    <Popover x={x} y={y} onFechar={onFechar} minWidth={minWidth}>
      {itens.map((it, i) => {
        if ('separador' in it) return <div key={i} role="separator" style={{ height: 1, background: 'var(--line)', margin: '4px 2px' }} />
        if ('titulo' in it) return <div key={i} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{it.titulo}</div>
        const I = it.icone
        return (
          <button key={i} type="button" role="menuitem" disabled={it.desabilitado} className="onenote-hover"
            onClick={() => { onFechar(); it.onClick?.() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 38, padding: '0 10px', border: 0, borderRadius: 4, background: 'transparent',
              color: it.perigo ? 'var(--danger)' : 'var(--ink)', fontSize: 13, fontFamily: 'inherit', textAlign: 'left', cursor: it.desabilitado ? 'default' : 'pointer', opacity: it.desabilitado ? 0.45 : 1,
            }}>
            <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center', color: 'var(--brand)' }}>{it.marcado ? <Check size={14} aria-hidden /> : I ? <I size={15} aria-hidden /> : null}</span>
            <span style={{ flex: 1 }}>{it.rotulo}</span>
            {it.atalho ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>{it.atalho}</span> : null}
          </button>
        )
      })}
    </Popover>
  )
}

/** Abre `itens` logo abaixo do elemento clicado. Uso: const { abrir, menu } = useMenuAncorado(); onClick={(e)=>abrir(e.currentTarget, itens)} ... {menu} */
export function useMenuAncorado() {
  const [aberto, setAberto] = useState<{ x: number; y: number; itens: ItemMenu[] } | null>(null)
  const fechar = useRef(() => setAberto(null)).current
  const abrir = (el: HTMLElement, itens: ItemMenu[]) => { const r = el.getBoundingClientRect(); setAberto({ x: r.left, y: r.bottom + 2, itens }) }
  const menu = aberto ? <MenuFlutuante x={aberto.x} y={aberto.y} itens={aberto.itens} onFechar={fechar} /> : null
  return { abrir, menu, fechar, aberto: !!aberto }
}
