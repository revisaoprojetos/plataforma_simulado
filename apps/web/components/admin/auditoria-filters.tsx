'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

const ACOES = ['INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ANULAR', 'RECORRIGIR', 'LIBERAR']

export function AuditoriaFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  function clear() {
    router.push(pathname)
  }

  const hasFilters = searchParams.toString().length > 0

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <Select
        defaultValue={searchParams.get('acao') ?? 'all'}
        onValueChange={(v) => update('acao', v === 'all' ? '' : (v ?? ''))}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Ação" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          {ACOES.map((a) => (
            <SelectItem key={a} value={a}>{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        className="w-[160px]"
        placeholder="Módulo (entidade)"
        defaultValue={searchParams.get('entidade') ?? ''}
        onBlur={(e) => update('entidade', e.target.value)}
      />

      <Input
        className="w-[140px]"
        type="date"
        defaultValue={searchParams.get('data_inicio') ?? ''}
        onChange={(e) => update('data_inicio', e.target.value)}
      />
      <span className="text-muted-foreground text-sm">até</span>
      <Input
        className="w-[140px]"
        type="date"
        defaultValue={searchParams.get('data_fim') ?? ''}
        onChange={(e) => update('data_fim', e.target.value)}
      />

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clear}>
          <X className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      )}
    </div>
  )
}
