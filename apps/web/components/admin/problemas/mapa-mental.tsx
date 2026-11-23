'use client'

// Aba "Mapa mental": nó central -> áreas -> problemas (SVG puro, sem dependência).
// Os DADOS vêm prontos do servidor; aqui só há apresentação (posicionamento das linhas visíveis, zoom/pan, recolher/expandir).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Image as ImageIcon, Maximize2, Minus, Plus, Download } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  AREAS, STATUS, ROTULO_AREA, ROTULO_STATUS,
  type Problema, type Area, type StatusProblema,
} from '@/lib/auditoria-problemas/tipos'
import { ProblemaPainel, type PermsProblemas } from './painel'

const SELECT = 'h-10 rounded-xl border bg-card px-3 text-[13.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'
const LINHA = 34, W_RAIZ = 170, H_RAIZ = 56, W_AREA = 250, H_AREA = 42, W_PROB = 330, H_PROB = 26, X_AREA = 250, X_PROB = 560, GAP_AREA = 16, PAD = 24

// Nós de problema coloridos pelo STATUS (cores semânticas); raiz/áreas usam os tokens da marca.
const NO_STATUS: Record<StatusProblema, string> = {
  aberto: 'fill-rose-500/15 stroke-rose-500',
  em_andamento: 'fill-amber-500/15 stroke-amber-500',
  resolvido: 'fill-emerald-500/15 stroke-emerald-500',
}
const PONTO_STATUS: Record<StatusProblema, string> = { aberto: 'bg-rose-500', em_andamento: 'bg-amber-500', resolvido: 'bg-emerald-500' }

const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

type NoProb = { p: Problema; y: number }
type NoArea = { area: Area; y: number; recolhida: boolean; total: number; filhos: NoProb[] }

