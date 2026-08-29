'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type React from 'react'
import { FolderTree, Library, ClipboardList, Loader2, Folder, FolderOpen, ChevronDown, Check, X, FolderPlus, Home, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { listarPastasParaSalvar } from '../acoes'
import { useCriar, useGuardStep, type PastaEscolha } from '../criar-context'

type Pasta = { id: string; nome: string; pai_id: string | null }

export default function SalvarPage() {
  useGuardStep(5)
  const { draft } = useCriar()
  const [pastas, setPastas] = useState<{ simulado: Pasta[]; banco: Pasta[] } | null>(null)

  useEffect(() => {
    listarPastasParaSalvar().then((r) => setPastas(r.ok ? { simulado: r.simulado ?? [], banco: r.banco ?? [] } : { simulado: [], banco: [] }))
  }, [])

  const qtdQuestoes = draft.questoesSelecionadas.length + draft.questoesImportadas.length
  const qtdAlunos = draft.estudanteIds.length

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">Escolha onde o simulado e o banco vão ficar. Clique para abrir a árvore — dá para escolher uma pasta existente (com suas subpastas) ou criar uma nova.</p>

        {!pastas ? (
          <div className="flex items-center gap-2 rounded-2xl border bg-card p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando pastas…</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <PastaPanel icon={ClipboardList} titulo="Pasta do simulado" desc="Aparece na Aplicação de Simulado." pastas={pastas.simulado} chave="simuladoFolder" />
            <PastaPanel icon={Library} titulo="Pasta do banco" desc="Aparece no Banco de Simulado." pastas={pastas.banco} chave="bancoFolder" />
          </div>
        )}
      </div>

      {/* Resumo */}
      <aside className="space-y-2 lg:sticky lg:top-24">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resumo</p>
        <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
          <ResumoLinha label="Banco" valor={draft.bancoNome || '—'} />
          <ResumoLinha label="Simulado" valor={draft.simuladoNome || '—'} />
          <ResumoLinha label="Tipo" valor={draft.tipo === 'discursivo' ? 'Discursivo' : 'Objetivo'} />
          <ResumoLinha label="Questões" valor={qtdQuestoes ? qtdQuestoes.toLocaleString('pt-BR') : '—'} />
          <ResumoLinha label="Estudantes" valor={qtdAlunos ? qtdAlunos.toLocaleString('pt-BR') : (draft.grupoIds.length ? `${draft.grupoIds.length} grupo(s)` : '—')} />
          <ResumoLinha label="Cadernos" valor={[draft.folhaModeloId && 'Folha', draft.enunciadoPdf && 'Enunciado', draft.gabaritoPdf && 'Gabarito'].filter(Boolean).join(' · ') || '—'} />
          <div className="border-t pt-3 text-xs text-muted-foreground">Ao criar, o simulado nasce como <strong className="text-foreground">rascunho</strong>. Use o botão <strong className="text-foreground">Criar simulado</strong> no topo.</div>
        </div>
      </aside>
    </div>
  )
}

/** Texto-resumo da escolha atual (mostrado no gatilho do pop-up). */
function resumoEscolha(escolha: PastaEscolha, pastas: Pasta[]): string {
  if (escolha.mode === 'raiz') return 'Raiz (sem pasta)'
  if (escolha.mode === 'nova') return escolha.nome ? `Nova pasta: ${escolha.nome}` : 'Nova pasta'
  return pastas.find((p) => p.id === escolha.id)?.nome ?? 'Selecione a pasta'
}

function PastaPanel({ icon: Icon, titulo, desc, pastas, chave }: { icon: React.ComponentType<{ className?: string }>; titulo: string; desc: string; pastas: Pasta[]; chave: 'simuladoFolder' | 'bancoFolder' }) {
  const { draft, patch } = useCriar()
  const escolha = draft[chave]
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-[18px] w-[18px]" /></span>
        <div>
          <p className="text-sm font-semibold leading-tight">{titulo}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <button type="button" onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-left text-sm shadow-sm outline-none transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/40">
        <FolderTree className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium">{resumoEscolha(escolha, pastas)}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <PastaPickerDialog titulo={titulo} pastas={pastas} escolha={escolha}
          onConfirm={(e) => { patch({ [chave]: e } as any); setOpen(false) }} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}

/** Ramo da árvore (linhas de conexão) — igual aos outros seletores hierárquicos. */
function TreeBranch({ isLast, children }: { isLast: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('relative pl-[14px]', !isLast && 'pb-1')}>
      <span aria-hidden className="pointer-events-none absolute left-0 top-0 w-px bg-border" style={{ height: isLast ? 18 : '100%' }} />
      <span aria-hidden className="pointer-events-none absolute left-0 top-[18px] h-px w-[14px] bg-border" />
      {children}
    </div>
  )
}

/** Indicador de seleção (radio) à esquerda de cada linha. */
function Radio({ on }: { on: boolean }) {
  return (
    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors', on ? 'border-primary' : 'border-muted-foreground/40')}>
      {on && <span className="h-2 w-2 rounded-full bg-primary" />}
    </span>
  )
}

