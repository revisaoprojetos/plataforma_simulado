'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { Trash2, GripVertical, ChevronUp, ChevronDown, Tag, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MarkdownContent } from '@/components/markdown-content'
import { listarDisciplinasFiltro, type QuestaoBancoBuscaItem } from '@/app/admin/banco-questoes/actions'
import type { QuestaoImport } from '@/app/admin/banco-questoes/import-types'
import { useCriar, useGuardStep } from '../criar-context'
import { AdicionarQuestoesDialog } from '@/components/admin/adicionar-questoes-dialog'

type Etiqueta = { nome: string; cor: string | null }
const VOLTAR = encodeURIComponent('/admin/simulados/criar/questoes')

export default function QuestoesPage() {
  useGuardStep(1)
  const { draft, patch } = useCriar()
  const [disciplinas, setDisciplinas] = useState<{ id: string; nome: string }[]>([])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [popEtiquetas, setPopEtiquetas] = useState<Etiqueta[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  useEffect(() => { listarDisciplinasFiltro().then(setDisciplinas).catch(() => {}) }, [])

  const jaIds = new Set(draft.questoesSelData.map((q) => q.id))
  const importadas = draft.questoesImportadas as any[]
  const total = draft.questoesSelData.length + importadas.length

  const allKeys = [...draft.questoesSelData.map((q) => `s:${q.id}`), ...importadas.map((_, i) => `i:${i}`)]
  const todasMarcadas = allKeys.length > 0 && allKeys.every((k) => sel.has(k))

  function toggleAll() { setSel(todasMarcadas ? new Set() : new Set(allKeys)) }
  function toggleSel(key: string) { setSel((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n }) }

  function addSistema(items: QuestaoBancoBuscaItem[]) {
    const novos = items.filter((q) => !jaIds.has(q.id))
    const data = [...draft.questoesSelData, ...novos]
    patch({ questoesSelData: data, questoesSelecionadas: data.map((q) => q.id) })
  }
  function addImport(questoes: QuestaoImport[]) { patch({ questoesImportadas: [...draft.questoesImportadas, ...(questoes as any[])] }) }
  function removerSistema(id: string) {
    const data = draft.questoesSelData.filter((q) => q.id !== id)
    patch({ questoesSelData: data, questoesSelecionadas: data.map((q) => q.id) })
    setSel(new Set())
  }
  function removerImport(idx: number) { patch({ questoesImportadas: draft.questoesImportadas.filter((_, i) => i !== idx) }); setSel(new Set()) }
  function removerSelecionadas() {
    const sysIds = new Set([...sel].filter((k) => k.startsWith('s:')).map((k) => k.slice(2)))
    const impIdxs = new Set([...sel].filter((k) => k.startsWith('i:')).map((k) => Number(k.slice(2))))
    const data = draft.questoesSelData.filter((q) => !sysIds.has(q.id))
    const imp = draft.questoesImportadas.filter((_, i) => !impIdxs.has(i))
    patch({ questoesSelData: data, questoesSelecionadas: data.map((q) => q.id), questoesImportadas: imp })
    setSel(new Set())
  }
  function moverSistema(from: number, to: number) {
    if (to < 0 || to >= draft.questoesSelData.length || from === to) return
    const data = [...draft.questoesSelData]
    const [it] = data.splice(from, 1)
    data.splice(to, 0, it)
    patch({ questoesSelData: data, questoesSelecionadas: data.map((q) => q.id) })
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{total > 0 ? <><span className="font-medium text-foreground">{total}</span> questão(ões) na prova.</> : 'Nenhuma questão adicionada ainda.'}</p>
        <div className="flex items-center gap-2">
          {sel.size > 0 && (
            <button type="button" onClick={removerSelecionadas} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" /> Remover {sel.size}
            </button>
          )}
          <AdicionarQuestoesDialog disciplinas={disciplinas} jaIds={jaIds} onSelecionar={addSistema} onImportar={addImport} />
        </div>
      </div>

      {/* Tabela SEMPRE visível (mesmo vazia — cabeçalho/estrutura). Rolagem vertical + horizontal. */}
      <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b align-middle text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-10 py-2 pl-3 text-center">
                  <button type="button" onClick={toggleAll} aria-label="Selecionar todas" className={cn('mx-auto flex h-4 w-4 items-center justify-center rounded border transition-colors', todasMarcadas ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary')}>
                    {todasMarcadas && <Check className="h-3 w-3" />}
                  </button>
                </th>
                <th className="w-16 py-2 text-center font-medium">ORD</th>
                <th className="w-10 py-2 text-center font-medium">#</th>
                <th className="min-w-[340px] py-2 pr-3 text-left font-medium">Enunciado</th>
                <th className="w-16 py-2 pr-3 text-center font-medium">Ano</th>
                <th className="py-2 pr-3 text-center font-medium">Disciplina</th>
                <th className="py-2 pr-3 text-center font-medium">Assunto</th>
                <th className="py-2 pr-3 text-center font-medium">Assunto específico</th>
                <th className="py-2 pr-3 text-center font-medium">Banca</th>
                <th className="py-2 pr-3 text-center font-medium">Tipo</th>
                <th className="py-2 pr-3 text-center font-medium">Etiquetas</th>
                <th className="w-14 py-2 pr-3 text-center font-medium">Dif.</th>
                <th className="w-12 py-2 pr-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {draft.questoesSelData.map((q, i) => {
                const on = sel.has(`s:${q.id}`)
                return (
                  <tr
                    key={q.id}
                    draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragIdx !== null) moverSistema(dragIdx, i); setDragIdx(null) }}
                    onDragEnd={() => setDragIdx(null)}
                    className={cn('align-middle', dragIdx === i && 'opacity-40', on && 'bg-primary/5')}
                  >
                    <td className="py-2.5 pl-3 text-center">
                      <button type="button" onClick={() => toggleSel(`s:${q.id}`)} aria-label="Selecionar questão" className={cn('mx-auto flex h-4 w-4 items-center justify-center rounded border transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary')}>
                        {on && <Check className="h-3 w-3" />}
                      </button>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground/70">
                        <div className="flex flex-col">
                          <button type="button" onClick={() => moverSistema(i, i - 1)} disabled={i === 0} className="rounded transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30" title="Subir"><ChevronUp className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => moverSistema(i, i + 1)} disabled={i === draft.questoesSelData.length - 1} className="rounded transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30" title="Descer"><ChevronDown className="h-3.5 w-3.5" /></button>
                        </div>
                        <span className="cursor-grab active:cursor-grabbing" title="Arraste para reordenar"><GripVertical className="h-4 w-4" /></span>
                      </div>
                    </td>
                    <td className="py-2.5 text-center text-xs text-muted-foreground">{i + 1}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        {q.external_id && <span className="shrink-0 rounded border px-1 py-0.5 font-mono text-[10px] text-muted-foreground">{q.external_id}</span>}
                        <Link href={`/admin/questoes/${q.id}/editar?voltar=${VOLTAR}`} className="line-clamp-1 min-w-0 max-w-[560px] text-sm decoration-primary/40 underline-offset-2 hover:text-primary hover:underline" title="Abrir a questão"><MarkdownContent inline>{q.enunciado}</MarkdownContent></Link>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-center text-xs text-muted-foreground">{q.ano ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-center text-xs font-medium uppercase text-muted-foreground">{q.disciplina ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-center text-xs text-muted-foreground">{q.assunto ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-center text-xs text-muted-foreground">{q.assunto_detalhe ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-center text-xs text-muted-foreground">{q.banca ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-center"><TipoBadge tipo={q.tipo} formato={q.formato} /></td>
                    <td className="py-2.5 pr-3 text-center"><EtiquetasCel etiquetas={q.etiquetas ?? []} onAbrir={setPopEtiquetas} /></td>
                    <td className="py-2.5 pr-3 text-center"><DifBadge nivel={q.nivel_dificuldade} /></td>
                    <td className="py-2.5 pr-2 text-center">
                      <button type="button" onClick={() => removerSistema(q.id)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Remover"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                )
              })}
              {importadas.map((qi, idx) => {
                const on = sel.has(`i:${idx}`)
                return (
                  <tr key={`imp-${idx}`} className={cn('align-middle', on ? 'bg-primary/5' : 'bg-emerald-500/5')}>
                    <td className="py-2.5 pl-3 text-center">
                      <button type="button" onClick={() => toggleSel(`i:${idx}`)} aria-label="Selecionar questão" className={cn('mx-auto flex h-4 w-4 items-center justify-center rounded border transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary')}>
                        {on && <Check className="h-3 w-3" />}
                      </button>
                    </td>
                    <td className="py-2.5 text-center"><span className="rounded-full border border-emerald-500/40 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400">import</span></td>
                    <td className="py-2.5 text-center text-xs text-muted-foreground">{draft.questoesSelData.length + idx + 1}</td>
                    <td className="py-2.5 pr-3">
                      <div className="line-clamp-1 max-w-[560px] text-sm"><MarkdownContent inline>{qi.enunciado ?? ''}</MarkdownContent></div>
                    </td>
                    <td className="py-2.5 pr-3 text-center text-xs text-muted-foreground">{qi.ano ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-center text-xs font-medium uppercase text-muted-foreground">{qi.disciplina ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-center text-xs text-muted-foreground">{qi.assunto ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-center text-xs text-muted-foreground">{qi.assunto_detalhe ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-center text-xs text-muted-foreground">{qi.banca ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-center"><TipoBadge tipo={qi.tipo ?? 'objetiva'} formato={qi.formato ?? null} /></td>
                    <td className="py-2.5 pr-3 text-center"><EtiquetasCel etiquetas={(qi.etiquetas ?? []).map((e: any) => (typeof e === 'string' ? { nome: e, cor: null } : e))} onAbrir={setPopEtiquetas} /></td>
                    <td className="py-2.5 pr-3 text-center"><DifBadge nivel={qi.nivel_dificuldade ?? null} /></td>
                    <td className="py-2.5 pr-2 text-center"><button type="button" onClick={() => removerImport(idx)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Remover"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                )
              })}
              {total === 0 && (
                <tr><td colSpan={13} className="py-16 text-center text-sm text-muted-foreground">Nenhuma questão adicionada ainda. Clique em “Adicionar questões”.</td></tr>
              )}
            </tbody>
          </table>
      </div>

      {popEtiquetas && <EtiquetasModal etiquetas={popEtiquetas} onClose={() => setPopEtiquetas(null)} />}
    </div>
  )
}

function DifBadge({ nivel }: { nivel: string | null }) {
  if (!nivel) return <span className="text-muted-foreground">—</span>
  const map: Record<string, { l: string; c: string }> = {
    facil: { l: 'F', c: 'text-emerald-500' },
    medio: { l: 'M', c: 'text-amber-500' },
    dificil: { l: 'D', c: 'text-rose-500' },
  }
  const m = map[nivel] ?? { l: nivel[0]?.toUpperCase() ?? '?', c: 'text-muted-foreground' }
  return <span className={cn('font-bold', m.c)} title={nivel}>{m.l}</span>
}

function TipoBadge({ tipo, formato }: { tipo: string | null; formato: string | null }) {
  const ce = tipo !== 'discursiva' && formato === 'certo_errado'
  const label = tipo === 'discursiva' ? 'Discursiva' : ce ? 'Certo/Errado' : 'Múltipla'
  const cls = tipo === 'discursiva'
    ? 'border-indigo-400 text-indigo-600 dark:text-indigo-300'
    : ce
      ? 'border-violet-400 text-violet-600 dark:text-violet-300'
      : 'border-sky-400 text-sky-600 dark:text-sky-300'
  return <span className={cn('whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase', cls)}>{label}</span>
}

function Chip({ e }: { e: Etiqueta }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium" style={e.cor ? { borderColor: e.cor, color: e.cor } : undefined}>
      <Tag className="h-2.5 w-2.5" />{e.nome}
    </span>
  )
}

function EtiquetasCel({ etiquetas, onAbrir }: { etiquetas: Etiqueta[]; onAbrir: (e: Etiqueta[]) => void }) {
  if (!etiquetas.length) return <span className="text-muted-foreground">—</span>
  if (etiquetas.length === 1) return <Chip e={etiquetas[0]} />
  return (
    <button type="button" onClick={() => onAbrir(etiquetas)} className="inline-flex items-center gap-1" title="Ver todas as etiquetas">
      <Chip e={etiquetas[0]} />
      <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">+{etiquetas.length - 1}</span>
    </button>
  )
}

function EtiquetasModal({ etiquetas, onClose }: { etiquetas: Etiqueta[]; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Etiquetas ({etiquetas.length})</h3>
          <button onClick={onClose} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap gap-1.5">{etiquetas.map((e, i) => <Chip key={i} e={e} />)}</div>
      </div>
    </div>,
    document.body,
  )
}
