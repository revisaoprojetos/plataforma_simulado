'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { NotebookPen, Plus, Loader2, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface Caderno { id: string; nome: string; total: number }

export function CadernosManager() {
  const [cadernos, setCadernos] = useState<Caderno[] | null>(null)
  const [nome, setNome] = useState('')
  const [criando, setCriando] = useState(false)

  async function carregar() {
    const res = await fetch('/api/aluno/cadernos')
    if (res.ok) setCadernos((await res.json()).cadernos ?? [])
  }
  useEffect(() => { carregar() }, [])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setCriando(true)
    try {
      const res = await fetch('/api/aluno/cadernos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome }),
      })
      if (res.ok) { setNome(''); await carregar() }
    } finally { setCriando(false) }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={criar} className="flex gap-2 rounded-lg border bg-card p-3">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do novo caderno (ex.: Revisão de erros)"
          maxLength={120}
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <button type="submit" disabled={criando || !nome.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar
        </button>
      </form>

      {cadernos === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : cadernos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <NotebookPen className="h-8 w-8" />
          <p className="text-sm">Crie seu primeiro caderno e adicione questões a partir do banco.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cadernos.map((c) => (
            <Link key={c.id} href={`/aluno/cadernos/${c.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <NotebookPen className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-xs text-muted-foreground">{c.total} questão(ões)</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
