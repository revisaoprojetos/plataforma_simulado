'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  ArrowLeft, ScrollText, BookOpen, Rows3, ChevronLeft, ChevronRight, Minus, Plus,
  Sun, Moon, Coffee, CheckCircle2, Loader2, X, PanelLeft, Highlighter, Trash2, StickyNote, Crosshair, Search, ChevronUp, ChevronDown, Star,
  Undo2, Redo2, RotateCcw, Eraser,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DocumentoCarregado, AnotacaoAluno } from '@/lib/leitura/acesso'
import { construirEspinha, rangeParaAncora, ancoraParaRange, rectsDoRange, type Espinha, type RectRel } from '@/lib/leitura/anotacoes-engine'
import { QuestaoLeitura } from '@/components/aluno/questao-leitura'
import { LeituraAtualizacaoAviso } from '@/components/aluno/leitura-atualizacao-aviso'
import { GRIFOS, corDoGrifo, ehEstrutural } from '@/lib/leitura/grifos'

type Modo = 'scroll' | 'flip' | 'capitulo'
type Tema = 'claro' | 'sepia' | 'escuro'
interface Secao { id: string; art: number; label: string; tipo: string; nivel: number }
// #3 — histórico de grifos (voltar/avançar). Cada ação é um "batch" (o reset apaga vários de uma vez).
type AcaoGrifo =
  | { k: 'add'; a: AnotacaoAluno }
  | { k: 'del'; a: AnotacaoAluno }
  | { k: 'upd'; id: string; de: { cor: string; nota: string | null }; para: { cor: string; nota: string | null } }

// bg = painéis (aside/topo) · desk = "mesa" atrás do papel · sheet = a folha da leitura.
const TEMAS: Record<Tema, { bg: string; fg: string; muted: string; desk: string; sheet: string }> = {
  claro: { bg: '#ffffff', fg: '#1f2937', muted: '#6b7280', desk: '#eef0f3', sheet: '#ffffff' },
  sepia: { bg: '#f5ecd9', fg: '#4b3f2f', muted: '#8a7a5c', desk: '#e6d8ba', sheet: '#fbf6ea' },
  escuro: { bg: '#1a1a1e', fg: '#d8d8dc', muted: '#8a8a92', desk: '#0f0f12', sheet: '#26262c' },
}
const GAP = 48 // entre "páginas" no modo virar
const CORES_GRIFO = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fca5a5'] // amarelo/verde/azul/rosa/vermelho
// useLayoutEffect só faz sentido no cliente (evita warning de SSR do leitor).
const useIsoLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect

// Barra de LEGENDA dos grifos — FIXA no topo da leitura (sticky). Ao rolar, fica colada no topo;
// no topo do documento, aparece "separada" (respiro + sombra leve). Substitui a caixa LEGENDA inline.
function LegendaBar({ cores, escuro, noTopo }: { cores: { fg: string; muted: string; sheet: string }; escuro: boolean; noTopo: boolean }) {
  const chip = 'rounded px-1.5 py-[3px] text-[11px] font-semibold leading-none'
  const tag = 'px-0.5 text-[11px] font-bold leading-none'
  return (
    <div className={cn('pointer-events-none sticky top-0 z-20 flex justify-center transition-[padding] duration-200', noTopo ? 'pt-3' : 'pt-2')}>
      <div className={cn('pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-1 rounded-full border px-3 py-1.5 backdrop-blur transition-shadow duration-200', noTopo ? 'shadow-sm' : 'shadow-md')}
        style={{ background: `${cores.sheet}${escuro ? 'e6' : 'f2'}`, borderColor: escuro ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.08)' }}>
        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: cores.muted }}>Legenda</span>
        <span className={chip} style={{ background: '#fff35c', color: '#111' }}>Núcleo</span>
        <span className={chip} style={{ background: '#a8d08d', color: '#111' }}>Complemento</span>
        <span className={chip} style={{ background: '#cc99ff', color: '#111' }}>Prazos</span>
        <span className={tag} style={{ color: cores.fg }}>crucial</span>
        <span className={tag} style={{ color: escuro ? '#f9a8a8' : '#c00000' }}>exceção</span>
        <span className="px-0.5 leading-none" style={{ color: cores.muted }}>·</span>
        <span className={tag} style={{ color: escuro ? '#8fb7f0' : '#2f6fd0' }}>STF</span>
        <span className={tag} style={{ color: escuro ? '#f0c65a' : '#c98a00' }}>STJ</span>
        <span className="px-0.5 text-[11px] font-medium leading-none" style={{ color: cores.muted }}>Equipe</span>
      </div>
    </div>
  )
}

