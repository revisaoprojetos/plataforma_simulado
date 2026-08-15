'use client'

import { Fragment } from 'react'
import { Printer, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { MarkdownContent } from '@/components/markdown-content'
import type { QuestaoCaderno } from '@/app/aluno/(portal)/simulados/runner-actions'

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

/** Caderno de questões imprimível (sem gabarito). O botão "Baixar" chama a impressão do navegador
 *  (salvar como PDF). Layout em A4; a barra de ações some na impressão (print:hidden). */
export function CadernoImprimivel({ titulo, questoes }: { titulo: string; questoes: QuestaoCaderno[] }) {
  const router = useRouter()
  return (
    <div className="mx-auto max-w-3xl">
      {/* Barra de ações — escondida na impressão */}
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <button type="button" onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
          <Printer className="h-4 w-4" /> Baixar / Imprimir
        </button>
      </div>

      {/* Folha */}
      <div className="rounded-2xl border bg-white p-6 text-black shadow-sm sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="mb-6 border-b border-black/15 pb-4">
          <h1 className="text-xl font-bold tracking-tight">{titulo}</h1>
          <p className="mt-1 text-sm text-black/60">Caderno de questões · {questoes.length} {questoes.length === 1 ? 'questão' : 'questões'}</p>
        </header>

        <ol className="space-y-6">
          {questoes.map((q, i) => {
            const secaoNova = q.secao && (i === 0 || questoes[i - 1].secao !== q.secao)
            return (
              <Fragment key={q.numero}>
                {secaoNova && <li className="!mt-8 list-none border-b border-black/15 pb-1 text-sm font-bold uppercase tracking-wide text-black/70">{q.secao}</li>}
                <li className="break-inside-avoid">
                  <div className="mb-1 flex items-baseline gap-2">
                    <span className="text-sm font-bold">{q.numero}.</span>
                    {q.disciplina && <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">{q.disciplina}</span>}
                  </div>
                  <div className="text-[15px] leading-relaxed"><MarkdownContent>{q.enunciado || '(sem enunciado)'}</MarkdownContent></div>
                  <div className="mt-2 space-y-1.5 pl-1">
                    {q.alternativas.map((alt, ai) => (
                      <div key={ai} className="flex items-start gap-2 text-[14px] leading-relaxed">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-black/30 text-[11px] font-bold">{LETRA[ai]}</span>
                        <MarkdownContent inline>{alt}</MarkdownContent>
                      </div>
                    ))}
                  </div>
                </li>
              </Fragment>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
