'use client'
// FOLHA LIVRE + CANETA (Caderno beta) — componente controlado, sem fetch/server actions.
//   <FolhaLivre valor={folha} onChange={(nova) => ...} />   (o chamador faz o debounce/PATCH de `tinta`)
// Dois modos:
//  - padrão (preview/legado): barra de ferramentas própria, zoom próprio, folha de tamanho fixo centralizada.
//  - `onenote`: SEM barra (as ferramentas vêm do ribbon, via estado-desenho.ts), zoom/fundo da página vindos do CanvasPagina,
//    canvas ocupa a área toda e CRESCE com o conteúdo (tela "infinita", rola em todas as direções).
// Desfazer/refazer ficam internos (pilha limitada em lib/aluno/notebook-folha.ts) e cobrem caixas, texto e tinta juntos.
// Funciona em iframe (nada de window.top) e rola com o dedo; só a camada de tinta usa touch-action:none.
import { useCallback, useEffect, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Editor } from '@tiptap/react'
import {
  adicionarCaixa, adicionarTraco, ajustarAlturaCaixa, atualizarDocCaixa, caixaTemConteudo, confirmarDesde, criarHistorico, crescerPara, desfazer, expandirSeNecessario, gerarId,
  moverCaixa, podeDesfazer, podeRefazer, redimensionarCaixa, refazer, registrar, removerCaixa, removerTracos, substituirPresente,
  trazerParaFrente, type BBox, type CorFolha, type Folha, type Historico, type TracoFolha,
} from '@/lib/aluno/notebook-folha'
import { RAIO_BORRACHA_PX } from '@/lib/aluno/notebook-desenho'
import { atualizarDesenho, useEstadoDesenho } from '../onenote/estado-desenho'
import { BarraFerramentasFolha, type FerramentaFolha } from './barra-ferramentas-folha'
import { CamadaTinta, type FerramentaCamada } from './camada-tinta'
import { CaixaTextoFolha, CSS_CAIXA_FOLHA, LIMIAR_CAIXAS_EDITOR_SOB_DEMANDA } from './caixa-texto-folha'
import { garantirCss } from '../css-global'
import { CSS_EDITOR } from '../extensoes-editor'
import { CSS_TEXTO } from '../extensoes-texto'

const ZOOM_MIN = 0.4
const ZOOM_MAX = 3

// Cores semânticas da paleta (nomes fixos -> CSS vars). tinta/primaria seguem o tema/marca; as demais são cores de caneta
// (oklch, ajustadas para legibilidade em claro e escuro).
const VARS_COR: CSSProperties = {
  ['--folha-cor-tinta' as string]: 'var(--foreground)',
  ['--folha-cor-primaria' as string]: 'var(--brand-primary)',
  ['--folha-cor-vermelho' as string]: 'var(--destructive, oklch(0.6 0.22 27))',
  ['--folha-cor-laranja' as string]: 'oklch(0.72 0.17 55)',
  ['--folha-cor-amarelo' as string]: 'oklch(0.88 0.17 95)',
  ['--folha-cor-verde' as string]: 'oklch(0.68 0.17 150)',
  ['--folha-cor-azul' as string]: 'oklch(0.62 0.18 250)',
  ['--folha-cor-rosa' as string]: 'oklch(0.72 0.2 350)',
}
// No OneNote a tinta "automática" e a cor da marca seguem os tokens da casca (--ink / --brand).
const VARS_COR_ONENOTE: CSSProperties = { ...VARS_COR, ['--folha-cor-tinta' as string]: 'var(--ink)', ['--folha-cor-primaria' as string]: 'var(--brand)' }

type FerrEfetiva = FerramentaFolha | 'laco'

