'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, Check, Loader2, UsersRound, Trash2, X, Folder, FolderOpen, ChevronRight, ChevronDown, Minus } from 'lucide-react'
import type React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'
import { AdicionarEstudantesDialog, type AlunoSel } from '@/components/admin/adicionar-estudantes-dialog'
import { listarGruposParaSimulado, contarGruposSimulado, listarMembrosGrupos } from '../acoes'
import { useCriar, useGuardStep } from '../criar-context'

type Grupo = { id: string; nome: string; cor: string | null; membros: number }
type GrupoEstrut = { id: string; nome: string; cor: string | null; pai_id: string | null; is_mestre: boolean }
type Linha = AlunoSel & { origem: 'individual' | 'grupo'; grupoNome?: string | null }

const POR_PAGINA = 50
// Memo em memória das contagens (entre aberturas do diálogo, na sessão) — números pré-setados.
let _countsMemo: Record<string, number> | null = null

function iniciais(n: string) {
  return n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')
}

export default function EstudantesPage() {
  useGuardStep(3)
  const { draft, patch } = useCriar()
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pagina, setPagina] = useState(0)
  const [membrosPorGrupo, setMembrosPorGrupo] = useState<Record<string, AlunoSel[]>>({})
  const [carregandoGrupos, setCarregandoGrupos] = useState<Set<string>>(new Set())

  const estudantes = draft.estudantesSelData
  const grupos = draft.gruposSelData

  // Carrega os membros dos grupos informados (que ainda não temos) — mostra spinner até chegarem.
  async function carregarMembros(ids: string[]) {
    const faltando = ids.filter((id) => !(id in membrosPorGrupo))
    if (!faltando.length) return
    setCarregandoGrupos((p) => { const n = new Set(p); faltando.forEach((id) => n.add(id)); return n })
    try {
      const r = await listarMembrosGrupos(faltando)
      setMembrosPorGrupo((prev) => {
        const n = { ...prev }
        for (const id of faltando) n[id] = (r.ok && r.membros?.[id]) ? r.membros[id] : []
        return n
      })
    } finally {
      setCarregandoGrupos((p) => { const n = new Set(p); faltando.forEach((id) => n.delete(id)); return n })
    }
  }
  // Ao montar (e ao voltar à etapa), busca os membros dos grupos já escolhidos.
  useEffect(() => { if (grupos.length) carregarMembros(grupos.map((g) => g.id)) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  // Lista EXIBIDA: individuais + membros dos grupos, deduplicada por id.
  const merged = useMemo<Linha[]>(() => {
    const out: Linha[] = []
    const seen = new Set<string>()
    for (const e of estudantes) { out.push({ ...e, origem: 'individual' }); seen.add(e.id) }
    for (const g of grupos) {
      for (const m of (membrosPorGrupo[g.id] ?? [])) { if (!seen.has(m.id)) { out.push({ ...m, origem: 'grupo', grupoNome: g.nome }); seen.add(m.id) } }
    }
    return out
  }, [estudantes, grupos, membrosPorGrupo])

  const carregando = carregandoGrupos.size > 0
  const jaIds = new Set(merged.map((m) => m.id))

  const q = busca.trim().toLowerCase()
  const filtrados = q ? merged.filter((e) => e.nome.toLowerCase().includes(q) || (e.email ?? '').toLowerCase().includes(q)) : merged
  const totalPag = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaItens = filtrados.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA)
  useEffect(() => { setPagina(0) }, [busca])
  useEffect(() => { if (pagina > totalPag - 1) setPagina(0) }, [totalPag, pagina])

  // Só os individuais são selecionáveis/removíveis linha-a-linha (os de grupo saem removendo o grupo).
  const indivFiltrados = filtrados.filter((e) => e.origem === 'individual')
  const todasMarcadas = indivFiltrados.length > 0 && indivFiltrados.every((e) => sel.has(e.id))

  function addEstudantes(alunos: AlunoSel[]) {
    const novos = alunos.filter((a) => !new Set(estudantes.map((e) => e.id)).has(a.id))
    const data = [...estudantes, ...novos]
    patch({ estudantesSelData: data, estudanteIds: data.map((e) => e.id) })
  }
  function removerEstudante(id: string) {
    const data = estudantes.filter((e) => e.id !== id)
    patch({ estudantesSelData: data, estudanteIds: data.map((e) => e.id) })
    setSel(new Set())
  }
  function removerSelecionados() {
    const data = estudantes.filter((e) => !sel.has(e.id))
    patch({ estudantesSelData: data, estudanteIds: data.map((e) => e.id) })
    setSel(new Set())
  }
  function addGrupos(gs: Grupo[]) {
    const jaG = new Set(grupos.map((g) => g.id))
    const novos = gs.filter((g) => !jaG.has(g.id))
    if (!novos.length) return
    const data = [...grupos, ...novos]
    patch({ gruposSelData: data, grupoIds: data.map((g) => g.id) })
    carregarMembros(novos.map((g) => g.id))
  }
  function removerGrupo(id: string) {
    const data = grupos.filter((g) => g.id !== id)
    patch({ gruposSelData: data, grupoIds: data.map((g) => g.id) })
    setMembrosPorGrupo((prev) => { const n = { ...prev }; delete n[id]; return n })
  }

  function toggle(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleAll() { setSel(todasMarcadas ? new Set() : new Set(indivFiltrados.map((e) => e.id))) }

  return (
    <div className="space-y-4">
      {/* Texto puro (bloco) → entra na cascata de entrada da página. */}
      <p className="text-sm font-medium text-foreground">
        {merged.length} estudante(s){grupos.length > 0 ? ` · ${grupos.length} grupo(s)` : ''} selecionado(s)
      </p>

      {/* Card espelhando a aba Estudantes do banco (sem cabeçalho). */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail…" className="pl-8" />
          </div>
          {sel.size > 0 && (
            <Button variant="destructive" size="sm" onClick={removerSelecionados}>
              <Trash2 className="mr-2 h-4 w-4" /> Remover {sel.size}
            </Button>
          )}
          <GruposDialog jaIds={new Set(grupos.map((g) => g.id))} onConfirm={addGrupos} />
          <AdicionarEstudantesDialog onSelecionar={addEstudantes} jaIds={jaIds} />
        </div>

        {/* Grupos selecionados — chips removíveis. */}
        {grupos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2.5">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><UsersRound className="h-3.5 w-3.5" /> Grupos:</span>
            {grupos.map((g) => {
              const load = carregandoGrupos.has(g.id)
              return (
                <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.cor ?? 'var(--primary)' }} />
                  <span className="max-w-[180px] truncate">{g.nome}</span>
                  <span className="text-muted-foreground">{load ? <Loader2 className="h-3 w-3 animate-spin" /> : `· ${(membrosPorGrupo[g.id] ?? []).length || g.membros}`}</span>
                  <button type="button" onClick={() => removerGrupo(g.id)} className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remover grupo"><X className="h-3 w-3" /></button>
                </span>
              )
            })}
          </div>
        )}

        {/* Tabela mesclada */}
        <div className="max-h-[52vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b text-left align-middle text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-10 py-2 pl-3 text-center">
                  <button type="button" onClick={toggleAll} aria-label="Selecionar todos" disabled={indivFiltrados.length === 0} className={cn('mx-auto flex h-4 w-4 items-center justify-center rounded border disabled:opacity-30', todasMarcadas ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary')}>
                    {todasMarcadas && <Check className="h-3 w-3" />}
                  </button>
                </th>
                <th className="py-2 pr-3 font-medium">Nome</th>
                <th className="py-2 pr-3 font-medium">E-mail</th>
                <th className="py-2 pr-3 font-medium">Documento</th>
                <th className="py-2 pr-3 font-medium">Telefone</th>
                <th className="w-12 py-2 pr-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {merged.length === 0 && !carregando ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">Nenhum estudante. Clique em “Adicionar estudantes” ou “Adicionar grupo”.</td></tr>
              ) : filtrados.length === 0 && !carregando ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">Nenhum estudante encontrado.</td></tr>
              ) : paginaItens.map((e) => {
                const isInd = e.origem === 'individual'
                const on = sel.has(e.id)
                return (
                  <tr key={e.id} className={cn('align-middle', on && 'bg-primary/5')}>
                    <td className="py-2.5 pl-3 text-center">
                      {isInd ? (
                        <button type="button" onClick={() => toggle(e.id)} aria-label="Selecionar" className={cn('mx-auto flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary')}>
                          {on && <Check className="h-3 w-3" />}
                        </button>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-bold text-primary" style={e.perfil_avatar_cor ? { backgroundColor: e.perfil_avatar_cor } : undefined}>
                          {e.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={e.avatar} alt="" className="h-full w-full object-contain object-[center_82%]" />
                          ) : iniciais(e.nome)}
                        </span>
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium">{e.nome}</span>
                          <ClassificacaoBadge classificacao={e.classificacao} />
                          {!isInd && <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" title={`Via grupo: ${e.grupoNome ?? ''}`}><UsersRound className="h-2.5 w-2.5" /> grupo</span>}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{e.email ?? '—'}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted-foreground">{e.cpf ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{e.telefone ?? '—'}</td>
                    <td className="py-2.5 pr-2 text-center">
                      {isInd && (
                        <button type="button" onClick={() => removerEstudante(e.id)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Remover"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {carregando && (
                <tr><td colSpan={6} className="py-6 text-center text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando estudantes dos grupos…</span></td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé: total + paginação */}
        {merged.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
            <span>{filtrados.length.toLocaleString('pt-BR')} estudante(s){carregando && <span className="ml-1 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> carregando…</span>}</span>
            {totalPag > 1 && (
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} className="rounded-md border px-2 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40">Anterior</button>
                <span className="px-1 tabular-nums">Pág. {pagina + 1}/{totalPag}</span>
                <button type="button" onClick={() => setPagina((p) => Math.min(totalPag - 1, p + 1))} disabled={pagina >= totalPag - 1} className="rounded-md border px-2 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40">Próxima</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Ramo da árvore (estilo explorador) — igual ao diálogo do banco.
function TreeBranch({ isLast, children }: { isLast: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('relative pl-[14px]', !isLast && 'pb-1.5')}>
      <span aria-hidden className="pointer-events-none absolute left-0 top-0 w-px bg-border" style={{ height: isLast ? 18 : '100%' }} />
      <span aria-hidden className="pointer-events-none absolute left-0 top-[18px] h-px w-[14px] bg-border" />
      {children}
    </div>
  )
}

/** Dialog p/ escolher grupos respeitando as PASTAS — carrega estrutura primeiro, contagens depois (cacheadas). */
function GruposDialog({ jaIds, onConfirm }: { jaIds: Set<string>; onConfirm: (grupos: Grupo[]) => void }) {
  const [open, setOpen] = useState(false)
  const [grupos, setGrupos] = useState<GrupoEstrut[]>([])
  const [counts, setCounts] = useState<Record<string, number>>(() => _countsMemo ?? {})
  const [carregando, setCarregando] = useState(false)
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [aberto, setAberto] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setCarregando(true)
    // 1) Estrutura (pastas + grupos) — rápido.
    listarGruposParaSimulado().then((r) => setGrupos(r.ok ? (r.grupos ?? []) : [])).catch(() => setGrupos([])).finally(() => setCarregando(false))
    // 2) Contagens memorizadas — chegam depois e preenchem os números.
    contarGruposSimulado().then((r) => { if (r.ok && r.counts) { _countsMemo = r.counts; setCounts(r.counts) } }).catch(() => {})
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const membrosDe = (id: string): number | null => (id in counts ? counts[id] : null)

  const byId = useMemo(() => new Map(grupos.map((g) => [g.id, g])), [grupos])
  const { children: filhosMap, top } = useMemo(() => {
    const m = new Map<string, GrupoEstrut[]>()
    const t: GrupoEstrut[] = []
    for (const g of grupos) {
      const pai = g.pai_id && byId.has(g.pai_id) ? g.pai_id : null
      if (pai) { const a = m.get(pai) ?? []; a.push(g); m.set(pai, a) } else t.push(g)
    }
    const ordena = (arr: GrupoEstrut[]) => arr.sort((a, b) => Number(!!b.is_mestre) - Number(!!a.is_mestre) || a.nome.localeCompare(b.nome, 'pt-BR'))
    for (const a of m.values()) ordena(a)
    ordena(t)
    return { children: m, top: t }
  }, [grupos, byId])

  const folhasDe = (id: string): GrupoEstrut[] => {
    const out: GrupoEstrut[] = []
    const stack = [...(filhosMap.get(id) ?? [])]
    while (stack.length) { const n = stack.pop()!; if (n.is_mestre) { const c = filhosMap.get(n.id); if (c) stack.push(...c) } else out.push(n) }
    return out
  }

  const q = busca.trim().toLowerCase()
  function toggle(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleAberto(id: string) { setAberto((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function togglePasta(pastaId: string) {
    const ids = folhasDe(pastaId).map((f) => f.id).filter((id) => !jaIds.has(id))
    const todos = ids.length > 0 && ids.every((id) => sel.has(id))
    setSel((p) => { const n = new Set(p); ids.forEach((id) => (todos ? n.delete(id) : n.add(id))); return n })
  }
  const totalSel = grupos.filter((g) => !g.is_mestre && sel.has(g.id)).length
  function confirmar() {
    onConfirm(grupos.filter((g) => !g.is_mestre && sel.has(g.id)).map((g) => ({ id: g.id, nome: g.nome, cor: g.cor, membros: counts[g.id] ?? 0 })))
    setOpen(false); setSel(new Set()); setBusca('')
  }

  function linhaGrupo(g: GrupoEstrut) {
    const ja = jaIds.has(g.id)
    const on = ja || sel.has(g.id)
    const m = membrosDe(g.id)
    return (
      <div key={g.id} role="button" tabIndex={0} onClick={() => !ja && toggle(g.id)}
        className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', ja ? 'opacity-60' : 'cursor-pointer', on ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
        <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: g.cor ?? 'var(--primary)' }} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.nome}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{ja ? 'já adicionado' : m == null ? '…' : `${m} membro(s)`}</span>
      </div>
    )
  }

  function renderNo(g: GrupoEstrut): React.ReactElement {
    if (!g.is_mestre) return linhaGrupo(g)
    const folhas = folhasDe(g.id)
    const selecionaveis = folhas.map((f) => f.id).filter((id) => !jaIds.has(id))
    const marcados = selecionaveis.filter((id) => sel.has(id)).length
    const totalMembros = folhas.reduce((s, f) => s + (counts[f.id] ?? 0), 0)
    const filhos = filhosMap.get(g.id) ?? []
    const expandida = aberto.has(g.id)
    return (
      <div key={g.id}>
        <div role="button" tabIndex={0} onClick={() => toggleAberto(g.id)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted" title={expandida ? 'Recolher pasta' : 'Expandir pasta'}>
          <span className="shrink-0 text-muted-foreground">{expandida ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
          <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); togglePasta(g.id) }} title="Selecionar todos os grupos da pasta"
            className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', marcados === 0 ? 'border-muted-foreground/40' : 'border-primary bg-primary text-primary-foreground')}>
            {marcados > 0 && (marcados === selecionaveis.length ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />)}
          </span>
          {expandida ? <FolderOpen className="h-4 w-4 shrink-0" style={{ color: g.cor ?? 'var(--muted-foreground)' }} /> : <Folder className="h-4 w-4 shrink-0" style={{ color: g.cor ?? 'var(--muted-foreground)' }} />}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.nome}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{folhas.length} grupo(s) · {totalMembros} membro(s)</span>
        </div>
        {expandida && (
          <div className="ml-[18px] mt-1.5">
            {filhos.length === 0
              ? <TreeBranch isLast><p className="py-1 text-xs text-muted-foreground">Pasta vazia.</p></TreeBranch>
              : filhos.map((c, i) => <TreeBranch key={c.id} isLast={i === filhos.length - 1}>{renderNo(c)}</TreeBranch>)}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UsersRound className="mr-2 h-4 w-4" /> Adicionar grupo
      </Button>

      {open && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><UsersRound className="h-4 w-4" /> Adicionar grupo</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            <div className="px-5 pt-4">
              <p className="mb-3 text-xs text-muted-foreground">Marque uma <strong>pasta</strong> para selecionar todos os grupos dentro dela — e desmarque os que não devem entrar. Os membros entram na matrícula ao salvar (novos membros entram automaticamente).</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar grupo…" className="pl-9" />
              </div>
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-auto px-5 pb-2">
              {carregando && grupos.length === 0 ? (
                <p className="flex items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos…</p>
              ) : grupos.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum grupo cadastrado.</p>
              ) : q ? (
                (() => {
                  const res = grupos.filter((g) => !g.is_mestre && g.nome.toLowerCase().includes(q))
                  return res.length === 0
                    ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum grupo encontrado.</p>
                    : res.map((g) => linhaGrupo(g))
                })()
              ) : (
                top.map((g) => renderNo(g))
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
              <span className="text-sm text-muted-foreground">{totalSel === 0 ? 'Nenhum grupo selecionado' : `${totalSel} grupo(s) selecionado(s)`}</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={confirmar} disabled={totalSel === 0}>Adicionar</Button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
