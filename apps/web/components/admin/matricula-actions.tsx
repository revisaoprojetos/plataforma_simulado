'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { toggleMatriculaAcesso, excluirMatricula } from '@/app/admin/matriculas/actions'
import { Ban, CheckCircle, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  matriculaId: string
  liberado: boolean
}

export function MatriculaActions({ matriculaId, liberado }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleMatriculaAcesso(matriculaId, !liberado)
      if (result.ok) toast.success(liberado ? 'Acesso bloqueado' : 'Acesso liberado')
      else toast.error(result.error ?? 'Erro ao atualizar')
    })
  }

  function handleExcluir() {
    startTransition(async () => {
      const result = await excluirMatricula(matriculaId)
      if (result.ok) toast.success('Matrícula removida')
      else toast.error(result.error ?? 'Erro ao remover')
    })
  }

  if (isPending) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />

  return (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleToggle}
        title={liberado ? 'Bloquear acesso' : 'Liberar acesso'}
      >
        {liberado
          ? <Ban className="h-3.5 w-3.5 text-destructive" />
          : <CheckCircle className="h-3.5 w-3.5 text-green-600" />
        }
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleExcluir}
        title="Remover matrícula"
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  )
}
