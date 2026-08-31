'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCriar, useGuardStep } from '../criar-context'
import { Etapa } from '../etapa'
import { dadosAcessos } from '../dados'

export default function AcessosPage() {
  useGuardStep(4)
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
    <Etapa
      titulo="Acessos"
      descricao="Em quais grupos de acesso este cronograma entra — é por eles que o aluno recebe. Sem nenhum, ele fica só para quem tiver acesso avulso ou gratuito. Etapa opcional."
    >
      {carregando ? (
        <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos de acesso…
        </p>
      ) : pacotes.length === 0 ? (
        <div className="rounded-2xl border bg-card py-12 text-center text-sm text-muted-foreground shadow-sm">
          <Package className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
          Nenhum grupo de acesso cadastrado ainda. Você pode vincular o cronograma a um grupo depois de criar.
        </div>
      ) : (
        <div className="space-y-2">
          {pacotes.map((p) => {
            const on = draft.pacoteIds.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition',
                  on ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                  )}
                >
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
                <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nome}</span>
              </button>
            )
          })}
        </div>
      )}
    </Etapa>
  )
}