function PastaPickerDialog({ titulo, pastas, escolha, onConfirm, onClose }: {
  titulo: string; pastas: Pasta[]; escolha: PastaEscolha
  onConfirm: (e: PastaEscolha) => void; onClose: () => void
}) {
  const [sel, setSel] = useState<PastaEscolha>(escolha.mode === 'nova' ? { mode: 'raiz', id: null, nome: '' } : escolha)
  const [novaNome, setNovaNome] = useState(escolha.mode === 'nova' ? (escolha.nome ?? '') : '')
  const [aberto, setAberto] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const byId = useMemo(() => new Map(pastas.map((p) => [p.id, p])), [pastas])
  const { children: filhosMap, top } = useMemo(() => {
    const m = new Map<string, Pasta[]>()
    const t: Pasta[] = []
    for (const p of pastas) {
      const pai = p.pai_id && byId.has(p.pai_id) ? p.pai_id : null
      if (pai) { const a = m.get(pai) ?? []; a.push(p); m.set(pai, a) } else t.push(p)
    }
    const ordena = (arr: Pasta[]) => arr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    for (const a of m.values()) ordena(a); ordena(t)
    return { children: m, top: t }
  }, [pastas, byId])

  const q = busca.trim().toLowerCase()
  const escolherNova = novaNome.trim().length > 0
  const raizAtiva = !escolherNova && sel.mode === 'raiz'

  function pick(id: string) { setSel({ mode: 'existente', id, nome: '' }); setNovaNome('') }
  function toggleAberto(id: string) { setAberto((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function confirmar() { onConfirm(escolherNova ? { mode: 'nova', id: null, nome: novaNome.trim() } : sel) }

  function linhaPasta(p: Pasta) {
    const on = !escolherNova && sel.mode === 'existente' && sel.id === p.id
    return (
      <button type="button" onClick={() => pick(p.id)}
        className={cn('flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-sm transition-colors', on ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50')}>
        <Radio on={on} />
        <Folder className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
      </button>
    )
  }

  function renderNo(p: Pasta): React.ReactElement {
    const filhos = filhosMap.get(p.id) ?? []
    const on = !escolherNova && sel.mode === 'existente' && sel.id === p.id
    const expandida = aberto.has(p.id)
    return (
      <div key={p.id}>
        <div className={cn('flex items-center gap-1 rounded-xl border transition-colors', on ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50')}>
          <button type="button" onClick={() => pick(p.id)} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-2.5 text-left text-sm">
            <Radio on={on} />
            {expandida ? <FolderOpen className="h-4 w-4 shrink-0 text-primary" /> : <Folder className="h-4 w-4 shrink-0 text-primary" />}
            <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
          </button>
          {filhos.length > 0 && (
            <button type="button" onClick={() => toggleAberto(p.id)} className="mr-1.5 flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title={expandida ? 'Recolher' : 'Expandir'}>
              {filhos.length} <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !expandida && '-rotate-90')} />
            </button>
          )}
        </div>
        {expandida && filhos.length > 0 && (
          <div className="ml-[22px] mt-1">
            {filhos.map((c, i) => <TreeBranch key={c.id} isLast={i === filhos.length - 1}>{renderNo(c)}</TreeBranch>)}
          </div>
        )}
      </div>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-pop relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b bg-gradient-to-br from-primary/[0.06] to-transparent px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FolderTree className="h-4 w-4" /></span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold leading-tight">{titulo}</h3>
              <p className="text-[11px] text-muted-foreground">Escolha uma pasta ou crie uma nova.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 pt-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pasta…" className="pl-9" />
          </div>
        </div>

        <div className="scroll-claro mt-3 min-h-0 flex-1 space-y-1 overflow-auto px-5 pb-2">
          {/* Raiz (sem pasta) */}
          {!q && (
            <button type="button" onClick={() => { setSel({ mode: 'raiz', id: null, nome: '' }); setNovaNome('') }}
              className={cn('flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-sm transition-colors', raizAtiva ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50')}>
              <Radio on={raizAtiva} />
              <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 font-medium">Raiz (sem pasta)</span>
            </button>
          )}

          {pastas.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma pasta ainda — crie uma nova abaixo.</p>
          ) : q ? (
            (() => {
              const res = pastas.filter((p) => p.nome.toLowerCase().includes(q))
              return res.length === 0
                ? <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma pasta encontrada.</p>
                : res.map((p) => <div key={p.id}>{linhaPasta(p)}</div>)
            })()
          ) : (
            top.map((p) => renderNo(p))
          )}
        </div>

        {/* Criar nova pasta */}
        <div className="border-t bg-muted/20 px-5 py-3">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><FolderPlus className="h-3.5 w-3.5" /> Criar nova pasta</label>
          <Input value={novaNome} onChange={(e) => setNovaNome(e.target.value)} placeholder="Nome da nova pasta (na raiz)" />
          {escolherNova && <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-primary"><Check className="h-3 w-3" /> Será criada a pasta “{novaNome.trim()}”.</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar}>Confirmar</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ResumoLinha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="max-w-[60%] truncate text-right text-[12.5px] font-bold" title={valor}>{valor}</span>
    </div>
  )
}
