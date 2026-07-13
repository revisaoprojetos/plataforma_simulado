'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Check, X, MessageSquare, Lock } from 'lucide-react'
import type { QuestaoRevisao } from '@/lib/simulado/revisao'

export function RevisaoQuestoes({ questoes, revelou }: { questoes: QuestaoRevisao[]; revelou: boolean }) {
  const [filtro, setFiltro] = useState<'todas' | 'erradas' | 'branco'>('todas')
  const erradas = questoes.filter((q) => q.acertou === false).length
  const branco = questoes.filter((q) => !q.respondida).length

  const lista = useMemo(() => {
    if (filtro === 'erradas') return questoes.filter((q) => q.acertou === false)
    if (filtro === 'branco') return questoes.filter((q) => !q.respondida)
    return questoes
  }, [questoes, filtro])

  if (questoes.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Sem questões para revisar.</p>

  return (
    <div className="space-y-4">
      {!revelou && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>O gabarito ainda não foi liberado. Você vê o enunciado e a sua marcação; a alternativa correta aparece quando o gabarito for liberado.</span>
        </div>
      )}

      {revelou && (
        <div className="flex flex-wrap gap-1.5">
          {([['todas', `Todas (${questoes.length})`], ['erradas', `Erradas (${erradas})`], ['branco', `Em branco (${branco})`]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)}
              className={cn('rounded-full border px-3 py-1 text-sm font-medium transition-colors', filtro === v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {lista.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma questão nesse filtro.</p> : lista.map((q) => <QuestaoCard key={q.ordem} q={q} revelou={revelou} />)}
      </div>
    </div>
  )
}

function QuestaoCard({ q, revelou }: { q: QuestaoRevisao; revelou: boolean }) {
  const chip = !revelou ? 'bg-primary/15 text-primary'
    : !q.respondida ? 'bg-muted text-muted-foreground'
    : q.acertou ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums', chip)}>{q.ordem}</span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {q.disciplina && <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{q.disciplina}</span>}
            {revelou && q.respondida && <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', q.acertou ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400')}>{q.acertou ? 'Acertou' : 'Errou'}</span>}
            {!q.respondida && <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Em branco</span>}
          </div>
          <p className="text-sm text-foreground/90">{q.enunciado}</p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {q.alternativas.map((a) => {
          const errada = a.escolhida && !a.correta
          return (
            <div key={a.letra} className={cn('flex items-center gap-2.5 rounded-lg border px-2 py-1.5 text-sm',
              a.correta ? 'border-emerald-500/40 bg-emerald-500/10' : errada && revelou ? 'border-rose-500/40 bg-rose-500/10' : a.escolhida ? 'border-primary/40 bg-primary/5' : 'border-transparent')}>
              <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold',
                a.correta ? 'bg-emerald-500 text-white' : errada && revelou ? 'bg-rose-500 text-white' : a.escolhida ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{a.letra}</span>
              <span className={cn('min-w-0 flex-1 truncate', (a.correta || a.escolhida) && 'font-medium')} title={a.texto}>{a.texto || '—'}</span>
              {a.escolhida && <span className="shrink-0 text-[11px] text-muted-foreground">sua resposta</span>}
              {a.correta && <Check className="h-4 w-4 shrink-0 text-emerald-500" />}
              {errada && revelou && <X className="h-4 w-4 shrink-0 text-rose-500" />}
            </div>
          )
        })}
      </div>

      {q.comentario && (
        <div className="mt-3 flex gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Comentário do professor</p><p className="mt-0.5 text-foreground/90">{q.comentario}</p></div>
        </div>
      )}
    </div>
  )
}
