'use client'
// Camada de TINTA da folha livre (SVG + perfect-freehand).
// - `touch-action: none` SÓ aqui (e só quando a ferramenta é de tinta); nas demais, a folha rola nativamente.
// - PALM REJECTION (mesmo padrão do leitor: pointerType==='pen' é quem desenha; dedo rola/zoom):
//     caneta (pen) e mouse desenham; DEDO só desenha em aparelho que nunca viu uma caneta e com "só caneta" desligado.
//     Dedo rola (1 dedo) e dá zoom (pinça) por código, porque touch-action:none desliga o gesto nativo.
// - Botão de borracha da S-Pen (buttons & 32) apaga mesmo com a caneta selecionada.
import { memo, useCallback, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from 'react'
import getStroke from 'perfect-freehand'
import {
  corParaVar, gerarId, simplificarPontos, tracoAtingido, type CorFolha, type FerramentaTraco, type Ponto, type TracoFolha,
} from '@/lib/aluno/notebook-folha'

export type FerramentaTinta = FerramentaTraco

function caminho(pts: Ponto[], largura: number, marca: boolean, completo: boolean): string {
  const out = getStroke(pts, {
    size: largura,
    thinning: marca ? 0 : 0.5,
    smoothing: 0.5,
    streamline: marca ? 0.6 : 0.35,
    simulatePressure: false,
    last: completo,
  })
  if (!out.length) return ''
  const r = (n: number) => Math.round(n * 10) / 10
  const d: Array<string | number> = ['M', r(out[0][0]), r(out[0][1]), 'Q']
  for (let i = 0; i < out.length; i++) {
    const [x0, y0] = out[i]
    const [x1, y1] = out[(i + 1) % out.length]
    d.push(r(x0), r(y0), r((x0 + x1) / 2), r((y0 + y1) / 2))
  }
  d.push('Z')
  return d.join(' ')
}

const TracoSvg = memo(function TracoSvg({ t }: { t: TracoFolha }) {
  const marca = t.ferramenta === 'marca-texto'
  const d = useMemo(() => caminho(t.pontos, t.largura, marca, true), [t.pontos, t.largura, marca])
  return <path d={d} fill={corParaVar(t.cor)} fillOpacity={marca ? 0.38 : 1} />
})

type Caixa = { x0: number; y0: number; x1: number; y1: number }
const bboxCache = new WeakMap<TracoFolha, Caixa>()
function bbox(t: TracoFolha): Caixa {
  let b = bboxCache.get(t)
  if (!b) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of t.pontos) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1] }
    b = { x0, y0, x1, y1 }
    bboxCache.set(t, b)
  }
  return b
}

interface Props {
  tracos: TracoFolha[]
  largura: number
  altura: number
  ferramenta: FerramentaTinta
  cor: CorFolha
  espessura: number
  /** true = ferramenta de tinta ativa (a camada captura o ponteiro). */
  ativa: boolean
  soCaneta: boolean
  zoom: number
  scrollRef: RefObject<HTMLDivElement | null>
  /** Referência do palco (para converter coordenadas). */
  palcoRef: RefObject<HTMLDivElement | null>
  aoTraco: (t: TracoFolha) => void
  aoApagar: (ids: string[]) => void
  aoZoom: (novo: number, clientX: number, clientY: number) => void
  aoPenVisto?: () => void
}

