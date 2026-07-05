'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { responderFeedback } from '@/app/admin/feedbacks/actions'

const TIPO_LABEL: Record<string, string> = {
  erro_gabarito: 'Gabarito incorreto',
  enunciado_confuso: 'Enunciado confuso',
  desatualizada: 'Desatualizada',
  outro: 'Outro',
}
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pendente: 'destructive',
  analisado: 'secondary',
  resolvido: 'default',
}

interface Feedback {
  id: string
  tipo: string
  mensagem: string | null
  status: string
  resposta_admin: string | null
  criado_em: string
  enunciado: string
  estudante: string
}

export function FeedbackItem({ fb }: { fb: Feedback }) {
  const [resposta, setResposta] = useState(fb.resposta_admin ?? '')
  const [status, setStatus] = useState(fb.status)
  const [pending, startTransition] = useTransition()
  const [salvo, setSalvo] = useState(false)

  function salvar(novoStatus: 'pendente' | 'analisado' | 'resolvido') {
    startTransition(async () => {
      const r = await responderFeedback(fb.id, novoStatus, resposta)
      if (r.ok) {
        setStatus(novoStatus)
        setSalvo(true)
        toast.success('Report atualizado')
        setTimeout(() => setSalvo(false), 1500)
      } else {
        toast.error(r.error ?? 'Erro ao salvar')
      }
    })
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{TIPO_LABEL[fb.tipo] ?? fb.tipo}</Badge>
        <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{status}</Badge>
        <span className="text-xs text-muted-foreground">por {fb.estudante}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(fb.criado_em).toLocaleDateString('pt-BR')}
        </span>
      </div>

      <p className="line-clamp-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Questão:</span> {fb.enunciado}
      </p>

      {fb.mensagem && (
        <p className="rounded-md bg-muted/50 p-2 text-sm">
          <span className="font-medium">Relato:</span> {fb.mensagem}
        </p>
      )}

      <textarea
        value={resposta}
        onChange={(e) => setResposta(e.target.value)}
        placeholder="Resposta / observação interna (opcional)"
        rows={2}
        className="w-full resize-none rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => salvar('analisado')}>
          {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Marcar analisado
        </Button>
        <Button size="sm" disabled={pending} onClick={() => salvar('resolvido')}>
          {salvo ? <Check className="mr-1 h-3.5 w-3.5" /> : null}
          Resolver
        </Button>
      </div>
    </div>
  )
}
