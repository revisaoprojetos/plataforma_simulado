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
import { OCULTAR_DISCURSIVA } from '@/lib/flags'
import { X } from 'lucide-react'
import { useCallback } from 'react'

type Disciplina = { id: string; nome: string }

const DIFICULDADES = [
  { valor: 'all', rotulo: 'Toda dificuldade' },
  { valor: 'facil', rotulo: 'Fácil' },
  { valor: 'medio', rotulo: 'Médio' },
  { valor: 'dificil', rotulo: 'Difícil' },
]
const TIPOS = [
  { valor: 'all', rotulo: 'Todos os tipos' },
  { valor: 'objetiva', rotulo: 'Objetiva' },
  { valor: 'discursiva', rotulo: 'Discursiva' },
]
const STATUS = [
  { valor: 'all', rotulo: 'Todos os status' },
  { valor: 'rascunho', rotulo: 'Rascunho' },
  { valor: 'publicada', rotulo: 'Publicada' },
  { valor: 'arquivada', rotulo: 'Arquivada' },
]
const rotuloDe = (opts: { valor: string; rotulo: string }[], v: string) =>
  opts.find((o) => o.valor === v)?.rotulo ?? opts[0].rotulo

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
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Disciplina">{(v: string) => v === 'all' ? 'Todas as disciplinas' : (disciplinas.find((d) => d.id === v)?.nome ?? 'Todas as disciplinas')}</SelectValue></SelectTrigger>
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
        <SelectTrigger className="w-[150px]"><SelectValue placeholder="Dificuldade">{(v: string) => rotuloDe(DIFICULDADES, v)}</SelectValue></SelectTrigger>
        <SelectContent>
          {DIFICULDADES.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('tipo') ?? 'all'}
        onValueChange={(v) => updateParams('tipo', (!v || v === 'all') ? '' : v)}
      >
        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipo">{(v: string) => rotuloDe(TIPOS, v)}</SelectValue></SelectTrigger>
        <SelectContent>
          {TIPOS.filter((o) => o.valor !== 'discursiva' || !OCULTAR_DISCURSIVA).map((o) => (
            <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('status') ?? 'all'}
        onValueChange={(v) => updateParams('status', (!v || v === 'all') ? '' : v)}
      >
        <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status">{(v: string) => rotuloDe(STATUS, v)}</SelectValue></SelectTrigger>
        <SelectContent>
          {STATUS.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}
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
