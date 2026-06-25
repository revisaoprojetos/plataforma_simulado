'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { criarMatricula } from '@/app/admin/matriculas/actions'
import { toast } from 'sonner'

interface Estudante { id: string; nome: string; email: string }
interface Simulado { id: string; titulo: string }

interface Props {
  estudantes: Estudante[]
  simulados: Simulado[]
}

export function NovaMatriculaForm({ estudantes, simulados }: Props) {
  const [estudanteId, setEstudanteId] = useState('')
  const [simuladoId, setSimuladoId] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!estudanteId || !simuladoId) return
    startTransition(async () => {
      const result = await criarMatricula({
        estudante_id: estudanteId,
        simulado_id: simuladoId,
      })
      if (result.ok) {
        toast.success('Matrícula criada com sucesso')
        router.push('/admin/matriculas')
      } else {
        toast.error(result.error ?? 'Erro ao criar matrícula')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Estudante *</Label>
        <Select value={estudanteId} onValueChange={(v) => setEstudanteId(v ?? '')}>
          <SelectTrigger>
            <SelectValue placeholder="Selecionar estudante…" />
          </SelectTrigger>
          <SelectContent>
            {estudantes.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nome} — {e.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Simulado *</Label>
        <Select value={simuladoId} onValueChange={(v) => setSimuladoId(v ?? '')}>
          <SelectTrigger>
            <SelectValue placeholder="Selecionar simulado…" />
          </SelectTrigger>
          <SelectContent>
            {simulados.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.titulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={!estudanteId || !simuladoId || isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar Matrícula
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
