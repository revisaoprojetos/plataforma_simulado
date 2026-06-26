'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createRoleAction } from '@/app/admin/rbac/actions'

export function NovoPerfilForm() {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    startTransition(async () => {
      const r = await createRoleAction(nome, descricao)
      if (r.ok) {
        toast.success('Perfil criado')
        setNome('')
        setDescricao('')
        router.refresh()
      } else {
        toast.error(r.error ?? 'Erro ao criar perfil')
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Nome do perfil</label>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: admin_comercial" className="w-48" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Descrição (opcional)</label>
        <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que este perfil faz" className="w-64" />
      </div>
      <Button type="submit" disabled={pending || !nome.trim()}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        Novo perfil
      </Button>
    </form>
  )
}
