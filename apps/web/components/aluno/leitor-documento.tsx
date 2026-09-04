'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, ScrollText, BookOpen, ChevronLeft, ChevronRight, Minus, Plus,
  Sun, Moon, Coffee, CheckCircle2, Loader2, X, PanelLeft, Highlighter, Trash2, StickyNote, Crosshair, Search, ChevronUp, ChevronDown, Star,
  Undo2, Redo2, RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DocumentoCarregado, AnotacaoAluno } from '@/lib/leitura/acesso'
import { construirEspinha, rangeParaAncora, ancoraParaRange, rectsDoRange, type Espinha, type RectRel } from '@/lib/leitura/anotacoes-engine'
import { QuestaoLeitura } from '@/components/aluno/questao-leitura'
import { LeituraAtualizacaoAviso } from '@/components/aluno/leitura-atualizacao-aviso'
import { GRIFOS, corDoGrifo, ehEstrutural } from '@/lib/leitura/grifos'

type Modo = 'scroll' | 'flip'
type Tema = 'claro' | 'sepia' | 'escuro'
interface Secao { id: string; art: number; label: string; tipo: string; nivel: number }
// #3 — histórico de grifos (voltar/avançar). Cada ação é um "batch" (o reset apaga vários de uma vez).
type AcaoGrifo =
  | { k: 'add'; a: AnotacaoAluno }
  | { k: 'del'; a: AnotacaoAluno }
  | { k: 'upd'; id: string; de: { cor: string; nota: string | null }; para: { cor: string; nota: string | null } }

