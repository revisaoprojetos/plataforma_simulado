'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { deleteEstudanteAction } from '@/app/admin/estudantes/actions'

export function ExcluirEstudanteButton({ id, nome }: { id: string; nome: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function excluir() {
    if (!confirm(`Excluir o estudante "${nome}"?\n\nVai para a Lixeira (recuperável). As sessões e vínculos são preservados.`)) return
    start(async () => {
      const r = await deleteEstudanteAction(id)
      if (r?.error) toast.error(r.error)
      else { toast.success('Estudante enviado para a Lixeira'); router.refresh() }
    })
  }

  return (
    <button onClick={excluir} disabled={pending} title="Excluir estudante" aria-label="Excluir estudante"
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'text-destructive hover:bg-destructive/10 hover:text-destructive')}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  )
}
