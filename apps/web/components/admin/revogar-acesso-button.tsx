'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { revogarAcesso } from '@/app/admin/simulados/acesso-actions'

export function RevogarAcessoButton({ acessoId, simuladoId }: { acessoId: string; simuladoId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" disabled={pending}
      onClick={() => start(async () => {
        const r = await revogarAcesso(acessoId, simuladoId)
        if (r.ok) { toast.success('Acesso revogado'); router.refresh() } else toast.error(r.error ?? 'Erro')
      })}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  )
}