export function LeitorDocumento({ doc, trilha }: {
  doc: DocumentoCarregado
  // Modo trilha (2 etapas): 'leitura' = leitura pura (SEM questões inline; ao concluir → CTA questões);
  // 'questoes' = painel read-only de consulta (documento + grifos, sem inline, sem concluir).
  trilha?: { modo: 'leitura' | 'questoes'; questoesHref?: string; voltarHref?: string }
}) {
  const [modo, setModo] = useState<Modo>((doc.prefs?.modo as Modo) || 'scroll')
  // Tema da leitura sincronizado com o claro/escuro do sistema (next-themes). Café (sepia) é override
  // manual e NÃO acompanha o sistema. Sem preferência salva, o inicial é o tema do sistema.
  const { resolvedTheme, setTheme } = useTheme()
  const temaSalvo = (doc.prefs?.tema as Tema) || null
  const [tema, setTema] = useState<Tema>(temaSalvo ?? 'claro')
  const seguirSistema = useRef(temaSalvo == null || temaSalvo === 'claro' || temaSalvo === 'escuro')
  useEffect(() => {
    if (!resolvedTheme || !seguirSistema.current) return
    setTema(resolvedTheme === 'dark' ? 'escuro' : 'claro')
  }, [resolvedTheme])
  // Escolha do tema no leitor: claro/escuro também mudam o sistema (mantém sincronizado); café só o leitor.
  const escolherTema = (t: Tema) => {
    setTema(t)
    if (t === 'sepia') seguirSistema.current = false
    else { seguirSistema.current = true; setTheme(t === 'escuro' ? 'dark' : 'light') }
  }
  const [fonte, setFonte] = useState(doc.prefs?.fonte || 18)
  const [favorito, setFavorito] = useState(!!doc.favorito)
  const [menuAberto, setMenuAberto] = useState(true)
  const [pct, setPct] = useState(doc.progresso.pct)
  const [concluido, setConcluido] = useState(doc.progresso.concluido)
  const [concluindo, setConcluindo] = useState(false)
  const [secoes, setSecoes] = useState<Secao[]>([])
  // Modo capítulo: navega pelos títulos estruturais (nível 0). capAtual = índice do capítulo atual.
  const [capAtual, setCapAtual] = useState(0)
  // Capítulo = cabeçalho estrutural cujo rótulo começa por "Capítulo" (robusto ao tipo do parser).
  // Índice/sumário: SÓ capítulos (expansíveis) + artigos. §/inciso e "Livros do Tombo" (tabelas) ficam
  // de fora. Cada artigo guarda o capítulo-pai; capítulos começam recolhidos.
  const ehCap = (s: Secao) => s.tipo !== 'artigo' && /^\s*cap[íi]tulo\b/i.test(s.label)
  const capitulos = useMemo(() => secoes.filter(ehCap), [secoes])
  // Capítulo (índice) de cada seção — usado no modo Capítulo p/ o sumário saltar ao capítulo certo.
  const capDeSecao = useMemo(() => {
    const m = new Map<string, number>(); let ci = -1
    for (const s of secoes) { if (ehCap(s)) ci++; m.set(s.id, Math.max(0, ci)) }
    return m
  }, [secoes])
  // Agrupa o sumário em capítulos → artigos-filhos (artigos antes de qualquer capítulo caem em `cap:null`),
  // pra renderizar cada grupo num contêiner que anima abrir/fechar (grid-rows) com a linha de hierarquia.
  const tocGrupos = useMemo(() => {
    const grupos: { cap: Secao | null; artigos: Secao[] }[] = []
    let atual: { cap: Secao | null; artigos: Secao[] } | null = null
    for (const s of secoes) {
      if (ehCap(s)) { atual = { cap: s, artigos: [] }; grupos.push(atual) }
      else if (s.tipo === 'artigo') { if (!atual) { atual = { cap: null, artigos: [] }; grupos.push(atual) } atual.artigos.push(s) }
    }
    return grupos
  }, [secoes])
  const [tocAberto, setTocAberto] = useState<Set<string>>(new Set())
  const toggleCap = (id: string) => setTocAberto((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Modo virar-página
  const [pagina, setPagina] = useState(0)
  const [totalPag, setTotalPag] = useState(1)
  const [colW, setColW] = useState(0)
  const [noTopo, setNoTopo] = useState(true) // documento no topo → barra de legenda "separada"

  // Questões inline (Fase 2)
  // Indexado por docQuestaoId (slot único) — a MESMA questão pode aparecer em 2 pontos da lei;
  // indexar por questaoId marcaria os dois ao responder um só.
  const [respostas, setRespostas] = useState<Record<string, boolean>>(() => Object.fromEntries((doc.questoes ?? []).filter((q) => q.resposta).map((q) => [q.docQuestaoId, true])))
  const [slots, setSlots] = useState<{ q: DocumentoCarregado['questoes'][number]; el: HTMLElement }[]>([])

  // Busca dentro da lei
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [buscaQ, setBuscaQ] = useState('')
  const [matches, setMatches] = useState<{ rects: RectRel[]; el: HTMLElement | null }[]>([])
  const [matchIdx, setMatchIdx] = useState(0)

  // Grifos editoriais (conteúdo compartilhado) + modo sem grifos.
  // Memoizado: `doc.grifos ?? []` gerava um array NOVO a cada render → recomputarGrifos era recriado
  // e o efeito de layout repintava os grifos em TODO re-render (piscar ao expandir/clicar no sumário).
  const grifos = useMemo(() => doc.grifos ?? [], [doc.grifos])
  // Grifos "assados" no HTML (importados no padrão MAC → data-grifo/data-caixa;
  // ou o formato cru hl-*/box-* de importações antigas), além do overlay (doc.grifos).
  const temGrifosBaked = /data-grifo=|data-caixa=|\bhl-[ygr]\b|\bbox-(stj|stf|cinza|atencao)/.test(doc.html)
  const [semGrifos, setSemGrifos] = useState(!!doc.prefs?.semGrifos)
  const [grifosRects, setGrifosRects] = useState<Record<string, { rects: RectRel[]; tipo: string }>>({})

  // Anotações (grifos/notas)
  const [anotacoes, setAnotacoes] = useState<AnotacaoAluno[]>(doc.anotacoes ?? [])
  const [passado, setPassado] = useState<AcaoGrifo[][]>([]) // histórico p/ voltar
  const [futuro, setFuturo] = useState<AcaoGrifo[][]>([])   // p/ avançar
  const opLock = useRef(false) // impede reentrância (clique/Enter rápido) nas operações de grifo
  const [rectsPorId, setRectsPorId] = useState<Record<string, RectRel[]>>({})
  const [barraDir, setBarraDir] = useState(false)
  const [sel, setSel] = useState<{ anc: { inicio: number; fim: number; exact: string; prefix: string; suffix: string }; x: number; y: number } | null>(null)
  const [notaEdit, setNotaEdit] = useState<{ id: string; valor: string } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const espinhaRef = useRef<Espinha | null>(null)
  const espinhaHtmlRef = useRef<string>('')      // assinatura p/ reusar a espinha (só refaz quando o HTML muda)
  const artElsRef = useRef<HTMLElement[]>([])    // cache de [data-art] (evita querySelectorAll por frame de scroll)
  const dispElsRef = useRef<HTMLElement[]>([])   // cache de [data-disp]
  const retomouRef = useRef(false)               // retomar o último ponto só uma vez
  const artigoMaxRef = useRef(doc.progresso.artigoMax)
  const tempoRef = useRef(0)          // segundos acumulados desde o último flush
  const pctRef = useRef(doc.progresso.pct)
  const scrollRaf = useRef(0)
  const touchX = useRef<number | null>(null)
  const dispTopRef = useRef<string | null>(doc.ultimoDisp)
  const prefsRef = useRef(false)
  const cores = TEMAS[tema]

  // Salva preferências (debounced) ao mudar tema/fonte/modo/sem-grifos.
  useEffect(() => {
    if (!prefsRef.current) { prefsRef.current = true; return }
    const t = setTimeout(() => { fetch('/api/leitura/preferencias', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tema, fonte, modo, sem_grifos: semGrifos }) }).catch(() => {}) }, 800)
    return () => clearTimeout(t)
  }, [tema, fonte, modo, semGrifos])

  // Favoritar a lei.
  async function toggleFavorito() {
    setFavorito((v) => !v)
    try { const r = await fetch('/api/leitura/favorito', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documento_id: doc.id }) }); const j = await r.json(); if (typeof j?.favorito === 'boolean') setFavorito(j.favorito) } catch { /* ok */ }
  }

  // No mobile, começa com o menu fechado (a barra de 256px cobriria a leitura).
  useEffect(() => { if (typeof window !== 'undefined' && window.innerWidth < 768) setMenuAberto(false) }, [])

  // Retomar o último ponto lido (uma vez). Sem timeout fixo: reage a colW/modo até o layout ficar
  // pronto (no modo virar precisa da coluna medida); documentos grandes não caem no topo por atraso.
  useEffect(() => {
    if (retomouRef.current || !doc.ultimoDisp) return
    const el = contentRef.current?.querySelector<HTMLElement>(`[data-disp="${CSS.escape(doc.ultimoDisp)}"]`)
    if (!el) return
    if (modo === 'flip' && !colW) return // aguarda a medição da coluna
    retomouRef.current = true
    if (modo !== 'flip') el.scrollIntoView({ block: 'start' })
    else irPara(Math.floor(el.offsetLeft / (colW + GAP)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colW, modo, doc.ultimoDisp])

  // ── Sumário (TOC): prefere dispositivos ([data-disp], hierárquico); cai em [data-art]. ──
  useIsoLayout(() => {
    const root = contentRef.current
    if (!root) return
    const disp = Array.from(root.querySelectorAll<HTMLElement>('[data-disp]'))
    if (disp.length) {
      // Hierarquia do índice: CAPÍTULO/TÍTULO/SEÇÃO (0) → Art. (1) → § (2) → inciso (3) → alínea (4).
      const NIVEL_TIPO: Record<string, number> = { livro: 0, parte: 0, titulo: 0, capitulo: 0, secao: 0, subsecao: 0, artigo: 1, paragrafo: 2, inciso: 3, alinea: 4, item: 4 }
      setSecoes(disp.map((el) => {
        const id = el.getAttribute('data-disp') || ''
        const tipo = el.getAttribute('data-disp-tipo') || 'artigo'
        const nivel = NIVEL_TIPO[tipo] ?? Math.min(4, (id.match(/\./g) || []).length + 1)
        return { id, art: 0, tipo, nivel, label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70) || id }
      }))
      return
    }
    const nós = Array.from(root.querySelectorAll<HTMLElement>('[data-art]'))
    setSecoes(nós.map((el) => ({
      id: el.id || `art-${el.getAttribute('data-art')}`, art: Number(el.getAttribute('data-art')) || 0, tipo: 'artigo', nivel: 0,
      label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) || `Seção ${el.getAttribute('data-art')}`,
    })))
  }, [doc.html])

  // Cache dos nós de âncora — o progresso lê [data-art]/[data-disp] a cada frame de scroll; sem o
  // cache seria um querySelectorAll por frame (trava em leis grandes). Refaz só quando o DOM muda.
  useIsoLayout(() => {
    const root = contentRef.current
    artElsRef.current = root ? Array.from(root.querySelectorAll<HTMLElement>('[data-art]')) : []
    dispElsRef.current = root ? Array.from(root.querySelectorAll<HTMLElement>('[data-disp]')) : []
  }, [doc.html, slots])

  // ── Injeta as questões inline logo após o artigo indicado (contêiner no DOM; o card é
  //    renderizado por PORTAL). O texto delas é ignorado pela espinha das anotações. ──
  useIsoLayout(() => {
    const root = contentRef.current
    // Em modo trilha as questões NÃO são inline (viram etapa separada) → não injeta nada.
    if (!root || trilha) { setSlots([]); return }
    root.querySelectorAll('[data-leitura-q]').forEach((n) => n.remove())
    if (!doc.questoes?.length) { setSlots([]); return }
    const arts = Array.from(root.querySelectorAll<HTMLElement>('[data-art]'))
    const novos: { q: DocumentoCarregado['questoes'][number]; el: HTMLElement }[] = []
    for (const q of doc.questoes) {
      const container = document.createElement('div')
      container.setAttribute('data-leitura-q', q.docQuestaoId)
      const prox = arts.find((el) => Number(el.getAttribute('data-art')) > q.aposArtigo)
      if (prox && prox.parentElement) prox.parentElement.insertBefore(container, prox)
      else root.appendChild(container)
      novos.push({ q, el: container })
    }
    setSlots(novos)
  }, [doc.html, doc.questoes, trilha?.modo])

  // ── Modo CAPÍTULO: mostra SÓ o capítulo atual (esconde os demais blocos do conteúdo). ──
  // Cada capítulo vira uma "parte" separada; navega-se pela barra do topo. Restaura tudo ao sair.
  // Roda ANTES da medição do modo Virar p/ o total de páginas ser medido com tudo visível.
  useIsoLayout(() => {
    const ct = contentRef.current
    if (!ct) return
    const kids = Array.from(ct.children) as HTMLElement[]
    const restaura = () => kids.forEach((k) => { if (!k.hasAttribute('data-legenda-oculta')) k.style.removeProperty('display') })
    if (modo !== 'capitulo' || capitulos.length === 0) { restaura(); return }
    // Títulos de capítulo direto do DOM VIVO (mesma regra do sumário) — não depende dos ids salvos.
    const capEls = Array.from(ct.querySelectorAll<HTMLElement>('[data-disp]')).filter((el) => {
      const tipo = el.getAttribute('data-disp-tipo') || 'artigo'
      const label = (el.textContent || '').replace(/\s+/g, ' ').trim()
      return tipo !== 'artigo' && /^\s*cap[íi]tulo\b/i.test(label)
    })
    if (capEls.length === 0) { restaura(); return }
    // Capítulo de cada bloco, por ORDEM no documento: quando um bloco É/CONTÉM um título de capítulo,
    // o capítulo corrente passa a ser aquele; blocos antes do 1º capítulo ficam em -1 (introdução).
    const capDoBloco: number[] = []
    let atual = -1
    for (const k of kids) {
      for (let ci = 0; ci < capEls.length; ci++) { const ce = capEls[ci]; if (ce === k || k.contains(ce)) atual = ci }
      capDoBloco.push(atual)
    }
    const cur = Math.min(Math.max(0, capAtual), capEls.length - 1)
    let algumVisivel = false
    kids.forEach((k, i) => {
      if (k.hasAttribute('data-legenda-oculta')) return
      const cap = capDoBloco[i]
      const visivel = cap === cur || (cur === 0 && cap === -1) // intro acompanha o 1º capítulo
      if (visivel) algumVisivel = true
      k.style.display = visivel ? '' : 'none'
    })
    // Segurança: se a estrutura não permitiu isolar (nada visível), mostra tudo em vez de tela vazia.
    if (!algumVisivel) restaura()
    window.dispatchEvent(new Event('resize')) // realinha os grifos para o capítulo visível
  }, [modo, capAtual, capitulos, doc.html, slots])

  // ── Medição do modo virar-página ──
  // 1) Largura da coluna = largura REAL da coluna = caixa de conteúdo do texto (clientWidth do
  //    conteúdo MENOS o padding horizontal). Usar a largura da viewport ignorava o `px-6` (48px):
  //    a coluna saía com colW-48 mas o translate/totalPag usavam colW → desalinhava e a página
  //    seguinte "vazava" na borda direita. Medir a caixa de conteúdo casa coluna×paginação.
  useIsoLayout(() => {
    const medirColW = () => {
      const el = contentRef.current
      if (!el) return
      const cs = getComputedStyle(el)
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
      setColW(Math.max(0, el.clientWidth - padX))
    }
    medirColW()
    const ro = new ResizeObserver(medirColW)
    if (contentRef.current) ro.observe(contentRef.current)
    if (viewportRef.current) ro.observe(viewportRef.current)
    return () => ro.disconnect()
  }, [modo])

  // 2) Total de páginas — recalcula quando colW/fonte/conteúdo mudam (colunas já no DOM).
  useIsoLayout(() => {
    if (modo !== 'flip') { setTotalPag(1); return }
    const ct = contentRef.current
    if (!ct || !colW) return
    const passo = colW + GAP
    let total = Math.max(1, Math.round(ct.scrollWidth / passo))
    // Evita a "página vazia" no fim (margem/whitespace no fim do texto empurra p/ uma coluna a mais):
    // limita o total pela coluna do ÚLTIMO elemento com conteúdo (offsetLeft é imune ao transform).
    let maxOff = 0
    for (const el of ct.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, li, td, th, blockquote, img, table')) {
      if (el.offsetLeft > maxOff) maxOff = el.offsetLeft
    }
    if (maxOff > 0) total = Math.min(total, Math.floor(maxOff / passo) + 1)
    setTotalPag(total)
    setPagina((p) => Math.min(p, total - 1))
  }, [modo, colW, fonte, doc.html, slots])

  // ── Grifos: (re)calcula os retângulos do overlay. Coords LOCAIS ao overlay → imunes ao
  // translateX (virar) e ao scroll (as diferenças cancelam a transformação); por isso só
  // recalcula em REFLUXO (modo/fonte/colW/conteúdo/lista), nunca a cada página ou pixel. ──
  const recomputarGrifos = useCallback(() => {
    const root = contentRef.current, ov = overlayRef.current
    if (!root || !ov) return
    // A espinha (texto) só muda com o HTML; modo/fonte/colW mudam só o LAYOUT (rects). Reusa a espinha
    // memoizada nesses refluxos — construí-la varre todos os text nodes (caro em leis grandes).
    let esp = espinhaRef.current
    if (!esp || espinhaHtmlRef.current !== doc.html) { esp = construirEspinha(root); espinhaRef.current = esp; espinhaHtmlRef.current = doc.html }
    const base = ov.getBoundingClientRect()
    const map: Record<string, RectRel[]> = {}
    for (const a of anotacoes) {
      const range = ancoraParaRange(esp, { inicio: a.inicio, fim: a.fim, exact: a.exact, prefix: a.prefix, suffix: a.suffix })
      if (range) { const rs = rectsDoRange(range, base); if (rs.length) map[a.id] = rs }
    }
    setRectsPorId(map)
    // Grifos editoriais (mesmo motor de rects)
    const gmap: Record<string, { rects: RectRel[]; tipo: string }> = {}
    for (const g of grifos) {
      const range = ancoraParaRange(esp, { inicio: g.inicio, fim: g.fim, exact: g.exact, prefix: g.prefix, suffix: g.suffix })
      if (range) { const rs = rectsDoRange(range, base); if (rs.length) gmap[g.id] = { rects: rs, tipo: g.tipo } }
    }
    setGrifosRects(gmap)
  }, [anotacoes, grifos, doc.html])
  useIsoLayout(() => { recomputarGrifos() }, [recomputarGrifos, modo, colW, fonte, doc.html, slots])

  // Reflow por RESIZE real da janela E pelo colapso/expansão das caixas STJ/STF (que disparam
  // um 'resize' sintético): sem isto o overlay de grifos desalinha e a paginação (flip) fica
  // errada, pois o ResizeObserver só observa a largura da viewport (não a altura do conteúdo).
  useEffect(() => {
    const onResize = () => {
      recomputarGrifos()
      if (modo === 'flip') {
        const ct = contentRef.current
        if (ct && colW) {
          const total = Math.max(1, Math.round(ct.scrollWidth / (colW + GAP)))
          setTotalPag(total)
          setPagina((p) => Math.min(p, total - 1))
        }
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [recomputarGrifos, modo, colW])

  // ── Busca dentro da lei: acha ocorrências na espinha, gera rects p/ realçar + navegar. ──
  // Debounce: não reconstrói a espinha/varre a cada tecla (custo alto em leis grandes).
  useIsoLayout(() => {
    const root = contentRef.current, ov = overlayRef.current
    const q = buscaQ.trim()
    if (!root || !ov || q.length < 2) { setMatches([]); return }
    const t = setTimeout(() => {
      const esp = espinhaRef.current ?? construirEspinha(root)
      const base = ov.getBoundingClientRect()
      const S = esp.S, ql = q.toLowerCase(), Sl = S.toLowerCase()
      const res: { rects: RectRel[]; el: HTMLElement | null }[] = []
      let i = Sl.indexOf(ql)
      while (i >= 0 && res.length < 500) {
        const range = ancoraParaRange(esp, { inicio: i, fim: i + q.length, exact: S.slice(i, i + q.length), prefix: '', suffix: '' })
        if (range) { const rs = rectsDoRange(range, base); if (rs.length) res.push({ rects: rs, el: range.startContainer.parentElement }) }
        i = Sl.indexOf(ql, i + Math.max(1, q.length))
      }
      setMatches(res); setMatchIdx((idx) => Math.min(idx, Math.max(0, res.length - 1)))
    }, 180)
    return () => clearTimeout(t)
  }, [buscaQ, modo, colW, fonte, doc.html, slots])

  // ── Cálculo de progresso (%, artigo alcançado) ──
  const atualizarProgresso = useCallback(() => {
    const vp = viewportRef.current, ct = contentRef.current
    if (!vp || !ct) return
    const artEls = artElsRef.current, dispEls = dispElsRef.current
    let p = 0
    if (modo !== 'flip') {
      setNoTopo(vp.scrollTop <= 2) // barra de legenda: separada no topo, colada ao rolar
      const max = ct.scrollHeight - vp.clientHeight
      // cabe na viewport → 100% (o aluno vê tudo); mas não conta 100% em conteúdo ainda não medido.
      p = max <= 0 ? (ct.scrollHeight > 4 ? 100 : 0) : Math.round((vp.scrollTop / max) * 100)
      // artigo alcançado: última âncora acima do fim da viewport
      const limite = vp.scrollTop + vp.clientHeight
      for (const el of artEls) {
        if (el.offsetTop <= limite) artigoMaxRef.current = Math.max(artigoMaxRef.current, Number(el.getAttribute('data-art')) || 0)
      }
    } else {
      p = totalPag <= 1 ? 100 : Math.round(((pagina + 1) / totalPag) * 100)
      const limite = (pagina + 1) * (colW + GAP)
      for (const el of artEls) {
        if (el.offsetLeft < limite) artigoMaxRef.current = Math.max(artigoMaxRef.current, Number(el.getAttribute('data-art')) || 0)
      }
    }
    // Último ponto: dispositivo topo visível (para retomar depois).
    let topo: string | null = null
    for (const el of dispEls) {
      const passou = modo !== 'flip' ? el.offsetTop <= vp.scrollTop + 8 : el.offsetLeft <= pagina * (colW + GAP) + 8
      if (passou) topo = el.getAttribute('data-disp')
    }
    if (topo) dispTopRef.current = topo
    p = Math.min(100, Math.max(0, p))
    if (p > pctRef.current) { pctRef.current = p; setPct(p) }
  }, [modo, pagina, totalPag, colW])

  useEffect(() => { atualizarProgresso() }, [pagina, atualizarProgresso])

  // Scroll é frequente → recalcula no máx. 1x por frame (rAF), sem varrer o DOM a cada pixel.
  const onScroll = useCallback(() => {
    if (scrollRaf.current) return
    scrollRaf.current = requestAnimationFrame(() => { scrollRaf.current = 0; atualizarProgresso() })
  }, [atualizarProgresso])

  // ── Heartbeat: acumula tempo de leitura (só com aba visível) e envia progresso ──
  const flush = useCallback((concluir = false) => {
    const inc = tempoRef.current; tempoRef.current = 0
    const body = JSON.stringify({ documento_id: doc.id, versao: doc.versao, pct: pctRef.current, artigo_max: artigoMaxRef.current, tempo_inc: inc, concluir })
    return fetch('/api/leitura/progresso', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  }, [doc.id, doc.versao])

  const pontoSalvoRef = useRef<string | null>(doc.ultimoDisp)
  const salvarPonto = useCallback(() => {
    const d = dispTopRef.current
    if (!d || d === pontoSalvoRef.current) return
    pontoSalvoRef.current = d
    fetch('/api/leitura/ponto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documento_id: doc.id, versao: doc.versao, disp_id: d }) }).catch(() => {})
  }, [doc.id, doc.versao])

  useEffect(() => {
    const tick = setInterval(() => { if (document.visibilityState === 'visible') tempoRef.current += 1 }, 1000)
    const save = setInterval(() => { if (tempoRef.current > 0) flush().catch(() => {}); salvarPonto() }, 20000)
    // Ao esconder/fechar a aba: envia o tempo pendente via sendBeacon e ZERA (senão o próximo
    // flush contaria o mesmo tempo de novo). Listeners nomeados p/ remover no cleanup (sem leak).
    const onHide = () => {
      // Último ponto (mesmo sem tempo pendente) — o cleanup do React pode não rodar ao fechar a aba.
      const d = dispTopRef.current
      if (d && d !== pontoSalvoRef.current) {
        pontoSalvoRef.current = d
        navigator.sendBeacon?.('/api/leitura/ponto', new Blob([JSON.stringify({ documento_id: doc.id, versao: doc.versao, disp_id: d })], { type: 'application/json' }))
      }
      if (tempoRef.current <= 0) return
      const body = new Blob([JSON.stringify({ documento_id: doc.id, versao: doc.versao, pct: pctRef.current, artigo_max: artigoMaxRef.current, tempo_inc: tempoRef.current })], { type: 'application/json' })
      navigator.sendBeacon?.('/api/leitura/progresso', body)
      tempoRef.current = 0
    }
    const onVis = () => { if (document.visibilityState === 'hidden') onHide() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)
    return () => {
      clearInterval(tick); clearInterval(save)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
      flush().catch(() => {}); salvarPonto()
    }
  }, [flush, salvarPonto, doc.id, doc.versao])

  // ── Navegação virar-página (teclado) ──
  const irPara = useCallback((p: number) => setPagina((cur) => Math.min(Math.max(0, p), totalPag - 1)), [totalPag])
  useEffect(() => {
    if (modo !== 'flip') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); irPara(pagina + 1) }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); irPara(pagina - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modo, pagina, irPara])

  // ── Swipe (mobile) no modo virar-página ──
  function onTouchStart(e: React.TouchEvent) { touchX.current = e.touches[0]?.clientX ?? null }
  function onTouchEnd(e: React.TouchEvent) {
    if (modo !== 'flip' || touchX.current == null) return
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current
    if (Math.abs(dx) > 40) irPara(pagina + (dx < 0 ? 1 : -1))
    touchX.current = null
  }

  const flashAlvo = (el: HTMLElement) => {
    el.classList.remove('leitura-alvo'); void el.offsetWidth; el.classList.add('leitura-alvo')
    window.setTimeout(() => el.classList.remove('leitura-alvo'), 1700)
  }

  // Modo Capítulo: navega trocando o capítulo mostrado (um por vez) + volta ao topo.
  const irCapitulo = useCallback((i: number) => {
    setCapAtual(Math.max(0, Math.min(capitulos.length - 1, i)))
    requestAnimationFrame(() => viewportRef.current?.scrollTo({ top: 0 }))
  }, [capitulos.length])

  // ── Pular para uma seção (sumário) ──
  function pular(s: Secao) {
    const root = contentRef.current
    // No modo Capítulo, o alvo pode estar num capítulo oculto → troca de capítulo primeiro e rola depois.
    if (modo === 'capitulo') {
      setCapAtual(capDeSecao.get(s.id) ?? 0)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = contentRef.current?.querySelector<HTMLElement>(`[data-disp="${CSS.escape(s.id)}"]`) ?? contentRef.current?.querySelector<HTMLElement>(`[data-art="${s.art}"]`)
        if (!el) return
        el.scrollIntoView({ behavior: 'smooth', block: 'center' }); flashAlvo(el)
      }))
      return
    }
    const el = root?.querySelector<HTMLElement>(`[data-disp="${CSS.escape(s.id)}"]`) ?? root?.querySelector<HTMLElement>(`#${CSS.escape(s.id)}`) ?? root?.querySelector<HTMLElement>(`[data-art="${s.art}"]`)
    if (!el) return
    if (modo !== 'flip') { el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
    else { const alvo = Math.floor(el.offsetLeft / (colW + GAP)); irPara(alvo) }
    flashAlvo(el)
  }

  function irMatch(delta: number) {
    if (!matches.length) return
    const n = (matchIdx + delta + matches.length) % matches.length
    setMatchIdx(n)
    const el = matches[n]?.el
    if (!el) return
    if (modo !== 'flip') el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    else irPara(Math.floor(el.offsetLeft / (colW + GAP)))
  }

  // ── Anotações: seleção → popover, criar/editar/excluir, pular ──
  function aoSelecionar() {
    const s = window.getSelection()
    const root = contentRef.current, cont = containerRef.current
    if (!s || s.isCollapsed || s.rangeCount === 0 || !root || !cont) { setSel(null); return }
    const range = s.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return
    const esp = espinhaRef.current ?? construirEspinha(root)
    const anc = rangeParaAncora(root, esp, range)
    if (!anc || !anc.exact.trim()) return
    const rc = range.getBoundingClientRect(), cr = cont.getBoundingClientRect()
    setSel({ anc, x: Math.min(Math.max(60, rc.left + rc.width / 2 - cr.left), cr.width - 60), y: rc.bottom - cr.top + 6 })
  }

  // ── Primitivas (API + estado). IDs são ESTÁVEIS: exclusão é soft-delete e "voltar" é undelete
  //    do MESMO id (nunca recria) — então os batches do histórico podem ser reusados sem
  //    reescrever ids, e o vínculo base_id/origem é preservado. ──
  async function inserirServidor(a: AnotacaoAluno): Promise<AnotacaoAluno | null> {
    // Única fonte de IDs NOVOS: a ação de grifar do usuário.
    try {
      const res = await fetch('/api/leitura/anotacao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documento_id: doc.id, versao: doc.versao, inicio_char: a.inicio, fim_char: a.fim, exact: a.exact, prefix: a.prefix, suffix: a.suffix, cor: a.cor, nota: a.nota }) })
      const j = await res.json()
      if (!j?.ok) return null
      const novo: AnotacaoAluno = { ...a, id: j.id, origem: 'propria' }
      setAnotacoes((p) => [...p, novo])
      return novo
    } catch { return null }
  }
  // Retornam ok:boolean e REVERTEM o estado otimista em falha (rede/servidor) — antes engoliam o
  // erro e deixavam a UI dessincronizada do banco silenciosamente.
  async function removerServidor(a: AnotacaoAluno): Promise<boolean> {
    setAnotacoes((p) => p.filter((x) => x.id !== a.id))
    try { const r = await fetch(`/api/leitura/anotacao?id=${a.id}`, { method: 'DELETE' }); if (!r.ok) throw 0; return true }
    catch { setAnotacoes((p) => (p.some((x) => x.id === a.id) ? p : [...p, a])); return false }
  }
  async function restaurarServidor(a: AnotacaoAluno): Promise<boolean> {
    setAnotacoes((p) => (p.some((x) => x.id === a.id) ? p : [...p, a]))
    try { const r = await fetch('/api/leitura/anotacao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: a.id, restaurar: true, cor: a.cor, nota: a.nota }) }); if (!r.ok) throw 0; return true }
    catch { setAnotacoes((p) => p.filter((x) => x.id !== a.id)); return false }
  }
  async function atualizarServidor(id: string, cor: string, nota: string | null, revert?: { cor: string; nota: string | null }): Promise<boolean> {
    setAnotacoes((p) => p.map((a) => (a.id === id ? { ...a, cor, nota } : a)))
    try { const r = await fetch('/api/leitura/anotacao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, cor, nota }) }); if (!r.ok) throw 0; return true }
    catch { if (revert) setAnotacoes((p) => p.map((a) => (a.id === id ? { ...a, cor: revert.cor, nota: revert.nota } : a))); return false }
  }
  const avisarFalha = () => toast.error('Não foi possível salvar tudo. Recarregue a página se algum grifo ficar fora do lugar.')
  const registrar = (b: AcaoGrifo[]) => { if (b.length) { setPassado((p) => [...p, b].slice(-60)); setFuturo([]) } }

  // ── Ações do usuário (registram no histórico). opLock evita reentrância (clique/Enter rápido). ──
  async function criarAnotacao(cor: string) {
    if (!sel || opLock.current) return
    const a = sel.anc
    setSel(null); window.getSelection()?.removeAllRanges()
    opLock.current = true
    const novo = await inserirServidor({ id: 'tmp', inicio: a.inicio, fim: a.fim, exact: a.exact, prefix: a.prefix, suffix: a.suffix, cor, nota: null, origem: 'propria' })
    opLock.current = false
    if (!novo) { toast.error('Erro ao grifar.'); return }
    registrar([{ k: 'add', a: novo }])
  }

  async function atualizarAnotacao(id: string, patch: Partial<Pick<AnotacaoAluno, 'cor' | 'nota'>>) {
    if (opLock.current) return
    const atual = anotacoes.find((a) => a.id === id); if (!atual) return
    const de = { cor: atual.cor, nota: atual.nota }
    const para = { cor: patch.cor ?? atual.cor, nota: 'nota' in patch ? (patch.nota ?? null) : atual.nota }
    opLock.current = true
    const ok = await atualizarServidor(id, para.cor, para.nota, de)
    opLock.current = false
    if (!ok) { avisarFalha(); return }
    registrar([{ k: 'upd', id, de, para }])
  }

  async function excluirAnotacao(id: string) {
    if (opLock.current) return
    const a = anotacoes.find((x) => x.id === id); if (!a) return
    opLock.current = true
    const ok = await removerServidor(a)
    opLock.current = false
    if (!ok) { avisarFalha(); return }
    registrar([{ k: 'del', a }])
  }

  // Apaga os grifos PRÓPRIOS que tocam a seleção atual (ferramenta borracha do painel Anotações).
  async function apagarGrifoSelecao() {
    if (!sel || opLock.current) return
    const { inicio, fim } = sel.anc
    const alvos = anotacoes.filter((a) => a.origem === 'propria' && a.inicio < fim && a.fim > inicio)
    setSel(null); window.getSelection()?.removeAllRanges()
    if (!alvos.length) { toast.message('Nenhum grifo seu na seleção.'); return }
    opLock.current = true
    const oks = await Promise.all(alvos.map((a) => removerServidor(a)))
    opLock.current = false
    const removidos = alvos.filter((_, i) => oks[i])
    if (removidos.length) registrar(removidos.map((a) => ({ k: 'del' as const, a })))
    if (oks.some((o) => !o)) avisarFalha()
  }

  async function resetarGrifos() {
    if (opLock.current) return
    const meus = anotacoes.filter((a) => a.origem === 'propria')
    if (!meus.length) { toast.message('Você não tem grifos próprios para resetar.'); return }
    opLock.current = true
    const oks = await Promise.all(meus.map((a) => removerServidor(a)))
    opLock.current = false
    const removidos = meus.filter((_, i) => oks[i])
    if (removidos.length) registrar(removidos.map((a) => ({ k: 'del' as const, a })))
    if (oks.some((o) => !o)) avisarFalha()
    else toast.success(`${meus.length} grifo(s) removido(s)`)
  }

  // ── Voltar / Avançar. Como os ids são estáveis (soft-delete/undelete), o MESMO batch é só
  //    movido entre as pilhas — sem reescrever ids. ──
  async function desfazer() {
    if (opLock.current) return
    const b = passado[passado.length - 1]; if (!b) return
    opLock.current = true
    let falhou = false
    for (const ac of [...b].reverse()) {
      let ok = true
      if (ac.k === 'add') ok = await removerServidor(ac.a)
      else if (ac.k === 'del') ok = await restaurarServidor(ac.a)
      else ok = await atualizarServidor(ac.id, ac.de.cor, ac.de.nota, ac.para)
      if (!ok) falhou = true
    }
    opLock.current = false
    setPassado((p) => p.slice(0, -1))
    setFuturo((f) => [...f, b])
    if (falhou) avisarFalha()
  }
  async function refazer() {
    if (opLock.current) return
    const b = futuro[futuro.length - 1]; if (!b) return
    opLock.current = true
    let falhou = false
    for (const ac of b) {
      let ok = true
      if (ac.k === 'add') ok = await restaurarServidor(ac.a)
      else if (ac.k === 'del') ok = await removerServidor(ac.a)
      else ok = await atualizarServidor(ac.id, ac.para.cor, ac.para.nota, ac.de)
      if (!ok) falhou = true
    }
    opLock.current = false
    setFuturo((f) => f.slice(0, -1))
    setPassado((p) => [...p, b])
    if (falhou) avisarFalha()
  }

  function pularAnotacao(a: AnotacaoAluno) {
    const esp = espinhaRef.current; if (!esp) return
    const range = ancoraParaRange(esp, { inicio: a.inicio, fim: a.fim, exact: a.exact, prefix: a.prefix, suffix: a.suffix })
    const el = range?.startContainer.parentElement
    if (!el) return
    if (modo !== 'flip') el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    else irPara(Math.floor(el.offsetLeft / (colW + GAP)))
  }

  const obrigatoriasPendentes = (doc.questoes ?? []).filter((q) => q.obrigatoria && !respostas[q.docQuestaoId]).length

  async function concluir() {
    // Em trilha as obrigatórias são respondidas na ETAPA de questões (não inline) → não bloqueia aqui.
    if (!trilha && obrigatoriasPendentes > 0) { toast.error(`Responda as ${obrigatoriasPendentes} pergunta(s) obrigatória(s) antes de concluir.`); return }
    if (doc.desafio.exigeFim && pctRef.current < 100) { toast.error('Leia até o fim para concluir.'); return }
    setConcluindo(true)
    try {
      const r = await flush(true)
      const j = await r.json().catch(() => ({}))
      if (j?.concluido) { setConcluido(true); toast.success('Leitura concluída! 🎉') }
      else if (doc.desafio.tempoMin) toast.error(`Continue lendo por pelo menos ${doc.desafio.tempoMin} min.`)
      else toast.error('Ainda não foi possível concluir.')
    } finally { setConcluindo(false) }
  }

  const proseStyle = useMemo<React.CSSProperties>(() => ({ fontSize: fonte, lineHeight: 1.7, color: cores.fg }), [fonte, cores.fg])

  // ── Conteúdo + overlays MEMOIZADOS (anti-flash). ──
  // Sem isto, QUALQUER re-render (ex.: expandir/recolher um capítulo no sumário → muda `tocAberto`)
  // recria o div do conteúdo E os overlays com `mix-blend-mode: multiply`. O navegador então
  // re-rasteriza a camada blendada da lei INTEIRA e, em documentos grandes, pinta um FRAME BRANCO
  // ("piscar"/"apagar"). Memoizados pelos SEUS dados → cliques que não os afetam reusam o MESMO
  // elemento (React pula a subárvore por igualdade referencial) e nada re-rasteriza.
  const conteudoEl = useMemo(() => (
    <div
      ref={contentRef}
      className={cn('leitura-conteudo leitura-prosa px-6 py-6 [&_a]:underline [&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-6 [&_li]:list-disc [&_p]:mb-3 [&_table]:my-3 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1', semGrifos && 'sem-grifos')}
      style={modo === 'flip'
        ? { ...proseStyle, columnWidth: colW || undefined, columnGap: GAP, columnFill: 'auto', height: '100%' }
        : proseStyle}
      dangerouslySetInnerHTML={{ __html: doc.html }}
    />
  ), [doc.html, semGrifos, modo, colW, proseStyle])

  const grifosOverlay = useMemo(() => (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {grifos.map((g) => {
        if (semGrifos && !ehEstrutural(g.tipo)) return null
        const gr = grifosRects[g.id]; if (!gr) return null
        const info = (GRIFOS as any)[g.tipo]
        const label = info?.label ?? 'Grifo'
        return gr.rects.map((r, i) => (
          <div key={`g-${g.id}-${i}`} className="absolute rounded-[2px]" title={label} style={{ left: r.left, top: r.top, width: r.width, height: r.height, background: corDoGrifo(g.tipo), opacity: 0.42, mixBlendMode: 'multiply' }}>
            {i === 0 && ehEstrutural(g.tipo) && (
              <span className="absolute -top-4 left-0 whitespace-nowrap rounded px-1 text-[9px] font-bold uppercase tracking-wide text-white" style={{ background: corDoGrifo(g.tipo), mixBlendMode: 'normal' }}>{label}</span>
            )}
          </div>
        ))
      })}
    </div>
  ), [grifos, grifosRects, semGrifos])

  const anotacoesOverlay = useMemo(() => (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0" aria-hidden>
      {anotacoes.map((a) => (rectsPorId[a.id] ?? []).map((r, i) => (
        <div key={`${a.id}-${i}`} className="absolute rounded-[2px]" style={{ left: r.left, top: r.top, width: r.width, height: r.height, background: a.cor, opacity: 0.4, mixBlendMode: 'multiply' }} />
      )))}
    </div>
  ), [anotacoes, rectsPorId])

  const matchesOverlay = useMemo(() => matches.length === 0 ? null : (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {matches.map((m, mi) => m.rects.map((r, i) => (
        <div key={`m-${mi}-${i}`} className="absolute rounded-[2px]" style={{ left: r.left, top: r.top, width: r.width, height: r.height, background: '#f97316', opacity: mi === matchIdx ? 0.6 : 0.32, outline: mi === matchIdx ? '1px solid #ea580c' : 'none' }} />
      )))}
    </div>
  ), [matches, matchIdx])

  // #4 — caixas "ENTENDIMENTO DO STJ/STF" viram ACORDEÃO: recolhidas mostram só o cabeçalho;
  // clicar no cabeçalho abre o corpo (envolvido em .caixa-corpo/.caixa-corpo-in, grid-rows).
  // Envolver o corpo não muda ordem/texto dos nós → a "espinha" das âncoras dos grifos fica intacta.
  useEffect(() => {
    const cont = contentRef.current
    if (!cont) return
    const onCab = (e: Event) => {
      const cab = e.currentTarget as HTMLElement
      const box = cab.closest('.caixa-colapsavel') as HTMLElement | null
      if (!box) return
      const abrir = !box.hasAttribute('data-aberto')
      if (abrir) box.setAttribute('data-aberto', '1'); else box.removeAttribute('data-aberto')
      cab.setAttribute('aria-expanded', abrir ? 'true' : 'false')
      // Nudge imediato + ao FIM da transição, senão o overlay dos grifos mede um estado intermediário.
      window.dispatchEvent(new Event('resize'))
      box.querySelector('.caixa-corpo')?.addEventListener(
        'transitionend', () => window.dispatchEvent(new Event('resize')), { once: true },
      )
    }
    // Acessibilidade: o cabeçalho é um botão — abre por Enter/Espaço, não só clique de mouse.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }
    const ligados: HTMLElement[] = []
    // `aplicar` idempotente + rAF + MutationObserver (igual ao admin): garante o recolhimento mesmo
    // se o conteúdo montar/mutar depois (era o motivo de "não recolher igual no admin" no aluno).
    const aplicar = () => {
      // Pega data-caixa (novo) E as classes legadas box-stj/box-stf (conteúdo antigo).
      const caixas = Array.from(cont.querySelectorAll<HTMLElement>('[data-caixa="stj"], [data-caixa="stf"], .box-stj, .box-stf'))
      for (const box of caixas) {
        if (box.classList.contains('caixa-colapsavel') || box.hasAttribute('data-legenda-oculta')) continue
        const filhos = Array.from(box.children)
        const cab = filhos[0] as HTMLElement | undefined
        // A LEGENDA virou a BARRA FIXA do topo → esconde a caixa inline (não duplicar). Detecta pelo
        // TÍTULO (1º filho); usar o texto do box inteiro juntava "LEGENDA"+"AMARELO…" e quebrava o \b.
        if (cab && /^\s*LEGENDA\b/i.test((cab.textContent || '').replace(/\s+/g, ' ').trim())) { box.setAttribute('data-legenda-oculta', '1'); box.style.display = 'none'; continue }
        if (!cab || filhos.length < 2) continue // sem corpo pra recolher
        cab.classList.add('caixa-cab')
        cab.setAttribute('role', 'button'); cab.setAttribute('tabindex', '0')
        const corpo = document.createElement('div'); corpo.className = 'caixa-corpo'
        const inner = document.createElement('div'); inner.className = 'caixa-corpo-in'
        for (const f of filhos.slice(1)) inner.appendChild(f)
        corpo.appendChild(inner); box.appendChild(corpo)
        // Prévia (começo do corpo) ao lado do título, pra diferenciar as caixas recolhidas.
        // Vai num data-attr → renderizada via CSS ::before (sem nó de texto → não mexe na espinha das âncoras).
        const previa = (inner.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
        if (previa) cab.setAttribute('data-previa', previa)
        box.classList.add('caixa-colapsavel')
        box.removeAttribute('data-aberto') // recolhida por padrão (igual ao admin)
        cab.setAttribute('aria-expanded', 'false')
        cab.addEventListener('click', onCab); cab.addEventListener('keydown', onKey); ligados.push(cab)
      }
    }
    aplicar()
    const raf = requestAnimationFrame(aplicar)
    // Esconder a LEGENDA + recolher as caixas muda o layout → realinha os grifos uma vez.
    const raf2 = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    const mo = new MutationObserver(aplicar)
    mo.observe(cont, { childList: true, subtree: true })
    return () => { cancelAnimationFrame(raf); cancelAnimationFrame(raf2); mo.disconnect(); for (const c of ligados) { c.removeEventListener('click', onCab); c.removeEventListener('keydown', onKey) } }
  }, [doc.html])

  return (
    <div ref={containerRef} className={cn('relative flex overflow-hidden', trilha
      // LegProc: preenche a ÁREA INTERNA (à direita da sidebar) — cancela o padding do <main>
      // (p-4/md:p-6) com margens negativas e ocupa a altura cheia, sem card. A sidebar continua.
      ? '-m-4 h-[100dvh] md:-m-6'
      : 'h-[calc(100dvh-7rem)] min-h-[420px] rounded-2xl border shadow-sm')}
      // Scrollbars da leitura combinam com o tema (thumb/track derivados de cores.fg via CSS vars).
      style={{ background: cores.bg, ['--leitura-scroll-thumb' as string]: `color-mix(in srgb, ${cores.fg} 26%, transparent)`, ['--leitura-scroll-track' as string]: `color-mix(in srgb, ${cores.fg} 7%, transparent)` } as React.CSSProperties}>
      {/* Aviso "esta lei foi atualizada" + espelho do que mudou (flutua via portal). */}
      <LeituraAtualizacaoAviso doc={doc} />
      {/* Barra esquerda: navegação/sumário + ajustes */}
      {menuAberto && (
        <aside className="flex w-64 shrink-0 flex-col border-r" style={{ borderColor: '#0000001a', background: cores.bg }}>
          <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: '#0000001a' }}>
            <Link href="/aluno/leitura" className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: cores.muted }}>
              <ArrowLeft className="h-4 w-4" /> Biblioteca
            </Link>
            <button onClick={() => setMenuAberto(false)} className="rounded p-1" style={{ color: cores.muted }} aria-label="Fechar menu"><X className="h-4 w-4" /></button>
          </div>

          {/* Ajustes de leitura */}
          <div className="space-y-3 border-b px-3 py-3" style={{ borderColor: '#0000001a' }}>
            <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: '#0000001a' }}>
              {([['scroll', 'Rolar', ScrollText], ['capitulo', 'Capítulo', Rows3], ['flip', 'Virar', BookOpen]] as const).map(([m, label, Icon]) => (
                <button key={m} onClick={() => setModo(m)} className={cn('flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors', modo === m ? 'bg-primary text-primary-foreground' : '')} style={modo === m ? undefined : { color: cores.muted }}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: cores.muted }}>Fonte</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setFonte((f) => Math.max(13, f - 1))} className="rounded border p-1" style={{ borderColor: '#0000001a', color: cores.fg }}><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-8 text-center text-xs tabular-nums" style={{ color: cores.fg }}>{fonte}</span>
                <button onClick={() => setFonte((f) => Math.min(28, f + 1))} className="rounded border p-1" style={{ borderColor: '#0000001a', color: cores.fg }}><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: cores.muted }}>Tema</span>
              <div className="flex items-center gap-1">
                {([['claro', Sun], ['sepia', Coffee], ['escuro', Moon]] as const).map(([t, Icon]) => (
                  <button key={t} onClick={() => escolherTema(t)} className={cn('rounded border p-1.5 transition', tema === t && 'ring-2 ring-primary')} style={{ borderColor: '#0000001a', color: cores.fg }} aria-label={t}><Icon className="h-3.5 w-3.5" /></button>
                ))}
              </div>
            </div>
          </div>

          {/* Sumário — capítulos expansíveis (animado) + artigos ligados por linha de hierarquia. */}
          <div className="leitura-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: cores.muted }}>Sumário</p>
            {tocGrupos.length === 0 ? (
              <p className="px-1 text-xs" style={{ color: cores.muted }}>Sem seções detectadas.</p>
            ) : tocGrupos.map((g, gi) => {
              // Artigos soltos (antes de qualquer capítulo): lista simples, sem cabeçalho.
              if (!g.cap) return (
                <div key={`solto-${gi}`}>
                  {g.artigos.map((s, i) => (
                    <button key={`${s.id}-${i}`} onClick={() => pular(s)} className="block w-full truncate rounded py-1 pl-2 pr-2 text-left text-xs font-medium transition-colors hover:bg-black/5" style={{ color: cores.fg }} title={s.label}>{s.label}</button>
                  ))}
                </div>
              )
              const cap = g.cap
              const tem = g.artigos.length > 0
              const aberto = tocAberto.has(cap.id)
              return (
                <div key={`${cap.id}-${gi}`}>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => pular(cap)} className="min-w-0 flex-1 truncate rounded py-1 pl-2 pr-1 text-left text-xs font-semibold transition-colors hover:bg-black/5" style={{ color: cores.fg }} title={cap.label}>{cap.label}</button>
                    {tem && (
                      <button onClick={() => toggleCap(cap.id)} aria-label={aberto ? 'Recolher capítulo' : 'Expandir capítulo'} aria-expanded={aberto} className="shrink-0 rounded p-1 transition-colors hover:bg-black/5">
                        <ChevronDown className="h-3.5 w-3.5 transition-transform duration-300 ease-out" style={{ transform: aberto ? 'rotate(180deg)' : 'none', color: cores.muted }} />
                      </button>
                    )}
                  </div>
                  {/* Contêiner que anima 0fr↔1fr (mesma técnica das caixas STJ) — sem "salto" ao abrir/fechar. */}
                  {tem && (
                    <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: aberto ? '1fr' : '0fr' }}>
                      <div className="min-h-0 overflow-hidden">
                        {/* Árvore de hierarquia: tronco vertical (para no ÚLTIMO artigo, sem sobra) +
                            galho horizontal por item. Spans IRMÃOS do botão — o `truncate` do botão
                            (overflow:hidden) recortava o galho quando ele ficava dentro dele. */}
                        <div className="mb-1 mt-0.5 ml-3">
                          {g.artigos.map((s, i) => {
                            const ultimo = i === g.artigos.length - 1
                            return (
                              <div key={`${s.id}-${i}`} className="relative pl-4">
                                <span aria-hidden className="absolute left-0 w-px" style={{ background: `${cores.muted}40`, top: 0, bottom: ultimo ? '50%' : 0 }} />
                                <span aria-hidden className="absolute left-0 top-1/2 h-px w-4" style={{ background: `${cores.muted}40` }} />
                                <button onClick={() => pular(s)} title={s.label}
                                  className="block w-full truncate rounded py-1 pl-1 pr-2 text-left text-xs font-medium transition-colors hover:bg-black/5" style={{ color: cores.fg }}>
                                  {s.label}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>
      )}

      {/* Área central */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topo: progresso + concluir */}
        <div className="relative flex items-center gap-3 border-b px-3 py-2" style={{ borderColor: '#0000001a' }}>
          {!menuAberto && (
            <button onClick={() => setMenuAberto(true)} className="rounded p-1" style={{ color: cores.muted }} aria-label="Abrir menu"><PanelLeft className="h-4 w-4" /></button>
          )}
          <span className="truncate text-sm font-semibold" style={{ color: cores.fg }}>{doc.titulo}</span>
          {/* Modo CAPÍTULO: navegar ← anterior / próximo → centralizado na top bar. */}
          {modo === 'capitulo' && capitulos.length > 0 && (
            <div className="absolute left-1/2 top-1/2 flex max-w-[46vw] -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-lg border px-1 py-0.5 shadow-sm" style={{ borderColor: '#0000001a', background: cores.bg }}>
              <button onClick={() => irCapitulo(capAtual - 1)} disabled={capAtual <= 0} className="shrink-0 rounded-md p-1 transition disabled:opacity-30" style={{ color: cores.fg }} aria-label="Capítulo anterior"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-0 truncate px-1 text-xs font-semibold" style={{ color: cores.fg }} title={capitulos[Math.min(capAtual, capitulos.length - 1)]?.label}>{capitulos[Math.min(capAtual, capitulos.length - 1)]?.label ?? ''}</span>
              <button onClick={() => irCapitulo(capAtual + 1)} disabled={capAtual >= capitulos.length - 1} className="shrink-0 rounded-md p-1 transition disabled:opacity-30" style={{ color: cores.fg }} aria-label="Próximo capítulo"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
          <div className="ml-auto flex items-center gap-3">
            <button onClick={toggleFavorito} title={favorito ? 'Remover dos favoritos' : 'Favoritar'} className="rounded-lg border p-1.5 transition-colors" style={{ borderColor: '#0000001a', color: favorito ? '#f59e0b' : cores.fg }} aria-label="Favoritar">
              <Star className={cn('h-4 w-4', favorito && 'fill-amber-400')} />
            </button>
            <button onClick={() => setBuscaAberta((v) => !v)} title="Buscar na lei" className={cn('rounded-lg border p-1.5 transition-colors', buscaAberta && 'ring-2 ring-primary')} style={{ borderColor: '#0000001a', color: cores.fg }} aria-label="Buscar">
              <Search className="h-4 w-4" />
            </button>
            <button onClick={() => setBarraDir((v) => !v)} title="Minhas anotações" className={cn('inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors', barraDir && 'ring-2 ring-primary')} style={{ borderColor: '#0000001a', color: cores.fg }}>
              <Highlighter className="h-4 w-4" /> {anotacoes.length > 0 && <span className="tabular-nums">{anotacoes.length}</span>}
            </button>
            <div className="hidden items-center gap-2 sm:flex">
              <div className="h-1.5 w-28 overflow-hidden rounded-full" style={{ background: '#00000018' }}>
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs tabular-nums" style={{ color: cores.muted }}>{pct}%</span>
            </div>
            {trilha?.modo === 'questoes' ? null : concluido ? (
              trilha?.modo === 'leitura' && trilha.questoesHref ? (
                <Link href={trilha.questoesHref} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90">
                  <CheckCircle2 className="h-4 w-4" /> Ir para as questões
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Concluído</span>
              )
            ) : doc.desafio.ativo ? (
              <button onClick={concluir} disabled={concluindo} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                {concluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Concluir leitura
              </button>
            ) : trilha?.modo === 'leitura' ? (
              <button onClick={concluir} disabled={concluindo} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                {concluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Marcar como lido
              </button>
            ) : null}
          </div>
        </div>

        {/* Barra de busca dentro da lei */}
        {buscaAberta && (
          <div className="flex items-center gap-2 border-b px-3 py-1.5" style={{ borderColor: '#0000001a' }}>
            <Search className="h-4 w-4 shrink-0" style={{ color: cores.muted }} />
            <input autoFocus value={buscaQ} onChange={(e) => setBuscaQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') irMatch(e.shiftKey ? -1 : 1); if (e.key === 'Escape') { setBuscaAberta(false); setBuscaQ('') } }} placeholder="Buscar nesta lei…" className="min-w-32 flex-1 bg-transparent text-sm outline-none" style={{ color: cores.fg }} />
            <span className="shrink-0 text-xs tabular-nums" style={{ color: cores.muted }}>{matches.length ? `${matchIdx + 1}/${matches.length}${matches.length >= 500 ? '+' : ''}` : (buscaQ.trim().length >= 2 ? '0' : '')}</span>
            <button onClick={() => irMatch(-1)} disabled={!matches.length} className="rounded p-1 disabled:opacity-30" style={{ color: cores.fg }} aria-label="Anterior"><ChevronUp className="h-4 w-4" /></button>
            <button onClick={() => irMatch(1)} disabled={!matches.length} className="rounded p-1 disabled:opacity-30" style={{ color: cores.fg }} aria-label="Próximo"><ChevronDown className="h-4 w-4" /></button>
            <button onClick={() => { setBuscaAberta(false); setBuscaQ('') }} className="rounded p-1" style={{ color: cores.muted }} aria-label="Fechar busca"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Conteúdo */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={viewportRef}
            onScroll={modo !== 'flip' ? onScroll : undefined}
            onTouchStart={modo === 'flip' ? onTouchStart : undefined}
            onTouchEnd={modo === 'flip' ? onTouchEnd : undefined}
            onMouseUp={aoSelecionar}
            className={cn('leitura-scroll h-full', modo !== 'flip' ? 'overflow-y-auto px-3 md:px-8' : 'overflow-hidden')}
            style={modo !== 'flip' ? { background: cores.desk } : undefined}
          >
            {/* Barra de LEGENDA fixa (sticky) — some no modo virar (sem rolagem vertical). */}
            {modo !== 'flip' && <LegendaBar cores={cores} escuro={tema === 'escuro'} noTopo={noTopo} />}
            {/* wrapper posicionado: no modo virar leva o transform; nos demais é a FOLHA (papel) flutuante. */}
            <div
              ref={wrapperRef}
              className={cn('relative', modo !== 'flip' && 'mx-auto mb-6 mt-3 max-w-3xl rounded-lg')}
              style={modo === 'flip'
                ? { height: '100%', transform: `translateX(-${pagina * (colW + GAP)}px)`, transition: 'transform 220ms ease' }
                : { background: cores.sheet, border: `1px solid ${tema === 'escuro' ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'}`, boxShadow: tema === 'escuro' ? '0 6px 20px rgba(0,0,0,.4)' : '0 1px 2px rgba(0,0,0,.04), 0 8px 22px rgba(0,0,0,.08)' }}
            >
              {conteudoEl}
              {/* Overlay de GRIFOS EDITORIAIS (conteúdo). Some no "modo sem grifos" (exceto estruturais). */}
              {grifosOverlay}
              {/* Overlay das anotações PESSOAIS (por cima dos grifos) */}
              {anotacoesOverlay}
              {/* Overlay dos resultados de busca (realce laranja; atual mais forte) */}
              {matchesOverlay}
            </div>
          </div>

          {/* Popover de seleção → escolher a cor do grifo */}
          {sel && (
            <div className="absolute z-30 -translate-x-1/2 rounded-xl border bg-popover p-1.5 shadow-lg" style={{ left: sel.x, top: sel.y }}
              onMouseDown={(e) => e.preventDefault() /* não perde a seleção ao clicar */}>
              <div className="flex items-center gap-1">
                {CORES_GRIFO.map((c) => (
                  <button key={c} onClick={() => criarAnotacao(c)} className="h-6 w-6 rounded-full border border-black/10 transition hover:scale-110" style={{ background: c }} aria-label={`Grifar em ${c}`} />
                ))}
                <button onClick={() => { setSel(null); window.getSelection()?.removeAllRanges() }} className="ml-0.5 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Cancelar"><X className="h-4 w-4" /></button>
              </div>
            </div>
          )}

          {/* Controles de virar-página */}
          {modo === 'flip' && (
            <>
              <button onClick={() => irPara(pagina - 1)} disabled={pagina <= 0} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border bg-white/70 p-2 shadow-sm backdrop-blur transition disabled:opacity-30 dark:bg-black/40" aria-label="Página anterior"><ChevronLeft className="h-5 w-5" /></button>
              <button onClick={() => irPara(pagina + 1)} disabled={pagina >= totalPag - 1} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border bg-white/70 p-2 shadow-sm backdrop-blur transition disabled:opacity-30 dark:bg-black/40" aria-label="Próxima página"><ChevronRight className="h-5 w-5" /></button>
              <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs" style={{ color: cores.muted }}>{pagina + 1} / {totalPag}</div>
            </>
          )}

        </div>
      </div>

      {/* Questões inline: renderizadas DENTRO do conteúdo (portal). Em modo trilha NÃO aparecem inline. */}
      {!trilha && slots.map((s) => createPortal(
        <QuestaoLeitura key={s.q.docQuestaoId} documentoId={doc.id} q={s.q} corFg={cores.fg} corMuted={cores.muted} onRespondida={(docQid) => setRespostas((p) => ({ ...p, [docQid]: true }))} />,
        s.el,
      ))}

      {/* Barra direita: anotações (grifos + notas) */}
      {barraDir && (
        <aside className="flex w-72 shrink-0 flex-col border-l" style={{ borderColor: '#0000001a', background: cores.bg }}>
          <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: '#0000001a' }}>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: cores.fg }}><Highlighter className="h-4 w-4" /> Anotações</span>
            <button onClick={() => setBarraDir(false)} className="rounded p-1" style={{ color: cores.muted }} aria-label="Fechar"><X className="h-4 w-4" /></button>
          </div>

          {/* Ferramentas de grifo (planejadas): Grifos do Revisão + grifar/apagar seleção + desfazer/refazer/resetar. */}
          <div className="space-y-3 border-b px-3 py-3" style={{ borderColor: '#0000001a' }}>
            {(grifos.length > 0 || temGrifosBaked) && (
              <label className="flex cursor-pointer items-center justify-between text-xs" style={{ color: cores.muted }}>
                <span className="inline-flex items-center gap-1"><Highlighter className="h-3.5 w-3.5" /> Grifos do Revisão</span>
                {/* Marcado = MOSTRAR os grifos do Revisão; desmarcado = ler sem grifo. */}
                <input type="checkbox" checked={!semGrifos} onChange={(e) => setSemGrifos(!e.target.checked)} className="h-4 w-4 rounded border" />
              </label>
            )}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: cores.muted }}>Grifar seleção</p>
              {/* preventDefault no mousedown p/ não perder a seleção do texto ao clicar aqui. */}
              <div className="flex items-center gap-1.5" onMouseDown={(e) => e.preventDefault()}>
                {CORES_GRIFO.map((c) => (
                  <button key={c} onClick={() => criarAnotacao(c)} disabled={!sel} title={sel ? `Grifar em ${c}` : 'Selecione um trecho primeiro'} className="h-6 w-6 rounded-full border border-black/10 transition enabled:hover:scale-110 disabled:opacity-30" style={{ background: c }} aria-label={`Grifar em ${c}`} />
                ))}
                <button onClick={apagarGrifoSelecao} disabled={!sel} title="Apagar grifo da seleção" className="ml-auto rounded-md border p-1.5 transition enabled:hover:text-destructive disabled:opacity-30" style={{ borderColor: '#0000001a', color: cores.fg }}><Eraser className="h-3.5 w-3.5" /></button>
              </div>
              {!sel && <p className="mt-1.5 text-[11px]" style={{ color: cores.muted }}>Selecione um trecho no texto para grifar.</p>}
            </div>
            <div className="flex items-center justify-between gap-1 text-xs" style={{ color: cores.muted }}>
              <span className="inline-flex items-center gap-1"><StickyNote className="h-3.5 w-3.5" /> Meus grifos</span>
              <div className="flex items-center gap-1">
                <button onClick={desfazer} disabled={!passado.length} title="Voltar (desfazer)" className="rounded border p-1 transition disabled:opacity-40" style={{ borderColor: '#0000001a', color: cores.fg }}><Undo2 className="h-3.5 w-3.5" /></button>
                <button onClick={refazer} disabled={!futuro.length} title="Avançar (refazer)" className="rounded border p-1 transition disabled:opacity-40" style={{ borderColor: '#0000001a', color: cores.fg }}><Redo2 className="h-3.5 w-3.5" /></button>
                <button onClick={resetarGrifos} title="Resetar meus grifos" className="rounded border p-1 transition hover:text-destructive" style={{ borderColor: '#0000001a', color: cores.fg }}><RotateCcw className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>

          <div className="leitura-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {anotacoes.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs" style={{ color: cores.muted }}>Nenhuma anotação ainda. Selecione um trecho e escolha uma cor acima.</p>
            ) : [...anotacoes].sort((a, b) => a.inicio - b.inicio).map((a) => (
              <div key={a.id} className="rounded-lg border p-2" style={{ borderColor: '#0000001a' }}>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ background: a.cor }} />
                  <button onClick={() => pularAnotacao(a)} className="min-w-0 flex-1 text-left text-xs leading-snug" style={{ color: cores.fg }} title="Ir ao trecho">
                    <span className="line-clamp-3">{a.exact}</span>
                  </button>
                  <button onClick={() => pularAnotacao(a)} className="shrink-0 rounded p-1" style={{ color: cores.muted }} aria-label="Ir ao trecho"><Crosshair className="h-3.5 w-3.5" /></button>
                  <button onClick={() => excluirAnotacao(a.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-1.5 flex items-center gap-1 pl-5">
                  {CORES_GRIFO.map((c) => (
                    <button key={c} onClick={() => atualizarAnotacao(a.id, { cor: c })} className={cn('h-4 w-4 rounded-full transition', a.cor === c ? 'ring-2 ring-primary' : 'border border-black/10')} style={{ background: c }} aria-label={`Cor ${c}`} />
                  ))}
                  <button onClick={() => setNotaEdit(notaEdit?.id === a.id ? null : { id: a.id, valor: a.nota ?? '' })} className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground" title="Nota"><StickyNote className="h-3.5 w-3.5" /></button>
                </div>
                {notaEdit?.id === a.id ? (
                  <div className="mt-1.5 pl-5">
                    <textarea value={notaEdit.valor} onChange={(e) => setNotaEdit({ id: a.id, valor: e.target.value })} rows={2} autoFocus placeholder="Escreva uma nota…" className="w-full resize-none rounded-md border bg-transparent px-2 py-1 text-xs outline-none" style={{ borderColor: '#0000001a', color: cores.fg }} />
                    <div className="mt-1 flex justify-end gap-1">
                      <button onClick={() => setNotaEdit(null)} className="rounded px-2 py-0.5 text-xs" style={{ color: cores.muted }}>Cancelar</button>
                      <button onClick={() => { atualizarAnotacao(a.id, { nota: notaEdit.valor || null }); setNotaEdit(null) }} className="rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Salvar</button>
                    </div>
                  </div>
                ) : a.nota ? (
                  <p className="mt-1.5 pl-5 text-xs italic" style={{ color: cores.muted }}>{a.nota}</p>
                ) : null}
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}
