'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Check, X, User, Clock, HelpCircle, MessageSquare, Send, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'
import { responderFeedback } from '@/app/admin/feedbacks/actions'

const TIPO_LABEL: Record<string, string> = {
  erro_gabarito: 'Gabarito incorreto',
  enunciado_confuso: 'Enunciado confuso',
  desatualizada: 'Desatualizada',
  outro: 'Outro',
}
const STATUS_LABEL: Record<string, string> = { pendente: 'Pendente', analisado: 'Analisado', resolvido: 'Resolvido' }
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pendente: 'destructive', analisado: 'secondary', resolvido: 'default',
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
  email?: string | null
}

export function FeedbackItem({ fb }: { fb: Feedback }) {
  const [aberto, setAberto] = useState(false)
  const [resposta, setResposta] = useState(fb.resposta_admin ?? '')
  const [status, setStatus] = useState(fb.status)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pending) setAberto(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [aberto, pending])

  function salvar(novoStatus: 'analisado' | 'resolvido') {
    startTransition(async () => {
      const r = await responderFeedback(fb.id, novoStatus, resposta)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar'); return }
      setStatus(novoStatus)
      toast.success(resposta.trim() ? 'Resposta enviada ao estudante.' : `Report marcado como ${STATUS_LABEL[novoStatus].toLowerCase()}.`)
      setAberto(false)
    })
  }

  return (
    <>
      {/* Linha compacta — clique abre a janela de detalhe */}
      <button type="button" onClick={() => setAberto(true)}
        className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary/50 hover:shadow-sm">
        <span className={cn('mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full', status === 'pendente' ? 'bg-rose-500' : status === 'analisado' ? 'bg-amber-500' : 'bg-emerald-500')} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{TIPO_LABEL[fb.tipo] ?? fb.tipo}</Badge>
            <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{STATUS_LABEL[status] ?? status}</Badge>
            <span className="text-xs text-muted-foreground">por <b className="font-medium text-foreground">{fb.estudante}</b></span>
          </div>
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground"><span className="text-foreground/80">Questão:</span> {fb.enunciado}</p>
        </div>
        <span className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">{formatBrt(fb.criado_em) ?? '—'}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {aberto && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !pending && setAberto(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><MessageSquare className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">Report de questão</h3>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{TIPO_LABEL[fb.tipo] ?? fb.tipo}</Badge>
                  <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{STATUS_LABEL[status] ?? status}</Badge>
                </div>
              </div>
              <button type="button" onClick={() => setAberto(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            {/* Quem / Quando / Motivo */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info icon={User} rotulo="Quem enviou">
                <span className="font-medium">{fb.estudante}</span>
                {fb.email && <span className="block truncate text-xs text-muted-foreground">{fb.email}</span>}
              </Info>
              <Info icon={Clock} rotulo="Quando">{formatBrt(fb.criado_em) ?? '—'}</Info>
              <Info icon={HelpCircle} rotulo="Motivo">{TIPO_LABEL[fb.tipo] ?? fb.tipo}</Info>
            </div>

            {/* O que foi apontado */}
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">O que foi apontado</p>
              <p className="rounded-lg border bg-muted/40 p-3 text-sm">{fb.mensagem?.trim() || <span className="text-muted-foreground">Sem relato escrito.</span>}</p>
            </div>

            {/* Questão */}
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Questão</p>
              <p className="max-h-32 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-sm text-foreground/90">{fb.enunciado}</p>
            </div>

            {/* Resposta ao estudante */}
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Resposta ao estudante <span className="normal-case text-muted-foreground/70">(ele será notificado)</span></label>
              <textarea value={resposta} onChange={(e) => setResposta(e.target.value)} rows={3}
                placeholder="Explique o que foi verificado / a decisão. Ex.: O gabarito foi corrigido, obrigado pelo report."
                className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" disabled={pending} onClick={() => salvar('analisado')}>
                {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null} Marcar analisado
              </Button>
              <Button size="sm" disabled={pending} onClick={() => salvar('resolvido')}>
                {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : resposta.trim() ? <Send className="mr-1.5 h-3.5 w-3.5" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                {resposta.trim() ? 'Responder e resolver' : 'Resolver'}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function Info({ icon: Icon, rotulo, children }: { icon: React.ComponentType<{ className?: string }>; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5">
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><Icon className="h-3 w-3" /> {rotulo}</p>
      <div className="mt-0.5 min-w-0 text-sm">{children}</div>
    </div>
  )
}
