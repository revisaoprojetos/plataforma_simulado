'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Cabeçalho de coluna clicável (setas ↕/↑/↓), no mesmo padrão da tabela de estudantes.
export type Sort<K extends string = string> = { key: K; dir: 'asc' | 'desc' } | null

export function useOrdenacao<K extends string>(inicial: Sort<K> = null) {
  const [sort, setSort] = useState<Sort<K>>(inicial)
  const ordenarPor = (key: K) => setSort((p) => (p && p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  return { sort, setSort, ordenarPor }
}

/** Só o botão (rótulo + ícone) — coloque dentro de qualquer <th>/<TableHead>. */
export function SortButton<K extends string>({ label, k, sort, onSort, className }: {
  label: string; k: K; sort: Sort<K>; onSort: (k: K) => void; className?: string
}) {
  const ativo = sort?.key === k
  const Icon = ativo ? (sort!.dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown
  return (
    <button type="button" onClick={() => onSort(k)}
      className={cn('inline-flex items-center gap-1 transition-colors hover:text-foreground', ativo && 'text-foreground', className)}>
      {label}
      <Icon className={cn('h-3.5 w-3.5', ativo ? 'opacity-100' : 'opacity-40')} />
    </button>
  )
}

/** <th> ordenável pronto (para tabelas com <thead> cru). */
export function Th<K extends string>({ label, k, sort, onSort, align = 'left', className }: {
  label: string; k: K; sort: Sort<K>; onSort: (k: K) => void; align?: 'left' | 'center' | 'right'; className?: string
}) {
  return (
    <th className={cn('px-3 py-2.5 font-medium', align === 'center' && 'text-center', align === 'right' && 'text-right', className)}>
      <SortButton label={label} k={k} sort={sort} onSort={onSort}
        className={cn('uppercase tracking-wide', align === 'center' && 'mx-auto', align === 'right' && 'ml-auto')} />
    </th>
  )
}
