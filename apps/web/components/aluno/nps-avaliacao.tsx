'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Star, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { submeterAvaliacao } from '@/app/aluno/(portal)/simulados/[id]/nps-actions'

/**
 * Card de NPS mostrado na página de resultado quando o aluno ainda não avaliou o simulado.
 * Nota 0–10 (recomendaria?) + comentário opcional. Some após enviar (mostra agradecimento).
 */
export function NpsAvaliacao({ simuladoId, sessaoId }: { simuladoId: string; sessaoId?: string | null }) {
  const [nota, setNota] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [pending, start] = useTransition()

  function enviar() {
    if (nota === null) { toast.error('Escolha uma nota de 0 a 10.'); return }
    start(async () => {
      const r = await submeterAvaliacao({ simuladoId, sessaoId, nps: nota, comentario })
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível enviar.'); return }
      setEnviado(true)
      toast.success('Obrigado pela sua avaliação!')
    })
  }

  if (enviado) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-50/60 p-4 text-sm text-emerald-800 shadow-sm dark:bg-emerald-900/15 dark:text-emerald-300">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-4 w-4" /></span>
        Avaliação enviada. Obrigado por ajudar a melhorar a plataforma!
      </div>
    )
  }

  // Cor da bolinha por faixa: detrator (0–6) rose, neutro (7–8) amber, promotor (9–10) emerald.
  const faixa = (n: number) => (n <= 6 ? 'detrator' : n <= 8 ? 'neutro' : 'promotor')
  const corSel = (n: number) =>
    faixa(n) === 'promotor' ? 'border-emerald-500 bg-emerald-500 text-white'
      : faixa(n) === 'neutro' ? 'border-amber-500 bg-amber-500 text-white'
        : 'border-rose-500 bg-rose-500 text-white'

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary"><Star className="h-4 w-4" /></span>
        <div>
          <h3 className="text-sm font-semibold">Como foi sua experiência?</h3>
          <p className="text-xs text-muted-foreground">De 0 a 10, o quanto você recomendaria este simulado?</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }).map((_, i) => (
          <button key={i} type="button" onClick={() => setNota(i)}
            className={cn(
              'h-9 w-9 rounded-lg border text-sm font-bold tabular-nums transition',
              nota === i ? corSel(i) : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
            )}>
            {i}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between px-0.5 text-[10px] text-muted-foreground">
        <span>Não recomendaria</span><span>Recomendaria muito</span>
      </div>

      <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} maxLength={1000}
        placeholder="Quer contar o porquê? (opcional)"
        className="mt-3 w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />

      <button type="button" onClick={enviar} disabled={pending}
        className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Enviar avaliação
      </button>
    </div>
  )
}
