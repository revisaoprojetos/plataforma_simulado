'use client'

import * as React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { navProgressStart } from '@/lib/nav-progress'
import { cn } from '@/lib/utils'

export type FiltroSelect = { param: string; label: string; opcoes: { value: string; label: string }[]; padrao?: string }

const selectCls = 'h-9 rounded-lg border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

/** Filtros por URL (searchParams) para as telas de acessos — a PÁGINA lê os params e filtra no servidor. */
export function AcessosFiltros({ selects, toggles = [] }: { selects: FiltroSelect[]; toggles?: { param: string; label: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const push = (fn: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(sp.toString())
    fn(p)
    p.delete('page')
    navProgressStart()
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selects.map((f) => (
        <label key={f.param} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {f.label}
          <select
            className={selectCls}
            value={sp.get(f.param) ?? f.padrao ?? ''}
            onChange={(e) => push((p) => { e.target.value && e.target.value !== (f.padrao ?? '') ? p.set(f.param, e.target.value) : p.delete(f.param) })}
          >
            {f.opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      ))}
      {toggles.map((t) => {
        const on = sp.get(t.param) === '1'
        return (
          <button
            key={t.param}
            type="button"
            onClick={() => push((p) => { on ? p.delete(t.param) : p.set(t.param, '1') })}
            className={cn('h-9 rounded-lg border px-3 text-sm transition-colors', on ? 'border-primary bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
            aria-pressed={on}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
