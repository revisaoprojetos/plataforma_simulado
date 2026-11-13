'use client'

// MATRIZ de regras do Produto (módulo > aula × público) — EDITÁVEL e com MULTISSELEÇÃO.
//  · 1ª coluna fixa com a ÁRVORE (módulo > aula, recolhível, numerada, resumo de % liberado por módulo); cabeçalho fixo com NOME CURTO
//    do público (tooltip = nome completo), colunas agrupadas por tipo (Base · Grupos · Segmentos), fixar/ocultar coluna, densidade;
//  · célula = estado (ícone + cor por token); "Padrão/sem regra" em tom neutro para destacar o que é DIFERENTE; filtros no servidor
//    (módulo, efeito, busca, "só diferenças"); só os módulos EXPANDIDOS trazem as aulas (backend-first, nada de calcular aqui);
//  · seleção: clique, Shift (intervalo), Ctrl/Cmd (alternar), arrastar; linha inteira (módulo seleciona as aulas), coluna inteira,
//    "selecionar todos filtrados"; barra de ação em lote fixa (Esc limpa) -> painel de edição (prévia + relatório).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban, CalendarClock, Check, CheckCheck, ChevronDown, ChevronRight, CircleCheck, Columns3, Eye, EyeOff, Loader2, Lock, Minus, Pin, PinOff,
  Rows3, Search, X, ClipboardPaste, Copy, Trash2, UnfoldVertical, FoldVertical, Unlock,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Nota } from '@/app/admin/revisao/_comp/lista'
import { cn } from '@/lib/utils'
import type { CelulaMatriz, DadosMatriz, EfeitoRegra, LinhaMatriz, PublicoCol } from '@/lib/produtos/mapa-regras-tipos'
import { EFEITO_ROTULO } from '@/lib/produtos/mapa-regras-tipos'
import {
  chaveCelula, nomesCurtos, resolverPares, resumirPares, retangulo, selecaoTotal, selecaoVazia, type SelecaoMatriz,
} from '@/lib/produtos/matriz-util'
import { carregarMatrizAction } from './regras-actions'
import { PainelEdicaoRegras, copiarRegraDaCelula, type AbaPainel, type PedidoPainel, type RegraCopiada } from './painel-edicao-regras'

const selectCls = 'h-9 rounded-lg border bg-card px-2.5 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'
const TIPO_ROT = { todos: 'Base', grupo: 'Grupo', segmento: 'Segmento' } as const
const TIPO_TAG: Record<PublicoCol['tipo'], string> = {
  todos: 'bg-muted text-muted-foreground',
  grupo: 'bg-primary/10 text-primary',
  segmento: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
}
// Estados da célula: ícone + cor por token/semântica (o "padrão/sem regra" fica neutro de propósito).
const EFEITO_CLS: Record<EfeitoRegra, string> = {
  liberado: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  cadeado: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  oculto: 'bg-muted text-muted-foreground',
  bloqueado: 'bg-destructive/10 text-destructive',
}
const EFEITO_BARRA: Record<EfeitoRegra, string> = { liberado: 'bg-emerald-500', cadeado: 'bg-amber-500', oculto: 'bg-muted-foreground/50', bloqueado: 'bg-destructive' }

function IconeEfeito({ c, className }: { c: CelulaMatriz; className?: string }) {
  if (c.efeito === 'liberado') return /\d{2}\/\d{2}/.test(c.rotulo) || c.camada === 'cronograma' ? <CalendarClock className={className} /> : <CircleCheck className={className} />
  if (c.efeito === 'cadeado') return /\d{2}\/\d{2}/.test(c.rotulo) ? <CalendarClock className={className} /> : <Lock className={className} />
  if (c.efeito === 'oculto') return <EyeOff className={className} />
  return <Ban className={className} />
}

const LS = (k: string) => `regras-matriz:${k}`
function lerLS<T>(chave: string, padrao: T): T {
  try { const v = window.localStorage.getItem(chave); return v ? (JSON.parse(v) as T) : padrao } catch { return padrao }
}
function gravarLS(chave: string, valor: unknown) { try { window.localStorage.setItem(chave, JSON.stringify(valor)) } catch { /* modo privado / cheio */ } }

export interface PedidoAplicarEm { colunas: string[]; nonce: number }

