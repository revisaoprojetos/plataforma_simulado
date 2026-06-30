'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { removerQuestao } from '@/app/admin/banco-questoes/actions'

export function RemoverQuestaoBanco({ bancoId, questaoId }: { bancoId: string; questaoId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      className="text-muted-foreground hover:text-destructive"
      title="Remover do banco"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await removerQuestao(bancoId, questaoId)
          if (r.ok) { toast.success('Removida do banco'); router.refresh() }
          else toast.error(r.error ?? 'Erro')
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
    </Button>
  )
}
