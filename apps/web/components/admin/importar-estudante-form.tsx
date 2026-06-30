'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { importarEstudante } from '@/app/admin/banco-questoes/estudantes-actions'

export function ImportarEstudanteForm({ bancoId }: { bancoId: string }) {
  const [pending, start] = useTransition()
  const [novo, setNovo] = useState({ nome: '', email: '', telefone: '', cpf: '' })

  function importar(e: React.FormEvent) {
    e.preventDefault()
    if (!novo.nome.trim() || !novo.email.trim()) { toast.error('Nome e e-mail são obrigatórios.'); return }
    start(async () => {
      const r = await importarEstudante(bancoId, novo)
      if (r.ok) { toast.success('Aluno importado e vinculado'); window.location.reload() }
      else toast.error(r.error ?? 'Erro')
    })
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Importar novo estudante</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={importar} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5 lg:col-span-1"><Label htmlFor="imp-nome">Nome *</Label><Input id="imp-nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></div>
          <div className="space-y-1.5 lg:col-span-1"><Label htmlFor="imp-email">E-mail *</Label><Input id="imp-email" type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="imp-tel">Telefone</Label><Input id="imp-tel" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="imp-cpf">CPF</Label><Input id="imp-cpf" value={novo.cpf} onChange={(e) => setNovo({ ...novo, cpf: e.target.value })} /></div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Importar e vincular
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
