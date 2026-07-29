'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { confirmar } from '@/components/ui/confirm-dialog'
import { toggleTenantAtivoAction } from '@/app/admin/tenants/actions'

/** Badge de status clicável: super-admin ativa/oculta a plataforma (some do login e do sistema). */
export function TenantToggle({ id, nome, ativo }: { id: string; nome: string; ativo: boolean }) {
  const [pending, start] = useTransition()
  const router = useRouter()

  async function toggle() {
    const novo = !ativo
    const ok = await confirmar({
      titulo: novo ? 'Ativar plataforma' : 'Ocultar plataforma',
      mensagem: novo
        ? `Ativar "${nome}"? Volta a aparecer no login e no seletor.`
        : `Ocultar "${nome}"? Some do login e do seletor (não é apagada — reversível).`,
      confirmar: novo ? 'Ativar' : 'Ocultar',
      destrutivo: !novo,
    })
    if (!ok) return
    start(async () => {
      const r = await toggleTenantAtivoAction(id, novo)
      if (r.ok) { toast.success(novo ? 'Plataforma ativada.' : 'Plataforma ocultada.'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao alterar.')
    })
  }

  return (
    <button type="button" onClick={toggle} disabled={pending} className="inline-flex items-center gap-1.5 disabled:opacity-60" title={ativo ? 'Clique para ocultar da web' : 'Clique para ativar'}>
      {pending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      {ativo ? <Badge variant="default">Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}
    </button>
  )
}
