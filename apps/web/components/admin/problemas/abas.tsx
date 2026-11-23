'use client'

// Abas da Auditoria de Problemas — SUBLINHADO (border-b-2), nunca pill. Cada aba é um link (?aba=) e a página só busca os dados dela.
import Link from 'next/link'
import { BarChart3, Clock, ListChecks, Network } from 'lucide-react'
import { cn } from '@/lib/utils'

export const ABAS = [
  { id: 'visao', label: 'Visão geral', icon: BarChart3 },
  { id: 'mapa', label: 'Mapa mental', icon: Network },
  { id: 'lista', label: 'Lista', icon: ListChecks },
  { id: 'historico', label: 'Histórico', icon: Clock },
] as const
export type AbaId = (typeof ABAS)[number]['id']

export function ProblemasAbas({ ativa }: { ativa: AbaId }) {
  return (
    <div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b" role="tablist">
      {ABAS.map((t) => {
        const Icone = t.icon
        const on = t.id === ativa
        return (
          <Link
            key={t.id} href={t.id === 'visao' ? '/admin/auditoria/problemas' : `/admin/auditoria/problemas?aba=${t.id}`} role="tab" aria-selected={on}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition',
              on ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icone className="h-4 w-4" />{t.label}
          </Link>
        )
      })}
    </div>
  )
}
