'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function SimuladosFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Select
        defaultValue={searchParams.get('status') ?? 'all'}
        onValueChange={(v) => update('status', v ?? 'all')}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="rascunho">Rascunho</SelectItem>
          <SelectItem value="publicado">Publicado</SelectItem>
          <SelectItem value="encerrado">Encerrado</SelectItem>
        </SelectContent>
      </Select>

    </div>
  )
}
