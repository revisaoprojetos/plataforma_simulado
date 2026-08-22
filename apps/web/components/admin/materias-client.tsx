'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Check, X, Loader2, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { criarMateria, atualizarMateria, excluirMateria, type Materia } from '@/app/admin/leitura/actions'

const CORES = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']

export function MateriasClient({ inicial }: { inicial: Materia[] }) {
  const [itens, setItens] = useState<Materia[]>(inicial)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(CORES[5])
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editCor, setEditCor] = useState(CORES[5])
  const [pending, start] = useTransition()

  function criar() {
    const n = nome.trim(); if (!n) { toast.error('Informe um nome.'); return }
    start(async () => {
      const r = await criarMateria(n, cor)
      if (!r.ok) { toast.error(r.error ?? 'Erro'); return }
      setItens((p) => [...p, { id: r.id!, nome: n, slug: null, descricao: null, cor, icone: null, ordem: p.length }])
      setNome(''); toast.success('Matéria criada')
    })
  }
  function salvar() {
    const n = editNome.trim(); if (!n || !editId) return
    start(async () => {
      const r = await atualizarMateria(editId, { nome: n, cor: editCor })
      if (!r.ok) { toast.error(r.error ?? 'Erro'); return }
      setItens((p) => p.map((m) => (m.id === editId ? { ...m, nome: n, cor: editCor } : m)))
      setEditId(null); toast.success('Matéria atualizada')
    })
  }
  async function excluir(m: Materia) {
    if (!(await confirmar({ titulo: 'Excluir matéria', mensagem: `As leis de "${m.nome}" ficam sem matéria (não são apagadas). Continuar?`, confirmar: 'Excluir', destrutivo: true }))) return
    start(async () => {
      const r = await excluirMateria(m.id)
      if (!r.ok) { toast.error(r.error ?? 'Erro'); return }
      setItens((p) => p.filter((x) => x.id !== m.id)); toast.success('Matéria removida')
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="h-fit rounded-2xl border bg-card p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4 text-primary" /> Nova matéria</p>
        <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') criar() }} placeholder="Nome da matéria" className="mb-3 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
        <p className="mb-1.5 text-xs text-muted-foreground">Cor</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {CORES.map((c) => <button key={c} onClick={() => setCor(c)} className={cn('h-7 w-7 rounded-full border-2 transition', cor === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} aria-label={c} />)}
        </div>
        <button onClick={criar} disabled={pending || !nome.trim()} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar matéria
        </button>
      </div>

      <div className="self-start overflow-hidden rounded-2xl border bg-card shadow-sm">
        {itens.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma matéria ainda. Crie a primeira ao lado.</p>
        ) : itens.map((m, i) => (
          <div key={m.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', i > 0 && 'border-t')}>
            {editId === m.id ? (
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <input value={editNome} onChange={(e) => setEditNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditId(null) }} autoFocus className="flex-1 rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                <div className="flex flex-wrap gap-1">{CORES.map((c) => <button key={c} onClick={() => setEditCor(c)} className={cn('h-6 w-6 rounded-full border-2', editCor === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} />)}</div>
                <div className="flex gap-1">
                  <button onClick={salvar} disabled={pending} title="Salvar" className="rounded-md border p-1.5 text-emerald-600 hover:bg-emerald-500/10"><Check className="h-4 w-4" /></button>
                  <button onClick={() => setEditId(null)} title="Cancelar" className="rounded-md border p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                </div>
              </div>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: `${m.cor ?? '#64748b'}22`, color: m.cor ?? '#64748b' }}><Layers className="h-3 w-3" /> {m.nome}</span>
                <div className="ml-auto flex gap-1">
                  <button onClick={() => { setEditId(m.id); setEditNome(m.nome); setEditCor(m.cor ?? CORES[5]) }} title="Editar" className="rounded-md border p-1.5 text-muted-foreground transition hover:border-primary hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => excluir(m)} title="Excluir" className="rounded-md border p-1.5 text-muted-foreground transition hover:border-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
