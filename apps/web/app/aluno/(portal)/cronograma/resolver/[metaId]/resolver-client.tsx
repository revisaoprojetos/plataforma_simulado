'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { MarkdownContent } from '@/components/markdown-content'
import type { QuestaoResolver } from '../../resolver-actions'

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

export function ResolverClient({ titulo, questoes, voltar }: { titulo: string; questoes: QuestaoResolver[]; voltar: string }) {
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [finalizado, setFinalizado] = useState(false)
  const total = questoes.length
  const respondidas = Object.keys(respostas).length

  const acertos = useMemo(
    () => (finalizado ? questoes.filter((q) => q.alternativas.find((a) => a.id === respostas[q.id])?.correta).length : 0),
    [finalizado, questoes, respostas],
  )

  function escolher(qid: string, aid: string) {
    if (finalizado) return
    setRespostas((r) => ({ ...r, [qid]: aid }))
  }
  function irPara(qid: string) {
    document.getElementById(`q-${qid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      {/* Cabeçalho fixo com ação */}
      <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/95 p-4 shadow-sm backdrop-blur">
        <div className="min-w-0">
          <Link href={voltar} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao cronograma
          </Link>
          <h1 className="mt-1 truncate text-lg font-bold tracking-tight">Resolução — {titulo}</h1>
          <p className="text-xs text-muted-foreground">{total} questão(ões) · {respondidas} respondida(s)</p>
        </div>
        {finalizado ? (
          <div className="flex items-center gap-3">
            <span className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-3 py-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              {acertos}/{total} acertos
            </span>
            <Link href={voltar} className={buttonVariants()}>Voltar ao cronograma</Link>
          </div>
        ) : (
          <Button onClick={() => setFinalizado(true)} disabled={!respondidas} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
            Finalizar
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_13rem]">
        {/* Questões, uma abaixo da outra */}
        <div className="space-y-4">
          {questoes.map((q, i) => {
            const sel = respostas[q.id]
            const acertou = finalizado && q.alternativas.find((a) => a.id === sel)?.correta
            return (
              <div key={q.id} id={`q-${q.id}`} className="scroll-mt-24 rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                  {finalizado &&
                    (acertou ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Acertou</span>
                    ) : sel ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400"><X className="h-3.5 w-3.5" /> Errou</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Em branco</span>
                    ))}
                </div>
                <div className="text-sm leading-relaxed"><MarkdownContent>{q.enunciado || '(sem enunciado)'}</MarkdownContent></div>
                <div className="mt-3 space-y-1.5">
                  {q.alternativas.map((a, j) => {
                    const escolhida = sel === a.id
                    const mostrarCerta = finalizado && a.correta
                    const mostrarErrada = finalizado && escolhida && !a.correta
                    return (
                      <button
                        key={a.id}
                        onClick={() => escolher(q.id, a.id)}
                        disabled={finalizado}
                        className={cn(
                          'flex w-full items-start gap-2 rounded-xl border p-2.5 text-left text-sm transition',
                          mostrarCerta ? 'border-emerald-500/50 bg-emerald-500/5' : mostrarErrada ? 'border-rose-500/50 bg-rose-500/5' : escolhida ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                        )}
                      >
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold', escolhida || mostrarCerta ? 'border-current' : 'border-muted-foreground/40')}>
                          {LETRA[j] ?? j + 1}
                        </span>
                        <span className="min-w-0 flex-1"><MarkdownContent inline>{a.texto}</MarkdownContent></span>
                      </button>
                    )
                  })}
                </div>
                {finalizado && q.comentario && (
                  <div className="mt-3 rounded-xl border-l-2 border-primary/40 bg-muted/40 p-3 text-xs text-muted-foreground">
                    <p className="mb-1 font-semibold text-foreground">Comentário</p>
                    <MarkdownContent>{q.comentario}</MarkdownContent>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Navegador à direita */}
        <div className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-2xl border bg-card p-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold">Questões</p>
            <div className="grid grid-cols-5 gap-1.5">
              {questoes.map((q, i) => {
                const sel = respostas[q.id]
                const certa = finalizado && q.alternativas.find((a) => a.id === sel)?.correta
                const errada = finalizado && sel && !certa
                return (
                  <button
                    key={q.id}
                    onClick={() => irPara(q.id)}
                    className={cn(
                      'flex h-8 items-center justify-center rounded-lg border text-xs font-medium transition',
                      certa ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : errada ? 'border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400' : sel ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                    )}
                    title={`Questão ${i + 1}`}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{respondidas}/{total} respondidas</p>
          </div>
        </div>
      </div>
    </div>
  )
}
