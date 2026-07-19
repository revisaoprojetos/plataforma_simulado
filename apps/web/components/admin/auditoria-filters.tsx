'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACOES = ['INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ANULAR', 'RECORRIGIR', 'LIBERAR']

export function AuditoriaFilters({ mostrarAcao = true, buscaPlaceholder = 'Buscar…' }: { mostrarAcao?: boolean; buscaPlaceholder?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [q, setQ] = useState(searchParams.get('q') ?? '')

  function update(key: string, value: string, extraDelete: string[] = []) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('page')
    for (const e of extraDelete) params.delete(e)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  // Busca instantânea (debounced): atualiza a URL 350ms após parar de digitar, sem reload brusco.
  const primeiro = useRef(true)
  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return }
    const t = setTimeout(() => {
      if ((searchParams.get('q') ?? '') !== q) update('q', q)
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const clear = () => { setQ(''); router.push(pathname, { scroll: false }) }
  const hasFilters = ['q', 'acao', 'entidade', 'data_inicio', 'data_fim'].some((k) => searchParams.get(k))

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={buscaPlaceholder}
          className="h-9 border-0 bg-transparent pl-8 shadow-none focus-visible:ring-0" />
      </div>

      {mostrarAcao && (
        <Select defaultValue={searchParams.get('acao') ?? 'all'} onValueChange={(v) => update('acao', v === 'all' ? '' : (v ?? ''))}>
          <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Ação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {ACOES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-1.5">
        <Input className="h-9 w-[140px]" type="date" defaultValue={searchParams.get('data_inicio') ?? ''} onChange={(e) => update('data_inicio', e.target.value)} />
        <span className="text-xs text-muted-foreground">até</span>
        <Input className="h-9 w-[140px]" type="date" defaultValue={searchParams.get('data_fim') ?? ''} onChange={(e) => update('data_fim', e.target.value)} />
      </div>

      <button type="button" onClick={clear} disabled={!hasFilters}
        className={cn('inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm transition-colors', hasFilters ? 'text-muted-foreground hover:bg-muted hover:text-foreground' : 'cursor-not-allowed opacity-40')}>
        <X className="h-4 w-4" /> Limpar
      </button>
    </div>
  )
}