export function MatrizRegras({ produtoId, ativa, podeEditar, aplicarEm, onMudou, onIrPublicos, somente }: {
  produtoId: string; ativa: boolean; podeEditar: boolean
  /** "O que este público recebe": a matriz com UMA coluna (a chave do público). */
  somente?: string
  /** Vindo de "Públicos": mostra estas colunas, seleciona-as e abre o painel. */
  aplicarEm: PedidoAplicarEm | null
  onMudou: () => void
  onIrPublicos: () => void
}) {
  // ── preferências (localStorage, com try/catch) ──
  const [cols, setCols] = useState<string[] | null>(null)
  const [fixas, setFixas] = useState<string[]>([])
  const [densidade, setDensidade] = useState<'compacta' | 'confortavel'>('compacta')
  useEffect(() => {
    setCols(lerLS<string[] | null>(LS(`cols:${produtoId}`), null))
    setFixas(lerLS<string[]>(LS(`fixas:${produtoId}`), []))
    setDensidade(lerLS<'compacta' | 'confortavel'>(LS('densidade'), 'compacta'))
  }, [produtoId])
  const salvarCols = (n: string[]) => { setCols(n); gravarLS(LS(`cols:${produtoId}`), n) }
  const salvarFixas = (n: string[]) => { setFixas(n); gravarLS(LS(`fixas:${produtoId}`), n) }

  // ── filtros (servidor) ──
  const [q, setQ] = useState(''); const [qDeb, setQDeb] = useState('')
  const [modulo, setModulo] = useState(''); const [efeito, setEfeito] = useState<EfeitoRegra | ''>(''); const [soDif, setSoDif] = useState(false)
  useEffect(() => { const t = setTimeout(() => setQDeb(q.trim()), 300); return () => clearTimeout(t) }, [q])
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  // ── dados ──
  const [dados, setDados] = useState<DadosMatriz | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [pendentes, setPendentes] = useState<Set<string>>(new Set())
  const seq = useRef(0)
  const expKey = [...expandidos].sort().join(',')
  const colsEnvio = somente ? [somente] : (cols ?? [])
  const colsKey = colsEnvio.join(',')

  const carregar = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    const r = await carregarMatrizAction(produtoId, { cols: colsEnvio, expandir: [...expandidos], q: qDeb, modulo: modulo || undefined, efeito, soDiferencas: soDif })
      .catch(() => ({ error: 'Falha ao carregar a matriz.' }) as { error: string })
    if (mine !== seq.current) return
    setLoading(false)
    if (!('ok' in r)) { setErro(r.error); return }
    setErro(null); setDados(r.matriz); setPendentes(new Set())
    // 1ª visita sem preferência: base + grupos + segmentos que já têm regra (até 10).
    setCols((cur) => {
      if (cur !== null || somente) return cur
      // segmentos com regra primeiro (são os que têm datas/cronograma), depois base e grupos
      const elegiveis = r.matriz.publicos.filter((p) => p.tipo !== 'segmento' || p.comRegra)
      const padrao = [...elegiveis.filter((p) => p.tipo === 'todos'), ...elegiveis.filter((p) => p.tipo === 'segmento'), ...elegiveis.filter((p) => p.tipo === 'grupo')].slice(0, 10).map((p) => p.chave)
      return padrao.length ? padrao : r.matriz.colunas.map((c) => c.chave)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId, colsKey, expKey, qDeb, modulo, efeito, soDif])
  useEffect(() => { if (ativa) void carregar() }, [ativa, carregar])
  useEffect(() => { const h = () => { void carregar() }; window.addEventListener('produto-acesso-mudou', h); return () => window.removeEventListener('produto-acesso-mudou', h) }, [carregar])

  // ── derivados ──
  const colunas = useMemo(() => {
    const todas = dados?.colunas ?? []
    const ordem = { todos: 0, grupo: 1, segmento: 2 }
    const fx = new Set(fixas)
    return [...todas].sort((a, b) => (fx.has(a.chave) ? 0 : 1) - (fx.has(b.chave) ? 0 : 1) || ordem[a.tipo] - ordem[b.tipo])
  }, [dados, fixas])
  const curtos = useMemo(() => nomesCurtos(dados?.publicos ?? []), [dados])
  const nomeDe = useMemo(() => Object.fromEntries((dados?.publicos ?? []).map((p) => [p.chave, p.nome])), [dados])
  const numeros = useMemo(() => {
    const out: Record<string, string> = {}; const c: number[] = []
    for (const n of dados?.arvore ?? []) { c.length = n.nivel + 1; c[n.nivel] = (c[n.nivel] ?? 0) + 1; for (let i = n.nivel + 1; i < c.length; i++) c[i] = 0; out[n.id] = c.slice(0, n.nivel + 1).join('.') }
    return out
  }, [dados])
  const descendentes = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const n of dados?.arvore ?? []) { const l = m.get(n.raizId) ?? []; l.push(n.id); m.set(n.raizId, l) }
    return m // raiz -> [raiz, ...todas as filhas]
  }, [dados])
  const filtrando = !!(qDeb || efeito || soDif)
  const abertos = useMemo(() => new Set<string>([...expandidos, ...(dados?.autoExpandidos ?? [])]), [expandidos, dados])
  const linhas: LinhaMatriz[] = useMemo(() => {
    const out: LinhaMatriz[] = []
    for (const r of dados?.raizes ?? []) { out.push(r); const f = dados?.filhos[r.alvoId]; if (f && (abertos.has(r.alvoId) || filtrando)) out.push(...f) }
    return out
  }, [dados, abertos, filtrando])
  const idsLinhas = useMemo(() => linhas.map((l) => l.alvoId), [linhas])
  const chavesCols = useMemo(() => colunas.map((c) => c.chave), [colunas])
  const raizesOpcoes = (dados?.arvore ?? []).filter((n) => n.nivel === 0)

  // ── seleção ──
  const [sel, setSel] = useState<SelecaoMatriz>(selecaoVazia())
  const anchor = useRef<{ l: number; c: number } | null>(null)
  const arrastando = useRef(false); const moveu = useRef(false)
  const todosAlvos = useMemo(() => (dados?.arvore ?? []).map((n) => n.id), [dados])
  const pares = useMemo(() => resolverPares(sel, chavesCols, todosAlvos), [sel, chavesCols, todosAlvos])
  const resumoSel = useMemo(() => resumirPares(pares), [pares])
  const total = selecaoTotal(sel)
  const limpar = useCallback(() => { setSel(selecaoVazia()); anchor.current = null }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !painel) limpar() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limpar])
  useEffect(() => { const up = () => { arrastando.current = false }; window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up) }, [])

  const [painel, setPainel] = useState<PedidoPainel | null>(null)
  const [copiada, setCopiada] = useState<RegraCopiada | null>(null)

  function abrirPainel(aba: AbaPainel, unica?: { linha: LinhaMatriz; pub: PublicoCol; c: CelulaMatriz }) {
    const lista = [...pares.entries()].map(([publico, alvos]) => ({ publico, alvos: [...alvos] }))
    if (!lista.length) return
    setPainel({ aba, pares: lista, unica: unica ?? null })
  }

  function aoMouseDown(e: React.MouseEvent, li: number, ci: number, linha: LinhaMatriz, pub: PublicoCol) {
    if (e.button !== 0) return
    const k = chaveCelula(linha.alvoId, pub.chave)
    moveu.current = false
    if (e.shiftKey && anchor.current) {
      const r = retangulo(idsLinhas, chavesCols, anchor.current, { l: li, c: ci })
      setSel((s) => ({ ...s, celulas: e.ctrlKey || e.metaKey ? new Set([...s.celulas, ...r]) : new Set(r) }))
      e.preventDefault(); return
    }
    if (e.ctrlKey || e.metaKey) {
      setSel((s) => { const n = new Set(s.celulas); n.has(k) ? n.delete(k) : n.add(k); return { ...s, celulas: n } })
      anchor.current = { l: li, c: ci }; return
    }
    anchor.current = { l: li, c: ci }; arrastando.current = true
    setSel({ celulas: new Set([k]), linhas: new Set(), colunas: new Set() })
  }
  function aoEntrar(li: number, ci: number) {
    if (!arrastando.current || !anchor.current) return
    if (anchor.current.l === li && anchor.current.c === ci) return
    moveu.current = true
    setSel({ celulas: new Set(retangulo(idsLinhas, chavesCols, anchor.current, { l: li, c: ci })), linhas: new Set(), colunas: new Set() })
  }
  function aoClicar(e: React.MouseEvent, linha: LinhaMatriz, pub: PublicoCol, c: CelulaMatriz) {
    if (e.shiftKey || e.ctrlKey || e.metaKey || moveu.current) return // seleção múltipla: nada de painel
    setPainel({ aba: 'porque', pares: [{ publico: pub.chave, alvos: [linha.alvoId] }], unica: { linha, pub, c } })
  }
  function alternarLinha(linha: LinhaMatriz) {
    const ids = linha.nivel === 0 ? (descendentes.get(linha.alvoId) ?? [linha.alvoId]) : [linha.alvoId]
    setSel((s) => { const n = new Set(s.linhas); const tem = n.has(linha.alvoId); ids.forEach((i) => (tem ? n.delete(i) : n.add(i))); return { ...s, linhas: n } })
  }
  function alternarColuna(p: PublicoCol) {
    setSel((s) => { const n = new Set(s.colunas); n.has(p.chave) ? n.delete(p.chave) : n.add(p.chave); return { ...s, colunas: n } })
  }
  function selecionarTodosFiltrados() {
    const alvos = filtrando ? idsLinhas : (modulo ? (descendentes.get(modulo) ?? []) : todosAlvos)
    setSel({ celulas: new Set(), linhas: new Set(alvos), colunas: new Set() })
  }
  function alternarExpandir(id: string) {
    setExpandidos((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function expandirTudo() { setExpandidos(new Set((dados?.arvore ?? []).filter((n) => n.nivel === 0 && n.filhos > 0).map((n) => n.id).slice(0, 60))) }

  // ── aplicar vindo de "Públicos" ──
  const ultimoNonce = useRef(0)
  useEffect(() => {
    if (!aplicarEm || aplicarEm.nonce === ultimoNonce.current || !dados) return
    ultimoNonce.current = aplicarEm.nonce
    const novas = [...new Set([...(cols ?? dados.colunas.map((c) => c.chave)), ...aplicarEm.colunas])]
    if (novas.length > 40) { toast.error('Máximo de 40 colunas na matriz.'); return }
    salvarCols(novas)
    setSel({ celulas: new Set(), linhas: new Set(), colunas: new Set(aplicarEm.colunas) })
    setTimeout(() => setPainel({ aba: 'disponibilidade', pares: aplicarEm.colunas.map((publico) => ({ publico, alvos: todosAlvos })), unica: null }), 400)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplicarEm, dados])

  // ── colunas: diálogo ──
  const [dlgCols, setDlgCols] = useState(false)
  const [qCols, setQCols] = useState('')

  // posição das colunas fixas
  const LARGURA_ARVORE = 304
  const larguraCol = densidade === 'compacta' ? 104 : 132
  const fx = new Set(fixas)
  const left = (i: number) => LARGURA_ARVORE + i * larguraCol
  const nFixas = colunas.filter((c) => fx.has(c.chave)).length
  const alt = densidade === 'compacta' ? 'h-8' : 'h-11'

  const grupos = useMemo(() => {
    const out: Array<{ tipo: PublicoCol['tipo']; n: number }> = []
    for (const c of colunas) { const u = out[out.length - 1]; if (u && u.tipo === c.tipo) u.n++; else out.push({ tipo: c.tipo, n: 1 }) }
    return out
  }, [colunas])

  async function copiarDaCelula(linha: LinhaMatriz, pub: PublicoCol) { const c = await copiarRegraDaCelula(produtoId, linha.alvoId, pub.chave); if (c) { setCopiada(c); toast.success('Regra copiada. Selecione outras células e use “Colar regra”.') } }

  const celulaUnica = total === 1 && sel.celulas.size === 1 ? [...sel.celulas][0] : null

  return (
    <div className="space-y-3">
      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar módulo ou aula…" className="h-9 pl-8" aria-label="Buscar módulo ou aula" />
        </div>
        <select aria-label="Módulo" value={modulo} onChange={(e) => setModulo(e.target.value)} className={cn(selectCls, 'max-w-[14rem]')}>
          <option value="">Todos os módulos</option>
          {raizesOpcoes.map((n) => <option key={n.id} value={n.id}>{numeros[n.id]}. {n.titulo}</option>)}
        </select>
        <select aria-label="Efeito" value={efeito} onChange={(e) => setEfeito(e.target.value as EfeitoRegra | '')} className={selectCls}>
          <option value="">Todos os efeitos</option>
          {(Object.keys(EFEITO_ROTULO) as EfeitoRegra[]).map((e) => <option key={e} value={e}>{EFEITO_ROTULO[e]}</option>)}
        </select>
        <label className={cn('inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-[13px]', soDif ? 'border-primary bg-primary/5 text-primary' : 'bg-card')}>
          <input type="checkbox" checked={soDif} onChange={(e) => setSoDif(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--primary)]" />Só diferenças
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={expandirTudo} title="Expandir todos os módulos"><UnfoldVertical className="h-4 w-4" />Expandir</Button>
          <Button variant="outline" size="sm" onClick={() => setExpandidos(new Set())} title="Recolher todos"><FoldVertical className="h-4 w-4" />Recolher</Button>
          {podeEditar && <Button variant="outline" size="sm" onClick={selecionarTodosFiltrados} disabled={!dados}><CheckCheck className="h-4 w-4" />{filtrando ? 'Selecionar filtrados' : 'Selecionar tudo'}</Button>}
          {!somente && <Button variant="outline" size="sm" onClick={() => setDlgCols(true)}><Columns3 className="h-4 w-4" />Colunas ({colunas.length})</Button>}
          <Button variant="outline" size="sm" onClick={() => { const n = densidade === 'compacta' ? 'confortavel' : 'compacta'; setDensidade(n); gravarLS(LS('densidade'), n) }} title="Densidade das linhas">
            <Rows3 className="h-4 w-4" />{densidade === 'compacta' ? 'Compacta' : 'Confortável'}
          </Button>
        </div>
      </div>

      {/* Legenda compacta sempre visível */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda">
        {(['liberado', 'cadeado', 'oculto', 'bloqueado'] as EfeitoRegra[]).map((e) => (
          <span key={e} className="inline-flex items-center gap-1"><span className={cn('inline-flex h-5 w-5 items-center justify-center rounded', EFEITO_CLS[e])}><IconeEfeito c={{ efeito: e, rotulo: '', camada: 'disponibilidade', origem: '', porque: '', href: null }} className="h-3 w-3" /></span>{EFEITO_ROTULO[e]}</span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60">·</span>Padrão (sem regra)</span>
        <span className="ml-auto hidden md:inline">{podeEditar ? 'Clique = editar · arraste / Shift = intervalo · Ctrl = alternar · Esc = limpar' : 'Somente leitura'}</span>
      </div>

      {erro && <Nota tipo="aviso">{erro}</Nota>}
      {dados && dados.colunas.length < (cols?.length ?? 0) && <Nota tipo="info">Alguns públicos escolhidos não existem mais e foram omitidos.</Nota>}

      {/* Matriz */}
      <div className={cn('relative max-h-[72vh] overflow-auto rounded-2xl border bg-card shadow-sm', loading && 'opacity-90')} onMouseLeave={() => { arrastando.current = false }}>
        {loading && !dados && <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando a matriz…</div>}
        {dados && (
          <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 top-0 z-30 border-b bg-card px-3 text-left align-bottom" style={{ minWidth: LARGURA_ARVORE, width: LARGURA_ARVORE }}>
                  <div className="py-2 text-xs font-semibold text-muted-foreground">
                    Módulo / Aula
                    <span className="ml-2 font-normal">{dados.raizes.length} módulo(s){loading && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}</span>
                  </div>
                </th>
                {grupos.map((g, i) => (
                  <th key={`${g.tipo}${i}`} colSpan={g.n} className="sticky top-0 z-20 h-6 border-b border-l bg-card px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.tipo === 'todos' ? 'Base' : g.tipo === 'grupo' ? `Grupos (${g.n})` : `Segmentos (${g.n})`}
                  </th>
                ))}
              </tr>
              <tr>
                {colunas.map((p, i) => {
                  const fixa = fx.has(p.chave); const marcada = sel.colunas.has(p.chave)
                  return (
                    <th key={p.chave} title={`${TIPO_ROT[p.tipo]}: ${p.nome}${p.membros != null ? ` · ${p.membros} membro(s)` : ''}`}
                      className={cn('group sticky top-6 border-b border-l bg-card px-1.5 py-1 text-left align-bottom', fixa ? 'z-30' : 'z-20')}
                      style={{ minWidth: larguraCol, width: larguraCol, ...(fixa ? { left: left(i) } : {}) }}>
                      <div className="flex items-start gap-1">
                        {podeEditar && <button type="button" onClick={() => alternarColuna(p)} aria-label={`Selecionar a coluna ${p.nome}`} aria-pressed={marcada}
                          className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border', marcada ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-transparent hover:text-muted-foreground')}><Check className="h-3 w-3" /></button>}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold leading-tight">{curtos[p.chave] ?? p.nome}</div>
                          <span className={cn('mt-0.5 inline-block rounded px-1 text-[10px] font-medium leading-4', TIPO_TAG[p.tipo])}>{TIPO_ROT[p.tipo]}{p.membros != null ? ` · ${p.membros}` : ''}</span>
                        </div>
                        <div className="flex shrink-0 flex-col opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button type="button" aria-label={fixa ? 'Soltar coluna' : 'Fixar coluna'} title={fixa ? 'Soltar' : 'Fixar à esquerda'} onClick={() => salvarFixas(fixa ? fixas.filter((x) => x !== p.chave) : [...fixas, p.chave])} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">{fixa ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}</button>
                          {p.tipo !== 'todos' || colunas.length > 1 ? <button type="button" aria-label="Ocultar coluna" title="Ocultar coluna" onClick={() => salvarCols((cols ?? chavesCols).filter((x) => x !== p.chave))} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3 w-3" /></button> : null}
                        </div>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr><td colSpan={colunas.length + 1} className="px-4 py-10 text-center text-sm text-muted-foreground">{filtrando || modulo ? 'Nenhum módulo/aula com estes filtros.' : 'Este produto ainda não tem módulos.'}</td></tr>
              )}
              {linhas.map((linha, li) => {
                const raiz = linha.nivel === 0
                const aberta = raiz && (abertos.has(linha.alvoId) || filtrando) && !!dados.filhos[linha.alvoId]
                const no = dados.arvore.find((n) => n.id === linha.alvoId)
                const r = raiz ? dados.resumo[linha.alvoId] : null
                const pct = r && r.total ? Math.round((r.liberado / r.total) * 100) : null
                const marcada = sel.linhas.has(linha.alvoId)
                return (
                  <tr key={linha.alvoId} className={cn('group/linha', raiz && 'bg-muted/30')}>
                    <th scope="row" className={cn('sticky left-0 z-10 border-b text-left font-normal', raiz ? 'bg-muted' : 'bg-card', alt)} style={{ minWidth: LARGURA_ARVORE, width: LARGURA_ARVORE }}>
                      <div className="flex items-center gap-1.5 px-2" style={{ paddingLeft: 8 + linha.nivel * 16 }}>
                        {podeEditar && <button type="button" onClick={() => alternarLinha(linha)} aria-label={`Selecionar ${linha.titulo}`} aria-pressed={marcada}
                          className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', marcada ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-transparent hover:text-muted-foreground')}><Check className="h-3 w-3" /></button>}
                        {raiz && (no?.filhos ?? 0) > 0 ? (
                          <button type="button" onClick={() => alternarExpandir(linha.alvoId)} aria-expanded={aberta} aria-label={aberta ? 'Recolher' : 'Expandir'} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background">
                            {aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : <span className="w-5 shrink-0" />}
                        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">{numeros[linha.alvoId]}</span>
                        <span className={cn('min-w-0 flex-1 truncate', raiz ? 'font-semibold' : 'font-medium')} title={`${linha.disciplina} › ${linha.titulo}`}>{linha.titulo}</span>
                        {raiz && (no?.filhos ?? 0) > 0 && <span className="shrink-0 rounded-full bg-background px-1.5 text-[10px] tabular-nums text-muted-foreground" title="Aulas/submódulos">{no?.filhos}</span>}
                        {pct != null && (
                          <span className="flex w-12 shrink-0 items-center gap-1" title={r ? `${r.liberado} de ${r.total} células liberadas · ${r.diferentes} com regra` : undefined}>
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-background"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                            <span className="text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
                          </span>
                        )}
                      </div>
                    </th>
                    {colunas.map((p, ci) => {
                      const c = linha.celulas[p.chave]
                      const k = chaveCelula(linha.alvoId, p.chave)
                      const selecionada = sel.celulas.has(k) || marcada || sel.colunas.has(p.chave)
                      const fixa = fx.has(p.chave)
                      const fixaIdx = fixa ? colunas.filter((x) => fx.has(x.chave)).findIndex((x) => x.chave === p.chave) : -1
                      return (
                        <td key={p.chave} className={cn('border-b border-l p-0', fixa && 'sticky z-10 bg-card', alt)} style={{ minWidth: larguraCol, width: larguraCol, ...(fixa ? { left: left(fixaIdx) } : {}) }}>
                          {!c ? <span className="px-2 text-muted-foreground">—</span> : (
                            <div role="button" tabIndex={0} data-celula={k} title={`${c.origem}: ${c.porque}`} aria-label={`${linha.titulo} · ${p.nome}: ${c.rotulo}`}
                              onMouseDown={(e) => aoMouseDown(e, li, ci, linha, p)} onMouseEnter={() => aoEntrar(li, ci)} onClick={(e) => aoClicar(e, linha, p, c)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPainel({ aba: 'porque', pares: [{ publico: p.chave, alvos: [linha.alvoId] }], unica: { linha, pub: p, c } }) } }}
                              className={cn('flex h-full w-full cursor-pointer select-none items-center px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                selecionada && 'bg-primary/10 ring-2 ring-inset ring-primary', pendentes.has(k) && 'animate-pulse opacity-60')}>
                              {c.camada === 'base'
                                ? <span className="text-muted-foreground/50" title="Padrão: sem regra específica">·</span>
                                : <span className={cn('inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium', EFEITO_CLS[c.efeito])}><IconeEfeito c={c} className="h-3 w-3 shrink-0" /><span className="truncate">{c.rotulo}</span></span>}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {dados && <p className="text-xs text-muted-foreground">{dados.totalAlvos} módulo(s)/aula(s) no produto · {dados.publicos.length} público(s) disponíveis · atualizado {new Date(dados.geradoEm).toLocaleTimeString('pt-BR')}. As aulas de cada módulo carregam ao expandir. <button type="button" onClick={onIrPublicos} className="font-medium text-primary hover:underline">Gerenciar públicos</button></p>}

      {/* Barra de ação em lote (fixa) */}
      {podeEditar && total > 0 && (
        <div role="toolbar" aria-label="Ações em lote" className="fixed inset-x-3 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 rounded-2xl border bg-card px-3 py-2 shadow-lg">
          <span className="text-sm font-semibold tabular-nums">{resumoSel.pares.toLocaleString('pt-BR')} célula(s)</span>
          <span className="text-xs text-muted-foreground">{resumoSel.alvos} item(ns) × {resumoSel.publicos} público(s)</span>
          {resumoSel.erro && <span className="text-xs font-medium text-destructive">{resumoSel.erro}</span>}
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <Button size="sm" variant="outline" disabled={!!resumoSel.erro} onClick={() => abrirPainel('visibilidade-liberar')}><Unlock className="h-4 w-4" />Liberar</Button>
          <Button size="sm" variant="outline" disabled={!!resumoSel.erro} onClick={() => abrirPainel('visibilidade-ocultar')}><EyeOff className="h-4 w-4" />Ocultar</Button>
          <Button size="sm" variant="outline" disabled={!!resumoSel.erro} onClick={() => abrirPainel('visibilidade-cadeado')}><Lock className="h-4 w-4" />Bloquear</Button>
          <Button size="sm" disabled={!!resumoSel.erro} onClick={() => abrirPainel('disponibilidade')}><CalendarClock className="h-4 w-4" />Disponibilidade…</Button>
          <Button size="sm" variant="outline" disabled={!!resumoSel.erro} onClick={() => abrirPainel('excecao')}><Eye className="h-4 w-4" />Exceção…</Button>
          <Button size="sm" variant="outline" disabled={!!resumoSel.erro} onClick={() => abrirPainel('remover')}><Trash2 className="h-4 w-4" />Remover regras</Button>
          {celulaUnica && <Button size="sm" variant="ghost" onClick={() => { const { alvoId, publico } = { alvoId: celulaUnica.split('|')[0], publico: celulaUnica.slice(celulaUnica.indexOf('|') + 1) }; const linha = linhas.find((l) => l.alvoId === alvoId); const pub = colunas.find((c) => c.chave === publico); if (linha && pub) void copiarDaCelula(linha, pub) }}><Copy className="h-4 w-4" />Copiar regra</Button>}
          {copiada && <Button size="sm" variant="ghost" disabled={!!resumoSel.erro} onClick={() => abrirPainel('colar')} title={copiada.rotulo}><ClipboardPaste className="h-4 w-4" />Colar regra</Button>}
          <Button size="sm" variant="ghost" onClick={limpar} aria-label="Limpar seleção (Esc)"><Minus className="h-4 w-4" />Limpar <kbd className="ml-1 rounded border px-1 text-[10px]">Esc</kbd></Button>
        </div>
      )}

      {painel && (
        <PainelEdicaoRegras
          produtoId={produtoId} podeEditar={podeEditar} pedido={painel} copiada={copiada} nomes={nomeDe}
          titulosAlvos={Object.fromEntries((dados?.arvore ?? []).map((n) => [n.id, n.titulo]))}
          onFechar={() => setPainel(null)} onCopiar={(c) => { setCopiada(c); toast.success('Regra copiada. Selecione outras células e use “Colar regra”.') }}
          onAplicado={(afetadas) => { setPendentes(new Set(afetadas)); void carregar(); onMudou() }}
        />
      )}

      {/* Colunas */}
      <Dialog open={dlgCols} onOpenChange={setDlgCols}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Colunas da matriz</DialogTitle><DialogDescription>Escolha quais públicos aparecem (até 40). A escolha fica salva neste navegador.</DialogDescription></DialogHeader>
          <Input value={qCols} onChange={(e) => setQCols(e.target.value)} placeholder="Buscar público…" className="h-9" />
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
            {(['todos', 'grupo', 'segmento'] as const).map((tipo) => {
              const lista = (dados?.publicos ?? []).filter((p) => p.tipo === tipo && (!qCols || p.nome.toLowerCase().includes(qCols.toLowerCase())))
              if (!lista.length) return null
              const atuais = new Set(cols ?? chavesCols)
              return (
                <div key={tipo}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tipo === 'todos' ? 'Base' : tipo === 'grupo' ? 'Grupos do produto' : 'Segmentos'} ({lista.length})</span>
                    {tipo !== 'todos' && <span className="space-x-2 text-xs">
                      <button type="button" className="font-medium text-primary hover:underline" onClick={() => { const n = new Set(atuais); lista.forEach((p) => n.add(p.chave)); if (n.size > 40) { toast.error('Máximo de 40 colunas.'); return } salvarCols([...n]) }}>marcar</button>
                      <button type="button" className="font-medium text-primary hover:underline" onClick={() => { const n = new Set(atuais); lista.forEach((p) => n.delete(p.chave)); salvarCols([...n]) }}>desmarcar</button>
                    </span>}
                  </div>
                  {lista.map((p) => (
                    <label key={p.chave} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                      <input type="checkbox" checked={atuais.has(p.chave)} onChange={(e) => {
                        const n = new Set(atuais); e.target.checked ? n.add(p.chave) : n.delete(p.chave)
                        if (n.size > 40) { toast.error('Máximo de 40 colunas.'); return }
                        if (!n.size) { toast.error('Mantenha ao menos uma coluna.'); return }
                        salvarCols([...n])
                      }} />
                      <span className="min-w-0 flex-1"><span className="block truncate">{p.nome}</span><span className="text-[11px] text-muted-foreground">{curtos[p.chave]}{p.membros != null ? ` · ${p.membros} membro(s)` : ''}{p.tipo === 'segmento' && !p.comRegra ? ' · sem regra ainda' : ''}</span></span>
                      <span className={cn('rounded px-1 text-[10px] font-medium', TIPO_TAG[p.tipo])}>{TIPO_ROT[p.tipo]}</span>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => { setCols(null); gravarLS(LS(`cols:${produtoId}`), null); setFixas([]); gravarLS(LS(`fixas:${produtoId}`), []); setDlgCols(false); setTimeout(() => void carregar(), 0) }}>Restaurar padrão</Button>
            <Button onClick={() => setDlgCols(false)}>Pronto</Button>
          </div>
        </DialogContent>
      </Dialog>
      {nFixas > 0 && <span className="sr-only">{nFixas} coluna(s) fixa(s)</span>}
    </div>
  )
}
