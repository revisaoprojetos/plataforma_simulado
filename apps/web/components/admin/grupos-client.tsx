'use client'

import { useMemo, useState, useTransition } from 'react'
import type React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { criarGrupo, criarGrupoMestre, excluirGrupo, moverGrupo } from '@/app/admin/grupos/actions'
import { pedirTexto, confirmar } from '@/components/ui/confirm-dialog'
import { EditarGrupoDialog } from '@/components/admin/editar-grupo-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Plus, Users, Pencil, Trash2, Loader2, ChevronRight, ChevronDown,
  Folder, FolderOpen, FolderPlus, FolderInput, X, Check, GripVertical, FolderMinus,
  Search, ArrowUpDown, ChevronsUpDown, Hash, Download, FolderTree,
} from 'lucide-react'

type Grupo = { id: string; nome: string; membros: number; cor: string | null; is_mestre: boolean; pai_id: string | null; codigo?: string | null; criado_em?: string | null }
type Destino = { id: string; nome: string; cor: string | null; depth: number }
type Ordem = 'nome' | 'nome_desc' | 'membros' | 'membros_asc' | 'codigo'
type Filtro = 'todos' | 'grupos' | 'pastas' | 'vazios'
type Escopo = 'all' | 'orphan' | 'imported' | string // string = id de pasta

const ORDENS: { v: Ordem; label: string }[] = [
  { v: 'nome', label: 'Nome (A → Z)' },
  { v: 'nome_desc', label: 'Nome (Z → A)' },
  { v: 'membros', label: 'Mais membros' },
  { v: 'membros_asc', label: 'Menos membros' },
  { v: 'codigo', label: 'Código' },
]

const nf = (n: number) => n.toLocaleString('pt-BR')
// Grade das colunas da tabela (px + fr) — casa cabeçalho e linhas.
const GRID = '32px 22px minmax(0,1fr) 120px 108px 104px 96px'

/** Tempo relativo curto em pt-BR a partir de um ISO (client-side). */
function tempoRel(iso?: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (isNaN(t)) return '—'
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 60) return 'agora'
  const m = Math.floor(s / 60); if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24); if (d < 30) return `há ${d} dia${d > 1 ? 's' : ''}`
  const me = Math.floor(d / 30); if (me < 12) return `há ${me} ${me > 1 ? 'meses' : 'mês'}`
  const a = Math.floor(me / 12); return `há ${a} ano${a > 1 ? 's' : ''}`
}

