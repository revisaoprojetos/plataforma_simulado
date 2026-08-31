'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCriar } from './criar-context'
import { Secao } from './secao'
import { dadosAcessos } from './dados'

export function SecaoAcessos() {
  const { draft, patch } = useCriar()
  const [pacotes, setPacotes] = useState<{ id: string; nome: string }[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    dadosAcessos().then((r) => {
      if (r.ok) setPacotes(r.pacotes ?? [])
      setCarregando(false)
    })
  }, [])

  function toggle(id: string) {
    patch({ pacoteIds: draft.pacoteIds.includes(id) ? draft.pacoteIds.filter((x) => x !== id) : [...draft.pacoteIds, id] })
  }

  return (
    <Secao numero={5} titulo="Acessos" descricao="Grupos de acesso que recebem o cronograma — é por eles que o aluno recebe. Opcional; dá para vincular depois.">
      {carregando ? (
        <p className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos de acesso…
        </p>
      ) : pacotes.length === 0 ? (
        <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          Nenhum grupo de acesso cadastrado ainda. Você pode vincular o cronograma a um grupo depois de criar.
        </p>
      ) : (
        <div className="grid gap-2 rounded-2xl border bg-card p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
          {pacotes.map((p) => {
            const on = draft.pacoteIds.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className={cn('flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition', on ? 'border-primary bg-primary/5' : 'hover:bg-muted')}
              >
                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
                <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nome}</span>
              </button>
            )
          })}
        </div>
      )}
    </Secao>
  )
}
