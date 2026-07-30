'use client'

import { useState } from 'react'
import Link from 'next/link'
import { UserPlus, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NovoAdministradorForm } from '@/components/admin/novo-administrador-form'
import { AdministradoresLista } from '@/components/admin/administradores-lista'
import { GerenciarAcessosModal } from '@/components/super/gerenciar-acessos-modal'
import type { AdminMembro, CargoOpcao } from '@/app/admin/administradores/actions'

/** Aba "Acessos" da plataforma (console super): toolbar com "Adicionar administrador" (modal)
 *  e "Configurar RBAC" (página da matriz de permissões), + a lista da equipe. */
export function PlataformaAcessos({ tenantId, membros, cargos }: {
  tenantId: string
  membros: AdminMembro[]
  cargos: CargoOpcao[]
}) {
  const [novoAberto, setNovoAberto] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Equipe da plataforma</h2>
          <p className="text-xs text-muted-foreground">{membros.length} administrador(es) com acesso</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setNovoAberto(true)}><UserPlus className="mr-2 h-4 w-4" /> Adicionar administrador</Button>
          <GerenciarAcessosModal membros={membros} cargos={cargos} tenantId={tenantId} />
          <Link href={`/super/plataformas/${tenantId}/rbac`} className={cn(buttonVariants({ variant: 'outline' }))}>
            <ShieldCheck className="mr-2 h-4 w-4" /> Configurar RBAC
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <AdministradoresLista membros={membros} cargos={cargos} tenantId={tenantId} />
      </div>

      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo administrador</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Cria (ou reaproveita) a conta por e-mail e concede acesso com o cargo escolhido.</p>
          <NovoAdministradorForm cargos={cargos} tenantId={tenantId} onSuccess={() => setNovoAberto(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