export function CamadaTinta({
  tracos, largura, altura, ferramenta, cor, espessura, ativa, soCaneta, zoom, scrollRef, palcoRef, aoTraco, aoApagar, aoZoom, aoPenVisto,
}: Props) {
  const penVisto = useRef(false)
  const desenho = useRef<{ pointerId: number; modo: 'tinta' | 'apagar'; pontos: Ponto[] } | null>(null)
  const toques = useRef(new Map<number, { x: number; y: number }>())
  const pinca = useRef<{ dist: number; zoom: number } | null>(null)
  const apagados = useRef(new Set<string>())
  const raf = useRef(0)
  const [vivo, setVivo] = useState<Ponto[] | null>(null)
  const [escondidos, setEscondidos] = useState<Set<string>>(() => new Set())

  const paraFolha = useCallback((cx: number, cy: number): [number, number] => {
    const r = palcoRef.current?.getBoundingClientRect()
    if (!r) return [0, 0]
    return [(cx - r.left) / zoom, (cy - r.top) / zoom]
  }, [palcoRef, zoom])

  const agendar = useCallback(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const d = desenho.current
      if (d?.modo === 'tinta') setVivo(d.pontos.slice())
    })
  }, [])

  const marcarPen = () => { if (!penVisto.current) { penVisto.current = true; aoPenVisto?.() } }

  const apagarEm = (x: number, y: number) => {
    const raio = 10 / zoom
    let mudou = false
    for (const t of tracos) {
      if (apagados.current.has(t.id)) continue
      const b = bbox(t)
      const m = raio + t.largura / 2
      if (x < b.x0 - m || x > b.x1 + m || y < b.y0 - m || y > b.y1 + m) continue
      if (tracoAtingido(t, x, y, raio)) { apagados.current.add(t.id); mudou = true }
    }
    if (mudou) setEscondidos(new Set(apagados.current))
  }

  const aoDescer = (e: RPointerEvent<SVGSVGElement>) => {
    if (!ativa) return
    const pen = e.pointerType === 'pen'
    const mouse = e.pointerType === 'mouse'
    if (pen) marcarPen()
    if (mouse && e.button !== 0) return
    const desenha = pen || mouse || (!soCaneta && !penVisto.current)
    if (!desenha) {
      // dedo: rolar / pinçar (nunca desenha)
      if (desenho.current) return // palma encostando durante o traço: ignora
      toques.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      e.currentTarget.setPointerCapture(e.pointerId)
      if (toques.current.size === 2) {
        const [a, b] = [...toques.current.values()]
        pinca.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom }
      }
      return
    }
    if (desenho.current) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    toques.current.clear()
    pinca.current = null
    const modo: 'tinta' | 'apagar' = ferramenta === 'borracha' || (pen && (e.buttons & 32) !== 0) ? 'apagar' : 'tinta'
    const [x, y] = paraFolha(e.clientX, e.clientY)
    const p: Ponto = [x, y, pressao(e)]
    desenho.current = { pointerId: e.pointerId, modo, pontos: [p] }
    apagados.current = new Set()
    if (modo === 'apagar') apagarEm(x, y)
    else agendar()
  }

  const aoMover = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'pen') marcarPen()
    if (!ativa) return
    const d = desenho.current
    if (d && d.pointerId === e.pointerId) {
      const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.()
      const lista = evs && evs.length ? evs : [e.nativeEvent as PointerEvent]
      for (const ev of lista) {
        const [x, y] = paraFolha(ev.clientX, ev.clientY)
        if (d.modo === 'apagar') apagarEm(x, y)
        else d.pontos.push([x, y, pressao(ev)])
      }
      if (d.modo === 'tinta') agendar()
      return
    }
    const t = toques.current.get(e.pointerId)
    if (!t) return
    const dx = e.clientX - t.x, dy = e.clientY - t.y
    t.x = e.clientX
    t.y = e.clientY
    if (toques.current.size === 1) {
      const sc = scrollRef.current
      if (sc) { sc.scrollLeft -= dx; sc.scrollTop -= dy }
    } else if (toques.current.size === 2 && pinca.current) {
      const [a, b] = [...toques.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      aoZoom(pinca.current.zoom * (dist / pinca.current.dist), (a.x + b.x) / 2, (a.y + b.y) / 2)
    }
  }

  const terminar = (e: RPointerEvent<SVGSVGElement>, cancelado: boolean) => {
    if (toques.current.delete(e.pointerId)) {
      pinca.current = null
      return
    }
    const d = desenho.current
    if (!d || d.pointerId !== e.pointerId) return
    desenho.current = null
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0 }
    setVivo(null)
    if (cancelado) {
      apagados.current = new Set()
      setEscondidos(new Set())
      return
    }
    if (d.modo === 'apagar') {
      const ids = [...apagados.current]
      apagados.current = new Set()
      setEscondidos(new Set())
      if (ids.length) aoApagar(ids)
      return
    }
    const marca = ferramenta === 'marca-texto'
    const larg = marca ? Math.max(14, espessura * 4) : espessura
    const pts = simplificarPontos(d.pontos, 0.5 / zoom).map(([x, y, p]) => [x, y, p] as Ponto)
    aoTraco({ id: gerarId(), ferramenta: marca ? 'marca-texto' : 'caneta', cor, largura: larg, pontos: pts })
  }

  const marcaTexto = tracos.filter((t) => t.ferramenta === 'marca-texto' && !escondidos.has(t.id))
  const canetas = tracos.filter((t) => t.ferramenta !== 'marca-texto' && !escondidos.has(t.id))
  const vivoMarca = ferramenta === 'marca-texto'
  const vivoLarg = vivoMarca ? Math.max(14, espessura * 4) : espessura
  const dVivo = useMemo(() => (vivo ? caminho(vivo, vivoLarg, vivoMarca, false) : ''), [vivo, vivoLarg, vivoMarca])

  return (
    <svg
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      role="img"
      aria-label="Camada de desenho da folha"
      onPointerDown={aoDescer}
      onPointerMove={aoMover}
      onPointerUp={(e) => terminar(e, false)}
      onPointerCancel={(e) => terminar(e, true)}
      onContextMenu={(e) => { if (ativa) e.preventDefault() }}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: ativa ? 'auto' : 'none',
        touchAction: ativa ? 'none' : undefined,
        cursor: ativa ? (ferramenta === 'borracha' ? 'cell' : 'crosshair') : undefined,
        zIndex: 1000001,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <g>{marcaTexto.map((t) => <TracoSvg key={t.id} t={t} />)}</g>
      <g>{canetas.map((t) => <TracoSvg key={t.id} t={t} />)}</g>
      {vivo && dVivo && <path d={dVivo} fill={corParaVar(cor)} fillOpacity={vivoMarca ? 0.38 : 1} />}
    </svg>
  )
}

function pressao(e: { pointerType: string; pressure: number }): number {
  if (e.pointerType === 'pen' && e.pressure > 0) return Math.min(1, e.pressure)
  return 0.5
}
