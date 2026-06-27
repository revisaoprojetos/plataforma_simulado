'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { concederAcesso } from '@/app/admin/simulados/acesso-actions'

interface Est { id: string; nome: string }

export function ConcederAcessoForm({ simuladoId, estudantes }: { simuladoId: string; estudantes: Est[] }) {
  const router = useRouter()
  const [estudanteId, setEstudanteId] = useState('')
  const [prazo, setPrazo] = useState(7)
  const [unidade, setUnidade] = useState<'horas' | 'dias' | 'meses'>('dias')
  const [tentativas, setTentativas] = useState(1)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!estudanteId) { toast.error('Selecione um aluno.'); return }
    start(async () => {
      const r = await concederAcesso(simuladoId, estudanteId, Number(prazo), unidade, Number(tentativas))
      if (r.ok) { toast.success('Acesso concedido'); setEstudanteId(''); router.refresh() }
      else toast.error(r.error ?? 'Erro ao conceder')
    })
  }

  return (
    <form onSubmit={submit} className="grid items-end gap-2 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_auto_auto_auto]">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Aluno</label>
        <select value={estudanteId} onChange={(e) => setEstudanteId(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring">
          <option value="">Selecione…</option>
          {estudantes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Prazo</label>
        <div className="flex gap-1">
          <Input type="number" min={1} value={prazo} onChange={(e) => setPrazo(Number(e.target.value))} className="w-16" />
          <select value={unidade} onChange={(e) => setUnidade(e.target.value as any)}
            className="rounded-md border bg-background px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-ring">
            <option value="horas">horas</option>
            <option value="dias">dias</option>
            <option value="meses">meses</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Tentativas</label>
        <Input type="number" min={1} value={tentativas} onChange={(e) => setTentativas(Number(e.target.value))} className="w-20" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Conceder
      </Button>
    </form>
  )
}
