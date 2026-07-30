'use client'

import { useState } from 'react'
import { Plus, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NovoPerfilForm } from '@/components/admin/novo-perfil-form'
import { GerenciarCargos, type CargoItem } from '@/components/super/gerenciar-cargos'
import type { RbacCategoria } from '@/app/admin/tenants/actions'

/** Botões da toolbar de cargos: "Novo cargo" (modal de criação, com escolha de categoria) e
 *  "Gerenciar cargos" (modal com categorias + atribuição por cargo + exclusão). */
export function RbacCargosControles({ tenantId, cargos, categorias }: { tenantId: string; cargos: CargoItem[]; categorias: RbacCategoria[] }) {
  const [novo, setNovo] = useState(false)
  const [gerenciar, setGerenciar] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => setNovo(true)}><Plus className="mr-2 h-4 w-4" /> Novo cargo</Button>
      <Button variant="outline" onClick={() => setGerenciar(true)}><Settings2 className="mr-2 h-4 w-4" /> Gerenciar cargos</Button>

      <Dialog open={novo} onOpenChange={setNovo}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo cargo</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Cria um cargo (função) personalizado para esta plataforma e escolhe a categoria (banda da matriz).</p>
          <NovoPerfilForm tenantId={tenantId} categorias={categorias} onSuccess={() => setNovo(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={gerenciar} onOpenChange={setGerenciar}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Gerenciar cargos</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Crie categorias, defina a categoria de cada cargo e exclua cargos personalizados. Os de sistema são protegidos.</p>
          <GerenciarCargos cargos={cargos} categorias={categorias} tenantId={tenantId} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
