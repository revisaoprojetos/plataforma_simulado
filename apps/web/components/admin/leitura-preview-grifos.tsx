'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Save, Loader2, Bold, Eraser, X, ListTree, GitCompare, ArrowDown, ArrowUp, Trash2, Search, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { salvarConteudoHtml } from '@/app/admin/leitura/upload-actions'
import { DiffEspelho } from '@/components/leitura/diff-espelho'
import { listarVersoesDocumento, carregarDiffDocumento, reverterAlteracao } from '@/app/admin/leitura/alteracoes-actions'
import type { BlocoDiff, DiffDoc, VersaoInfo } from '@/lib/leitura/diff-tipos'

// Editor WYSIWYG de grifos DENTRO da prévia: o admin seleciona um trecho e aplica
// grifo (núcleo/complemento/prazo/exceção), negrito ou caixa (STJ/STF/Equipe/Atenção),
// vendo o resultado na hora (o CSS .leitura-prosa pinta os data-grifo/data-caixa).
// Salva o HTML editado via salvarConteudoHtml (re-sanitiza + versiona como rascunho).

// Grifos inline (decorativos) — cores batem com o CSS .leitura-prosa.
const GRIFOS_INLINE = [
  { id: 'nucleo', label: 'Núcleo', cor: '#fff35c', texto: '#111' },
  { id: 'complemento', label: 'Complemento', cor: '#a8d08d', texto: '#111' },
  { id: 'prazo', label: 'Prazo', cor: '#cc99ff', texto: '#111' },
  { id: 'excecao', label: 'Exceção', cor: '#f3b0b0', texto: '#c00000' },
] as const
// Caixas de destaque (estruturais) — cores batem com o CSS.
const CAIXAS = [
  { id: 'comentario', label: 'Equipe', cor: '#d0cece' },
  { id: 'stj', label: 'STJ', cor: '#fff2cc' },
  { id: 'stf', label: 'STF', cor: '#bdd6ee' },
  { id: 'alerta', label: 'Atenção', cor: '#fde9d9' },
] as const

const CONTENT_CLASS =
  'leitura-prosa px-6 py-5 text-sm leading-relaxed outline-none [&_a]:text-primary [&_a]:underline [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1'
// Fundo pontilhado do "canvas" da prévia (igual ao construtor de caderno).
const CANVAS_DOTS = 'bg-[radial-gradient(circle,theme(colors.slate.300)_1px,transparent_1px)] [background-size:18px_18px] dark:bg-[radial-gradient(circle,theme(colors.slate.700)_1px,transparent_1px)]'

function rotuloVersao(v: VersaoInfo): string {
  const base = v.nome ? `${v.nome} (v${v.versao})` : `v${v.versao}`
  const marca = v.atual ? ' (Atual)' : v.rascunho ? ' (rascunho)' : ''
  return base + marca
}

