'use client'

import { useRef, useState, useEffect } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Star, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Ferramenta = 'selecionar' | 'destaque' | 'ponto' | 'icone' | 'bolinha' | 'texto'

export interface Marca {
  id: string
  arquivo_id?: string | null
  competencia_id?: string | null
  tipo: string
  x: number; y: number
  largura?: number | null; altura?: number | null
  cor?: string | null
  icone?: string | null
  numero?: number | null
  conteudo?: string | null
}

export const ICONES: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  check: CheckCircle2, x: XCircle, alerta: AlertTriangle, estrela: Star,
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Marca renderizada sobre a folha (coords 0–1 → %). */
function MarcaView({ m, selecionada, clicavel, movivel, onIniciarMover, onIniciarResize }: {
  m: Marca; selecionada: boolean; clicavel: boolean; movivel: boolean
  onIniciarMover: (e: React.PointerEvent, m: Marca) => void
  onIniciarResize: (e: React.PointerEvent, m: Marca) => void
}) {
  const cor = m.cor || '#e11d48'
  const onClick = (e: React.MouseEvent) => e.stopPropagation() // nunca cria "por baixo" da marca
  const onDown = (e: React.PointerEvent) => onIniciarMover(e, m)
  const cursor = movivel ? 'cursor-move' : clicavel ? 'cursor-pointer' : undefined

  if (m.tipo === 'destaque') {
    return (
      <div id={`marca-${m.id}`} onClick={onClick} onPointerDown={onDown}
        className={cn('absolute rounded-sm', cursor, selecionada && 'ring-2 ring-foreground ring-offset-1')}
        style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${(m.largura ?? 0) * 100}%`, height: `${(m.altura ?? 0) * 100}%`, background: `${cor}33`, border: `2px solid ${cor}`, mixBlendMode: 'multiply' }}>
        {selecionada && movivel && (
          <div onPointerDown={(e) => onIniciarResize(e, m)} className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border-2 border-white bg-foreground" style={{ mixBlendMode: 'normal' }} />
        )}
      </div>
    )
  }
  if (m.tipo === 'texto') {
    return (
      <div id={`marca-${m.id}`} onClick={onClick} onPointerDown={onDown}
        className={cn('absolute max-w-[45%] -translate-y-1/2 truncate rounded-md border bg-white px-1.5 py-0.5 text-[11px] font-medium shadow-sm', cursor, selecionada && 'ring-2 ring-foreground')}
        style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, color: cor, borderColor: cor }}>
        {m.conteudo?.trim() || 'nota…'}
      </div>
    )
  }
  const Icon = m.tipo === 'icone' ? (ICONES[m.icone || 'check'] ?? CheckCircle2) : null
  return (
    <div id={`marca-${m.id}`} onClick={onClick} onPointerDown={onDown}
      className={cn('absolute -translate-x-1/2 -translate-y-1/2', cursor)}
      style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>
      {m.tipo === 'ponto' && <span className={cn('block h-3.5 w-3.5 rounded-full border-2 border-white shadow', selecionada && 'ring-2 ring-foreground')} style={{ background: cor }} />}
      {m.tipo === 'icone' && Icon && <span className={cn('flex h-6 w-6 items-center justify-center rounded-full bg-white shadow', selecionada && 'ring-2 ring-foreground')}><Icon className="h-5 w-5" style={{ color: cor }} /></span>}
      {m.tipo === 'bolinha' && <span className={cn('flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow', selecionada && 'ring-2 ring-foreground')} style={{ background: cor }}>{m.numero ?? '•'}</span>}
    </div>
  )
}

/**
 * Folha do aluno (uma página por vez) com camada de anotações.
 * - Ferramentas: selecionar / destaque (arrasta) / ponto / ícone / bolinha (clica).
 * - Selecionar: arrasta a marca p/ MOVER; destaque selecionado tem alça p/ REDIMENSIONAR.
 * - Coordenadas 0–1 (imunes a zoom/DPI). Zoom via largura % + scroll; foco dá scrollIntoView.
 */
export function CorrecaoFolha({
  paginas, marcas, paginaIndex, onPagina, ferramenta, corAtiva, iconeAtivo,
  selecionadaId, onSelecionar, onCriar, onAtualizar, focoId, focoKey = 0,
}: {
  paginas: { arquivoId: string; url: string }[]
  marcas: Marca[]
  paginaIndex: number
  onPagina: (i: number) => void
  ferramenta: Ferramenta
  corAtiva: string
  iconeAtivo: string
  selecionadaId: string | null
  onSelecionar: (id: string | null) => void
  onCriar: (m: Omit<Marca, 'id'>) => void
  onAtualizar: (id: string, patch: Partial<Marca>) => void
  focoId: string | null
  focoKey?: number
}) {
  const [zoom, setZoom] = useState(1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [draw, setDraw] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [drag, setDrag] = useState<{ id: string; modo: 'mover' | 'resize'; dx: number; dy: number; base: Marca } | null>(null)
  const [live, setLive] = useState<Partial<Marca> | null>(null)
  const ignorarClique = useRef(false)

  const pagina = paginas[paginaIndex]
  const arquivoAtual = pagina?.arquivoId
  const marcasPagina = marcas.filter((m) => (m.arquivo_id ?? paginas[0]?.arquivoId) === arquivoAtual)

  useEffect(() => {
    if (!focoId) return
    const el = document.getElementById(`marca-${focoId}`)
    if (el) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }, [focoId, focoKey, zoom, paginaIndex])

  function pos(e: React.PointerEvent | React.MouseEvent) {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }
  }

  function iniciarMover(e: React.PointerEvent, m: Marca) {
    e.stopPropagation()
    if (ferramenta !== 'selecionar') return
    onSelecionar(m.id)
    // A captura de ponteiro redireciona o clique seguinte p/ o wrap; ignora-o (senão desmarcaria).
    ignorarClique.current = true
    const { x, y } = pos(e)
    setDrag({ id: m.id, modo: 'mover', dx: x - m.x, dy: y - m.y, base: m })
    wrapRef.current?.setPointerCapture?.(e.pointerId)
  }
  function iniciarResize(e: React.PointerEvent, m: Marca) {
    e.stopPropagation()
    ignorarClique.current = true
    setDrag({ id: m.id, modo: 'resize', dx: 0, dy: 0, base: m })
    wrapRef.current?.setPointerCapture?.(e.pointerId)
  }

  function onClickWrap(e: React.MouseEvent) {
    if (ignorarClique.current) { ignorarClique.current = false; return }
    if (ferramenta === 'selecionar') { onSelecionar(null); return }
    if (ferramenta === 'destaque') return
    const { x, y } = pos(e)
    const base = { arquivo_id: arquivoAtual, cor: corAtiva, x, y }
    if (ferramenta === 'ponto') onCriar({ ...base, tipo: 'ponto' })
    else if (ferramenta === 'icone') onCriar({ ...base, tipo: 'icone', icone: iconeAtivo })
    else if (ferramenta === 'texto') onCriar({ ...base, tipo: 'texto', conteudo: '' })
    else if (ferramenta === 'bolinha') {
      const prox = marcas.filter((m) => m.tipo === 'bolinha').reduce((mx, m) => Math.max(mx, m.numero ?? 0), 0) + 1
      onCriar({ ...base, tipo: 'bolinha', numero: prox })
    }
  }
  function onDown(e: React.PointerEvent) {
    if (ferramenta !== 'destaque') return
    const { x, y } = pos(e); setDraw({ x0: x, y0: y, x1: x, y1: y })
    wrapRef.current?.setPointerCapture?.(e.pointerId)
  }
  function onMove(e: React.PointerEvent) {
    if (draw) { const { x, y } = pos(e); setDraw((d) => (d ? { ...d, x1: x, y1: y } : d)); return }
    if (drag) {
      const { x, y } = pos(e)
      if (drag.modo === 'mover') {
        let nx = clamp01(x - drag.dx), ny = clamp01(y - drag.dy)
        if (drag.base.tipo === 'destaque') { nx = Math.min(nx, 1 - (drag.base.largura ?? 0)); ny = Math.min(ny, 1 - (drag.base.altura ?? 0)) }
        setLive({ x: nx, y: ny })
      } else {
        const w = Math.max(0.02, Math.min(1 - drag.base.x, x - drag.base.x))
        const h = Math.max(0.02, Math.min(1 - drag.base.y, y - drag.base.y))
        setLive({ largura: w, altura: h })
      }
    }
  }
  function onUp() {
    if (draw) {
      const x = Math.min(draw.x0, draw.x1), y = Math.min(draw.y0, draw.y1)
      const largura = Math.abs(draw.x1 - draw.x0), altura = Math.abs(draw.y1 - draw.y0)
      setDraw(null)
      if (largura > 0.01 && altura > 0.01) onCriar({ arquivo_id: arquivoAtual, cor: corAtiva, tipo: 'destaque', x, y, largura, altura })
      return
    }
    if (drag) {
      if (live) { onAtualizar(drag.id, live); ignorarClique.current = true }
      setDrag(null); setLive(null)
    }
  }

  const btn = 'flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {paginas.map((_, i) => (
            <button key={i} type="button" onClick={() => onPagina(i)}
              className={cn('rounded-md px-2.5 py-1 text-xs font-medium', i === paginaIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
              Página {i + 1}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={btn} onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))} disabled={zoom <= 1} aria-label="Menos zoom"><ZoomOut className="h-4 w-4" /></button>
          <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <button type="button" className={btn} onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} disabled={zoom >= 4} aria-label="Mais zoom"><ZoomIn className="h-4 w-4" /></button>
          <button type="button" className={btn} onClick={() => setZoom(1)} aria-label="Ajustar"><Maximize2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="relative max-h-[68vh] overflow-auto rounded-lg border bg-muted/20">
        {pagina ? (
          <div style={{ width: `${zoom * 100}%` }}>
            <div ref={wrapRef} className="relative select-none" onClick={onClickWrap} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
              style={{ cursor: ferramenta === 'selecionar' ? 'default' : 'crosshair', touchAction: draw || drag ? 'none' : undefined }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pagina.url} alt={`Página ${paginaIndex + 1}`} className="block w-full" draggable={false} />
              {marcasPagina.map((m) => {
                const mm = drag?.id === m.id && live ? { ...m, ...live } : m
                return (
                  <MarcaView key={m.id} m={mm} selecionada={m.id === selecionadaId}
                    clicavel={ferramenta === 'selecionar'} movivel={ferramenta === 'selecionar'}
                    onIniciarMover={iniciarMover} onIniciarResize={iniciarResize} />
                )
              })}
              {draw && (
                <div className="pointer-events-none absolute border-2"
                  style={{ left: `${Math.min(draw.x0, draw.x1) * 100}%`, top: `${Math.min(draw.y0, draw.y1) * 100}%`, width: `${Math.abs(draw.x1 - draw.x0) * 100}%`, height: `${Math.abs(draw.y1 - draw.y0) * 100}%`, borderColor: corAtiva, background: `${corAtiva}22` }} />
              )}
            </div>
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma foto enviada pelo aluno.</div>
        )}
      </div>
    </div>
  )
}
