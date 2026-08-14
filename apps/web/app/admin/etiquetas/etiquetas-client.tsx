'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Tag, Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { criarEtiqueta, atualizarEtiqueta, excluirEtiqueta, type Etiqueta } from './actions'

const CORES = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
const ordenar = (a: Etiqueta, b: Etiqueta) => a.nome.localeCompare(b.nome, 'pt-BR')

export function EtiquetasClient({ inicial }: { inicial: Etiqueta[] }) {
  const [itens, setItens] = useState<Etiqueta[]>(inicial)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(CORES[5])
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editCor, setEditCor] = useState(CORES[5])
  const [pending, start] = useTransition()

  function criar() {
    const n = nome.trim()
    if (!n) { toast.error('Informe um nome.'); return }
    start(async () => {
      const r = await criarEtiqueta(n, cor)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao criar.'); return }
      setItens((p) => [...p, { id: r.id!, nome: n, cor, total: 0 }].sort(ordenar))
      setNome('')
      toast.success('Etiqueta criada')
    })
  }

  function salvarEdicao() {
    const n = editNome.trim()
    if (!n || !editId) return
    start(async () => {
      const r = await atualizarEtiqueta(editId, n, editCor)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar.'); return }
      setItens((p) => p.map((e) => (e.id === editId ? { ...e, nome: n, cor: editCor } : e)).sort(ordenar))
      setEditId(null)
      toast.success('Etiqueta atualizada')
    })
  }

  async function excluir(e: Etiqueta) {
    const ok = await confirmar({
      mensagem: `Excluir a etiqueta "${e.nome}"?${e.total ? ` Ela está em ${e.total} questão(ões) — o vínculo será removido.` : ''}`,
      destrutivo: true,
    })
    if (!ok) return
    start(async () => {
      const r = await excluirEtiqueta(e.id)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao excluir.'); return }
      setItens((p) => p.filter((x) => x.id !== e.id))
      toast.success('Etiqueta removida')
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Criar */}
      <div className="h-fit rounded-2xl border bg-card p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4 text-primary" /> Nova etiqueta</p>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') criar() }}
          placeholder="Nome da etiqueta"
          className="mb-3 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mb-1.5 text-xs text-muted-foreground">Cor</p>
        <PaletaCor value={cor} onChange={setCor} />
        <div className="mt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: `${cor}22`, color: cor }}>
            <Tag className="h-3 w-3" /> {nome.trim() || 'Prévia'}
          </span>
        </div>
        <button
          onClick={criar}
          disabled={pending || !nome.trim()}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar etiqueta
        </button>
      </div>

      {/* Lista */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {itens.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma etiqueta ainda. Crie a primeira ao lado.</p>
        ) : (
          itens.map((e, i) => (
            <div key={e.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', i > 0 && 'border-t')}>
              {editId === e.id ? (
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={editNome}
                    onChange={(ev) => setEditNome(ev.target.value)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') salvarEdicao(); if (ev.key === 'Escape') setEditId(null) }}
                    autoFocus
                    className="flex-1 rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                  <PaletaCor value={editCor} onChange={setEditCor} compact />
                  <div className="flex gap-1">
                    <button onClick={salvarEdicao} disabled={pending} title="Salvar" className="rounded-md border p-1.5 text-emerald-600 hover:bg-emerald-500/10"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setEditId(null)} title="Cancelar" className="rounded-md border p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: `${e.cor ?? '#64748b'}22`, color: e.cor ?? '#64748b' }}>
                    <Tag className="h-3 w-3" /> {e.nome}
                  </span>
                  <span className="text-xs text-muted-foreground">{e.total ?? 0} quest{(e.total ?? 0) === 1 ? 'ão' : 'ões'}</span>
                  <div className="ml-auto flex gap-1">
                    <button onClick={() => { setEditId(e.id); setEditNome(e.nome); setEditCor(e.cor ?? CORES[5]) }} title="Editar" className="rounded-md border p-1.5 text-muted-foreground transition hover:border-primary hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => excluir(e)} title="Excluir" className="rounded-md border p-1.5 text-muted-foreground transition hover:border-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function PaletaCor({ value, onChange, compact }: { value: string; onChange: (c: string) => void; compact?: boolean }) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', compact && 'gap-1')}>
      {CORES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          className={cn('rounded-full ring-offset-1 transition', compact ? 'h-6 w-6' : 'h-7 w-7', value === c && 'ring-2 ring-foreground ring-offset-2')}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}