/** Dropdown estilizado de versão (substitui o <select> nativo). */
function SeletorVersao({ label, valor, opcoes, onChange }: { label: string; valor: number; opcoes: VersaoInfo[]; onChange: (v: number) => void }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [aberto])
  const atual = opcoes.find((o) => o.versao === valor)
  return (
    <div ref={ref} className="relative">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <button type="button" onClick={() => setAberto((v) => !v)} className={cn('flex h-9 w-full items-center gap-2 rounded-lg border bg-background px-2.5 text-left text-xs font-medium transition hover:bg-muted', aberto && 'ring-1 ring-primary', atual ? 'text-foreground' : 'text-muted-foreground')}>
        <span className="min-w-0 flex-1 truncate">{atual ? rotuloVersao(atual) : 'Selecione…'}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-56 space-y-px overflow-y-auto rounded-lg border bg-card p-1 shadow-lg">
          {opcoes.map((o) => {
            const on = o.versao === valor
            return (
              <button key={o.versao} type="button" onClick={() => { onChange(o.versao); setAberto(false) }} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition', on ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-muted')}>
                <span className="min-w-0 flex-1 truncate">{rotuloVersao(o)}</span>
                {on && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
const RESUMO_ZERO = { mod: 0, add: 0, rem: 0, igual: 0 }

/** Controles do editor de grifos expostos p/ a barra de topo do editor (desfazer/refazer). */
export type GrifoCtl = { dirty: boolean; podeDesfazer: boolean; podeRefazer: boolean; desfazer: () => void; refazer: () => void }

export function LeituraPreviewGrifos({ documentoId, html, podeEditar, artigos = 0, podeComparar = false, onGrifoCtl }: {
  documentoId: string; html: string; podeEditar: boolean; artigos?: number; podeComparar?: boolean
  onGrifoCtl?: (c: GrifoCtl | null) => void
}) {
  const router = useRouter()
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [editando, setEditando] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [maxH, setMaxH] = useState<number>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  // Sidebar em abas: Índice × Alterações (antes/depois). O diff carrega sob demanda.
  const [aba, setAba] = useState<'indice' | 'alteracoes'>('indice')
  const [versoes, setVersoes] = useState<VersaoInfo[] | null>(null)
  const [vAntes, setVAntes] = useState(0)
  const [vDepois, setVDepois] = useState(0)
  const [diff, setDiff] = useState<DiffDoc | null>(null)
  const [carregandoDiff, iniciarDiff] = useTransition()
  const [revertendo, setRevertendo] = useState<string | null>(null)
  const [buscaAlt, setBuscaAlt] = useState('')
  const [podeDesfazer, setPodeDesfazer] = useState(false)
  const [podeRefazer, setPodeRefazer] = useState(false)

  // Caixas "ENTENDIMENTO DO STJ/STF" colapsáveis na PRÉVIA (modo leitura): recolhidas por padrão,
  // expandem no clique da faixa do topo. No modo de EDIÇÃO de grifos ficam inteiras (p/ editar).
  useEffect(() => {
    if (editando) return
    const cont = viewRef.current
    if (!cont) return
    const onCab = (e: Event) => {
      const box = (e.currentTarget as HTMLElement).closest('.caixa-colapsavel') as HTMLElement | null
      if (!box) return
      if (box.hasAttribute('data-aberto')) box.removeAttribute('data-aberto')
      else box.setAttribute('data-aberto', '1')
    }
    const ligados: HTMLElement[] = []
    const aplicar = () => {
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
        // Vai num data-attr → renderizada via CSS ::before (sem nó de texto).
        const previa = (inner.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
        if (previa) cab.setAttribute('data-previa', previa)
        box.classList.add('caixa-colapsavel')
        // A caixa de LEGENDA dos grifos abre por padrão (o aluno vê as cores de cara); as demais recolhem.
        if (/^\s*LEGENDA\b/i.test(cab.textContent || '')) box.setAttribute('data-aberto', '1')
        else box.removeAttribute('data-aberto')
        cab.addEventListener('click', onCab); ligados.push(cab)
      }
    }
    aplicar()
    const raf = requestAnimationFrame(aplicar)
    const mo = new MutationObserver(aplicar)
    mo.observe(cont, { childList: true, subtree: true })
    return () => { cancelAnimationFrame(raf); mo.disconnect(); for (const c of ligados) c.removeEventListener('click', onCab) }
  }, [editando, html])

  // Índice (CAPÍTULO→Art→§) do conteúdo, para o professor navegar a prévia (mesma hierarquia do leitor).
  const secoes = useMemo(() => {
    type Sec = { dispId: string | null; artId: string | null; nivel: number; label: string }
    if (typeof window === 'undefined' || !html) return [] as Sec[]
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    const NIVEL: Record<string, number> = { livro: 0, parte: 0, titulo: 0, capitulo: 0, secao: 0, subsecao: 0, artigo: 1, paragrafo: 2, inciso: 3, alinea: 4, item: 4 }
    const disp = Array.from(parsed.querySelectorAll('[data-disp]'))
    const src = disp.length ? disp : Array.from(parsed.querySelectorAll('[data-art]'))
    return src.map((el): Sec => {
      const dispId = el.getAttribute('data-disp')
      const artId = el.getAttribute('data-art')
      const tipo = el.getAttribute('data-disp-tipo') || 'artigo'
      const id = dispId || `art-${artId}`
      const nivel = disp.length ? (NIVEL[tipo] ?? Math.min(4, (id.match(/\./g) || []).length + 1)) : 0
      return { dispId, artId, nivel, label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) || id }
    })
  }, [html])
  function pular(s: { dispId: string | null; artId: string | null }) {
    const cont = scrollRef.current; if (!cont) return
    const alvo = (s.dispId ? cont.querySelector(`[data-disp="${CSS.escape(s.dispId)}"]`) : s.artId ? cont.querySelector(`[data-art="${s.artId}"]`) : null) as HTMLElement | null
    if (!alvo) return
    alvo.scrollIntoView({ block: 'start', behavior: 'smooth' })
    // Pisca o alvo (remove+reflow p/ reiniciar a animação se clicar de novo no mesmo item).
    alvo.classList.remove('leitura-alvo')
    void alvo.offsetWidth
    alvo.classList.add('leitura-alvo')
    window.setTimeout(() => alvo.classList.remove('leitura-alvo'), 1700)
  }

  // Sempre que a aba Alterações abre, recarrega versões + diff PADRÃO (última versão × última que
  // de fato difere — pula republicações idênticas). Recarrega a cada abertura p/ refletir publicações.
  useEffect(() => {
    if (aba !== 'alteracoes') return
    iniciarDiff(async () => {
      const vsR = await listarVersoesDocumento(documentoId)
      const vs = vsR.versoes ?? []
      setVersoes(vs)
      setVDepois(vs.length ? Math.max(...vs.map((v) => v.versao)) : 0)
      setVAntes(0)   // "Antes" começa em BRANCO — o usuário escolhe com qual comparar
      setDiff(null)
    })
  }, [aba, documentoId])

  function recarregarDiff(a: number, b: number) {
    if (!a || !b) { setDiff(null); return } // sem "Antes" escolhido ainda
    iniciarDiff(async () => {
      const d = await carregarDiffDocumento(documentoId, a, b)
      setDiff(d.diff ?? { blocos: [], resumo: RESUMO_ZERO })
    })
  }

  // Busca dentro das alterações: filtra os blocos do espelho pelo texto digitado.
  const diffFiltrado = useMemo(() => {
    if (!diff) return null
    const q = buscaAlt.trim().toLowerCase()
    if (!q) return diff
    const txt = (b: BlocoDiff) => (b.estado === 'mod'
      ? `${b.rotulo ?? ''} ${b.antes.map((t) => t.s).join('')} ${b.depois.map((t) => t.s).join('')}`
      : `${b.rotulo ?? ''} ${(b.html ?? '').replace(/<[^>]+>/g, ' ')}`).toLowerCase()
    return { ...diff, blocos: diff.blocos.filter((b) => txt(b).includes(q)) }
  }, [diff, buscaAlt])
  // Preserva a posição de leitura ao entrar em edição (o conteúdo é re-montado como contentEditable
  // e o scroll pularia pro topo): ancora num dispositivo visível e o recoloca no mesmo offset.
  const ancoraScroll = useRef<{ tipo: 'disp' | 'art'; id: string; offset: number } | null>(null)
  function capturarAncora() {
    const cont = scrollRef.current
    ancoraScroll.current = null
    if (!cont) return
    const contTop = cont.getBoundingClientRect().top
    let alvo: HTMLElement | null = null, alvoTop = 0
    for (const el of Array.from(cont.querySelectorAll<HTMLElement>('[data-disp], [data-art]'))) {
      alvo = el; alvoTop = el.getBoundingClientRect().top - contTop
      if (alvoTop >= -4) break // primeiro dispositivo no/abaixo do topo do viewport
    }
    if (alvo) ancoraScroll.current = { tipo: alvo.getAttribute('data-disp') ? 'disp' : 'art', id: alvo.getAttribute('data-disp') || alvo.getAttribute('data-art') || '', offset: alvoTop }
  }
  function restaurarAncora() {
    const cont = scrollRef.current
    const a = ancoraScroll.current
    ancoraScroll.current = null
    if (!cont || !a?.id) return
    const attr = a.tipo === 'disp' ? 'data-disp' : 'data-art'
    const el = Array.from(cont.querySelectorAll<HTMLElement>(`[${attr}]`)).find((e) => e.getAttribute(attr) === a.id)
    if (!el) return
    cont.scrollTop += (el.getBoundingClientRect().top - cont.getBoundingClientRect().top) - a.offset
  }

  // Rola a prévia até o dispositivo do bloco de diff (clique no espelho de Alterações).
  function pularBloco(b: BlocoDiff) {
    if (!b.anchor) return
    pular({ dispId: b.anchor.tipo === 'disp' ? b.anchor.id : null, artId: b.anchor.tipo === 'art' ? b.anchor.id : null })
  }

  // Versão do rascunho pendente (onde é possível reverter). Reverter só faz sentido comparando
  // com ela (não mexe em versão já publicada). -1 quando não há rascunho separado.
  const rascunhoVersao = versoes?.find((v) => v.rascunho)?.versao ?? -1

  // Descarta (reverte) uma alteração: o dispositivo volta ao texto da versão anterior no rascunho.
  async function reverter(b: BlocoDiff) {
    if (!b.anchor || b.estado === undefined) return
    const key = `${b.anchor.tipo}:${b.anchor.id}`
    const ok = await confirmar({
      titulo: 'Descartar esta alteração?',
      mensagem: 'O dispositivo volta ao texto da versão anterior no rascunho. Ao publicar, o aluno não verá esta mudança.',
      confirmar: 'Descartar',
      destrutivo: true,
    })
    if (!ok) return
    setRevertendo(key)
    const r = await reverterAlteracao(documentoId, vAntes, vDepois, b.anchor, b.estado)
    setRevertendo(null)
    if (!r.ok) { toast.error(r.error ?? 'Não foi possível reverter.'); return }
    toast.success('Alteração descartada.')
    recarregarDiff(vAntes, vDepois)
    router.refresh() // recarrega o HTML do rascunho na prévia
  }

  // Marca (caixa colorida) os dispositivos ALTERADOS direto na prévia enquanto a aba Alterações
  // está aberta — "no lugar" da mudança, no meio do texto. Limpa ao sair da aba/editar.
  useEffect(() => {
    const cont = scrollRef.current
    if (!cont) return
    const CLS = ['leitura-alt', 'leitura-alt-mod', 'leitura-alt-add', 'leitura-alt-rem']
    const limpar = () => cont.querySelectorAll('.leitura-alt').forEach((el) => el.classList.remove(...CLS))
    limpar()
    if (aba !== 'alteracoes' || !diff || editando) return
    for (const b of diff.blocos) {
      if (!b.anchor) continue
      const sel = b.anchor.tipo === 'disp' ? `[data-disp="${CSS.escape(b.anchor.id)}"]` : `[data-art="${CSS.escape(b.anchor.id)}"]`
      const el = cont.querySelector(sel) as HTMLElement | null
      if (!el) continue
      el.classList.add('leitura-alt', b.estado === 'add' ? 'leitura-alt-add' : b.estado === 'rem' ? 'leitura-alt-rem' : 'leitura-alt-mod')
    }
    return limpar
  }, [aba, diff, editando, html])

  // Adapta a altura do canvas à tela: mede o topo e ocupa até 16px do fim da janela.
  useEffect(() => {
    const medir = () => {
      const el = canvasRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      setMaxH(Math.max(360, Math.round(window.innerHeight - top - 16)))
    }
    medir()
    const t = setTimeout(medir, 120)
    window.addEventListener('resize', medir)
    return () => { clearTimeout(t); window.removeEventListener('resize', medir) }
  }, [editando, html])

  // Ao entrar no modo de edição, injeta o HTML atual (imperativo: contentEditable
  // não pode ser controlado pelo React sem clobber das edições do usuário).
  useEffect(() => {
    if (editando && boxRef.current) {
      boxRef.current.innerHTML = html; setDirty(false)
      histRef.current = [html]; idxRef.current = 0; setPodeDesfazer(false); setPodeRefazer(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando])

  // Restaura a posição de leitura DEPOIS da troca view↔edição, já com o layout final. No view mode
  // as caixas STJ recolhem na re-montagem (instantâneo, sem animação de transição no mount), então
  // este efeito — declarado após o de recolher e o de injeção — mede as posições certas.
  useEffect(() => {
    if (!ancoraScroll.current) return
    const raf = requestAnimationFrame(restaurarAncora)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando])

  // Remove um elemento mantendo os filhos no lugar (unwrap).
  function desembrulhar(el: Element) {
    const p = el.parentNode; if (!p) return
    while (el.firstChild) p.insertBefore(el.firstChild, el)
    p.removeChild(el)
    ;(p as any).normalize?.()
  }

  function selecaoNoEditor(): Range | null {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return null
    const r = sel.getRangeAt(0)
    if (!boxRef.current?.contains(r.commonAncestorContainer)) return null
    return r
  }

  // Aplica um grifo inline à seleção. Grifos internos são desfeitos (o novo tipo
  // vale para todo o trecho); grifos ancestrais permanecem (grifo parcial).
  function aplicarGrifo(tipo: string) {
    const range = selecaoNoEditor()
    if (!range || range.collapsed) { toast.message('Selecione um trecho para grifar'); return }
    const span = document.createElement('span')
    span.setAttribute('data-grifo', tipo)
    try { range.surroundContents(span) }
    catch { const frag = range.extractContents(); span.appendChild(frag); range.insertNode(span) }
    span.querySelectorAll('[data-grifo]').forEach(desembrulhar)
    span.normalize()
    window.getSelection()?.removeAllRanges()
    setDirty(true)
    boxRef.current?.focus()
    snapshot()
  }

  // Remove grifos inline que tocam a seleção (ou o grifo sob o cursor).
  function removerGrifo() {
    const box = boxRef.current; if (!box) return
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const alvos = Array.from(box.querySelectorAll('[data-grifo]')).filter((g) => range.intersectsNode(g))
    if (!alvos.length) {
      let n: Node | null = sel.anchorNode
      while (n && n !== box) { if (n.nodeType === 1 && (n as Element).hasAttribute?.('data-grifo')) { alvos.push(n as Element); break } n = n.parentNode }
    }
    if (!alvos.length) { toast.message('Nenhum grifo na seleção'); return }
    alvos.forEach(desembrulhar)
    setDirty(true)
    snapshot()
  }

  function negrito() {
    boxRef.current?.focus()
    try { document.execCommand('styleWithCSS', false, 'false'); document.execCommand('bold') } catch { /* ok */ }
    setDirty(true)
    snapshot()
  }

  // Envolve os parágrafos selecionados numa caixa; se já estiver numa caixa, troca
  // o tipo (ou desfaz, se for o mesmo tipo) — toggle.
  function toggleCaixa(tipo: string) {
    const box = boxRef.current; if (!box) return
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) return
    let n: Node | null = sel.anchorNode
    while (n && n !== box) { if (n.nodeType === 1 && (n as Element).getAttribute?.('data-caixa')) break; n = n.parentNode }
    const caixa = n && n !== box ? (n as Element) : null
    if (caixa?.getAttribute('data-caixa')) {
      if (caixa.getAttribute('data-caixa') === tipo) desembrulhar(caixa)
      else caixa.setAttribute('data-caixa', tipo)
      setDirty(true); snapshot(); return
    }
    const range = sel.getRangeAt(0)
    const blocos = Array.from(box.children).filter((ch) => range.intersectsNode(ch))
    if (!blocos.length) { toast.message('Selecione ao menos um parágrafo'); return }
    const div = document.createElement('div'); div.setAttribute('data-caixa', tipo)
    box.insertBefore(div, blocos[0]); blocos.forEach((b) => div.appendChild(b))
    setDirty(true)
    snapshot()
  }

  async function salvar() {
    if (!boxRef.current) return
    setSalvando(true)
    const r = await salvarConteudoHtml(documentoId, boxRef.current.innerHTML)
    setSalvando(false)
    if (r.ok) { toast.success('Grifos salvos'); setDirty(false); router.refresh() }
    else toast.error(r.error ?? 'Erro ao salvar.')
  }

  // Histórico PRÓPRIO (snapshots do innerHTML). O undo nativo não pega as operações de grifo/caixa
  // (surroundContents/DOM manual), então mantemos nossa pilha — cobre grifo/caixa/negrito/digitação
  // e dá enable/disable exato (bloqueia quando não há mais o que desfazer/refazer).
  const histRef = useRef<string[]>([])
  const idxRef = useRef(0)
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const atualizarFlags = useCallback(() => {
    setPodeDesfazer(idxRef.current > 0)
    setPodeRefazer(idxRef.current < histRef.current.length - 1)
  }, [])
  const snapshot = useCallback(() => {
    const h = boxRef.current?.innerHTML ?? ''
    if (histRef.current[idxRef.current] === h) return
    histRef.current = histRef.current.slice(0, idxRef.current + 1)
    histRef.current.push(h)
    if (histRef.current.length > 80) histRef.current.shift()
    idxRef.current = histRef.current.length - 1
    atualizarFlags()
  }, [atualizarFlags])
  const snapshotDebounced = useCallback(() => {
    if (snapTimer.current) clearTimeout(snapTimer.current)
    snapTimer.current = setTimeout(() => snapshot(), 400)
  }, [snapshot])
  const restaurar = useCallback((delta: number) => {
    if (snapTimer.current) { clearTimeout(snapTimer.current); snapshot() } // consolida digitação pendente
    const alvo = idxRef.current + delta
    if (alvo < 0 || alvo >= histRef.current.length) return
    idxRef.current = alvo
    if (boxRef.current) boxRef.current.innerHTML = histRef.current[alvo]
    setDirty(true); atualizarFlags(); boxRef.current?.focus()
  }, [snapshot, atualizarFlags])
  const desfazer = useCallback(() => restaurar(-1), [restaurar])
  const refazer = useCallback(() => restaurar(1), [restaurar])

  // Expõe os controles de grifo (desfazer/refazer) para a barra de topo do editor.
  useEffect(() => {
    if (!onGrifoCtl) return
    onGrifoCtl(editando ? { dirty, podeDesfazer, podeRefazer, desfazer, refazer } : null)
    return () => onGrifoCtl(null)
  }, [onGrifoCtl, editando, dirty, podeDesfazer, podeRefazer, desfazer, refazer])

  async function sair() {
    if (dirty && !(await confirmar({ titulo: 'Descartar alterações?', mensagem: 'Há grifos não salvos. Sair mesmo assim?', confirmar: 'Descartar', destrutivo: true }))) return
    capturarAncora()
    setEditando(false)
  }

  // Botão de barra (não perde a seleção ao clicar → onMouseDown preventDefault).
  const Btn = ({ onClick, title, children, className }: { onClick: () => void; title: string; children: ReactNode; className?: string }) => (
    <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted', className)}>
      {children}
    </button>
  )

  return (
    <div ref={canvasRef} style={{ height: maxH }} className="grid min-h-[460px] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[280px_1fr]">
      {/* ESQUERDA: painel de controles (flat, estilo construtor) */}
      <div className="flex min-h-0 flex-col gap-3 overflow-hidden border-b bg-muted/20 p-3 lg:border-b-0 lg:border-r">
        <div className="flex shrink-0 flex-col gap-3">
        {podeEditar ? (
          <>
            {/* Mesmo botão no topo (largura cheia) alterna Editar grifos ↔ Fechar edição. */}
            {!editando ? (
              <button onClick={() => { capturarAncora(); setEditando(true) }} disabled={!html} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-semibold transition hover:bg-muted disabled:opacity-50">
                <Pencil className="h-4 w-4" /> Editar grifos
              </button>
            ) : (
              <button onClick={sair} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-semibold transition hover:bg-muted">
                <X className="h-4 w-4" /> Fechar edição
              </button>
            )}

            {editando && (
              <>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Grifo</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {GRIFOS_INLINE.map((g) => (
                      <Btn key={g.id} title={`Grifar: ${g.label}`} onClick={() => aplicarGrifo(g.id)} className="justify-start bg-card">
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10" style={{ background: g.cor }} />
                        <span className="truncate" style={{ color: g.id === 'excecao' ? g.texto : undefined, fontWeight: g.id === 'excecao' ? 700 : undefined }}>{g.label}</span>
                      </Btn>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Btn title="Negrito (selecione o trecho)" onClick={negrito} className="justify-center bg-card"><Bold className="h-3.5 w-3.5" /> Negrito</Btn>
                    <Btn title="Remover grifo da seleção" onClick={removerGrifo} className="justify-center bg-card text-destructive hover:bg-destructive/10"><Eraser className="h-3.5 w-3.5" /> Remover</Btn>
                  </div>
                </div>
                <div className="space-y-1.5 border-t pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Caixa</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CAIXAS.map((c) => (
                      <Btn key={c.id} title={`Caixa: ${c.label} (clique de novo p/ desfazer)`} onClick={() => toggleCaixa(c.id)} className="justify-start bg-card">
                        <span className="h-3.5 w-3.5 shrink-0 rounded border border-black/10" style={{ background: c.cor }} />
                        <span className="truncate">{c.label}</span>
                      </Btn>
                    ))}
                  </div>
                </div>
                {/* Salvar embaixo dos controles, largura cheia. */}
                <button onClick={salvar} disabled={salvando || !dirty} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
                </button>
              </>
            )}
          </>
        ) : <p className="text-xs text-muted-foreground">Somente leitura.</p>}
        </div>

        {/* Sidebar com abas: ÍNDICE (navega a prévia) × ALTERAÇÕES (antes/depois). As abas só
            aparecem quando há histórico p/ comparar; senão mostra só o índice. Preenche a altura
            restante do painel com um único scroll (sem cap de 46vh que cortava a lista). */}
        {(secoes.length > 0 || podeComparar) && (
          <div className="flex min-h-0 flex-1 flex-col gap-2 border-t pt-3">
            {podeComparar ? (
              <div className="relative flex shrink-0 border-b text-xs">
                <button onClick={() => setAba('indice')} className={cn('flex flex-1 items-center justify-center gap-1.5 px-2 py-2 font-semibold transition-colors', aba === 'indice' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
                  <ListTree className="h-3.5 w-3.5" /> Índice
                </button>
                <button onClick={() => setAba('alteracoes')} className={cn('flex flex-1 items-center justify-center gap-1.5 px-2 py-2 font-semibold transition-colors', aba === 'alteracoes' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
                  <GitCompare className="h-3.5 w-3.5" /> Alterações
                </button>
                {/* Linha embaixo que desliza para a aba ativa. */}
                <span className="pointer-events-none absolute -bottom-px h-0.5 w-1/2 rounded-full bg-primary transition-[left] duration-300 ease-out" style={{ left: aba === 'indice' ? '0%' : '50%' }} />
              </div>
            ) : (
              <p className="flex shrink-0 items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <ListTree className="h-3.5 w-3.5" /> Índice
              </p>
            )}

            {/* Painel ÍNDICE */}
            {(!podeComparar || aba === 'indice') && (
              secoes.length > 0 ? (
                <div className="min-h-0 flex-1 space-y-px overflow-y-auto pr-1">
                  {secoes.map((s, i) => (
                    <div key={i}>
                      {/* Divisória tracejada antes de cada CAPÍTULO/TÍTULO/SEÇÃO (menos o primeiro). */}
                      {s.nivel === 0 && i > 0 && <div className="mx-1 my-1.5 border-t border-dashed border-border" />}
                      <button
                        onClick={() => pular(s)}
                        className={cn(
                          'block w-full truncate rounded-md py-1 pr-1.5 text-left leading-tight transition',
                          s.nivel === 0
                            ? 'bg-muted/40 text-xs font-bold text-foreground hover:bg-primary/10 hover:text-primary'
                            : 'text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                        style={{ paddingLeft: 8 + s.nivel * 12, fontWeight: s.nivel === 1 ? 600 : undefined, opacity: s.nivel >= 3 ? 0.75 : 1 }}
                        title={s.label}
                      >
                        {s.label}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-1 py-2 text-xs text-muted-foreground">Sem seções detectadas neste conteúdo.</p>
              )
            )}

            {/* Painel ALTERAÇÕES (antes/depois) — carregado sob demanda ao abrir a aba */}
            {podeComparar && aba === 'alteracoes' && (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {versoes === null ? (
                  <div className="flex items-center gap-2 px-1 py-4 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando versões…</div>
                ) : versoes.length < 2 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Só há uma versão — sem histórico para comparar.</p>
                ) : (
                  <>
                    {/* Seletores de versão (mais recente EM CIMA, "antes" embaixo) */}
                    <div className="space-y-1.5 rounded-lg border bg-card/60 p-2">
                      <SeletorVersao label="Depois (mais recente)" valor={vDepois} opcoes={versoes.filter((v) => v.versao !== vAntes)} onChange={(b) => { setVDepois(b); recarregarDiff(vAntes, b) }} />
                      <div className="flex justify-center text-muted-foreground"><ArrowUp className="h-3.5 w-3.5" /></div>
                      <SeletorVersao label="Antes" valor={vAntes} opcoes={versoes.filter((v) => v.versao !== vDepois)} onChange={(a) => { setVAntes(a); recarregarDiff(a, vDepois) }} />
                    </div>
                    {!vAntes ? (
                      <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Escolha a versão <strong>Antes</strong> (embaixo) para comparar com a de cima.</p>
                    ) : (
                    <>
                    {/* Buscar nas alterações (filtra o espelho por texto) */}
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input value={buscaAlt} onChange={(e) => setBuscaAlt(e.target.value)} placeholder="Buscar nas alterações…" className="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                    {/* Resumo (total do diff, não da busca) */}
                    {diff && (
                      <div className="flex flex-wrap items-center gap-1 text-[10px]">
                        {carregandoDiff && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700 dark:text-amber-300">{diff.resumo.mod} alt.</span>
                        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">{diff.resumo.add} novo(s)</span>
                        <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 font-semibold text-rose-700 dark:text-rose-300">{diff.resumo.rem} rem.</span>
                      </div>
                    )}
                    {/* Espelho (filtrado pela busca) */}
                    {vAntes === vDepois ? (
                      <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Escolha duas versões diferentes.</p>
                    ) : diff && diff.resumo.mod + diff.resumo.add + diff.resumo.rem === 0 ? (
                      <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhuma diferença de texto.</p>
                    ) : diffFiltrado && diffFiltrado.blocos.length === 0 ? (
                      <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nada encontrado para “{buscaAlt}”.</p>
                    ) : diffFiltrado ? (
                      <div className={cn(carregandoDiff && 'opacity-60')}>
                        <DiffEspelho
                          diff={diffFiltrado}
                          onSelecionar={pularBloco}
                          acaoBloco={(b) => (b.anchor && vDepois === rascunhoVersao) ? (
                            <button
                              type="button"
                              onClick={() => reverter(b)}
                              disabled={revertendo === `${b.anchor.tipo}:${b.anchor.id}`}
                              title="Descartar esta alteração (reverte o trecho no rascunho)"
                              className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                            >
                              {revertendo === `${b.anchor.tipo}:${b.anchor.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          ) : null}
                        />
                      </div>
                    ) : null}
                    </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* DIREITA: prévia grande sobre canvas pontilhado (igual ao construtor) */}
      <div ref={scrollRef} className={cn('overflow-auto p-5', CANVAS_DOTS)}>
        {editando ? (
          <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border bg-card shadow-sm">
            <div ref={boxRef} contentEditable suppressContentEditableWarning spellCheck={false} onInput={() => { setDirty(true); snapshotDebounced() }}
              className={cn(CONTENT_CLASS, 'focus:ring-1 focus:ring-inset focus:ring-ring')} />
          </div>
        ) : html ? (
          <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border bg-card shadow-sm">
            <div ref={viewRef} className={CONTENT_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="rounded-lg border bg-card px-5 py-10 text-center text-sm text-muted-foreground shadow-sm">Sem conteúdo ainda. Importe na aba <span className="font-medium text-foreground">Configuração</span>.</p>
          </div>
        )}
      </div>
    </div>
  )
}