interface Props {
  valor: Folha
  onChange: (nova: Folha) => void
  somenteLeitura?: boolean
  /** Altura do componente (padrão: 100% do pai, mínimo 480px). */
  altura?: number | string
  /** Modo OneNote: sem barra própria; ferramentas/zoom/fundo vêm do app (estado-desenho.ts). */
  onenote?: boolean
  /** Modo OneNote: recebe o editor TipTap da caixa em edição (ou null) para os comandos de texto do ribbon. */
  aoEditor?: (ed: Editor | null) => void
}

const interativo = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function FolhaLivre({ valor, onChange, somenteLeitura = false, altura = '100%', onenote = false, aoEditor }: Props) {
  const dz = useEstadoDesenho()
  const [hist, setHist] = useState<Historico>(() => criarHistorico(valor))
  const histRef = useRef(hist)
  const ultimoEmitido = useRef<Folha>(valor)
  const snapshot = useRef<Folha | null>(null)
  const [ferramenta, setFerramenta] = useState<FerramentaFolha>(somenteLeitura ? 'mao' : 'caneta')
  const [cor, setCor] = useState<CorFolha>('tinta')
  const [espessura, setEspessura] = useState(4)
  const [soCaneta, setSoCaneta] = useState(false)
  const [penVisto, setPenVisto] = useState(false)
  const [zoomProprio, setZoomState] = useState(1)
  const [selId, setSelId] = useState<string | null>(null)
  const [focoId, setFocoId] = useState<string | null>(null)
  const [selTracos, setSelTracos] = useState<string[]>([])
  const [aviso, setAviso] = useState('')
  const [cont, setCont] = useState({ w: 0, h: 0 })
  const [visivel, setVisivel] = useState<BBox | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const palcoRef = useRef<HTMLDivElement>(null)
  const zoom = onenote ? dz.pagina.zoom : zoomProprio
  const zoomRef = useRef(zoom); zoomRef.current = zoom
  const ancora = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null)
  const ultimoPedidoZoom = useRef(0)
  const pedirRef = useRef(dz.pedirZoom); pedirRef.current = dz.pedirZoom
  const selTracosRef = useRef<string[]>([])
  const aoEditorRef = useRef(aoEditor); aoEditorRef.current = aoEditor
  const editorAtivo = useRef<Editor | null>(null) // UM editor ativo por vez (o da caixa focada); alimenta o ribbon via aoEditor

  const folha = hist.presente
  useInsertionEffect(() => { garantirCss('editor', CSS_EDITOR + CSS_TEXTO); garantirCss('folha-caixa', CSS_CAIXA_FOLHA) }, [])
  const modoEstatico = folha.caixas.length > LIMIAR_CAIXAS_EDITOR_SOB_DEMANDA

  // ---- ferramenta efetiva ----
  const ferr: FerrEfetiva = onenote
    ? (dz.ferramenta === 'texto' ? 'caixa' : dz.ferramenta)
    : ferramenta
  const penOneNote = dz.canetas[dz.slot ?? 'c1']
  const marca = ferr === 'marca-texto'
  const corPena: string = onenote ? penOneNote.cor : cor
  const largPena = onenote ? penOneNote.largura : marca ? Math.max(14, espessura * 4) : espessura
  const toque = onenote ? dz.toque : !soCaneta && !penVisto
  const ferrCamada: FerrEfetiva = somenteLeitura ? 'mao' : ferr
  const camada: FerramentaCamada =
    ferrCamada === 'caneta' || ferrCamada === 'marca-texto' || ferrCamada === 'borracha' || ferrCamada === 'laco' ? ferrCamada
    : ferrCamada === 'selecionar' && onenote ? 'selecionar' : 'nenhuma'
  const boxesInterativas = !somenteLeitura && (onenote ? ferr === 'selecionar' || ferr === 'caixa' : ferr === 'selecionar')

  // Valor trocado de fora (ex.: outra página carregada): reinicia o histórico.
  useEffect(() => {
    if (valor === ultimoEmitido.current || valor === histRef.current.presente) return
    ultimoEmitido.current = valor
    const h = criarHistorico(valor)
    histRef.current = h
    setHist(h)
    setSelId(null)
    setSelTracos([])
  }, [valor])

  const onChangeRef = useRef(onChange); onChangeRef.current = onChange // `aplicar` fica estável mesmo se o pai trocar o callback
  const aplicar = useCallback((fn: (h: Historico) => Historico) => {
    if (somenteLeitura) return
    const antes = histRef.current
    const prox = fn(antes)
    if (prox === antes) return
    histRef.current = prox
    setHist(prox)
    if (prox.presente !== antes.presente) {
      ultimoEmitido.current = prox.presente
      onChangeRef.current(prox.presente)
    }
  }, [somenteLeitura])
  const aplicarRef = useRef(aplicar); aplicarRef.current = aplicar

  // ---- zoom (padrão: mantém o ponto sob o dedo/cursor; OneNote: pede passo ao app) ----
  const setZoom = useCallback((novo: number, cx?: number, cy?: number) => {
    if (onenote) {
      const agora = Date.now()
      if (agora - ultimoPedidoZoom.current < 280) return
      const z = zoomRef.current
      if (novo > z * 1.1) { ultimoPedidoZoom.current = agora; pedirRef.current?.(1) }
      else if (novo < z / 1.1) { ultimoPedidoZoom.current = agora; pedirRef.current?.(-1) }
      return
    }
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, novo))
    if (Math.abs(z - zoomRef.current) < 0.001) return
    const sc = scrollRef.current, palco = palcoRef.current
    if (sc && palco) {
      const sr = sc.getBoundingClientRect(), pr = palco.getBoundingClientRect()
      const x = cx ?? sr.left + sr.width / 2, y = cy ?? sr.top + sr.height / 2
      ancora.current = { fx: (x - pr.left) / zoomRef.current, fy: (y - pr.top) / zoomRef.current, cx: x, cy: y }
    }
    zoomRef.current = z
    setZoomState(z)
  }, [onenote])
  useLayoutEffect(() => {
    const a = ancora.current, sc = scrollRef.current, palco = palcoRef.current
    if (!a || !sc || !palco) return
    ancora.current = null
    const pr = palco.getBoundingClientRect()
    sc.scrollLeft += pr.left + a.fx * zoom - a.cx
    sc.scrollTop += pr.top + a.fy * zoom - a.cy
  }, [zoom])

  // Ajuste inicial à largura disponível (celular/iframe estreito) — só no modo padrão.
  useEffect(() => {
    if (onenote) return
    const sc = scrollRef.current
    if (!sc) return
    const w = sc.clientWidth
    if (w > 0 && w < valor.largura) {
      const z = Math.min(1, Math.max(ZOOM_MIN, (w - 8) / valor.largura))
      zoomRef.current = z
      setZoomState(z)
    }
    // só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ctrl + roda = zoom (listener não-passivo para poder impedir o zoom do navegador).
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const h = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(zoomRef.current * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY)
    }
    sc.addEventListener('wheel', h, { passive: false })
    return () => sc.removeEventListener('wheel', h)
  }, [setZoom])

  // ---- tamanho do contêiner + janela visível (virtualização dos traços) ----
  const calcularVisivel = useCallback(() => {
    const sc = scrollRef.current, palco = palcoRef.current
    if (!sc || !palco) return
    const sr = sc.getBoundingClientRect(), pr = palco.getBoundingClientRect()
    const z = zoomRef.current
    const v: BBox = { x0: (sr.left - pr.left) / z, y0: (sr.top - pr.top) / z, x1: (sr.right - pr.left) / z, y1: (sr.bottom - pr.top) / z }
    setVisivel((atual) => {
      if (atual && v.x0 >= atual.x0 && v.y0 >= atual.y0 && v.x1 <= atual.x1 && v.y1 <= atual.y1) {
        // ainda dentro da janela renderizada; só reavalia se a janela atual ficou enorme em relação ao necessário
        const folgaX = (v.x1 - v.x0), folgaY = (v.y1 - v.y0)
        if (atual.x1 - atual.x0 <= folgaX * 4 && atual.y1 - atual.y0 <= folgaY * 4) return atual
      }
      const mx = (v.x1 - v.x0), my = (v.y1 - v.y0)
      return { x0: v.x0 - mx, y0: v.y0 - my, x1: v.x1 + mx, y1: v.y1 + my }
    })
  }, [])
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    let r = 0, rc = 0
    const agendar = () => { if (!r) r = requestAnimationFrame(() => { r = 0; calcularVisivel() }) }
    // o ResizeObserver dispara em rajada (arrastar divisor, teclado virtual): UMA medição por quadro e setState só se mudou
    const medirCont = () => { rc = 0; setCont((a) => (a.w === sc.clientWidth && a.h === sc.clientHeight ? a : { w: sc.clientWidth, h: sc.clientHeight })); agendar() }
    const ro = new ResizeObserver(() => { if (!rc) rc = requestAnimationFrame(medirCont) })
    ro.observe(sc)
    sc.addEventListener('scroll', agendar, { passive: true })
    medirCont()
    return () => { ro.disconnect(); sc.removeEventListener('scroll', agendar); if (r) cancelAnimationFrame(r); if (rc) cancelAnimationFrame(rc) }
  }, [calcularVisivel])
  useEffect(() => { setVisivel(null); const r = requestAnimationFrame(calcularVisivel); return () => cancelAnimationFrame(r) }, [zoom, calcularVisivel])

  // ---- ações ----
  const aoTraco = (t: TracoFolha) => {
    setAviso('')
    aplicar((h) => {
      const f = adicionarTraco(h.presente, t)
      if (f === h.presente) { setAviso('Limite da folha atingido: apague algo ou use outra folha.'); return h }
      return registrar(h, expandirSeNecessario(f))
    })
  }
  const aoVivo = (fn: (f: Folha) => Folha) => aplicar((h) => substituirPresente(h, fn(h.presente)))
  const aoConfirmar = (fn: (f: Folha) => Folha) => aplicar((h) => registrar(h, expandirSeNecessario(fn(h.presente))))

  const inicioGesto = () => { if (!snapshot.current) snapshot.current = histRef.current.presente }
  const fimGesto = () => {
    const s = snapshot.current
    snapshot.current = null
    if (!s) return
    aplicar((h) => confirmarDesde({ ...h, presente: h.presente }, s))
  }
  const viva = (fn: (f: Folha) => Folha) => aplicar((h) => substituirPresente(h, fn(h.presente)))

  const caixaVazia = (f: Folha, id: string | null) => {
    const c = id ? f.caixas.find((x) => x.id === id) : null
    return !!c && !caixaTemConteudo(c)
  }
  /** Desseleciona a caixa atual; no OneNote uma caixa que ficou vazia é descartada (como os contêineres do OneNote). */
  const soltarCaixa = () => {
    const id = selId
    setSelId(null); setFocoId(null)
    if (onenote && id) viva((f) => (caixaVazia(f, id) ? removerCaixa(f, id) : f))
  }

  const aoPalco = (e: React.PointerEvent<HTMLDivElement>) => {
    if (somenteLeitura || e.target !== e.currentTarget) return
    if (selTracos.length) setSelTracos([])
    if (ferr === 'caixa') {
      if (onenote && selId) { soltarCaixa(); return } // 1º clique só solta a caixa em edição; o próximo cria outra
      const r = e.currentTarget.getBoundingClientRect()
      const id = gerarId()
      const x = (e.clientX - r.left) / zoom, y = (e.clientY - r.top) / zoom
      aplicar((h) => {
        const base = onenote ? crescerPara(h.presente, x + 300, y + 140) : h.presente
        const f = adicionarCaixa(base, { id, x, y, livre: onenote })
        if (f === base) { setAviso('Limite de caixas atingido.'); return h }
        return registrar(h, expandirSeNecessario(f))
      })
      setSelId(id)
      setFocoId(id)
      if (!onenote) setFerramenta('selecionar')
      return
    }
    if (ferr === 'selecionar') { if (onenote) soltarCaixa(); else { setSelId(null); setFocoId(null) } }
  }

  const trocarFerramenta = (f: FerramentaFolha) => {
    setFerramenta(f)
    if (f !== 'selecionar' && f !== 'caixa') { setSelId(null); setFocoId(null) }
  }
  // OneNote: ao sair de Selecionar/Laço/Texto, solta seleções.
  useEffect(() => {
    if (!onenote) return
    if (ferr !== 'selecionar' && ferr !== 'laco') setSelTracos([])
    if (ferr !== 'selecionar' && ferr !== 'caixa') { setSelId(null); setFocoId(null) }
  }, [onenote, ferr])

  const aoSelecionarTracos = (ids: string[]) => { setSelTracos(ids); if (ids.length) { setSelId(null); setFocoId(null) } }
  const excluirTracosSel = useCallback(() => {
    setSelTracos((ids) => { if (ids.length) aplicarRef.current((h) => registrar(h, removerTracos(h.presente, ids))); return [] })
  }, [])

  // ---- editor ativo (caixa focada) -> ribbon ----
  const definirEditorAtivo = useCallback((ed: Editor | null) => {
    if (editorAtivo.current === ed) return
    editorAtivo.current = ed
    aoEditorRef.current?.(ed)
  }, [])
  const liberarEditor = useCallback((ed: Editor) => { if (editorAtivo.current === ed) definirEditorAtivo(null) }, [definirEditorAtivo])
  // Sem caixa selecionada ou com ferramenta de tinta ativa, os comandos de texto do ribbon ficam sem editor (desabilitados).
  useEffect(() => { if (!selId || !boxesInterativas) definirEditorAtivo(null) }, [selId, boxesInterativas, definirEditorAtivo])
  useEffect(() => () => { if (editorAtivo.current) { editorAtivo.current = null; aoEditorRef.current?.(null) } }, [])

  /**
   * Desfazer/refazer: com uma caixa focada que TEM histórico próprio, o TipTap desfaz a digitação; senão desfaz a FOLHA
   * (caixas, tinta, movimentos). Nunca os dois no mesmo comando.
   */
  const historico = useCallback((dir: 'desfazer' | 'refazer') => {
    const ed = editorAtivo.current
    const foco = !!ed && !ed.isDestroyed && ed.isFocused
    if (foco && dir === 'desfazer' && ed!.can().undo()) { ed!.commands.undo(); return }
    if (foco && dir === 'refazer' && ed!.can().redo()) { ed!.commands.redo(); return }
    snapshot.current = null // a edição contínua em curso deixa de valer: o estado muda por baixo dela
    aplicarRef.current(dir === 'desfazer' ? desfazer : refazer)
    if (foco) snapshot.current = histRef.current.presente // recomeça a sessão de digitação a partir do novo estado
  }, [])
  const historicoRef = useRef(historico); historicoRef.current = historico

  // ---- ponte com o ribbon (desfazer/refazer) + atalhos de teclado (modo OneNote) ----
  useEffect(() => {
    if (!onenote || somenteLeitura) return
    atualizarDesenho({ folhaAtiva: true, acoes: { desfazer: () => historicoRef.current('desfazer'), refazer: () => historicoRef.current('refazer') } })
    return () => atualizarDesenho({ folhaAtiva: false, acoes: { desfazer: null, refazer: null } })
  }, [onenote, somenteLeitura])
  useEffect(() => {
    if (!onenote || somenteLeitura) return
    const f = (e: KeyboardEvent) => {
      if (interativo(e.target)) return
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey
      if (mod && k === 'z') { e.preventDefault(); aplicarRef.current(e.shiftKey ? refazer : desfazer) }
      else if (mod && k === 'y') { e.preventDefault(); aplicarRef.current(refazer) }
      else if (k === 'delete' || k === 'backspace') { if (selTracosRef.current.length) { e.preventDefault(); excluirTracosSel() } }
      else if (k === 'escape') setSelTracos([])
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onenote, somenteLeitura, excluirTracosSel])
  selTracosRef.current = selTracos

  // ---- tamanho do palco ----
  const W = onenote ? Math.max(folha.largura, Math.ceil(cont.w / zoom)) : folha.largura
  const H = onenote ? Math.max(folha.altura, Math.ceil(cont.h / zoom)) : folha.altura

  // Callbacks das caixas com identidade ESTÁVEL (proxies para a versão mais recente): o React.memo das caixas só re-renderiza a caixa que mudou.
  const cx = useRef<Record<string, (...a: any[]) => any>>({})
  cx.current = {
    aoSelecionar: (id: string) => { setSelId(id); setSelTracos([]); aplicar((h) => { const f = trazerParaFrente(h.presente, id); return f === h.presente ? h : substituirPresente(h, f) }) },
    aoInicioGesto: inicioGesto, aoFimGesto: fimGesto,
    aoMover: (id: string, x: number, y: number) => viva((f) => expandirSeNecessario(moverCaixa(f, id, x, y, onenote))),
    aoRedimensionar: (id: string, w: number, h2: number) => viva((f) => expandirSeNecessario(redimensionarCaixa(f, id, w, h2, onenote))),
    aoDoc: (id: string, d: Record<string, unknown>) => viva((f) => atualizarDocCaixa(f, id, d)),
    aoAltura: (id: string, h: number) => viva((f) => expandirSeNecessario(ajustarAlturaCaixa(f, id, h))),
    aoExcluir: (id: string) => { setSelId(null); aplicar((h) => registrar(h, removerCaixa(h.presente, id))) },
  }
  const cb = useMemo(() => ({
    aoSelecionar: (id: string) => cx.current.aoSelecionar(id),
    aoInicioGesto: () => cx.current.aoInicioGesto(),
    aoFimGesto: () => cx.current.aoFimGesto(),
    aoMover: (id: string, x: number, y: number) => cx.current.aoMover(id, x, y),
    aoRedimensionar: (id: string, w: number, h: number) => cx.current.aoRedimensionar(id, w, h),
    aoDoc: (id: string, d: Record<string, unknown>) => cx.current.aoDoc(id, d),
    aoAltura: (id: string, h: number) => cx.current.aoAltura(id, h),
    aoExcluir: (id: string) => cx.current.aoExcluir(id),
    aoHistoricoFolha: (dir: 'desfazer' | 'refazer') => historicoRef.current(dir),
  }), [])

  const raiz: CSSProperties = onenote
    ? { ...VARS_COR_ONENOTE, display: 'flex', flexDirection: 'column', width: '100%', height: altura, minHeight: 0, background: 'transparent', color: 'var(--ink)', overflow: 'hidden' }
    : { ...VARS_COR, display: 'flex', flexDirection: 'column', width: '100%', height: altura, minHeight: 480, background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }

  const tintaAtiva = camada === 'caneta' || camada === 'marca-texto' || camada === 'borracha' || camada === 'laco'

  return (
    <div style={raiz} data-folha-livre>
      {!somenteLeitura && !onenote && (
        <BarraFerramentasFolha
          ferramenta={ferramenta}
          aoFerramenta={trocarFerramenta}
          cor={cor}
          aoCor={(c) => { setCor(c); if (ferramenta === 'borracha' || ferramenta === 'mao' || ferramenta === 'selecionar' || ferramenta === 'caixa') setFerramenta('caneta') }}
          espessura={espessura}
          aoEspessura={setEspessura}
          podeDesfazer={podeDesfazer(hist)}
          podeRefazer={podeRefazer(hist)}
          aoDesfazer={() => aplicar(desfazer)}
          aoRefazer={() => aplicar(refazer)}
          soCaneta={soCaneta}
          aoSoCaneta={setSoCaneta}
          zoom={zoom}
          aoZoom={(z) => setZoom(z)}
          temSelecao={!!selId}
          aoExcluirSelecao={() => { if (selId) { const id = selId; setSelId(null); aplicar((h) => registrar(h, removerCaixa(h.presente, id))) } }}
        />
      )}
      {aviso && <div role="status" style={{ padding: '6px 12px', fontSize: 13, background: onenote ? 'var(--surface2)' : 'var(--muted)', color: 'inherit', borderBottom: '1px solid var(--border, var(--line))' }}>{aviso}</div>}
      <div
        ref={scrollRef}
        style={{
          flex: 1, minHeight: 0, overflow: 'auto', background: onenote ? 'transparent' : 'var(--muted)', overscrollBehavior: 'contain',
          touchAction: tintaAtiva ? undefined : 'pan-x pan-y pinch-zoom',
        }}
      >
        <div style={{ width: W * zoom, height: H * zoom, margin: onenote ? 0 : '0 auto', position: 'relative', flex: '0 0 auto' }}>
          <div
            ref={palcoRef}
            onPointerDown={aoPalco}
            style={{
              position: 'absolute', left: 0, top: 0, width: W, height: H, transform: `scale(${zoom})`, transformOrigin: '0 0',
              ...(onenote
                ? { backgroundColor: dz.pagina.fundoCor ?? 'transparent', backgroundImage: dz.pagina.fundoImg ?? undefined, backgroundPosition: '0 8px' }
                : { backgroundColor: 'var(--card)', backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '28px 28px', boxShadow: '0 0 0 1px var(--border)' }),
              cursor: ferr === 'caixa' ? 'text' : undefined,
            }}
          >
            {folha.caixas.map((c) => (
              <CaixaTextoFolha
                key={c.id}
                caixa={c}
                zoom={zoom}
                selecionada={selId === c.id}
                interativa={boxesInterativas}
                somenteLeitura={somenteLeitura}
                autoFoco={focoId === c.id}
                modoEstatico={modoEstatico}
                aoSelecionar={cb.aoSelecionar}
                aoInicioGesto={cb.aoInicioGesto}
                aoFimGesto={cb.aoFimGesto}
                aoMover={cb.aoMover}
                aoRedimensionar={cb.aoRedimensionar}
                aoDoc={cb.aoDoc}
                aoAltura={cb.aoAltura}
                aoEditorAtivo={definirEditorAtivo}
                aoEditorLiberado={liberarEditor}
                aoHistoricoFolha={cb.aoHistoricoFolha}
                aoExcluir={cb.aoExcluir}
              />
            ))}
            <CamadaTinta
              tracos={folha.tracos}
              largura={W}
              altura={H}
              ferramenta={camada}
              cor={corPena}
              espessura={largPena}
              modoBorracha={onenote ? dz.borracha.modo : 'traco'}
              raioBorracha={onenote ? RAIO_BORRACHA_PX[dz.borracha.tamanho] : 10}
              toque={toque}
              somenteLeitura={somenteLeitura}
              zoom={zoom}
              scrollRef={scrollRef}
              palcoRef={palcoRef}
              visivel={visivel}
              selecao={selTracos}
              aoTraco={aoTraco}
              aoSelecionar={aoSelecionarTracos}
              aoVivo={aoVivo}
              aoInicioGesto={inicioGesto}
              aoFimGesto={fimGesto}
              aoConfirmar={aoConfirmar}
              aoZoom={(z, cx, cy) => setZoom(z, cx, cy)}
              aoPenVisto={() => setPenVisto(true)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
