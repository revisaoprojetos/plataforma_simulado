'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, BookOpenText, CheckCircle2, Bookmark, Flag, RotateCcw, Eye, Check, X, PartyPopper } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QuestaoLeitura } from '@/components/aluno/questao-leitura'
import type { DocumentoCarregado, QuestaoLeituraDados } from '@/lib/leitura/acesso'

/**
 * Etapa de QUESTÕES da aula = mini-simulado "Questões do conteúdo" (liberada após concluir a leitura).
 * UMA questão por vez com Anterior/Próxima e navegador numerado (estilo do simulado real) que sinaliza
 * acerto/erro. Ao concluir: pop-up animado com nota + Refazer. Cada conclusão vira uma tentativa
 * contabilizada. "Refazer" NÃO apaga as respostas no servidor (mantém a trilha destravada) — só reinicia
 * o quiz no cliente, gravando uma nova tentativa ao concluir de novo.
 */
export function LeituraQuestoesStep({ doc, questoes, trilhaHref }: { doc: DocumentoCarregado; questoes: QuestaoLeituraDados[]; trilhaHref: string }) {
  const total = questoes.length
  const jaCompletoInicial = total > 0 && questoes.filter((q) => q.resposta).length >= total

  const [idx, setIdx] = useState(0)
  const [respondidas, setRespondidas] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(questoes.filter((q) => q.resposta).map((q) => [q.docQuestaoId, true])))
  const [resultados, setResultados] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(questoes.filter((q) => q.resposta).map((q) => [q.docQuestaoId, !!q.resposta!.correta])))
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [entrada, setEntrada] = useState(jaCompletoInicial) // já respondeu no load → tela "Ver resultados / Refazer"
  const [revisando, setRevisando] = useState(false)          // vendo resultados de tentativa concluída
  const [refazendo, setRefazendo] = useState(false)          // refazendo (ignora as respostas antigas no cliente)
  const [mostrarPopup, setMostrarPopup] = useState(false)
  const registradoRef = useRef(false)

  const feitasTotal = questoes.filter((q) => respondidas[q.docQuestaoId]).length
  const acertosTotal = questoes.filter((q) => resultados[q.docQuestaoId]).length
  const completo = total > 0 && feitasTotal >= total
  const obrig = questoes.filter((q) => q.obrigatoria)
  const feitasObrig = obrig.filter((q) => respondidas[q.docQuestaoId]).length
  const pct = total > 0 ? Math.round((acertosTotal / total) * 100) : 0

  const toggleMarcar = (id: string) => setMarcadas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Ao concluir (fresh/refazer): registra a tentativa e abre o pop-up. Não registra no load nem revisando.
  useEffect(() => {
    if (!completo || revisando || entrada || registradoRef.current) return
    registradoRef.current = true
    setMostrarPopup(true)
    const acertos = questoes.filter((q) => resultados[q.docQuestaoId]).length
    const respostasMap = Object.fromEntries(questoes.map((q) => [q.questaoId, !!resultados[q.docQuestaoId]]))
    fetch('/api/leitura/quiz-tentativa', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ documento_id: doc.id, acertos, total, respostas: respostasMap }),
    }).catch(() => { /* tolerante: migração de tentativas pode não ter rodado */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completo, revisando, entrada])

  const refazer = () => {
    setMostrarPopup(false); setEntrada(false); setRevisando(false)
    setRespondidas({}); setResultados({}); setMarcadas(new Set()); setIdx(0)
    registradoRef.current = false
    setRefazendo(true)
  }
  const verResultados = () => { setMostrarPopup(false); setEntrada(false); setRevisando(true) }

  const onRespondida = (id: string, correta: boolean) => {
    setResultados((p) => ({ ...p, [id]: correta }))
    setRespondidas((p) => ({ ...p, [id]: true }))
  }

  // Navegador (topo no mobile / coluna à direita no desktop) — sinaliza acerto (verde ✓) / erro (vermelho ✗).
  const navBtns = questoes.map((q, i) => {
    const feito = !!respondidas[q.docQuestaoId]
    const acertou = feito && resultados[q.docQuestaoId]
    const errou = feito && !resultados[q.docQuestaoId]
    const marcada = marcadas.has(q.docQuestaoId)
    return (
      <button key={q.docQuestaoId} type="button" onClick={() => setIdx(i)} title={`Questão ${i + 1}`}
        className={cn('relative flex h-8 w-8 items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition-colors',
          i === idx ? 'border-primary bg-primary text-primary-foreground'
            : acertou ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : errou ? 'border-rose-500/50 bg-rose-500/15 text-rose-600 dark:text-rose-400'
                : marcada ? 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground hover:border-foreground/30')}>
        {feito && i !== idx ? (acertou ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />) : i + 1}
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
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-500/20 ring-1 ring-emerald-500/50" /> acertou</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-rose-500/20 ring-1 ring-rose-500/50" /> errou</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-500/15 ring-1 ring-amber-500/50" /> revisar</span>
        </div>
      </div>
    </div>
  )

  const q = questoes[idx]
  const qView = refazendo ? { ...q, resposta: undefined } : q

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={trilhaHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar à trilha</Link>
        <Link href={`/aluno/leitura/${doc.id}`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><BookOpenText className="h-4 w-4" /> Consultar o documento</Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{doc.titulo}</h1>
        <p className="text-sm text-muted-foreground">Questões da aula {obrig.length > 0 && <>· <span className="font-semibold text-foreground">{feitasObrig}/{obrig.length}</span> obrigatórias respondidas</>}</p>
      </div>

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Esta aula não tem questões.</div>
      ) : entrada ? (
        // Já respondeu (no load): 2 botões — Ver resultados / Refazer.
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-7 w-7" /></span>
          <div>
            <p className="text-lg font-bold">Você já respondeu este quiz</p>
            <p className="text-sm text-muted-foreground">Acertos: <span className="font-semibold text-foreground">{acertosTotal}/{total}</span> ({pct}%)</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={verResultados} className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors hover:bg-muted"><Eye className="h-4 w-4" /> Ver resultados</button>
            <button type="button" onClick={refazer} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"><RotateCcw className="h-4 w-4" /> Refazer</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_13rem] lg:gap-8">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="lg:hidden">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Navegador de questões</p>
              <div className="flex flex-wrap gap-1.5">{navBtns}</div>
            </div>

            <div className="flex items-center gap-2">
              <span className="flex h-6 items-center rounded-lg bg-primary px-2 text-xs font-bold tabular-nums text-primary-foreground">{idx + 1} / {total}</span>
              <span className="text-xs text-muted-foreground">Questão do conteúdo</span>
              {revisando && <button type="button" onClick={refazer} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition-colors hover:bg-muted"><RotateCcw className="h-3.5 w-3.5" /> Refazer</button>}
            </div>

            <QuestaoLeitura key={`${q.docQuestaoId}-${refazendo ? 'r' : 'o'}`} documentoId={doc.id} q={qView} corFg="var(--foreground)" corMuted="var(--muted-foreground)"
              onRespondida={onRespondida} />

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

            {completo && !mostrarPopup && (
              <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-50 p-4 text-center dark:bg-emerald-950/30">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">Quiz concluído · {acertosTotal}/{total} ({pct}%)</span>
                <button type="button" onClick={refazer} className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-muted"><RotateCcw className="h-4 w-4" /> Refazer</button>
                <Link href={trilhaHref} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"><Flag className="h-4 w-4" /> Voltar à trilha</Link>
              </div>
            )}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-4">{navegadorCard}</div>
          </aside>
        </div>
      )}

      {/* Pop-up de conclusão — animado, com nota e Refazer. */}
      {mostrarPopup && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in" onClick={verResultados}>
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border bg-card p-6 text-center shadow-2xl motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:fade-in motion-safe:duration-300" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={verResultados} aria-label="Fechar" className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center">
              <span className="absolute h-16 w-16 rounded-full bg-emerald-500/20 motion-safe:animate-ping" />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><PartyPopper className="h-8 w-8 motion-safe:animate-bounce" /></span>
            </div>
            <h2 className="text-xl font-bold">Quiz concluído! 🎉</h2>
            <p className="mt-1 text-sm text-muted-foreground">Você acertou</p>
            <p className="my-1 text-3xl font-extrabold tabular-nums text-primary">{acertosTotal}<span className="text-lg font-bold text-muted-foreground">/{total}</span></p>
            <p className="text-sm font-semibold text-muted-foreground">{pct}% de acerto</p>
            <p className="mt-2 text-xs text-muted-foreground">A próxima aula foi liberada na trilha.</p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={refazer} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border bg-card px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors hover:bg-muted"><RotateCcw className="h-4 w-4" /> Refazer quiz</button>
              <Link href={trilhaHref} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"><Flag className="h-4 w-4" /> Voltar à trilha</Link>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
