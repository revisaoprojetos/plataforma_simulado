'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { MoreVertical, Settings, Eye, EyeOff, Trash2, Loader2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { toggleTenantAtivoAction, deleteTenantAction } from '@/app/admin/tenants/actions'

/** Menu de ações (3 pontos) de uma plataforma na tabela do console. */
export function PlataformaAcoes({ id, nome, ativo }: { id: string; nome: string; ativo: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function alternar() {
    start(async () => {
      const r = await toggleTenantAtivoAction(id, !ativo)
      if (r.ok) { toast.success(ativo ? 'Plataforma ocultada.' : 'Plataforma reativada.'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao alterar a visualização')
    })
  }

  function excluir() {
    start(async () => {
      if (ativo) { toast.error('Oculte a plataforma antes de excluir.'); return }
      const digitado = await pedirTexto({
        titulo: 'Excluir plataforma',
        mensagem: `Esta ação é irreversível. Digite o nome "${nome}" para confirmar a exclusão.`,
        label: 'Nome da plataforma',
        placeholder: nome,
        confirmar: 'Excluir definitivamente',
      })
      if (digitado == null) return
      if (!(await confirmar({ titulo: 'Confirmar exclusão', mensagem: `Excluir "${nome}" permanentemente?`, confirmar: 'Excluir', destrutivo: true }))) return
      const r = await deleteTenantAction(id, digitado)
      if (r.ok) { toast.success('Plataforma excluída.'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao excluir')
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        aria-label={`Ações de ${nome}`}
        disabled={pending}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem render={<Link href={`/super/plataformas/${id}`} />}>
          <Settings className="mr-2 h-4 w-4" /> Configurações
        </DropdownMenuItem>
        <DropdownMenuItem onClick={alternar}>
          {ativo ? <><EyeOff className="mr-2 h-4 w-4" /> Ocultar visualização</> : <><Eye className="mr-2 h-4 w-4" /> Reativar visualização</>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={excluir} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