export function GruposClient({ grupos }: { grupos: Grupo[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editando, setEditando] = useState<Grupo | null>(null)
  const [movendo, setMovendo] = useState<Grupo[] | null>(null)
  const [expandido, setExpandido] = useState<Set<string>>(() => new Set<string>())
  const [arrastando, setArrastando] = useState<Grupo | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('nome')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [escopo, setEscopo] = useState<Escopo>('all')
  const [sel, setSel] = useState<Set<string>>(() => new Set<string>())

  const byId = useMemo(() => new Map(grupos.map((g) => [g.id, g])), [grupos])

  // Árvore: filhos por pasta + nós de topo. Também expõe baseCmp/memOf.
  const { children, top, baseCmp } = useMemo(() => {
    const m = new Map<string, Grupo[]>()
    const t: Grupo[] = []
    for (const g of grupos) {
      const pai = g.pai_id && byId.has(g.pai_id) ? g.pai_id : null
      if (pai) { const a = m.get(pai) ?? []; a.push(g); m.set(pai, a) } else t.push(g)
    }
    const memOf = (g: Grupo): number => {
      if (!g.is_mestre) return g.membros
      let s = 0; const st = [...(m.get(g.id) ?? [])]
      while (st.length) { const n = st.pop()!; if (n.is_mestre) { const c = m.get(n.id); if (c) st.push(...c) } else s += n.membros }
      return s
    }
    const codeNum = (g: Grupo) => (g.codigo != null && g.codigo !== '' ? Number(g.codigo) : NaN)
    const baseCmp = (a: Grupo, b: Grupo): number => {
      switch (ordem) {
        case 'nome_desc': return b.nome.localeCompare(a.nome, 'pt-BR')
        case 'membros': return memOf(b) - memOf(a) || a.nome.localeCompare(b.nome, 'pt-BR')
        case 'membros_asc': return memOf(a) - memOf(b) || a.nome.localeCompare(b.nome, 'pt-BR')
        case 'codigo': {
          const ca = codeNum(a), cb = codeNum(b)
          if (!isNaN(ca) && !isNaN(cb)) return ca - cb
          if (!isNaN(ca)) return -1
          if (!isNaN(cb)) return 1
          return a.nome.localeCompare(b.nome, 'pt-BR')
        }
        default: return a.nome.localeCompare(b.nome, 'pt-BR')
      }
    }
    const treeCmp = (a: Grupo, b: Grupo) => Number(b.is_mestre) - Number(a.is_mestre) || baseCmp(a, b)
    for (const a of m.values()) a.sort(treeCmp)
    t.sort(treeCmp)
    return { children: m, top: t, baseCmp, memOf }
  }, [grupos, byId, ordem])

  const descendentesDe = (id: string): Set<string> => {
    const out = new Set<string>()
    const stack = [...(children.get(id) ?? [])]
    while (stack.length) { const n = stack.pop()!; if (out.has(n.id)) continue; out.add(n.id); const c = children.get(n.id); if (c) stack.push(...c) }
    return out
  }
  const membrosDe = (id: string) => { let s = 0; for (const d of descendentesDe(id)) { const g = byId.get(d); if (g && !g.is_mestre) s += g.membros } return s }
  const comunsDentro = (id: string) => { let n = 0; for (const d of descendentesDe(id)) { const g = byId.get(d); if (g && !g.is_mestre) n++ } return n }
  const semPai = (g: Grupo) => !(g.pai_id && byId.has(g.pai_id))

  // Estatísticas (KPIs).
  const pastas = useMemo(() => grupos.filter((g) => g.is_mestre), [grupos])
  const comuns = useMemo(() => grupos.filter((g) => !g.is_mestre), [grupos])
  const totalMembros = useMemo(() => comuns.reduce((a, g) => a + g.membros, 0), [comuns])
  const orfaos = useMemo(() => comuns.filter(semPai), [comuns, byId])
  const importados = useMemo(() => comuns.filter((g) => g.codigo), [comuns])

  // Escopo (painel de navegação) ativo → há filtro/busca também? Então lista plana.
  const flatAtivo = escopo !== 'all' || filtro !== 'todos' || busca.trim() !== ''

  // Base de itens conforme o escopo escolhido na esquerda.
  const baseDoEscopo = useMemo(() => {
    if (escopo === 'orphan') return orfaos
    if (escopo === 'imported') return importados
    if (escopo !== 'all') { const set = descendentesDe(escopo); return grupos.filter((g) => set.has(g.id)) }
    return grupos
  }, [escopo, grupos, orfaos, importados, children])

  // Lista plana (com filtro/busca aplicados).
  const flat = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return baseDoEscopo.filter((g) => {
      if (filtro === 'grupos' && g.is_mestre) return false
      if (filtro === 'pastas' && !g.is_mestre) return false
      if (filtro === 'vazios' && (g.is_mestre ? membrosDe(g.id) > 0 : g.membros > 0)) return false
      if (q && !(g.nome.toLowerCase().includes(q) || String(g.codigo ?? '').toLowerCase().includes(q))) return false
      return true
    }).sort(baseCmp)
  }, [baseDoEscopo, busca, filtro, baseCmp])

  // Linhas visíveis (árvore OU plana) — unifica render, seleção e contagem.
  const linhas = useMemo<{ g: Grupo; depth: number; arvore: boolean }[]>(() => {
    if (flatAtivo) return flat.map((g) => ({ g, depth: 0, arvore: false }))
    const out: { g: Grupo; depth: number; arvore: boolean }[] = []
    const walk = (nodes: Grupo[], d: number) => { for (const n of nodes) { out.push({ g: n, depth: d, arvore: true }); if (n.is_mestre && expandido.has(n.id)) walk(children.get(n.id) ?? [], d + 1) } }
    walk(top, 0)
    return out
  }, [flatAtivo, flat, top, children, expandido])

  const ids = useMemo(() => linhas.map((l) => l.g.id), [linhas])
  const todosMarcados = ids.length > 0 && ids.every((id) => sel.has(id))
  const selecionados = useMemo(() => [...sel].map((id) => byId.get(id)).filter(Boolean) as Grupo[], [sel, byId])

  const ordemPastas = useMemo(() => {
    const out: Destino[] = []
    const walk = (nodes: Grupo[], d: number) => { for (const n of nodes) if (n.is_mestre) { out.push({ id: n.id, nome: n.nome, cor: n.cor, depth: d }); walk(children.get(n.id) ?? [], d + 1) } }
    walk(top, 0)
    return out
  }, [children, top])

  // ── Ações ────────────────────────────────────────────────────────────────
  async function novo() {
    const nome = await pedirTexto({ titulo: 'Novo grupo', label: 'Nome do grupo', placeholder: 'ex.: Turma 2026', confirmar: 'Criar' })
    if (!nome) return
    start(async () => { const r = await criarGrupo(nome); if (r.ok) { toast.success('Grupo criado'); router.refresh() } else toast.error(r.error ?? 'Erro ao criar') })
  }
  async function novaPasta(pai?: Grupo) {
    const titulo = pai ? `Nova sub-pasta em “${pai.nome}”` : 'Nova pasta (grupo mestre)'
    const nome = await pedirTexto({ titulo, label: 'Nome da pasta', placeholder: 'ex.: Turmas 2026', confirmar: 'Criar pasta' })
    if (!nome) return
    start(async () => {
      const r = await criarGrupoMestre(nome, undefined, pai?.id ?? null)
      if (r.ok) { toast.success(pai ? 'Sub-pasta criada' : 'Pasta criada'); if (pai) expandir(pai.id); router.refresh() } else toast.error(r.error ?? 'Erro ao criar')
    })
  }
  async function excluir(g: Grupo) {
    const msg = g.is_mestre
      ? `Excluir a pasta "${g.nome}"? O que está dentro dela volta a ficar solto (não é apagado).`
      : `Excluir o grupo "${g.nome}"?`
    if (!(await confirmar({ mensagem: msg, destrutivo: true }))) return
    start(async () => { const r = await excluirGrupo(g.id); if (r.ok) { toast.success(g.is_mestre ? 'Pasta excluída' : 'Grupo excluído'); router.refresh() } else toast.error(r.error ?? 'Erro') })
  }
  async function excluirEmLote() {
    const n = selecionados.length
    if (!n) return
    if (!(await confirmar({ mensagem: `Excluir ${n} item(ns) selecionado(s)? Pastas soltam o conteúdo (não apaga).`, destrutivo: true }))) return
    start(async () => {
      let ok = 0
      for (const g of selecionados) { const r = await excluirGrupo(g.id); if (r.ok) ok++ }
      setSel(new Set())
      ok ? toast.success(`${ok} item(ns) excluído(s)`) : toast.error('Nada foi excluído')
      router.refresh()
    })
  }
  function exportarCsv() {
    const linhasCsv = [['Nome', 'Tipo', 'Membros', 'Código', 'Criado em'],
      ...selecionados.map((g) => [g.nome, g.is_mestre ? 'Pasta' : 'Grupo', String(g.is_mestre ? membrosDe(g.id) : g.membros), g.codigo ?? '', g.criado_em ?? ''])]
    const csv = linhasCsv.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'grupos.csv'; a.click(); URL.revokeObjectURL(url)
  }
  function toggle(id: string) { setExpandido((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function expandir(id: string) { setExpandido((p) => (p.has(id) ? p : new Set(p).add(id))) }
  function toggleSel(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const todasAbertas = pastas.length > 0 && pastas.every((f) => expandido.has(f.id))
  function toggleTudo() { setExpandido(todasAbertas ? new Set() : new Set(pastas.map((f) => f.id))) }

  // ── Drag & drop (só na árvore) ─────────────────────────────────────────────
  function doMover(g: Grupo, paiId: string | null) {
    setArrastando(null); setAlvo(null)
    if ((g.pai_id ?? null) === paiId) return
    start(async () => {
      const r = await moverGrupo(g.id, paiId)
      if (r.ok) { toast.success(paiId ? 'Movido para a pasta' : 'Solto da pasta'); router.refresh() } else toast.error(r.error ?? 'Erro ao mover')
    })
  }
  const dragProps = (g: Grupo): React.HTMLAttributes<HTMLDivElement> & { draggable: boolean } => ({
    draggable: true,
    onDragStart: (e) => { setArrastando(g); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', g.id) } catch {} },
    onDragEnd: () => { setArrastando(null); setAlvo(null) },
  })
  const bloqueados = useMemo(() => (arrastando ? descendentesDe(arrastando.id) : new Set<string>()), [arrastando, children])
  const podeSoltarNa = (paiId: string) =>
    !!arrastando && (arrastando.pai_id ?? null) !== paiId && arrastando.id !== paiId && !bloqueados.has(paiId)

  const scopeNome = escopo === 'all' ? 'Todos os grupos'
    : escopo === 'orphan' ? 'Sem pasta'
    : escopo === 'imported' ? 'Importados'
    : (byId.get(escopo)?.nome ?? 'Grupos')

  const navItens: { key: Escopo; nome: string; count: number; dot: string }[] = [
    { key: 'all', nome: 'Todos os grupos', count: comuns.length, dot: 'bg-primary' },
    { key: 'orphan', nome: 'Sem pasta', count: orfaos.length, dot: 'bg-amber-500' },
    { key: 'imported', nome: 'Importados', count: importados.length, dot: 'bg-muted-foreground' },
    ...pastas.filter(semPai).map((f) => ({ key: f.id as Escopo, nome: f.nome, count: comunsDentro(f.id), dot: 'bg-emerald-500' })),
  ]

  const filtros: { key: Filtro; label: string; count: number }[] = [
    { key: 'todos', label: 'Todos', count: baseDoEscopo.length },
    { key: 'grupos', label: 'Grupos', count: baseDoEscopo.filter((g) => !g.is_mestre).length },
    { key: 'pastas', label: 'Pastas', count: baseDoEscopo.filter((g) => g.is_mestre).length },
    { key: 'vazios', label: 'Sem membros', count: baseDoEscopo.filter((g) => (g.is_mestre ? membrosDe(g.id) === 0 : g.membros === 0)).length },
  ]

  const nada = grupos.length === 0

  return (
    <div className="animate-page space-y-5 pb-24">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span>Alunos</span><span>/</span><span className="text-foreground/70">Grupos</span><span>/</span>
            <span className="font-semibold text-primary">{scopeNome}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Organização de grupos</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Agrupe turmas em pastas (grupos mestre), mova em lote e acompanhe a distribuição de membros. Arraste as linhas para reorganizar a hierarquia.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => novaPasta()} disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-50">
            <FolderPlus className="h-4 w-4" /> Nova pasta
          </button>
          <button type="button" onClick={novo} disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Novo grupo
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Grupos" valor={nf(comuns.length)} hint="grupos comuns" />
        <Kpi label="Pastas" valor={nf(pastas.length)} hint="grupos mestre" />
        <Kpi label="Membros" valor={nf(totalMembros)} hint="vínculos ativos" />
        <Kpi label="Sem pasta" valor={nf(orfaos.length)} hint="precisam organização" destaque={orfaos.length > 0} />
      </div>

      {nada ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card py-16 text-center text-muted-foreground shadow-sm">
          <FolderTree className="h-8 w-8 opacity-40" />
          <p className="text-sm">Nenhum grupo cadastrado.</p>
          <button type="button" onClick={novo} className="text-sm font-medium text-primary hover:underline">Criar o primeiro</button>
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[236px_minmax(0,1fr)]">
          {/* Painel de navegação (esquerda) */}
          <aside className="rounded-2xl border bg-card p-3 shadow-sm lg:sticky lg:top-4">
            <div className="flex items-center justify-between px-1.5 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Navegação</span>
              <span className="font-mono text-[11px] text-muted-foreground">{nf(pastas.length)}</span>
            </div>
            <div className="space-y-0.5">
              {navItens.map((s) => {
                const on = escopo === s.key
                return (
                  <button key={s.key} type="button" onClick={() => setEscopo(s.key)}
                    className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors',
                      on ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground/80 hover:bg-muted')}>
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', s.dot)} />
                    <span className="min-w-0 flex-1 truncate">{s.nome}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{nf(s.count)}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-2 space-y-1.5 border-t pt-3">
              <span className="px-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Legenda</span>
              <div className="flex items-center gap-2 px-1.5 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Ativo com matrículas</div>
              <div className="flex items-center gap-2 px-1.5 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-amber-500" /> Ativo sem membros</div>
              <div className="flex items-center gap-2 px-1.5 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-muted-foreground" /> Importado</div>
            </div>
          </aside>

          {/* Tabela (direita) */}
          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            {/* Toolbar */}
            <div className="space-y-3 border-b bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, código ou pasta…"
                    className="w-full rounded-lg border bg-card py-2 pl-9 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  {busca && <button type="button" onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
                </div>
                <Select value={ordem} onValueChange={(v) => v && setOrdem(v as Ordem)}>
                  <SelectTrigger className="h-10 gap-2"><ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" /><SelectValue>{(v: string) => ORDENS.find((o) => o.v === v)?.label}</SelectValue></SelectTrigger>
                  <SelectContent>{ORDENS.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
                {!flatAtivo && (
                  <button type="button" onClick={toggleTudo}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                    <ChevronsUpDown className="h-4 w-4" /> {todasAbertas ? 'Recolher' : 'Expandir'}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Filtrar</span>
                {filtros.map((f) => {
                  const on = filtro === f.key
                  return (
                    <button key={f.key} type="button" onClick={() => setFiltro(f.key)}
                      className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition',
                        on ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground')}>
                      {f.label} <span className="font-mono opacity-70">{nf(f.count)}</span>
                    </button>
                  )
                })}
                <div className="flex-1" />
                <span className="text-xs text-muted-foreground">{nf(linhas.length)} linha(s)</span>
              </div>
            </div>

            {/* Cabeçalho da tabela */}
            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                <div style={{ gridTemplateColumns: GRID }}
                  className="grid items-center gap-2 border-b bg-muted/40 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <div className="flex justify-center">
                    <input type="checkbox" checked={todosMarcados} onChange={() => setSel(todosMarcados ? new Set() : new Set(ids))}
                      className="h-4 w-4 cursor-pointer accent-primary" aria-label="Selecionar todos" />
                  </div>
                  <div />
                  <div>Grupo / Pasta</div>
                  <div>Origem</div>
                  <div>Membros</div>
                  <div>Criado</div>
                  <div className="pr-1 text-right">Ações</div>
                </div>

                {/* Linhas */}
                {linhas.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
                    <Search className="h-6 w-6 opacity-40" />
                    <p className="text-sm font-semibold text-foreground">Nenhum grupo encontrado</p>
                    <p className="text-xs">Ajuste a busca ou remova os filtros ativos.</p>
                  </div>
                ) : linhas.map(({ g, depth, arvore }) => (
                  <LinhaGrupo key={g.id} g={g} depth={depth} arvore={arvore}
                    marcado={sel.has(g.id)} onSel={() => toggleSel(g.id)}
                    aberto={expandido.has(g.id)} onToggle={() => toggle(g.id)}
                    alvoAtivo={alvo === g.id}
                    nGrupos={g.is_mestre ? comunsDentro(g.id) : 0}
                    nMembros={g.is_mestre ? membrosDe(g.id) : g.membros}
                    criado={tempoRel(g.criado_em)}
                    dragProps={arvore ? dragProps(g) : undefined}
                    arrastandoId={arrastando?.id ?? null}
                    dropHandlers={arvore && g.is_mestre ? {
                      onDragOver: (e) => { if (podeSoltarNa(g.id)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setAlvo(g.id); expandir(g.id) } },
                      onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo((a) => (a === g.id ? null : a)) },
                      onDrop: (e) => { if (arrastando && podeSoltarNa(g.id)) { e.preventDefault(); doMover(arrastando, g.id) } },
                    } : undefined}
                    onNovaSub={() => novaPasta(g)} onEdit={() => setEditando(g)} onMove={() => setMovendo([g])} onDelete={() => excluir(g)} />
                ))}

                {/* Zona para tirar da pasta (ao arrastar algo que está dentro). */}
                {!flatAtivo && arrastando && arrastando.pai_id && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setAlvo('__solto__') }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo((a) => (a === '__solto__' ? null : a)) }}
                    onDrop={(e) => { if (arrastando) { e.preventDefault(); doMover(arrastando, null) } }}
                    className={cn('m-3 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-sm transition-colors',
                      alvo === '__solto__' ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-muted-foreground/30 text-muted-foreground')}>
                    <FolderMinus className="h-4 w-4" /> Solte aqui para tirar da pasta
                  </div>
                )}
              </div>
            </div>

            {/* Rodapé */}
            <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              <span>Mostrando {nf(linhas.length)} de {nf(grupos.length)} itens · {nf(totalMembros)} membros no total</span>
              {flatAtivo && <button type="button" onClick={() => { setEscopo('all'); setFiltro('todos'); setBusca('') }} className="font-semibold text-primary hover:underline">Limpar filtros</button>}
            </div>
          </section>
        </div>
      )}

      {/* Barra de seleção em massa */}
      {sel.size > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border bg-card py-2.5 pl-4 pr-2.5 shadow-2xl">
          <span className="text-sm font-bold">{nf(sel.size)} {sel.size === 1 ? 'selecionado' : 'selecionados'}</span>
          <span className="h-5 w-px bg-border" />
          <button type="button" onClick={() => setMovendo(selecionados)} disabled={pending}
            className="inline-flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm font-semibold transition-colors hover:border-primary hover:text-primary disabled:opacity-50">
            <FolderInput className="h-4 w-4" /> Mover para pasta
          </button>
          <button type="button" onClick={exportarCsv}
            className="inline-flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm font-semibold transition-colors hover:border-primary hover:text-primary">
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
          <button type="button" onClick={excluirEmLote} disabled={pending}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 text-sm font-bold text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Excluir
          </button>
          <button type="button" onClick={() => setSel(new Set())} title="Limpar seleção" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      )}

      {editando && <EditarGrupoDialog grupo={editando} onClose={() => setEditando(null)} />}
      {movendo && (
        <MoverGrupoDialog
          grupos={movendo}
          destinos={ordemPastas.filter((d) => !movendo.some((m) => m.id === d.id || descendentesDe(m.id).has(d.id)))}
          onDone={() => { setMovendo(null); setSel(new Set()) }}
          onClose={() => setMovendo(null)}
        />
      )}
    </div>
  )
}

function Kpi({ label, valor, hint, destaque }: { label: string; valor: string; hint: string; destaque?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-3.5 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn('text-2xl font-extrabold tracking-tight', destaque && 'text-amber-500')}>{valor}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
    </div>
  )
}

function OrigemBadge({ codigo }: { codigo?: string | null }) {
  if (codigo) return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 py-0.5 pl-1 pr-2.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 font-mono text-[9px] text-white">I</span> Importado
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-1 pr-2.5 text-[11px] font-bold text-muted-foreground">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted-foreground/70 font-mono text-[9px] text-background">+</span> Criado
    </span>
  )
}

function LinhaGrupo({
  g, depth, arvore, marcado, onSel, aberto, onToggle, alvoAtivo, nGrupos, nMembros, criado,
  dragProps, arrastandoId, dropHandlers, onNovaSub, onEdit, onMove, onDelete,
}: {
  g: Grupo; depth: number; arvore: boolean; marcado: boolean; onSel: () => void
  aberto: boolean; onToggle: () => void; alvoAtivo: boolean; nGrupos: number; nMembros: number; criado: string
  dragProps?: React.HTMLAttributes<HTMLDivElement> & { draggable: boolean }
  arrastandoId: string | null
  dropHandlers?: Pick<React.HTMLAttributes<HTMLDivElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'>
  onNovaSub: () => void; onEdit: () => void; onMove: () => void; onDelete: () => void
}) {
  const cor = g.cor ?? 'var(--muted-foreground)'
  const dotCor = g.is_mestre ? '' : (nMembros > 0 ? 'bg-emerald-500' : g.codigo ? 'bg-muted-foreground' : 'bg-amber-500')
  return (
    <div {...dropHandlers} className={cn('transition-colors', alvoAtivo && 'bg-primary/10 ring-2 ring-inset ring-primary')}>
      <div {...(dragProps ?? {})} style={{ gridTemplateColumns: GRID }}
        className={cn('group grid items-center gap-2 border-b border-border/60 px-3 py-2.5 transition-colors hover:bg-muted/40',
          marcado && 'bg-primary/5', arrastandoId === g.id && 'opacity-40')}>
        <div className="flex justify-center">
          <input type="checkbox" checked={marcado} onChange={onSel} className="h-4 w-4 cursor-pointer accent-primary" aria-label={`Selecionar ${g.nome}`} />
        </div>
        <div className={cn('flex justify-center text-muted-foreground/30', arvore && 'cursor-grab group-hover:text-muted-foreground active:cursor-grabbing')}>
          {arvore && <GripVertical className="h-3.5 w-3.5" />}
        </div>

        {/* Nome / Pasta */}
        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 20 }}>
          {g.is_mestre ? (
            <button type="button" onClick={onToggle} title={aberto ? 'Recolher' : 'Expandir'}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:text-foreground">
              {aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : <span className="w-5 shrink-0" />}
          {g.is_mestre
            ? (aberto ? <FolderOpen className="h-4 w-4 shrink-0" style={{ color: cor }} /> : <Folder className="h-4 w-4 shrink-0" style={{ color: cor }} />)
            : <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10', dotCor)} style={dotCor ? undefined : { background: cor }} />}
          {g.is_mestre ? (
            <>
              <button type="button" onClick={onToggle} className="truncate text-left text-[13.5px] font-bold hover:text-primary">{g.nome}</button>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">pasta</span>
              <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{nGrupos} grupo(s)</span>
            </>
          ) : (
            <>
              <Link href={`/admin/grupos/${g.id}`} draggable={false} className="truncate text-[13.5px] font-medium hover:text-primary">{g.nome}</Link>
              {g.codigo && <span title="Código do canal importado" className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"><Hash className="h-3 w-3" />{g.codigo}</span>}
              {nMembros === 0 && <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">sem membros</span>}
            </>
          )}
        </div>

        {/* Origem */}
        <div className="min-w-0">{!g.is_mestre && <OrigemBadge codigo={g.codigo} />}</div>

        {/* Membros */}
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-[12.5px] font-medium text-foreground/80">{nf(nMembros)}</span>
        </div>

        {/* Criado */}
        <div className="text-xs text-muted-foreground">{criado}</div>

        {/* Ações */}
        <div className="flex items-center justify-end gap-0.5">
          {g.is_mestre && <button type="button" onClick={onNovaSub} title="Nova sub-pasta aqui" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><FolderPlus className="h-4 w-4" /></button>}
          {!g.is_mestre && <button type="button" onClick={onMove} title="Mover para pasta" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"><FolderInput className="h-4 w-4" /></button>}
          <button type="button" onClick={onEdit} title="Editar" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"><Pencil className="h-4 w-4" /></button>
          <button type="button" onClick={onDelete} title="Excluir" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  )
}

function MoverGrupoDialog({ grupos, destinos, onDone, onClose }: { grupos: Grupo[]; destinos: Destino[]; onDone: () => void; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const umSo = grupos.length === 1
  const [sel, setSel] = useState<string | null>(umSo ? (grupos[0].pai_id ?? null) : null)

  function salvar() {
    start(async () => {
      let ok = 0
      for (const g of grupos) { const r = await moverGrupo(g.id, sel); if (r.ok) ok++ }
      if (ok) { toast.success(sel ? `${ok} movido(s) para a pasta` : `${ok} solto(s) da pasta`); router.refresh(); onDone() }
      else toast.error('Nada foi movido')
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-pop relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><FolderInput className="h-4 w-4" /> {umSo ? `Mover “${grupos[0].nome}”` : `Mover ${grupos.length} itens`}</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="scroll-claro min-h-0 flex-1 space-y-1.5 overflow-auto p-4">
          <Opcao ativo={sel === null} onClick={() => setSel(null)} depth={0} icon={<FolderMinus className="h-4 w-4 text-muted-foreground" />} label="Sem pasta (raiz)" />
          {destinos.length === 0 && <p className="px-1 py-2 text-center text-xs text-muted-foreground">Nenhuma pasta de destino disponível.</p>}
          {destinos.map((p) => (
            <Opcao key={p.id} ativo={sel === p.id} onClick={() => setSel(p.id)} depth={p.depth} icon={<Folder className="h-4 w-4" style={{ color: p.cor ?? 'var(--muted-foreground)' }} />} label={p.nome} />
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={pending || (umSo && sel === (grupos[0].pai_id ?? null))}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Mover
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Opcao({ ativo, onClick, icon, label, depth }: { ativo: boolean; onClick: () => void; icon: React.ReactNode; label: string; depth: number }) {
  return (
    <button type="button" onClick={onClick} style={{ marginLeft: depth * 16 }}
      className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', ativo ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
        {ativo && <Check className="h-3 w-3" />}
      </span>
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
    </button>
  )
}
