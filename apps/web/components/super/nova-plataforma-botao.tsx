'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NovoTenantForm } from '@/components/admin/novo-tenant-form'

/** Botão "Nova plataforma" que abre o formulário de criação num pop-up (modal). */
export function NovaPlataformaBotao() {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button onClick={() => setAberto(true)}><Plus className="mr-2 h-4 w-4" /> Nova plataforma</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova plataforma</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Já recebe perfis de acesso, mensagens padrão e um admin inicial.</p>
          <NovoTenantForm onSuccess={() => setAberto(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
