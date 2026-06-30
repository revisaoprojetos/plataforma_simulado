'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { criarCaderno } from '@/app/admin/cadernos/actions'

export function NovoCadernoForm() {
  const [nome, setNome] = useState('')
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    start(async () => {
      const r = await criarCaderno(nome)
      if (r.ok && r.id) {
        toast.success('Caderno criado')
        // Navegação dura: garante a ida ao editor sem corrida com revalidação.
        window.location.assign(`/admin/cadernos/${r.id}`)
      } else {
        toast.error(r.error ?? 'Erro ao criar')
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex gap-2 rounded-lg border bg-card p-3">
      <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do caderno (ex.: Simulado TJ - Caderno 1)" className="flex-1" />
      <Button type="submit" disabled={pending || !nome.trim()}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Criar
      </Button>
    </form>
  )
}
