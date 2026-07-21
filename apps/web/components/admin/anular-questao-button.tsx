'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Ban, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { anularQuestao } from '@/app/admin/simulados/recorrecao-actions'

export function AnularQuestaoButton({ simuladoId, questaoId }: { simuladoId: string; questaoId: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [politica, setPolitica] = useState<'pontua_todos' | 'desconsidera'>('pontua_todos')
  const [pending, start] = useTransition()

  function confirmar() {
    start(async () => {
      const r = await anularQuestao(simuladoId, questaoId, motivo, politica)
      if (r.ok) {
        toast.success(r.processando
          ? `Questão anulada — re-correção de ${r.afetados ?? 0} sessões em processamento (atualize em instantes).`
          : `Questão anulada — ${r.afetados ?? 0} sessão(ões) re-corrigida(s)`)
        setAberto(false)
        router.refresh()
      } else {
        toast.error(r.error ?? 'Erro ao anular')
      }
    })
  }

  if (!aberto) {
    return (
      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setAberto(true)}>
        <Ban className="mr-1 h-3.5 w-3.5" /> Anular
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-xs font-medium">Anular esta questão e re-corrigir as provas?</p>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (ex.: questão sem resposta correta)"
        className="w-full rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex flex-wrap gap-1.5">
        {([['pontua_todos', 'Pontua todos'], ['desconsidera', 'Desconsidera']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setPolitica(v)}
            className={`rounded-full border px-2.5 py-1 text-xs ${politica === v ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={pending} onClick={confirmar}>
          {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Ban className="mr-1 h-3.5 w-3.5" />}
          Confirmar anulação
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
      </div>
    </div>
  )
}
