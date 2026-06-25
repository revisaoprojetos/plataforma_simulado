'use client'

import { Button } from '@/components/ui/button'
import { publishSimuladoAction, encerrarSimuladoAction } from '@/app/admin/simulados/actions'
import { toast } from 'sonner'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface SimuladoActionsProps {
  simuladoId: string
  status: string
}

export function SimuladoActions({ simuladoId, status }: SimuladoActionsProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handlePublish() {
    setIsLoading(true)
    try {
      await publishSimuladoAction(simuladoId)
      toast.success('Simulado publicado com sucesso!')
    } catch {
      toast.error('Erro ao publicar simulado')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleEncerrar() {
    setIsLoading(true)
    try {
      await encerrarSimuladoAction(simuladoId)
      toast.success('Simulado encerrado.')
    } catch {
      toast.error('Erro ao encerrar simulado')
    } finally {
      setIsLoading(false)
    }
  }

  if (status === 'encerrado') {
    return (
      <div className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">
        Encerrado
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      {status === 'rascunho' && (
        <Button onClick={handlePublish} disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Publicar
        </Button>
      )}
      {status === 'publicado' && (
        <Button variant="destructive" onClick={handleEncerrar} disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Encerrar Simulado
        </Button>
      )}
    </div>
  )
}
