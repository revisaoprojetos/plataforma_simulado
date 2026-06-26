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
import { useCallback } from 'react'

export function QuestoesFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page')
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  return (
    <div className="flex flex-wrap gap-3">
      <Input
        placeholder="Buscar por enunciado..."
        defaultValue={searchParams.get('q') ?? ''}
        onChange={(e) => updateParams('q', e.target.value)}
        className="max-w-xs"
      />
      <Select
        defaultValue={searchParams.get('status') ?? 'all'}
        onValueChange={(v) => updateParams('status', v === 'all' ? '' : (v ?? ''))}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="rascunho">Rascunho</SelectItem>
          <SelectItem value="publicada">Publicada</SelectItem>
          <SelectItem value="arquivada">Arquivada</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
