'use client'

import { useMemo, useState, useTransition } from 'react'
import type React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { criarGrupo, criarGrupoMestre, excluirGrupo, moverGrupo } from '@/app/admin/grupos/actions'
import { pedirTexto, confirmar } from '@/components/ui/confirm-dialog'
import { EditarGrupoDialog } from '@/components/admin/editar-grupo-dialog'
import { SecaoHeader } from '@/components/admin/secao-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Plus, Users, Pencil, Trash2, Loader2, UsersRound, ChevronRight, ChevronDown,
  Folder, FolderOpen, FolderPlus, FolderInput, X, Check, GripVertical, FolderMinus,
  Search, ArrowUpDown, ListFilter, Hash,
} from 'lucide-react'

type Grupo = { id: string; nome: string; membros: number; cor: string | null; is_mestre: boolean; pai_id: string | null; codigo?: string | null }
type Destino = { id: string; nome: string; cor: string | null; depth: number }
type Ordem = 'nome' | 'nome_desc' | 'membros' | 'membros_asc' | 'codigo'
type Filtro = 'todos' | 'grupos' | 'pastas' | 'importados'
const ORDENS: { v: Ordem; label: string }[] = [
  { v: 'nome', label: 'Nome (A → Z)' },
  { v: 'nome_desc', label: 'Nome (Z → A)' },
  { v: 'membros', label: 'Mais membros' },
  { v: 'membros_asc', label: 'Menos membros' },
  { v: 'codigo', label: 'Código' },
]

