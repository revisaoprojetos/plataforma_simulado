'use client'
import { confirmar } from '@/components/ui/confirm-dialog'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { excluirSessaoAction } from '@/app/admin/estudantes/actions'

export function ExcluirSessaoButton({ sessaoId, simuladoId, estudanteId }: { sessaoId: string; simuladoId: string; estudanteId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  async function excluir() {
    if (!(await confirmar({ mensagem: 'Excluir esta tentativa?\n\nEla sai do histórico, dos resultados e do ranking (recalculado), e vai para a Lixeira — pode ser restaurada.', destrutivo: true }))) return
    start(async () => {
      const r = await excluirSessaoAction(sessaoId, simuladoId, estudanteId)
      if (r?.error) toast.error(r.error)
      else { toast.success('Tentativa enviada para a Lixeira'); router.refresh() }
    })
  }

  return (
    <button onClick={excluir} disabled={pending} title="Excluir tentativa" aria-label="Excluir tentativa"
      className={cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }), 'text-destructive hover:bg-destructive/10 hover:text-destructive')}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  )
}
