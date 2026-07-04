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
import { useCallback } from 'react'

type Disciplina = { id: string; nome: string }

export function QuestoesFilters({ disciplinas = [] }: { disciplinas?: Disciplina[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      params.delete('page')
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const temFiltro = ['q', 'status', 'disciplina', 'dificuldade', 'tipo'].some((k) => searchParams.get(k))

  return (
    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
      <Input
        placeholder="Buscar por código ou enunciado..."
        defaultValue={searchParams.get('q') ?? ''}
        onChange={(e) => updateParams('q', e.target.value)}
        className="w-full sm:w-56"
      />

      <Select
        value={searchParams.get('disciplina') ?? 'all'}
        onValueChange={(v) => updateParams('disciplina', (!v || v === 'all') ? '' : v)}
      >
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Disciplina" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as disciplinas</SelectItem>
          {disciplinas.map((d) => (
            <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('dificuldade') ?? 'all'}
        onValueChange={(v) => updateParams('dificuldade', (!v || v === 'all') ? '' : v)}
      >
        <SelectTrigger className="w-[150px]"><SelectValue placeholder="Dificuldade" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toda dificuldade</SelectItem>
          <SelectItem value="facil">Fácil</SelectItem>
          <SelectItem value="medio">Médio</SelectItem>
          <SelectItem value="dificil">Difícil</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('tipo') ?? 'all'}
        onValueChange={(v) => updateParams('tipo', (!v || v === 'all') ? '' : v)}
      >
        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os tipos</SelectItem>
          <SelectItem value="objetiva">Objetiva</SelectItem>
          <SelectItem value="discursiva">Discursiva</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('status') ?? 'all'}
        onValueChange={(v) => updateParams('status', (!v || v === 'all') ? '' : v)}
      >
        <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="rascunho">Rascunho</SelectItem>
          <SelectItem value="publicada">Publicada</SelectItem>
          <SelectItem value="arquivada">Arquivada</SelectItem>
        </SelectContent>
      </Select>

      {temFiltro && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          <X className="mr-1 h-4 w-4" /> Limpar
        </Button>
      )}
    </div>
  )
}
