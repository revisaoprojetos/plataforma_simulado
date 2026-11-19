'use client'
// Caixa de texto posicionável/redimensionável da folha livre (pointer events; funciona com dedo, caneta e mouse).
// Arrastar = alça superior; redimensionar = canto inferior direito. Texto simples (textarea).
import { useEffect, useRef, type PointerEvent as RPointerEvent } from 'react'
import { Trash2 } from 'lucide-react'
import type { CaixaFolha } from '@/lib/aluno/notebook-folha'

interface Props {
  caixa: CaixaFolha
  zoom: number
  selecionada: boolean
  /** ferramenta 'selecionar' ativa: caixas recebem toque. */
  interativa: boolean
  somenteLeitura: boolean
  autoFoco: boolean
  aoSelecionar: (id: string) => void
  aoInicioGesto: () => void
  aoFimGesto: () => void
  aoMover: (id: string, x: number, y: number) => void
  aoRedimensionar: (id: string, w: number, h: number) => void
  aoTexto: (id: string, texto: string) => void
  aoExcluir: (id: string) => void
}

const ALCA = 36

export function CaixaTextoFolha(p: Props) {
  const { caixa: c, zoom } = p
  const ta = useRef<HTMLTextAreaElement>(null)
  const gesto = useRef<{ id: number; px: number; py: number; x: number; y: number; w: number; h: number; tipo: 'mover' | 'redim' } | null>(null)

  useEffect(() => { if (p.autoFoco) ta.current?.focus() }, [p.autoFoco])

  const iniciar = (e: RPointerEvent<HTMLElement>, tipo: 'mover' | 'redim') => {
    if (p.somenteLeitura) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    p.aoSelecionar(c.id)
    p.aoInicioGesto()
    gesto.current = { id: e.pointerId, px: e.clientX, py: e.clientY, x: c.x, y: c.y, w: c.w, h: c.h, tipo }
  }
  const mover = (e: RPointerEvent<HTMLElement>) => {
    const g = gesto.current
    if (!g || g.id !== e.pointerId) return
    const dx = (e.clientX - g.px) / zoom, dy = (e.clientY - g.py) / zoom
    if (g.tipo === 'mover') p.aoMover(c.id, g.x + dx, g.y + dy)
    else p.aoRedimensionar(c.id, g.w + dx, g.h + dy)
  }
  const fim = (e: RPointerEvent<HTMLElement>) => {
    const g = gesto.current
    if (!g || g.id !== e.pointerId) return
    gesto.current = null
    p.aoFimGesto()
  }

  const sel = p.selecionada && p.interativa

  return (
    <div
      role="group"
      aria-label="Caixa de texto"
      tabIndex={p.interativa ? 0 : -1}
      onPointerDown={() => {
        if (!p.interativa) return
        const jaSel = p.selecionada
        p.aoSelecionar(c.id)
        if (!jaSel && !p.somenteLeitura) requestAnimationFrame(() => ta.current?.focus())
      }}
      onKeyDown={(e) => {
        if (p.somenteLeitura || e.target !== e.currentTarget) return
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); p.aoExcluir(c.id) }
        const passo = e.shiftKey ? 40 : 10
        const d: Record<string, [number, number]> = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }
        const m = d[e.key]
        if (m) { e.preventDefault(); p.aoInicioGesto(); p.aoMover(c.id, c.x + m[0], c.y + m[1]); p.aoFimGesto() }
      }}
      style={{
        position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h, zIndex: c.z,
        pointerEvents: p.interativa ? 'auto' : 'none',
        border: sel ? '2px solid var(--brand-primary)' : '1px dashed var(--border)',
        borderRadius: 8, background: 'color-mix(in oklab, var(--card) 88%, transparent)', color: 'var(--foreground)',
        boxSizing: 'border-box', display: 'flex', flexDirection: 'column', outline: 'none',
      }}
    >
      {sel && !p.somenteLeitura && (
        <div style={{ display: 'flex', alignItems: 'center', height: 40, flex: '0 0 auto', background: 'var(--brand-primary)', color: 'var(--brand-foreground, var(--primary-foreground))', borderRadius: '6px 6px 0 0' }}>
          <div
            aria-label="Arrastar caixa"
            title="Arrastar"
            onPointerDown={(e) => iniciar(e, 'mover')}
            onPointerMove={mover}
            onPointerUp={fim}
            onPointerCancel={fim}
            style={{ flex: 1, height: '100%', cursor: 'grab', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, letterSpacing: 2, userSelect: 'none' }}
          >
            <span aria-hidden>⋮⋮⋮</span>
          </div>
          <button
            type="button"
            aria-label="Excluir caixa"
            title="Excluir caixa"
            onClick={() => p.aoExcluir(c.id)}
            style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer' }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      )}
      <textarea
        ref={ta}
        aria-label="Texto da caixa"
        value={c.texto ?? ''}
        readOnly={p.somenteLeitura || !sel}
        tabIndex={sel ? 0 : -1}
        placeholder="Digite aqui…"
        onFocus={p.aoInicioGesto}
        onBlur={p.aoFimGesto}
        onChange={(e) => p.aoTexto(c.id, e.target.value)}
        style={{
          flex: 1, minHeight: 0, width: '100%', resize: 'none', border: 0, outline: 'none', background: 'transparent', color: 'inherit',
          padding: 8, font: 'inherit', fontSize: 16, lineHeight: 1.4, pointerEvents: sel ? 'auto' : 'none',
        }}
      />
      {sel && !p.somenteLeitura && (
        <div
          aria-label="Redimensionar caixa"
          title="Redimensionar"
          onPointerDown={(e) => iniciar(e, 'redim')}
          onPointerMove={mover}
          onPointerUp={fim}
          onPointerCancel={fim}
          style={{
            position: 'absolute', right: -2, bottom: -2, width: ALCA, height: ALCA, cursor: 'nwse-resize', touchAction: 'none',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
          }}
        >
          <span aria-hidden style={{ width: 14, height: 14, borderRight: '3px solid var(--brand-primary)', borderBottom: '3px solid var(--brand-primary)', borderRadius: 2, margin: 4 }} />
        </div>
      )}
    </div>
  )
}
