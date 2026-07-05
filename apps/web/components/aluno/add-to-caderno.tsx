'use client'

import { useState, useRef, useEffect } from 'react'
import { NotebookPen, Plus, Check, Loader2 } from 'lucide-react'

interface Caderno { id: string; nome: string; total: number }

export function AddToCaderno({ questaoId }: { questaoId: string }) {
  const [aberto, setAberto] = useState(false)
  const [cadernos, setCadernos] = useState<Caderno[] | null>(null)
  const [novo, setNovo] = useState('')
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    if (cadernos === null) {
      fetch('/api/aluno/cadernos').then((r) => r.json()).then((j) => setCadernos(j.cadernos ?? [])).catch(() => setCadernos([]))
    }
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [aberto, cadernos])

  async function adicionar(cadernoId: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/aluno/cadernos/questao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caderno_id: cadernoId, questao_id: questaoId }),
      })
      if (res.ok) setAddedTo((s) => new Set(s).add(cadernoId))
    } finally { setBusy(false) }
  }

  async function criarEAdicionar(e: React.FormEvent) {
    e.preventDefault()
    if (!novo.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/aluno/cadernos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novo }),
      })
      if (res.ok) {
        const { caderno } = await res.json()
        setCadernos((c) => [caderno, ...(c ?? [])])
        setNovo('')
        await adicionar(caderno.id)
      }
    } finally { setBusy(false) }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label="Adicionar a caderno"
        className="text-muted-foreground hover:text-primary"
        title="Adicionar a caderno"
      >
        <NotebookPen className="h-5 w-5" />
      </button>

      {aberto && (
        <div className="absolute right-0 top-8 z-50 w-60 overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="border-b px-3 py-2 text-xs font-semibold">Adicionar a caderno</div>
          <div className="max-h-56 overflow-auto">
            {cadernos === null ? (
              <div className="p-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : cadernos.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">Nenhum caderno ainda.</p>
            ) : (
              cadernos.map((c) => {
                const added = addedTo.has(c.id)
                return (
                  <button key={c.id} disabled={busy || added} onClick={() => adicionar(c.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-70">
                    <span className="truncate">{c.nome}</span>
                    {added ? <Check className="h-4 w-4 text-green-600" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                  </button>
                )
              })
            )}
          </div>
          <form onSubmit={criarEAdicionar} className="flex gap-1 border-t p-2">
            <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo caderno…" maxLength={120}
              className="min-w-0 flex-1 rounded-md border bg-[var(--input-bg,transparent)] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
            <button type="submit" disabled={busy || !novo.trim()} className="shrink-0 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
