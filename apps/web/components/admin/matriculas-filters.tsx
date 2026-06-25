'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

export function MatriculasFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') params.set(key, value)
    else params.delete(key)
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Select
        defaultValue={searchParams.get('liberado') ?? 'all'}
        onValueChange={(v) => update('liberado', v ?? 'all')}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Acesso" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="true">Liberado</SelectItem>
          <SelectItem value="false">Bloqueado</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
