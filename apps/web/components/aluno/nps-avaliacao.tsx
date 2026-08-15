'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Star, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Card de NPS mostrado ao concluir um simulado (página de resultado do portal E tela final da
 * prova embed). Autentica pelo `sessaoId` via /api/sessoes/avaliar — serve os dois contextos.
 * Nota 0–10 (recomendaria?) + comentário opcional. Some após enviar (mostra agradecimento).
 */
export function NpsAvaliacao({ sessaoId, compact = false }: { sessaoId?: string | null; compact?: boolean }) {
  const [nota, setNota] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [jaAvaliou, setJaAvaliou] = useState(false) // guard local (embed não tem check server-side)
  const [pending, start] = useTransition()

  useEffect(() => { try { if (sessaoId && localStorage.getItem('nps_' + sessaoId)) setJaAvaliou(true) } catch {} }, [sessaoId])

  function enviar() {
    if (nota === null) { toast.error('Escolha uma nota de 0 a 10.'); return }
    if (!sessaoId) { toast.error('Sessão não encontrada.'); return }
    start(async () => {
      try {
        const res = await fetch('/api/sessoes/avaliar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessao_id: sessaoId, nps: nota, comentario }),
        })
        if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? 'Não foi possível enviar.'); return }
        try { if (sessaoId) localStorage.setItem('nps_' + sessaoId, '1') } catch {}
        setEnviado(true)
        toast.success('Obrigado pela sua avaliação!')
      } catch { toast.error('Falha de rede. Tente novamente.') }
    })
  }

  if (jaAvaliou) return null

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
    <div className={cn('rounded-2xl border bg-card shadow-sm', compact ? 'p-4' : 'p-5')}>
      <div className="flex items-center gap-2">
        <span className={cn('flex shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary', compact ? 'h-7 w-7' : 'h-8 w-8')}><Star className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight">Como foi sua experiência?</h3>
          <p className={cn('text-muted-foreground', compact ? 'text-[11px] leading-tight' : 'text-xs')}>De 0 a 10, o quanto você recomendaria este simulado?</p>
        </div>
      </div>

      <div className={cn('flex flex-wrap gap-1.5', compact ? 'mt-3' : 'mt-4')}>
        {Array.from({ length: 11 }).map((_, i) => (
          <button key={i} type="button" onClick={() => setNota(i)}
            className={cn(
              'rounded-lg border text-sm font-bold tabular-nums transition',
              compact ? 'h-8 w-8' : 'h-9 w-9',
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
        className={cn('w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring', compact ? 'mt-2.5' : 'mt-3')} />

      <button type="button" onClick={enviar} disabled={pending}
        className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60', compact ? 'mt-2.5 w-full' : 'mt-3')}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Enviar avaliação
      </button>
    </div>
  )
}