export function MapaMental({ problemas, perms, podeExportar }: { problemas: Problema[]; perms: PermsProblemas; podeExportar: boolean }) {
  const [fArea, setFArea] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fPrazo, setFPrazo] = useState('')
  const [recolhidas, setRecolhidas] = useState<Set<Area>>(new Set())
  const [sel, setSel] = useState<Problema | null>(null)
  const [novo, setNovo] = useState<Area | null>(null)
  const [vista, setVista] = useState({ x: 20, y: 20, k: 1 })
  const caixa = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const arrasto = useRef<{ x: number; y: number; vx: number; vy: number; moveu: boolean } | null>(null)

  // Posiciona só o que está visível (layout vertical em árvore da esquerda p/ a direita).
  const { areas, altura, raizY } = useMemo(() => {
    const visiveis = problemas.filter((p) =>
      (!fStatus || p.status === fStatus) &&
      (!fPrazo || (fPrazo === 'atrasado' ? p.atrasado : fPrazo === 'com' ? !!p.prazo : !p.prazo)))
    const lista: NoArea[] = []
    let y = PAD
    for (const area of AREAS) {
      if (fArea && area !== fArea) continue
      const doArea = visiveis.filter((p) => p.area === area)
      // Área sem problemas visíveis só aparece quando não há filtro ativo (continua sendo um ponto de "novo problema").
      if (doArea.length === 0 && (fStatus || fPrazo)) continue
      const recolhida = recolhidas.has(area)
      const linhas = recolhida ? 1 : Math.max(1, doArea.length)
      const bloco = linhas * LINHA
      const filhos = recolhida ? [] : doArea.map((p, i) => ({ p, y: y + i * LINHA + LINHA / 2 }))
      lista.push({ area, y: y + bloco / 2, recolhida, total: doArea.length, filhos })
      y += bloco + GAP_AREA
    }
    const alt = Math.max(y + PAD - GAP_AREA, 120)
    const meio = lista.length ? (lista[0].y + lista[lista.length - 1].y) / 2 : alt / 2
    return { areas: lista, altura: alt, raizY: meio }
  }, [problemas, fArea, fStatus, fPrazo, recolhidas])

  const largura = X_PROB + W_PROB + PAD

  const ajustar = useCallback(() => {
    const w = caixa.current?.clientWidth ?? largura
    const h = caixa.current?.clientHeight ?? altura
    const k = Math.min(1, (w - 16) / largura, (h - 16) / altura)
    setVista({ x: 8, y: Math.max(8, (h - altura * k) / 2), k: Math.max(0.35, k) })
  }, [largura, altura])

  useEffect(() => { ajustar() }, [ajustar])

  // Zoom com a roda (listener não-passivo para impedir a rolagem da página).
  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const cx = e.clientX - r.left, cy = e.clientY - r.top
      setVista((v) => {
        const k = Math.min(2.5, Math.max(0.25, v.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
        const f = k / v.k
        return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBtn = (f: number) => setVista((v) => {
    const r = caixa.current?.getBoundingClientRect()
    const cx = (r?.width ?? 0) / 2, cy = (r?.height ?? 0) / 2
    const k = Math.min(2.5, Math.max(0.25, v.k * f))
    return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) }
  })

  function aoPressionar(e: React.PointerEvent) {
    arrasto.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y, moveu: false }
  }
  function aoMover(e: React.PointerEvent) {
    const a = arrasto.current
    if (!a) return
    const dx = e.clientX - a.x, dy = e.clientY - a.y
    if (Math.abs(dx) + Math.abs(dy) > 4) a.moveu = true
    if (a.moveu) setVista((v) => ({ ...v, x: a.vx + dx, y: a.vy + dy }))
  }
  const aoSoltar = () => { setTimeout(() => { arrasto.current = null }, 0) }
  const clique = (fn: () => void) => () => { if (!arrasto.current?.moveu) fn() }

  const alternar = (a: Area) => setRecolhidas((s) => { const n = new Set(s); n.has(a) ? n.delete(a) : n.add(a); return n })

  // ── Downloads da imagem (SVG/PNG): clona o conteúdo com os estilos resolvidos, sem o zoom/pan ──
  function montarSvg(): { xml: string; w: number; h: number } | null {
    const origem = svgRef.current?.querySelector('[data-conteudo]') as SVGGElement | null
    if (!origem) return null
    const clone = origem.cloneNode(true) as SVGGElement
    const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-weight', 'font-family', 'opacity']
    const o = [origem, ...Array.from(origem.querySelectorAll('*'))]
    const c = [clone, ...Array.from(clone.querySelectorAll('*'))]
    o.forEach((el, i) => {
      const cs = getComputedStyle(el)
      const alvo = c[i] as SVGElement
      alvo.setAttribute('style', props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'))
      alvo.removeAttribute('class')
    })
    const w = Math.ceil(largura), h = Math.ceil(altura)
    const fundo = getComputedStyle(document.body).backgroundColor
    const xml = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${fundo}"/>${new XMLSerializer().serializeToString(clone)}</svg>`
    return { xml, w, h }
  }
  function baixar(blob: Blob, nome: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = nome; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  function exportarSvg() {
    const s = montarSvg()
    if (!s) return
    baixar(new Blob([s.xml], { type: 'image/svg+xml;charset=utf-8' }), 'mapa-mental-problemas.svg')
  }
  function exportarPng() {
    const s = montarSvg()
    if (!s) return
    const img = new window.Image()
    img.onload = () => {
      const esc = 2
      const cv = document.createElement('canvas')
      cv.width = s.w * esc; cv.height = s.h * esc
      const ctx = cv.getContext('2d')
      if (!ctx) { toast.error('Não foi possível gerar a imagem.'); return }
      ctx.scale(esc, esc)
      ctx.drawImage(img, 0, 0)
      cv.toBlob((b) => { if (b) baixar(b, 'mapa-mental-problemas.png'); else toast.error('Não foi possível gerar a imagem.') }, 'image/png')
    }
    img.onerror = () => toast.error('Não foi possível gerar a imagem.')
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.xml)}`
  }

  const totalVisiveis = areas.reduce((n, a) => n + a.total, 0)
  const btn = 'inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-card text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Área" className={SELECT} value={fArea} onChange={(e) => setFArea(e.target.value)}>
          <option value="">Todas as áreas</option>{AREAS.map((a) => <option key={a} value={a}>{ROTULO_AREA[a]}</option>)}
        </select>
        <select aria-label="Status" className={SELECT} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Todos os status</option>{STATUS.map((a) => <option key={a} value={a}>{ROTULO_STATUS[a]}</option>)}
        </select>
        <select aria-label="Prazo" className={SELECT} value={fPrazo} onChange={(e) => setFPrazo(e.target.value)}>
          <option value="">Qualquer prazo</option><option value="atrasado">Atrasados</option><option value="com">Com prazo</option><option value="sem">Sem prazo</option>
        </select>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {STATUS.map((s) => <span key={s} className="inline-flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-full', PONTO_STATUS[s])} />{ROTULO_STATUS[s]}</span>)}
          <span>{totalVisiveis} problema(s) visível(is)</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className={btn} aria-label="Diminuir zoom" onClick={() => zoomBtn(1 / 1.2)}><Minus className="h-4 w-4" /></button>
          <button type="button" className={btn} aria-label="Aumentar zoom" onClick={() => zoomBtn(1.2)}><Plus className="h-4 w-4" /></button>
          <button type="button" className={btn} aria-label="Ajustar à tela" title="Ajustar à tela" onClick={ajustar}><Maximize2 className="h-4 w-4" /></button>
          {podeExportar && (
            <>
              <Button variant="outline" className="h-10 rounded-xl" onClick={exportarPng}><ImageIcon className="h-4 w-4" /> PNG</Button>
              <Button variant="outline" className="h-10 rounded-xl" onClick={exportarSvg}><Download className="h-4 w-4" /> SVG</Button>
            </>
          )}
        </div>
      </div>

      <div ref={caixa} className="relative h-[calc(100vh-22rem)] min-h-[420px] w-full touch-none overflow-hidden rounded-2xl border bg-card">
        <svg
          ref={svgRef} className="h-full w-full cursor-grab select-none active:cursor-grabbing" role="img" aria-label="Mapa mental dos problemas"
          onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar} onPointerLeave={aoSoltar}
        >
          <g transform={`translate(${vista.x} ${vista.y}) scale(${vista.k})`}>
            <g data-conteudo className="font-sans">
              {/* arestas */}
              {areas.map((a) => (
                <g key={`e-${a.area}`} className="fill-none stroke-border" strokeWidth={1.5}>
                  <path d={`M ${PAD + W_RAIZ} ${raizY} C ${PAD + W_RAIZ + 40} ${raizY}, ${X_AREA - 40} ${a.y}, ${X_AREA} ${a.y}`} />
                  {a.filhos.map((f) => (
                    <path key={f.p.id} d={`M ${X_AREA + W_AREA} ${a.y} C ${X_AREA + W_AREA + 30} ${a.y}, ${X_PROB - 30} ${f.y}, ${X_PROB} ${f.y}`} />
                  ))}
                </g>
              ))}

              {/* raiz */}
              <g>
                <rect x={PAD} y={raizY - H_RAIZ / 2} width={W_RAIZ} height={H_RAIZ} rx={14} className="fill-primary" />
                <text x={PAD + W_RAIZ / 2} y={raizY - 4} textAnchor="middle" className="fill-primary-foreground" fontSize={14} fontWeight={700}>Problemas</text>
                <text x={PAD + W_RAIZ / 2} y={raizY + 14} textAnchor="middle" className="fill-primary-foreground" fontSize={11} opacity={0.85}>{problemas.length} no total</text>
              </g>

              {/* áreas e problemas */}
              {areas.map((a) => (
                <g key={a.area}>
                  <g className="cursor-pointer" onClick={clique(() => alternar(a.area))}>
                    <rect x={X_AREA} y={a.y - H_AREA / 2} width={W_AREA} height={H_AREA} rx={12} className="fill-card stroke-primary" strokeWidth={2} />
                    <text x={X_AREA + 14} y={a.y + 4} fontSize={13} fontWeight={600} className="fill-foreground">{corta(ROTULO_AREA[a.area], 28)}</text>
                    <text x={X_AREA + W_AREA - 14} y={a.y + 4} textAnchor="end" fontSize={12} className="fill-muted-foreground">{a.total} {a.recolhida ? '▸' : '▾'}</text>
                  </g>
                  {a.filhos.map((f) => (
                    <g key={f.p.id} className="cursor-pointer" onClick={clique(() => setSel(f.p))}>
                      <title>{`${f.p.assunto} — ${ROTULO_STATUS[f.p.status]}${f.p.atrasado ? ' (atrasado)' : ''}`}</title>
                      <rect x={X_PROB} y={f.y - H_PROB / 2} width={W_PROB} height={H_PROB} rx={8} strokeWidth={1.5} strokeDasharray={f.p.atrasado ? '5 3' : undefined} className={NO_STATUS[f.p.status]} />
                      <text x={X_PROB + 10} y={f.y + 4} fontSize={12} className="fill-foreground">{corta(f.p.assunto, 50)}</text>
                    </g>
                  ))}
                </g>
              ))}
            </g>
          </g>
        </svg>

        {areas.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Nenhum problema para os filtros escolhidos.</div>}
        <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-muted-foreground">Arraste para mover · roda do mouse para o zoom · clique numa área para recolher/expandir · linha tracejada = atrasado</p>
      </div>

      {/* Atalhos de teclado/toque para recolher e criar (alternativa acessível ao clique no SVG) */}
      <div className="flex flex-wrap gap-1.5">
        {AREAS.filter((a) => !fArea || a === fArea).map((a) => (
          <div key={a} className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs">
            <button type="button" className="inline-flex items-center gap-1 font-medium hover:underline" onClick={() => alternar(a)} aria-label={`${recolhidas.has(a) ? 'Expandir' : 'Recolher'} ${ROTULO_AREA[a]}`}>
              {recolhidas.has(a) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}{ROTULO_AREA[a]}
            </button>
            {perms.criar && <button type="button" className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Novo problema em ${ROTULO_AREA[a]}`} onClick={() => setNovo(a)}><Plus className="h-3 w-3" /></button>}
          </div>
        ))}
      </div>

      <ProblemaPainel aberto={!!sel || !!novo} problema={sel} novo={!!novo} areaInicial={novo ?? undefined} perms={perms} onFechar={() => { setSel(null); setNovo(null) }} />
    </div>
  )
}