export function GruposClient({ grupos }: { grupos: Grupo[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editando, setEditando] = useState<Grupo | null>(null)
  const [movendo, setMovendo] = useState<Grupo | null>(null)
  const [expandido, setExpandido] = useState<Set<string>>(() => new Set<string>()) // pastas começam recolhidas; clicar expande
  const [arrastando, setArrastando] = useState<Grupo | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null) // pasta.id ou '__solto__'
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('nome')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const byId = useMemo(() => new Map(grupos.map((g) => [g.id, g])), [grupos])
  // Árvore: filhos por pasta-mãe (existente) + nós de topo (pai nulo ou órfão).
  const { children, top, baseCmp, memOf } = useMemo(() => {
    const m = new Map<string, Grupo[]>()
    const t: Grupo[] = []
    for (const g of grupos) {
      const pai = g.pai_id && byId.has(g.pai_id) ? g.pai_id : null
      if (pai) { const a = m.get(pai) ?? []; a.push(g); m.set(pai, a) } else t.push(g)
    }
    // Membros efetivos: grupo = próprios; pasta = soma dos grupos descendentes.
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
    // Na árvore: pastas primeiro, depois a ordem escolhida.
    const treeCmp = (a: Grupo, b: Grupo) => Number(b.is_mestre) - Number(a.is_mestre) || baseCmp(a, b)
    for (const a of m.values()) a.sort(treeCmp)
    t.sort(treeCmp)
    return { children: m, top: t, baseCmp, memOf }
  }, [grupos, byId, ordem])

  // Lista plana (quando há busca ou filtro): grupos/pastas filtrados e ordenados.
  const flat = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return grupos.filter((g) => {
      if (filtro === 'grupos' && g.is_mestre) return false
      if (filtro === 'pastas' && !g.is_mestre) return false
      if (filtro === 'importados' && !g.codigo) return false
      if (q && !(g.nome.toLowerCase().includes(q) || String(g.codigo ?? '').toLowerCase().includes(q))) return false
      return true
    }).sort(baseCmp)
  }, [grupos, busca, filtro, baseCmp])
  const flatAtivo = busca.trim() !== '' || filtro !== 'todos'

  const descendentesDe = (id: string): Set<string> => {
    const out = new Set<string>()
    const stack = [...(children.get(id) ?? [])]
    while (stack.length) { const n = stack.pop()!; if (out.has(n.id)) continue; out.add(n.id); const c = children.get(n.id); if (c) stack.push(...c) }
    return out
  }
  const membrosDe = (id: string) => { let s = 0; for (const d of descendentesDe(id)) { const g = byId.get(d); if (g && !g.is_mestre) s += g.membros } return s }
  const comunsDentro = (id: string) => { let n = 0; for (const d of descendentesDe(id)) { const g = byId.get(d); if (g && !g.is_mestre) n++ } return n }

  const totalPastas = grupos.filter((g) => g.is_mestre).length
  const totalComuns = grupos.length - totalPastas

  // Pastas em ordem hierárquica (para o diálogo "Mover").
  const ordemPastas = useMemo(() => {
    const out: Destino[] = []
    const walk = (nodes: Grupo[], d: number) => { for (const n of nodes) if (n.is_mestre) { out.push({ id: n.id, nome: n.nome, cor: n.cor, depth: d }); walk(children.get(n.id) ?? [], d + 1) } }
    walk(top, 0)
    return out
  }, [children, top])

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
  function toggle(id: string) { setExpandido((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function expandir(id: string) { setExpandido((p) => (p.has(id) ? p : new Set(p).add(id))) }

  // ── Drag & drop ──────────────────────────────────────────────────────────
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
  // Não pode soltar numa pasta que já é a mãe, na própria pasta arrastada, nem numa descendente dela.
  const bloqueados = useMemo(() => (arrastando ? descendentesDe(arrastando.id) : new Set<string>()), [arrastando, children])
  const podeSoltarNa = (paiId: string) =>
    !!arrastando && (arrastando.pai_id ?? null) !== paiId && arrastando.id !== paiId && !bloqueados.has(paiId)

  function renderNo(g: Grupo, depth: number): React.ReactElement {
    const pad = 12 + depth * 18
    if (!g.is_mestre) {
      return <GrupoRow key={g.id} g={g} padLeft={pad} dragging={arrastando?.id === g.id} dragProps={dragProps(g)}
        onEdit={() => setEditando(g)} onMove={() => setMovendo(g)} onDelete={() => excluir(g)} />
    }
    const filhos = children.get(g.id) ?? []
    const aberto = expandido.has(g.id)
    const ativo = alvo === g.id
    const canDrop = podeSoltarNa(g.id)
    return (
      <div key={g.id}
        onDragOver={(e) => { if (canDrop) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setAlvo(g.id); expandir(g.id) } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo((a) => (a === g.id ? null : a)) }}
        onDrop={(e) => { if (arrastando && canDrop) { e.preventDefault(); doMover(arrastando, g.id) } }}
        className={cn('transition-colors', ativo && 'bg-primary/10 ring-2 ring-inset ring-primary')}>
        <div {...dragProps(g)} style={{ paddingLeft: pad }}
          className={cn('group flex items-center gap-1.5 py-2.5 pr-4 transition-colors hover:bg-muted/40', arrastando?.id === g.id && 'opacity-40')}>
          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/30 transition-colors group-hover:text-muted-foreground active:cursor-grabbing" />
          <button type="button" onClick={() => toggle(g.id)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" title={aberto ? 'Recolher' : 'Expandir'}>
            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => toggle(g.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left font-semibold">
            {aberto ? <FolderOpen className="h-4 w-4 shrink-0" style={{ color: g.cor ?? 'var(--muted-foreground)' }} /> : <Folder className="h-4 w-4 shrink-0" style={{ color: g.cor ?? 'var(--muted-foreground)' }} />}
            <span className="truncate">{g.nome}</span>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{comunsDentro(g.id)} grupo(s) · {membrosDe(g.id)} membro(s)</span>
          </button>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => novaPasta(g)} title="Nova sub-pasta aqui" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><FolderPlus className="h-4 w-4" /></button>
            <button type="button" onClick={() => setEditando(g)} title="Renomear pasta" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
            <button type="button" onClick={() => excluir(g)} title="Excluir pasta" className="rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
        {aberto && (
          <div className="bg-muted/10">
            {filhos.length === 0 ? (
              <p style={{ paddingLeft: pad + 26 }} className={cn('py-2.5 pr-4 text-xs', ativo ? 'font-medium text-primary' : 'text-muted-foreground')}>
                {ativo ? 'Solte para mover para esta pasta' : 'Pasta vazia — arraste grupos ou pastas para cá.'}
              </p>
            ) : filhos.map((c) => renderNo(c, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const nada = grupos.length === 0

  return (
    <div className="animate-page space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Grupos</h1>
          <p className="text-muted-foreground">Organize grupos em pastas (grupos mestre) — pastas podem conter outras pastas. Arraste para mover.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => novaPasta()} disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-muted disabled:opacity-50">
            <FolderPlus className="h-4 w-4" /> Nova pasta
          </button>
          <button type="button" onClick={novo} disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Novo grupo
          </button>
        </div>
      </div>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={UsersRound} titulo="Grupos cadastrados" subtitulo={`${totalPastas} pasta(s) · ${totalComuns} grupo(s)`} />
        <CardContent className="p-0">
          {nada ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <UsersRound className="h-8 w-8 opacity-40" />
              <p className="text-sm">Nenhum grupo cadastrado.</p>
              <button type="button" onClick={novo} className="text-sm font-medium text-primary hover:underline">Criar o primeiro</button>
            </div>
          ) : (
            <>
              {/* Toolbar: busca + ordenar + filtro */}
              <div className="flex flex-wrap items-center gap-2 border-b p-3">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou código…"
                    className="w-full rounded-lg border bg-transparent py-2 pl-9 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring" />
                  {busca && <button type="button" onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
                </div>
                <Select value={ordem} onValueChange={(v) => v && setOrdem(v as Ordem)}>
                  <SelectTrigger className="h-10 gap-2"><ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" /><SelectValue>{(v: string) => ORDENS.find((o) => o.v === v)?.label}</SelectValue></SelectTrigger>
                  <SelectContent>{ORDENS.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ListFilter className="h-3.5 w-3.5" /></span>
                  {([['todos', 'Todos'], ['grupos', 'Grupos'], ['pastas', 'Pastas'], ['importados', 'Importados']] as [Filtro, string][]).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setFiltro(v)}
                      className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition', filtro === v ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:border-primary/40 hover:text-foreground')}>{label}</button>
                  ))}
                </div>
              </div>

              {flatAtivo ? (
                <div className="divide-y">
                  {flat.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Nenhum grupo/pasta encontrado.</p>
                  ) : flat.map((g) => g.is_mestre ? (
                    <div key={g.id} className="group flex items-center gap-1.5 py-2.5 pl-3 pr-4 transition-colors hover:bg-muted/40">
                      <Folder className="h-4 w-4 shrink-0" style={{ color: g.cor ?? 'var(--muted-foreground)' }} />
                      <span className="min-w-0 flex-1 truncate font-semibold">{g.nome}</span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{comunsDentro(g.id)} grupo(s) · {membrosDe(g.id)} membro(s)</span>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => setEditando(g)} title="Renomear pasta" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => excluir(g)} title="Excluir pasta" className="rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ) : (
                    <GrupoRow key={g.id} g={g} padLeft={12} onEdit={() => setEditando(g)} onMove={() => setMovendo(g)} onDelete={() => excluir(g)} />
                  ))}
                </div>
              ) : (
                <div className="divide-y">
                  {top.map((g) => renderNo(g, 0))}
                  {/* Zona para tirar da pasta (aparece ao arrastar algo que está dentro de uma pasta). */}
                  {arrastando && arrastando.pai_id && (
                    <div
                      onDragOver={(e) => { if ((arrastando.pai_id ?? null) !== null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setAlvo('__solto__') } }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo((a) => (a === '__solto__' ? null : a)) }}
                      onDrop={(e) => { if (arrastando) { e.preventDefault(); doMover(arrastando, null) } }}
                      className={cn('m-3 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-sm transition-colors',
                        alvo === '__solto__' ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-muted-foreground/30 text-muted-foreground')}>
                      <FolderMinus className="h-4 w-4" /> Solte aqui para tirar da pasta
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {editando && <EditarGrupoDialog grupo={editando} onClose={() => setEditando(null)} />}
      {movendo && (
        <MoverGrupoDialog
          grupo={movendo}
          destinos={ordemPastas.filter((d) => d.id !== movendo.id && !descendentesDe(movendo.id).has(d.id))}
          onClose={() => setMovendo(null)}
        />
      )}
    </div>
  )
}

function CodigoBadge({ codigo }: { codigo?: string | null }) {
  if (!codigo) return null
  return (
    <span title="Código do canal importado" className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      <Hash className="h-3 w-3" />{codigo}
    </span>
  )
}

function GrupoRow({ g, padLeft, dragging, dragProps, onEdit, onMove, onDelete }: {
  g: Grupo; padLeft: number; dragging?: boolean
  dragProps?: React.HTMLAttributes<HTMLDivElement> & { draggable: boolean }
  onEdit: () => void; onMove: () => void; onDelete: () => void
}) {
  return (
    <div {...(dragProps ?? {})} style={{ paddingLeft: padLeft }}
      className={cn('group flex items-center gap-1.5 py-2.5 pr-4 transition-colors hover:bg-muted/40', dragging && 'opacity-40')}>
      {dragProps
        ? <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/30 transition-colors group-hover:text-muted-foreground active:cursor-grabbing" />
        : <span className="w-4 shrink-0" />}
      <Link href={`/admin/grupos/${g.id}`} draggable={false} className="flex min-w-0 flex-1 items-center gap-2 font-medium hover:text-primary">
        <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: g.cor ?? 'var(--muted-foreground)' }} />
        <span className="truncate">{g.nome}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
      <CodigoBadge codigo={g.codigo} />
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground"><Users className="h-3.5 w-3.5" /> {g.membros}</span>
      <div className="flex shrink-0 gap-1">
        <button type="button" onClick={onMove} title="Mover para uma pasta" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><FolderInput className="h-4 w-4" /></button>
        <button type="button" onClick={onEdit} title="Editar (nome e cor)" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
        <button type="button" onClick={onDelete} title="Excluir" className="rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  )
}

function MoverGrupoDialog({ grupo, destinos, onClose }: { grupo: Grupo; destinos: Destino[]; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [sel, setSel] = useState<string | null>(grupo.pai_id ?? null)

  function salvar() {
    start(async () => {
      const r = await moverGrupo(grupo.id, sel)
      if (r.ok) { toast.success(sel ? 'Movido para a pasta' : 'Solto da pasta'); router.refresh(); onClose() } else toast.error(r.error ?? 'Erro ao mover')
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-pop relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><FolderInput className="h-4 w-4" /> Mover “{grupo.nome}”</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="scroll-claro min-h-0 flex-1 space-y-1.5 overflow-auto p-4">
          <Opcao ativo={sel === null} onClick={() => setSel(null)} depth={0} icon={<UsersRound className="h-4 w-4 text-muted-foreground" />} label={grupo.is_mestre ? 'Sem pasta (raiz)' : 'Sem pasta (solto)'} />
          {destinos.length === 0 && <p className="px-1 py-2 text-center text-xs text-muted-foreground">Nenhuma pasta de destino disponível.</p>}
          {destinos.map((p) => (
            <Opcao key={p.id} ativo={sel === p.id} onClick={() => setSel(p.id)} depth={p.depth} icon={<Folder className="h-4 w-4" style={{ color: p.cor ?? 'var(--muted-foreground)' }} />} label={p.nome} />
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={pending || sel === (grupo.pai_id ?? null)}
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