const TEMAS: Record<Tema, { bg: string; fg: string; muted: string }> = {
  claro: { bg: '#ffffff', fg: '#1f2937', muted: '#6b7280' },
  sepia: { bg: '#f5ecd9', fg: '#4b3f2f', muted: '#8a7a5c' },
  escuro: { bg: '#1a1a1e', fg: '#d8d8dc', muted: '#8a8a92' },
}
const GAP = 48 // entre "páginas" no modo virar
const CORES_GRIFO = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fca5a5'] // amarelo/verde/azul/rosa/vermelho
// useLayoutEffect só faz sentido no cliente (evita warning de SSR do leitor).
const useIsoLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export function LeitorDocumento({ doc }: { doc: DocumentoCarregado }) {
  const [modo, setModo] = useState<Modo>((doc.prefs?.modo as Modo) || 'scroll')
  const [tema, setTema] = useState<Tema>((doc.prefs?.tema as Tema) || 'sepia')
  const [fonte, setFonte] = useState(doc.prefs?.fonte || 18)
  const [favorito, setFavorito] = useState(!!doc.favorito)
  const [menuAberto, setMenuAberto] = useState(true)
  const [pct, setPct] = useState(doc.progresso.pct)
  const [concluido, setConcluido] = useState(doc.progresso.concluido)
  const [concluindo, setConcluindo] = useState(false)
  const [secoes, setSecoes] = useState<Secao[]>([])

  // Modo virar-página
  const [pagina, setPagina] = useState(0)
  const [totalPag, setTotalPag] = useState(1)
  const [colW, setColW] = useState(0)

  // Questões inline (Fase 2)
  const [respostas, setRespostas] = useState<Record<string, boolean>>(() => Object.fromEntries((doc.questoes ?? []).filter((q) => q.resposta).map((q) => [q.questaoId, true])))
  const [slots, setSlots] = useState<{ q: DocumentoCarregado['questoes'][number]; el: HTMLElement }[]>([])

  // Busca dentro da lei
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [buscaQ, setBuscaQ] = useState('')
  const [matches, setMatches] = useState<{ rects: RectRel[]; el: HTMLElement | null }[]>([])
  const [matchIdx, setMatchIdx] = useState(0)

  // Grifos editoriais (conteúdo compartilhado) + modo sem grifos
  const grifos = doc.grifos ?? []
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

  // Retomar o último ponto lido (uma vez, após o layout).
  useEffect(() => {
    if (!doc.ultimoDisp) return
    const t = setTimeout(() => {
      const el = contentRef.current?.querySelector<HTMLElement>(`[data-disp="${CSS.escape(doc.ultimoDisp!)}"]`)
      if (!el) return
      if (modo === 'scroll') el.scrollIntoView({ block: 'start' })
      else if (colW) irPara(Math.floor(el.offsetLeft / (colW + GAP)))
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // ── Injeta as questões inline logo após o artigo indicado (contêiner no DOM; o card é
  //    renderizado por PORTAL). O texto delas é ignorado pela espinha das anotações. ──
  useIsoLayout(() => {
    const root = contentRef.current
    if (!root) { setSlots([]); return }
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
  }, [doc.html, doc.questoes])

  // ── Medição do modo virar-página ──
  // 1) Largura da coluna = largura da viewport (muda em resize/modo). Ao mudar colW,
  //    o React aplica columnWidth no DOM; SÓ ENTÃO (efeito 2) medimos o total de páginas —
  //    senão o scrollWidth seria lido antes das colunas existirem (total errado = 1).
  useIsoLayout(() => {
    const medirColW = () => { const vp = viewportRef.current; if (vp) setColW(vp.clientWidth) }
    medirColW()
    const ro = new ResizeObserver(medirColW)
    if (viewportRef.current) ro.observe(viewportRef.current)
    return () => ro.disconnect()
  }, [modo])

  // 2) Total de páginas — recalcula quando colW/fonte/conteúdo mudam (colunas já no DOM).
  useIsoLayout(() => {
    if (modo !== 'flip') { setTotalPag(1); return }
    const ct = contentRef.current
    if (!ct || !colW) return
    const total = Math.max(1, Math.round(ct.scrollWidth / (colW + GAP)))
    setTotalPag(total)
    setPagina((p) => Math.min(p, total - 1))
  }, [modo, colW, fonte, doc.html, slots])

  // ── Grifos: (re)calcula os retângulos do overlay. Coords LOCAIS ao overlay → imunes ao
  // translateX (virar) e ao scroll (as diferenças cancelam a transformação); por isso só
  // recalcula em REFLUXO (modo/fonte/colW/conteúdo/lista), nunca a cada página ou pixel. ──
  const recomputarGrifos = useCallback(() => {
    const root = contentRef.current, ov = overlayRef.current
    if (!root || !ov) return
    const esp = construirEspinha(root); espinhaRef.current = esp
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
  }, [anotacoes, grifos])
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
  useIsoLayout(() => {
    const root = contentRef.current, ov = overlayRef.current
    const q = buscaQ.trim()
    if (!root || !ov || q.length < 2) { setMatches([]); return }
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
    setMatches(res); setMatchIdx(0)
  }, [buscaQ, modo, colW, fonte, doc.html, slots])

  // ── Cálculo de progresso (%, artigo alcançado) ──
  const atualizarProgresso = useCallback(() => {
    const vp = viewportRef.current, ct = contentRef.current
    if (!vp || !ct) return
    let p = 0
    if (modo === 'scroll') {
      const max = ct.scrollHeight - vp.clientHeight
      p = max <= 0 ? 100 : Math.round((vp.scrollTop / max) * 100)
      // artigo alcançado: última âncora acima do fim da viewport
      const limite = vp.scrollTop + vp.clientHeight
      for (const el of ct.querySelectorAll<HTMLElement>('[data-art]')) {
        if (el.offsetTop <= limite) artigoMaxRef.current = Math.max(artigoMaxRef.current, Number(el.getAttribute('data-art')) || 0)
      }
    } else {
      p = totalPag <= 1 ? 100 : Math.round(((pagina + 1) / totalPag) * 100)
      const limite = (pagina + 1) * (colW + GAP)
      for (const el of ct.querySelectorAll<HTMLElement>('[data-art]')) {
        if (el.offsetLeft < limite) artigoMaxRef.current = Math.max(artigoMaxRef.current, Number(el.getAttribute('data-art')) || 0)
      }
    }
    // Último ponto: dispositivo topo visível (para retomar depois).
    const dispEls = ct.querySelectorAll<HTMLElement>('[data-disp]')
    let topo: string | null = null
    for (const el of dispEls) {
      const passou = modo === 'scroll' ? el.offsetTop <= vp.scrollTop + 8 : el.offsetLeft <= pagina * (colW + GAP) + 8
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

  // ── Pular para uma seção (sumário) ──
  function pular(s: Secao) {
    const root = contentRef.current
    const el = root?.querySelector<HTMLElement>(`[data-disp="${CSS.escape(s.id)}"]`) ?? root?.querySelector<HTMLElement>(`#${CSS.escape(s.id)}`) ?? root?.querySelector<HTMLElement>(`[data-art="${s.art}"]`)
    if (!el) return
    if (modo === 'scroll') { el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
    else { const alvo = Math.floor(el.offsetLeft / (colW + GAP)); irPara(alvo) }
    // Pisca o dispositivo alvo (remove+reflow p/ reiniciar a animação em cliques repetidos).
    el.classList.remove('leitura-alvo'); void el.offsetWidth; el.classList.add('leitura-alvo')
    window.setTimeout(() => el.classList.remove('leitura-alvo'), 1700)
  }

  function irMatch(delta: number) {
    if (!matches.length) return
    const n = (matchIdx + delta + matches.length) % matches.length
    setMatchIdx(n)
    const el = matches[n]?.el
    if (!el) return
    if (modo === 'scroll') el.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
  async function removerServidor(id: string) {
    setAnotacoes((p) => p.filter((a) => a.id !== id))
    try { await fetch(`/api/leitura/anotacao?id=${id}`, { method: 'DELETE' }) } catch { /* ok */ }
  }
  async function restaurarServidor(a: AnotacaoAluno) {
    setAnotacoes((p) => (p.some((x) => x.id === a.id) ? p : [...p, a]))
    try { await fetch('/api/leitura/anotacao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: a.id, restaurar: true, cor: a.cor, nota: a.nota }) }) } catch { /* ok */ }
  }
  async function atualizarServidor(id: string, cor: string, nota: string | null) {
    setAnotacoes((p) => p.map((a) => (a.id === id ? { ...a, cor, nota } : a)))
    try { await fetch('/api/leitura/anotacao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, cor, nota }) }) } catch { /* otimista */ }
  }
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
    await atualizarServidor(id, para.cor, para.nota)
    opLock.current = false
    registrar([{ k: 'upd', id, de, para }])
  }

  async function excluirAnotacao(id: string) {
    if (opLock.current) return
    const a = anotacoes.find((x) => x.id === id); if (!a) return
    opLock.current = true
    await removerServidor(id)
    opLock.current = false
    registrar([{ k: 'del', a }])
  }

  async function resetarGrifos() {
    if (opLock.current) return
    const meus = anotacoes.filter((a) => a.origem === 'propria')
    if (!meus.length) { toast.message('Você não tem grifos próprios para resetar.'); return }
    opLock.current = true
    for (const a of meus) await removerServidor(a.id)
    opLock.current = false
    registrar(meus.map((a) => ({ k: 'del' as const, a })))
    toast.success(`${meus.length} grifo(s) removido(s)`)
  }

  // ── Voltar / Avançar. Como os ids são estáveis (soft-delete/undelete), o MESMO batch é só
  //    movido entre as pilhas — sem reescrever ids. ──
  async function desfazer() {
    if (opLock.current) return
    const b = passado[passado.length - 1]; if (!b) return
    opLock.current = true
    for (const ac of [...b].reverse()) {
      if (ac.k === 'add') await removerServidor(ac.a.id)
      else if (ac.k === 'del') await restaurarServidor(ac.a)
      else await atualizarServidor(ac.id, ac.de.cor, ac.de.nota)
    }
    opLock.current = false
    setPassado((p) => p.slice(0, -1))
    setFuturo((f) => [...f, b])
  }
  async function refazer() {
    if (opLock.current) return
    const b = futuro[futuro.length - 1]; if (!b) return
    opLock.current = true
    for (const ac of b) {
      if (ac.k === 'add') await restaurarServidor(ac.a)
      else if (ac.k === 'del') await removerServidor(ac.a.id)
      else await atualizarServidor(ac.id, ac.para.cor, ac.para.nota)
    }
    opLock.current = false
    setFuturo((f) => f.slice(0, -1))
    setPassado((p) => [...p, b])
  }

  function pularAnotacao(a: AnotacaoAluno) {
    const esp = espinhaRef.current; if (!esp) return
    const range = ancoraParaRange(esp, { inicio: a.inicio, fim: a.fim, exact: a.exact, prefix: a.prefix, suffix: a.suffix })
    const el = range?.startContainer.parentElement
    if (!el) return
    if (modo === 'scroll') el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    else irPara(Math.floor(el.offsetLeft / (colW + GAP)))
  }

  const obrigatoriasPendentes = (doc.questoes ?? []).filter((q) => q.obrigatoria && !respostas[q.questaoId]).length

  async function concluir() {
    if (obrigatoriasPendentes > 0) { toast.error(`Responda as ${obrigatoriasPendentes} pergunta(s) obrigatória(s) antes de concluir.`); return }
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

  // #4 — caixas "ENTENDIMENTO DO STJ/STF" viram ACORDEÃO: recolhidas mostram só o cabeçalho;
  // clicar no cabeçalho abre o corpo (envolvido em .caixa-corpo/.caixa-corpo-in, grid-rows).
  // Envolver o corpo não muda ordem/texto dos nós → a "espinha" das âncoras dos grifos fica intacta.
  useEffect(() => {
    const cont = contentRef.current
    if (!cont) return
    const onCab = (e: Event) => {
      const box = (e.currentTarget as HTMLElement).closest('.caixa-colapsavel') as HTMLElement | null
      if (!box) return
      if (box.hasAttribute('data-aberto')) box.removeAttribute('data-aberto')
      else box.setAttribute('data-aberto', '1')
      // Nudge imediato + ao FIM da transição, senão o overlay dos grifos mede um estado intermediário.
      window.dispatchEvent(new Event('resize'))
      box.querySelector('.caixa-corpo')?.addEventListener(
        'transitionend', () => window.dispatchEvent(new Event('resize')), { once: true },
      )
    }
    const ligados: HTMLElement[] = []
    // Pega data-caixa (novo) E as classes legadas box-stj/box-stf (conteúdo antigo).
    const caixas = Array.from(cont.querySelectorAll<HTMLElement>('[data-caixa="stj"], [data-caixa="stf"], .box-stj, .box-stf'))
    for (const box of caixas) {
      if (box.classList.contains('caixa-colapsavel')) continue
      const filhos = Array.from(box.children)
      if (filhos.length < 2) continue // sem corpo pra recolher
      const cab = filhos[0] as HTMLElement
      cab.classList.add('caixa-cab')
      const corpo = document.createElement('div'); corpo.className = 'caixa-corpo'
      const inner = document.createElement('div'); inner.className = 'caixa-corpo-in'
      for (const f of filhos.slice(1)) inner.appendChild(f)
      corpo.appendChild(inner); box.appendChild(corpo)
      // Prévia (começo do corpo) ao lado do título, pra diferenciar as caixas recolhidas.
      // Vai num data-attr → renderizada via CSS ::before (sem nó de texto → não mexe na espinha das âncoras).
      const previa = (inner.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
      if (previa) cab.setAttribute('data-previa', previa)
      box.classList.add('caixa-colapsavel')
      // A caixa de LEGENDA dos grifos abre por padrão (o aluno vê as cores de cara); as demais recolhem.
      if (/^\s*LEGENDA\b/i.test(cab.textContent || '')) box.setAttribute('data-aberto', '1')
      else box.removeAttribute('data-aberto')
      cab.addEventListener('click', onCab); ligados.push(cab)
    }
    return () => { for (const c of ligados) c.removeEventListener('click', onCab) }
  }, [doc.html])

  return (
    <div ref={containerRef} className="relative flex h-[calc(100dvh-7rem)] min-h-[420px] overflow-hidden rounded-2xl border shadow-sm" style={{ background: cores.bg }}>
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
              {([['scroll', 'Rolar', ScrollText], ['flip', 'Virar', BookOpen]] as const).map(([m, label, Icon]) => (
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
                  <button key={t} onClick={() => setTema(t)} className={cn('rounded border p-1.5 transition', tema === t && 'ring-2 ring-primary')} style={{ borderColor: '#0000001a', color: cores.fg }} aria-label={t}><Icon className="h-3.5 w-3.5" /></button>
                ))}
              </div>
            </div>
            {(grifos.length > 0 || temGrifosBaked) && (
              <label className="flex items-center justify-between text-xs" style={{ color: cores.muted }}>
                <span className="inline-flex items-center gap-1"><Highlighter className="h-3.5 w-3.5" /> Grifos do Revisão</span>
                {/* Marcado = MOSTRAR os grifos do Revisão; desmarcado = ler sem grifo. */}
                <input type="checkbox" checked={!semGrifos} onChange={(e) => setSemGrifos(!e.target.checked)} className="h-4 w-4 rounded border" />
              </label>
            )}
            {/* #3 — Meus grifos: voltar/avançar (undo/redo) + resetar. */}
            <div className="flex items-center justify-between gap-1 text-xs" style={{ color: cores.muted }}>
              <span className="inline-flex items-center gap-1"><StickyNote className="h-3.5 w-3.5" /> Meus grifos</span>
              <div className="flex items-center gap-1">
                <button onClick={desfazer} disabled={!passado.length} title="Voltar (desfazer)" className="rounded border p-1 transition disabled:opacity-40" style={{ borderColor: '#0000001a', color: cores.fg }}><Undo2 className="h-3.5 w-3.5" /></button>
                <button onClick={refazer} disabled={!futuro.length} title="Avançar (refazer)" className="rounded border p-1 transition disabled:opacity-40" style={{ borderColor: '#0000001a', color: cores.fg }}><Redo2 className="h-3.5 w-3.5" /></button>
                <button onClick={resetarGrifos} title="Resetar meus grifos" className="rounded border p-1 transition hover:text-destructive" style={{ borderColor: '#0000001a', color: cores.fg }}><RotateCcw className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>

          {/* Sumário */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: cores.muted }}>Sumário</p>
            {secoes.length === 0 ? (
              <p className="px-1 text-xs" style={{ color: cores.muted }}>Sem seções detectadas.</p>
            ) : secoes.map((s, i) => (
              <button key={`${s.id}-${i}`} onClick={() => pular(s)} className="block w-full truncate rounded py-1 pr-2 text-left text-xs transition-colors hover:bg-black/5" style={{ color: cores.fg, paddingLeft: 8 + s.nivel * 12, fontWeight: s.tipo === 'secao' || s.tipo === 'artigo' ? 600 : 400, opacity: s.nivel >= 2 ? 0.8 : 1 }} title={s.label}>
                {s.label}
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Área central */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topo: progresso + concluir */}
        <div className="flex items-center gap-3 border-b px-3 py-2" style={{ borderColor: '#0000001a' }}>
          {!menuAberto && (
            <button onClick={() => setMenuAberto(true)} className="rounded p-1" style={{ color: cores.muted }} aria-label="Abrir menu"><PanelLeft className="h-4 w-4" /></button>
          )}
          <span className="truncate text-sm font-semibold" style={{ color: cores.fg }}>{doc.titulo}</span>
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
            {concluido ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Concluído</span>
            ) : doc.desafio.ativo ? (
              <button onClick={concluir} disabled={concluindo} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                {concluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Concluir leitura
              </button>
            ) : null}
          </div>
        </div>

        {/* Barra de busca dentro da lei */}
        {buscaAberta && (
          <div className="flex items-center gap-2 border-b px-3 py-1.5" style={{ borderColor: '#0000001a' }}>
            <Search className="h-4 w-4 shrink-0" style={{ color: cores.muted }} />
            <input autoFocus value={buscaQ} onChange={(e) => setBuscaQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') irMatch(e.shiftKey ? -1 : 1); if (e.key === 'Escape') { setBuscaAberta(false); setBuscaQ('') } }} placeholder="Buscar nesta lei…" className="min-w-32 flex-1 bg-transparent text-sm outline-none" style={{ color: cores.fg }} />
            <span className="shrink-0 text-xs tabular-nums" style={{ color: cores.muted }}>{matches.length ? `${matchIdx + 1}/${matches.length}` : (buscaQ.trim().length >= 2 ? '0' : '')}</span>
            <button onClick={() => irMatch(-1)} disabled={!matches.length} className="rounded p-1 disabled:opacity-30" style={{ color: cores.fg }} aria-label="Anterior"><ChevronUp className="h-4 w-4" /></button>
            <button onClick={() => irMatch(1)} disabled={!matches.length} className="rounded p-1 disabled:opacity-30" style={{ color: cores.fg }} aria-label="Próximo"><ChevronDown className="h-4 w-4" /></button>
            <button onClick={() => { setBuscaAberta(false); setBuscaQ('') }} className="rounded p-1" style={{ color: cores.muted }} aria-label="Fechar busca"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Conteúdo */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={viewportRef}
            onScroll={modo === 'scroll' ? onScroll : undefined}
            onTouchStart={modo === 'flip' ? onTouchStart : undefined}
            onTouchEnd={modo === 'flip' ? onTouchEnd : undefined}
            onMouseUp={aoSelecionar}
            className={cn('h-full', modo === 'scroll' ? 'overflow-y-auto' : 'overflow-hidden')}
          >
            {/* wrapper posicionado: leva o transform (virar) p/ mover conteúdo E overlay juntos */}
            <div
              ref={wrapperRef}
              className={cn('relative', modo === 'scroll' && 'mx-auto max-w-3xl')}
              style={modo === 'flip' ? { height: '100%', transform: `translateX(-${pagina * (colW + GAP)}px)`, transition: 'transform 220ms ease' } : undefined}
            >
              <div
                ref={contentRef}
                className={cn('leitura-conteudo leitura-prosa px-6 py-6 [&_a]:underline [&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-6 [&_li]:list-disc [&_p]:mb-3 [&_table]:my-3 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1', semGrifos && 'sem-grifos')}
                style={modo === 'flip'
                  ? { ...proseStyle, columnWidth: colW || undefined, columnGap: GAP, columnFill: 'auto', height: '100%' }
                  : proseStyle}
                dangerouslySetInnerHTML={{ __html: doc.html }}
              />
              {/* Overlay de GRIFOS EDITORIAIS (conteúdo). Some no "modo sem grifos" (exceto estruturais). */}
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
              {/* Overlay das anotações PESSOAIS (por cima dos grifos) */}
              <div ref={overlayRef} className="pointer-events-none absolute inset-0" aria-hidden>
                {anotacoes.map((a) => (rectsPorId[a.id] ?? []).map((r, i) => (
                  <div key={`${a.id}-${i}`} className="absolute rounded-[2px]" style={{ left: r.left, top: r.top, width: r.width, height: r.height, background: a.cor, opacity: 0.4, mixBlendMode: 'multiply' }} />
                )))}
              </div>
              {/* Overlay dos resultados de busca (realce laranja; atual mais forte) */}
              {matches.length > 0 && (
                <div className="pointer-events-none absolute inset-0" aria-hidden>
                  {matches.map((m, mi) => m.rects.map((r, i) => (
                    <div key={`m-${mi}-${i}`} className="absolute rounded-[2px]" style={{ left: r.left, top: r.top, width: r.width, height: r.height, background: '#f97316', opacity: mi === matchIdx ? 0.6 : 0.32, outline: mi === matchIdx ? '1px solid #ea580c' : 'none' }} />
                  )))}
                </div>
              )}
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

      {/* Questões inline: renderizadas DENTRO do conteúdo (portal p/ o contêiner injetado) */}
      {slots.map((s) => createPortal(
        <QuestaoLeitura key={s.q.docQuestaoId} documentoId={doc.id} q={s.q} corFg={cores.fg} corMuted={cores.muted} onRespondida={(qid) => setRespostas((p) => ({ ...p, [qid]: true }))} />,
        s.el,
      ))}

      {/* Barra direita: anotações (grifos + notas) */}
      {barraDir && (
        <aside className="flex w-72 shrink-0 flex-col border-l" style={{ borderColor: '#0000001a', background: cores.bg }}>
          <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: '#0000001a' }}>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: cores.fg }}><Highlighter className="h-4 w-4" /> Anotações</span>
            <button onClick={() => setBarraDir(false)} className="rounded p-1" style={{ color: cores.muted }} aria-label="Fechar"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {anotacoes.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs" style={{ color: cores.muted }}>Selecione um trecho do texto para grifar. Suas anotações aparecem aqui.</p>
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
