'use client'
// Camada de TINTA da folha livre (SVG vetorial + perfect-freehand) — a tinta é um OBJETO: traços selecionáveis (laço ou clique),
// movíveis, redimensionáveis e apagáveis (borracha por área ou por traço).
// - `touch-action: none` SÓ aqui e só quando a ferramenta é de tinta/laço; nas demais, a folha rola nativamente.
// - REGRA DO LEITOR (leitor-caneta-spen-tablet): caneta (pen) desenha SEMPRE; mouse desenha com a ferramenta ativa;
//   DEDO só desenha com "Desenhar com toque" ligado — desligado, 1 dedo rola e 2 dedos dão zoom (por código, pois touch-action:none
//   desliga o gesto nativo). Botão de borracha da S-Pen (buttons & 32) apaga mesmo com a caneta selecionada.
// - Desempenho: só renderiza os traços que cruzam a janela visível (prop `visivel`), paths memoizados por traço, ponteiro
//   por pointer events com getCoalescedEvents, ponto simplificado (RDP) ao confirmar, cursor da borracha sem re-render.
// - Todos os gestos escutam `window` (não dependem de pointer capture em elemento que pode ser remontado).
import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from 'react'
import getStroke from 'perfect-freehand'
import {
  apagarArea, bboxTraco, bboxTracos, corParaVar, escalarTracos, gerarId, limitarMovimento, moverTracos, removerTracos,
  simplificarPontos, tracosAtingidos, tracosNoLaco, type BBox, type CorTraco, type Folha, type Ponto, type Poligono, type TracoFolha,
} from '@/lib/aluno/notebook-folha'
import { OPACIDADE_MARCA_TEXTO, tipoDesenha, type ModoBorracha } from '@/lib/aluno/notebook-desenho'

export type FerramentaCamada = 'caneta' | 'marca-texto' | 'borracha' | 'laco' | 'selecionar' | 'nenhuma'

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

const TracoSvg = memo(function TracoSvg({ t, interativo }: { t: TracoFolha; interativo: boolean }) {
  const marca = t.ferramenta === 'marca-texto'
  const d = useMemo(() => caminho(t.pontos, t.largura, marca, true), [t.pontos, t.largura, marca])
  const cor = corParaVar(t.cor)
  // Em "Selecionar" o traço fica clicável (com uma área de acerto maior que a espessura desenhada).
  return (
    <path
      d={d} fill={cor} fillOpacity={marca ? OPACIDADE_MARCA_TEXTO : 1} data-tid={t.id}
      stroke={interativo ? 'transparent' : undefined} strokeWidth={interativo ? 10 : undefined} strokeLinejoin="round"
      style={interativo ? { cursor: 'pointer', touchAction: 'none' } : undefined}
    />
  )
})

type Trans = { k: 'mover'; dx: number; dy: number } | { k: 'escala'; ax: number; ay: number; sx: number; sy: number }
type Gesto =
  | { k: 'tinta'; id: number; pontos: Ponto[]; marca: boolean; cor: string; largura: number }
  | { k: 'apagar'; id: number; raio: number; modo: ModoBorracha }
  | { k: 'laco'; id: number; pts: Poligono }
  | { k: 'mover'; id: number; x0: number; y0: number; ids: string[] }
  | { k: 'escala'; id: number; ax: number; ay: number; cx: number; cy: number; ids: string[]; prop: boolean }

export interface PropsCamadaTinta {
  tracos: TracoFolha[]
  /** Dimensões do palco em unidades da folha. */
  largura: number
  altura: number
  ferramenta: FerramentaCamada
  /** Cor/espessura da caneta (ou marca-texto) corrente. */
  cor: string
  espessura: number
  modoBorracha: ModoBorracha
  /** Raio da borracha em px de TELA. */
  raioBorracha: number
  /** "Desenhar com toque": o dedo também desenha. */
  toque: boolean
  somenteLeitura: boolean
  zoom: number
  scrollRef: RefObject<HTMLDivElement | null>
  palcoRef: RefObject<HTMLDivElement | null>
  /** Janela visível em coordenadas da folha (null = tudo). */
  visivel: BBox | null
  selecao: string[]
  aoTraco: (t: TracoFolha) => void
  aoSelecionar: (ids: string[], aditivo?: boolean) => void
  /** Edição ao vivo SEM ponto de desfazer (borracha em andamento). */
  aoVivo: (fn: (f: Folha) => Folha) => void
  aoInicioGesto: () => void
  aoFimGesto: () => void
  /** Confirma uma transformação (mover/redimensionar) como UM passo de desfazer. */
  aoConfirmar: (fn: (f: Folha) => Folha) => void
  aoZoom: (novo: number, clientX: number, clientY: number) => void
  aoPenVisto?: () => void
}

