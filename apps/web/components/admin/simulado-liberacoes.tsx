'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Award, ClipboardCheck, FileStack, Lock, Unlock, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolverLiberacoes, type RegrasLiberacao } from '@/lib/simulado/liberacao'
import { liberarItemAction } from '@/app/admin/simulados/actions'

const MODO_LABEL: Record<string, string> = { imediato: 'Imediato', apos_janela: 'Após janela', manual: 'Manual' }

type Item = 'nota' | 'gabarito' | 'caderno'

export function SimuladoLiberacoes({
  simuladoId, regras, status, dataFim,
}: {
  simuladoId: string
  regras: RegrasLiberacao | null | undefined
  status: string
  dataFim: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const r = regras ?? {}

  const efetivo = resolverLiberacoes(r, { status, data_fim: dataFim })
  const [override, setOverride] = useState<Partial<Record<Item, boolean>>>({})
  const estado: Record<Item, boolean> = {
    nota: override.nota ?? efetivo.notaLiberada,
    gabarito: override.gabarito ?? efetivo.gabaritoLiberado,
    caderno: override.caderno ?? efetivo.cadernoLiberado,
  }

  const rotulo: Record<Item, string> = { nota: 'Nota/desempenho', gabarito: 'Gabarito', caderno: 'Caderno (PDF)' }
  function toggle(item: Item) {
    const novo = !estado[item]
    setOverride((p) => ({ ...p, [item]: novo }))
    startTransition(async () => {
      await liberarItemAction(simuladoId, item, novo)
      toast.success(`${rotulo[item]} ${novo ? 'liberado(a) para os alunos' : 'bloqueado(a)'}`)
      router.refresh()
    })
  }

  const linhas: { item: Item; icon: any; titulo: string; desc: string; modo?: string }[] = [
    { item: 'nota', icon: Award, titulo: 'Nota e desempenho', desc: 'Nota, acertos e comparativo com a turma.', modo: r.liberar_nota ?? 'imediato' },
    { item: 'gabarito', icon: ClipboardCheck, titulo: 'Gabarito', desc: 'Alternativas corretas e comentário do professor.', modo: r.liberar_gabarito ?? 'apos_janela' },
    { item: 'caderno', icon: FileStack, titulo: 'Caderno em PDF', desc: 'Downloads de gabarito e caderno completo.', modo: r.liberar_caderno ?? 'apos_janela' },
  ]
  const publico = r.caderno_publico ?? 'todos'

  return (
    <div className="divide-y rounded-lg border">
      {linhas.map(({ item, icon: Icon, titulo, desc, modo }) => {
        const on = estado[item]
        return (
          <div key={item} className="flex flex-wrap items-center gap-3 p-3">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', on ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{titulo}</p>
                <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{MODO_LABEL[modo ?? ''] ?? modo}</span>
                {item === 'caderno' && (
                  <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Users className="h-3 w-3" /> {publico === 'passaporte' ? 'Só passaporte' : 'Todos'}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">{desc}</p>
            </div>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', on ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
              {on ? 'Liberado' : 'Bloqueado'}
            </span>
            <button
              type="button"
              onClick={() => toggle(item)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                on ? 'hover:bg-muted' : 'border-primary bg-primary text-primary-foreground hover:opacity-90',
              )}
            >
              {on ? <><Lock className="h-3.5 w-3.5" /> Bloquear</> : <><Unlock className="h-3.5 w-3.5" /> Liberar</>}
            </button>
          </div>
        )
      })}
    </div>
  )
}
