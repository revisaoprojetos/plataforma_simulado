'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface SelectOption {
  id: string
  nome: string
}

interface BancoQuestoesSearchProps {
  bancas: SelectOption[]
  disciplinas: SelectOption[]
}

export function BancoQuestoesSearch({ bancas, disciplinas }: BancoQuestoesSearchProps) {
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

  function clearAll() {
    router.push(pathname)
  }

  const hasFilters = searchParams.toString().length > 0

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Busca</Label>
        <Input
          placeholder="Palavras-chave..."
          defaultValue={searchParams.get('q') ?? ''}
          onChange={(e) => update('q', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Banca</Label>
        <Select
          defaultValue={searchParams.get('banca') ?? 'all'}
          onValueChange={(v) => update('banca', v ?? 'all')}
        >
          <SelectTrigger>
            <SelectValue placeholder="Todas as bancas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as bancas</SelectItem>
            {bancas.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Disciplina</Label>
        <Select
          defaultValue={searchParams.get('disciplina') ?? 'all'}
          onValueChange={(v) => update('disciplina', v ?? 'all')}
        >
          <SelectTrigger>
            <SelectValue placeholder="Todas as disciplinas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as disciplinas</SelectItem>
            {disciplinas.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Dificuldade</Label>
        <Select
          defaultValue={searchParams.get('dificuldade') ?? 'all'}
          onValueChange={(v) => update('dificuldade', v ?? 'all')}
        >
          <SelectTrigger>
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="facil">Fácil</SelectItem>
            <SelectItem value="medio">Médio</SelectItem>
            <SelectItem value="dificil">Difícil</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" className="w-full" onClick={clearAll}>
          <X className="mr-2 h-4 w-4" />
          Limpar filtros
        </Button>
      )}
    </div>
  )
}