const CANTOS = ['nw', 'ne', 'se', 'sw'] as const

export function CamadaTinta(props: PropsCamadaTinta) {
  const { tracos, largura, altura, ferramenta, zoom, selecao, visivel, somenteLeitura } = props
  const ref = useRef(props); ref.current = props
  const svgRef = useRef<SVGSVGElement>(null)
  const cursorRef = useRef<SVGCircleElement>(null)
  const gesto = useRef<Gesto | null>(null)
  const toques = useRef(new Map<number, { x: number; y: number }>())
  const pinca = useRef<{ dist: number; zoom: number } | null>(null)
  const transRef = useRef<Trans | null>(null)
  const raf = useRef(0)
  const penVisto = useRef(false)
  const limpar = useRef<(() => void) | null>(null)
  const [vivo, setVivo] = useState<Ponto[] | null>(null)
  const [laco, setLaco] = useState<Poligono | null>(null)
  const [trans, setTrans] = useState<Trans | null>(null)

  useEffect(() => () => { limpar.current?.(); if (raf.current) cancelAnimationFrame(raf.current) }, [])

  const captura = !somenteLeitura && (ferramenta === 'caneta' || ferramenta === 'marca-texto' || ferramenta === 'borracha' || ferramenta === 'laco')
  const interativo = !somenteLeitura && ferramenta === 'selecionar'

  const paraFolha = (cx: number, cy: number): [number, number] => {
    const r = ref.current.palcoRef.current?.getBoundingClientRect()
    if (!r) return [0, 0]
    return [(cx - r.left) / ref.current.zoom, (cy - r.top) / ref.current.zoom]
  }
  const agendar = () => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const g = gesto.current
      if (g?.k === 'tinta') setVivo(g.pontos.slice())
      else if (g?.k === 'laco') setLaco(g.pts.slice())
    })
  }
  const definirTrans = (t: Trans | null) => { transRef.current = t; setTrans(t) }
  const selecionados = () => { const s = new Set(ref.current.selecao); return ref.current.tracos.filter((t) => s.has(t.id)) }

  // ------------------------------------------------------------ gestos (listeners no window durante o gesto)
  const aoMoverJanela = (ev: PointerEvent) => {
    const g = gesto.current
    const p = ref.current
    if (g && g.id === ev.pointerId) {
      const lista = ev.getCoalescedEvents?.()
      const evs = lista && lista.length ? lista : [ev]
      if (g.k === 'tinta') {
        for (const e of evs) { const [x, y] = paraFolha(e.clientX, e.clientY); g.pontos.push([x, y, pressao(e)]) }
        agendar()
      } else if (g.k === 'laco') {
        for (const e of evs) { const [x, y] = paraFolha(e.clientX, e.clientY); g.pts.push([x, y]) }
        agendar()
      } else if (g.k === 'apagar') {
        const raio = g.raio / p.zoom
        for (const e of evs) {
          const [x, y] = paraFolha(e.clientX, e.clientY)
          p.aoVivo((f) => (g.modo === 'traco' ? removerTracos(f, tracosAtingidos(f, x, y, raio)) : apagarArea(f, x, y, raio)))
        }
      } else if (g.k === 'mover') {
        const [x, y] = paraFolha(ev.clientX, ev.clientY)
        const [dx, dy] = limitarMovimento(selecionadosPorIds(g.ids), x - g.x0, y - g.y0)
        definirTrans({ k: 'mover', dx, dy })
      } else if (g.k === 'escala') {
        const [x, y] = paraFolha(ev.clientX, ev.clientY)
        let sx = Math.max(0.1, (x - g.ax) / (g.cx - g.ax || 1)), sy = Math.max(0.1, (y - g.ay) / (g.cy - g.ay || 1))
        if (g.prop || ev.shiftKey) { const s = Math.max(sx, sy); sx = s; sy = s }
        definirTrans({ k: 'escala', ax: g.ax, ay: g.ay, sx, sy })
      }
      return
    }
    const t = toques.current.get(ev.pointerId)
    if (!t) return
    const dx = ev.clientX - t.x, dy = ev.clientY - t.y
    t.x = ev.clientX; t.y = ev.clientY
    if (toques.current.size === 1) {
      const sc = p.scrollRef.current
      if (sc) { sc.scrollLeft -= dx; sc.scrollTop -= dy }
    } else if (toques.current.size === 2 && pinca.current) {
      const [a, b] = [...toques.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      p.aoZoom(pinca.current.zoom * (dist / pinca.current.dist), (a.x + b.x) / 2, (a.y + b.y) / 2)
    }
  }
  const selecionadosPorIds = (ids: string[]) => { const s = new Set(ids); return ref.current.tracos.filter((t) => s.has(t.id)) }

  const terminar = (ev: PointerEvent, cancelado: boolean) => {
    const p = ref.current
    if (toques.current.delete(ev.pointerId)) { pinca.current = null; if (!toques.current.size && !gesto.current) limpar.current?.(); return }
    const g = gesto.current
    if (!g || g.id !== ev.pointerId) return
    gesto.current = null
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0 }
    limpar.current?.()
    setVivo(null); setLaco(null)
    if (g.k === 'apagar') { p.aoFimGesto(); return }
    if (g.k === 'mover') {
      const tr = transRef.current
      definirTrans(null)
      if (!cancelado && tr?.k === 'mover' && (tr.dx || tr.dy)) p.aoConfirmar((f) => moverTracos(f, g.ids, tr.dx, tr.dy))
      return
    }
    if (g.k === 'escala') {
      const tr = transRef.current
      definirTrans(null)
      if (!cancelado && tr?.k === 'escala') p.aoConfirmar((f) => escalarTracos(f, g.ids, tr.ax, tr.ay, tr.sx, tr.sy))
      return
    }
    if (cancelado) return
    if (g.k === 'laco') {
      const ids = tracosNoLaco(p.tracos, simplificarLaco(g.pts, 1 / p.zoom))
      p.aoSelecionar(ids)
      return
    }
    const pts = simplificarPontos(g.pontos, 0.5 / p.zoom).map(([x, y, pr]) => [x, y, pr] as Ponto)
    p.aoTraco({ id: gerarId(), ferramenta: g.marca ? 'marca-texto' : 'caneta', cor: g.cor as CorTraco, largura: g.largura, pontos: pts })
  }

  const ligarJanela = (id: number) => {
    limpar.current?.()
    const mv = (e: PointerEvent) => aoMoverJanela(e)
    const up = (e: PointerEvent) => { if (e.pointerId === id || toques.current.has(e.pointerId)) terminar(e, false) }
    const cn = (e: PointerEvent) => { if (e.pointerId === id || toques.current.has(e.pointerId)) terminar(e, true) }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cn)
    limpar.current = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cn)
      limpar.current = null
    }
  }

  // ------------------------------------------------------------ pointerdown
  const aoDescer = (e: RPointerEvent<SVGSVGElement>) => {
    const p = ref.current
    if (p.somenteLeitura) return
    const pen = e.pointerType === 'pen'
    if (pen && !penVisto.current) { penVisto.current = true; p.aoPenVisto?.() }
    const alvo = e.target as Element
    const acao = alvo.closest?.('[data-acao]')?.getAttribute('data-acao') ?? null
    const tid = alvo.closest?.('[data-tid]')?.getAttribute('data-tid') ?? null
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (gesto.current) return // palma/2º ponteiro durante o gesto: ignora

    // 1) alças da seleção (mover / redimensionar), qualquer tipo de ponteiro
    if (acao) {
      e.preventDefault(); e.stopPropagation()
      const sel = selecionados()
      const b = bboxTracos(sel)
      if (!b) return
      const [x, y] = paraFolha(e.clientX, e.clientY)
      const ids = sel.map((t) => t.id)
      if (acao === 'mover') gesto.current = { k: 'mover', id: e.pointerId, x0: x, y0: y, ids }
      else {
        const canto = acao.slice(4) // nw|ne|se|sw
        const cx = canto.includes('w') ? b.x0 : b.x1, cy = canto.includes('n') ? b.y0 : b.y1
        const ax = canto.includes('w') ? b.x1 : b.x0, ay = canto.includes('n') ? b.y1 : b.y0
        gesto.current = { k: 'escala', id: e.pointerId, ax, ay, cx, cy, ids, prop: false }
      }
      ligarJanela(e.pointerId)
      return
    }
    // 2) ferramenta Selecionar: clicar num traço o seleciona (e já permite arrastar)
    if (p.ferramenta === 'selecionar') {
      if (!tid) return
      e.preventDefault()
      const aditivo = e.shiftKey || e.ctrlKey || e.metaKey
      const jaSel = p.selecao.includes(tid)
      const ids = aditivo ? (jaSel ? p.selecao.filter((i) => i !== tid) : [...p.selecao, tid]) : jaSel ? p.selecao : [tid]
      p.aoSelecionar(ids)
      if (!aditivo && ids.length) {
        const [x, y] = paraFolha(e.clientX, e.clientY)
        gesto.current = { k: 'mover', id: e.pointerId, x0: x, y0: y, ids }
        ligarJanela(e.pointerId)
      }
      return
    }
    if (!captura_(p.ferramenta)) return
    // 3) ferramentas de tinta/laço/borracha
    if (!tipoDesenha(e.pointerType, p.toque)) {
      // dedo com "Desenhar com toque" desligado: rola (1 dedo) / dá zoom (2 dedos)
      toques.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (toques.current.size === 2) {
        const [a, b] = [...toques.current.values()]
        pinca.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: p.zoom }
      }
      ligarJanela(e.pointerId)
      return
    }
    e.preventDefault()
    toques.current.clear(); pinca.current = null
    const [x, y] = paraFolha(e.clientX, e.clientY)
    const borrachaS = pen && (e.buttons & 32) !== 0
    if (p.ferramenta === 'laco') {
      p.aoSelecionar([])
      gesto.current = { k: 'laco', id: e.pointerId, pts: [[x, y]] }
      agendar()
    } else if (p.ferramenta === 'borracha' || borrachaS) {
      const modo: ModoBorracha = borrachaS && p.ferramenta !== 'borracha' ? 'area' : p.modoBorracha
      gesto.current = { k: 'apagar', id: e.pointerId, raio: p.raioBorracha, modo }
      p.aoInicioGesto()
      const raio = p.raioBorracha / p.zoom
      p.aoVivo((f) => (modo === 'traco' ? removerTracos(f, tracosAtingidos(f, x, y, raio)) : apagarArea(f, x, y, raio)))
    } else {
      const marca = p.ferramenta === 'marca-texto'
      gesto.current = { k: 'tinta', id: e.pointerId, pontos: [[x, y, pressao(e.nativeEvent)]], marca, cor: p.cor, largura: p.espessura }
      agendar()
    }
    ligarJanela(e.pointerId)
  }

  // cursor circular da borracha (sem re-render)
  const aoPairar = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'pen' && !penVisto.current) { penVisto.current = true; ref.current.aoPenVisto?.() }
    const c = cursorRef.current
    if (!c) return
    if (ferramenta !== 'borracha' || e.pointerType === 'touch') { c.style.display = 'none'; return }
    const [x, y] = paraFolha(e.clientX, e.clientY)
    c.setAttribute('cx', String(x)); c.setAttribute('cy', String(y)); c.style.display = ''
  }

  // ------------------------------------------------------------ render
  const sel = useMemo(() => new Set(selecao), [selecao])
  const arrastando = !!trans
  const { marcaTexto, canetas, arrastados } = useMemo(() => {
    const m: TracoFolha[] = [], c: TracoFolha[] = [], a: TracoFolha[] = []
    for (const t of tracos) {
      const arr = arrastando && sel.has(t.id)
      if (!arr && visivel) {
        const b = bboxTraco(t), mg = t.largura
        if (b.x1 + mg < visivel.x0 || b.x0 - mg > visivel.x1 || b.y1 + mg < visivel.y0 || b.y0 - mg > visivel.y1) continue
      }
      if (arr) a.push(t)
      else if (t.ferramenta === 'marca-texto') m.push(t)
      else c.push(t)
    }
    return { marcaTexto: m, canetas: c, arrastados: a }
  }, [tracos, visivel, arrastando, sel])

  const marcaViva = ferramenta === 'marca-texto'
  const dVivo = useMemo(() => (vivo ? caminho(vivo, props.espessura, marcaViva, false) : ''), [vivo, props.espessura, marcaViva])
  const caixaSel = useMemo(() => bboxTracos(tracos.filter((t) => sel.has(t.id))), [tracos, sel])

  // caixa da seleção já transformada (prévia durante o gesto)
  const caixaVis = useMemo(() => {
    if (!caixaSel) return null
    if (!trans) return caixaSel
    if (trans.k === 'mover') return { x0: caixaSel.x0 + trans.dx, y0: caixaSel.y0 + trans.dy, x1: caixaSel.x1 + trans.dx, y1: caixaSel.y1 + trans.dy }
    const X = (x: number) => trans.ax + (x - trans.ax) * trans.sx, Y = (y: number) => trans.ay + (y - trans.ay) * trans.sy
    return { x0: X(caixaSel.x0), x1: X(caixaSel.x1), y0: Y(caixaSel.y0), y1: Y(caixaSel.y1) }
  }, [caixaSel, trans])

  const transform = trans
    ? trans.k === 'mover' ? `translate(${trans.dx} ${trans.dy})` : `translate(${trans.ax} ${trans.ay}) scale(${trans.sx} ${trans.sy}) translate(${-trans.ax} ${-trans.ay})`
    : undefined
  const hs = 10 / zoom
  const cursorBorracha = ferramenta === 'borracha' ? 'none' : ferramenta === 'laco' ? 'crosshair' : captura ? 'crosshair' : undefined
  const pe = interativo ? 'visiblePainted' : 'none'

  return (
    <svg
      ref={svgRef}
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      role="img"
      aria-label="Camada de desenho da folha"
      onPointerDown={aoDescer}
      onPointerMove={aoPairar}
      onPointerLeave={() => { if (cursorRef.current) cursorRef.current.style.display = 'none' }}
      onContextMenu={(e) => { if (captura) e.preventDefault() }}
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: captura ? 'auto' : 'none',
        touchAction: captura ? 'none' : undefined,
        cursor: cursorBorracha,
        zIndex: 1000001, userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      <g style={{ pointerEvents: pe }}>{marcaTexto.map((t) => <TracoSvg key={t.id} t={t} interativo={interativo} />)}</g>
      <g style={{ pointerEvents: pe }}>{canetas.map((t) => <TracoSvg key={t.id} t={t} interativo={interativo} />)}</g>
      {arrastados.length ? <g transform={transform} style={{ pointerEvents: 'none' }}>{arrastados.map((t) => <TracoSvg key={t.id} t={t} interativo={false} />)}</g> : null}
      {vivo && dVivo ? <path d={dVivo} fill={corParaVar(props.cor)} fillOpacity={marcaViva ? OPACIDADE_MARCA_TEXTO : 1} style={{ pointerEvents: 'none' }} /> : null}
      {laco && laco.length > 1 ? (
        <path
          d={`M ${laco.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`} fill="color-mix(in srgb, var(--brand-primary, var(--brand)) 10%, transparent)"
          stroke="var(--brand-primary, var(--brand))" strokeWidth={1.5 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} style={{ pointerEvents: 'none' }}
        />
      ) : null}
      {caixaVis && !somenteLeitura ? (
        <g>
          <rect
            data-acao="mover" x={caixaVis.x0 - 4 / zoom} y={caixaVis.y0 - 4 / zoom} width={caixaVis.x1 - caixaVis.x0 + 8 / zoom} height={caixaVis.y1 - caixaVis.y0 + 8 / zoom}
            fill="transparent" stroke="var(--brand-primary, var(--brand))" strokeWidth={1.5 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`}
            style={{ pointerEvents: 'all', cursor: 'move', touchAction: 'none' }}
          />
          {CANTOS.map((c) => {
            const x = (c.includes('w') ? caixaVis.x0 - 4 / zoom : caixaVis.x1 + 4 / zoom) - hs / 2
            const y = (c.includes('n') ? caixaVis.y0 - 4 / zoom : caixaVis.y1 + 4 / zoom) - hs / 2
            return (
              <rect
                key={c} data-acao={`esc:${c}`} x={x} y={y} width={hs} height={hs} rx={2 / zoom}
                fill="var(--card, var(--surface))" stroke="var(--brand-primary, var(--brand))" strokeWidth={1.5 / zoom}
                style={{ pointerEvents: 'all', cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize', touchAction: 'none' }}
              />
            )
          })}
        </g>
      ) : null}
      <circle ref={cursorRef} r={props.raioBorracha / zoom} fill="none" stroke="var(--ink, currentColor)" strokeWidth={1 / zoom} style={{ display: 'none', pointerEvents: 'none' }} />
    </svg>
  )
}

const captura_ = (f: FerramentaCamada) => f === 'caneta' || f === 'marca-texto' || f === 'borracha' || f === 'laco'

/** Simplifica o contorno do laço (RDP) antes do teste de pertencimento. */
function simplificarLaco(pts: Poligono, eps: number): Poligono {
  return simplificarPontos(pts.map(([x, y]) => [x, y, 1] as Ponto), eps).map(([x, y]) => [x, y] as [number, number])
}

function pressao(e: { pointerType: string; pressure: number }): number {
  if (e.pointerType === 'pen' && e.pressure > 0) return Math.min(1, e.pressure)
  return 0.5
}
