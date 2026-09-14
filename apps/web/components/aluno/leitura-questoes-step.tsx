'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, BookOpenText, CheckCircle2, Bookmark, Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QuestaoLeitura } from '@/components/aluno/questao-leitura'
import type { DocumentoCarregado, QuestaoLeituraDados } from '@/lib/leitura/acesso'

/**
 * Etapa de QUESTÕES da aula = mini-simulado "Questões do conteúdo" (liberada após concluir a leitura).
 * UMA questão por vez, com Anterior/Próxima e navegador numerado no MESMO estilo do simulado real
 * (coluna à direita no desktop, faixa no topo no mobile). Ao responder todas, a próxima aula é liberada.
 */
export function LeituraQuestoesStep({ doc, questoes }: { doc: DocumentoCarregado; questoes: QuestaoLeituraDados[] }) {
  const [idx, setIdx] = useState(0)
  const [respondidas, setRespondidas] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(questoes.filter((q) => q.resposta).map((q) => [q.docQuestaoId, true])))
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const toggleMarcar = (id: string) => setMarcadas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const total = questoes.length
  const obrig = questoes.filter((q) => q.obrigatoria)
  const feitas = obrig.filter((q) => respondidas[q.docQuestaoId]).length
  const tudoFeito = obrig.length === 0 || feitas >= obrig.length
  const feitasTotal = questoes.filter((q) => respondidas[q.docQuestaoId]).length

  // Navegador de questões (topo no mobile / coluna à direita no desktop) — estilo do runner real.
  const navBtns = questoes.map((q, i) => {
    const feito = !!respondidas[q.docQuestaoId]
    const marcada = marcadas.has(q.docQuestaoId)
    return (
      <button key={q.docQuestaoId} type="button" onClick={() => setIdx(i)} title={`Questão ${i + 1}`}
        className={cn('relative flex h-8 w-8 items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition-colors',
          i === idx ? 'border-primary bg-primary text-primary-foreground'
            : marcada ? 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400'
              : feito ? 'border-primary/30 bg-primary/15 text-primary'
                : 'text-muted-foreground hover:border-foreground/30')}>
        {i + 1}
        {marcada && i === idx && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-card" />}
      </button>
    )
  })

  const navegadorCard = (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="h-1.5 bg-gradient-to-r from-primary via-primary to-primary/30" />
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-foreground">Navegador de questões</p>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{feitasTotal}/{total}</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">{navBtns}</div>
        <div className="border-t" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary" /> atual</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary/20 ring-1 ring-primary/40" /> respondida</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-500/15 ring-1 ring-amber-500/50" /> para revisar</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border" /> em branco</span>
        </div>
      </div>
    </div>
  )

  const q = questoes[idx]

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/aluno/leitura" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Trilha</Link>
        <Link href={`/aluno/leitura/${doc.id}`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><BookOpenText className="h-4 w-4" /> Consultar o documento</Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{doc.titulo}</h1>
        <p className="text-sm text-muted-foreground">Questões da aula {obrig.length > 0 && <>· <span className="font-semibold text-foreground">{feitas}/{obrig.length}</span> obrigatórias respondidas</>}</p>
      </div>

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Esta aula não tem questões.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_13rem] lg:gap-8">
          <div className="flex min-w-0 flex-col gap-4">
            {/* Navegador (mobile/tablet) */}
            <div className="lg:hidden">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Navegador de questões</p>
              <div className="flex flex-wrap gap-1.5">{navBtns}</div>
            </div>

            {/* Cabeçalho da questão (número / total) + questão atual (reusa QuestaoLeitura) */}
            <div className="flex items-center gap-2">
              <span className="flex h-6 items-center rounded-lg bg-primary px-2 text-xs font-bold tabular-nums text-primary-foreground">{idx + 1} / {total}</span>
              <span className="text-xs text-muted-foreground">Questão do conteúdo</span>
            </div>

            <QuestaoLeitura key={q.docQuestaoId} documentoId={doc.id} q={q} corFg="var(--foreground)" corMuted="var(--muted-foreground)"
              onRespondida={(id) => setRespondidas((p) => ({ ...p, [id]: true }))} />

            {/* Navegação — Anterior (esq) · Revisar (centro) · Próxima (dir) */}
            <div className="flex items-center gap-2">
              <div className="flex flex-1 justify-start">
                <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted disabled:opacity-40">
                  <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Anterior</span>
                </button>
              </div>
              <button type="button" onClick={() => toggleMarcar(q.docQuestaoId)} title={marcadas.has(q.docQuestaoId) ? 'Desmarcar revisão' : 'Marcar para revisar'}
                className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors',
                  marcadas.has(q.docQuestaoId) ? 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-card hover:bg-muted')}>
                <Bookmark className={cn('h-4 w-4', marcadas.has(q.docQuestaoId) && 'fill-current')} /> Revisar
              </button>
              <div className="flex flex-1 justify-end">
                <button type="button" onClick={() => setIdx((i) => Math.min(total - 1, i + 1))} disabled={idx >= total - 1}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 hover:shadow-md disabled:opacity-40">
                  <span className="hidden sm:inline">Próxima</span> <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {tudoFeito && (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-50 p-5 text-center dark:bg-emerald-950/30">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                <p className="font-semibold text-emerald-700 dark:text-emerald-400">Aula concluída! A próxima foi liberada na trilha. 🎉</p>
                <Link href="/aluno/leitura" className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"><Flag className="h-4 w-4" /> Voltar à trilha</Link>
              </div>
            )}
          </div>

          {/* Navegador (desktop) — coluna à direita, sticky */}
          <aside className="hidden lg:block">
            <div className="sticky top-4">{navegadorCard}</div>
          </aside>
        </div>
      )}
    </div>
  )
}
