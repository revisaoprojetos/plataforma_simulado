'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FileUp, Download, Loader2, Check, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { analisarQuestoesImport, confirmarImportQuestoes } from '@/app/admin/banco-questoes/actions'
import type { QuestaoImport } from '@/app/admin/banco-questoes/import-types'

const MODELO = [
  'enunciado;tipo;disciplina;banca;ano;dificuldade;a;b;c;d;e;correta;comentario',
  'Qual é a capital do Brasil?;objetiva;Geografia;CESPE;2024;facil;São Paulo;Rio de Janeiro;Brasília;Salvador;Recife;C;Brasília é a capital federal.',
  'Disserte sobre o princípio da legalidade.;discursiva;Direito;FGV;2023;dificil;;;;;;;Abordar CF art. 5º, II.',
].join('\r\n')

function baixarModelo() {
  const blob = new Blob(['﻿' + MODELO], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'modelo-importacao-questoes.csv'
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

type Resumo = { total: number; novas: number; jaExistem: number; comErro: number }

export function ImportarQuestoesTab({ bancoId = null, onDone }: { bancoId?: string | null; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [questoes, setQuestoes] = useState<QuestaoImport[] | null>(null)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [analisando, startAnalise] = useTransition()
  const [salvando, startSalvar] = useTransition()

  function onFile(f: File | null) {
    setQuestoes(null); setResumo(null)
    if (!f) { setNomeArquivo(''); return }
    setNomeArquivo(f.name)
    const fd = new FormData(); fd.set('arquivo', f)
    startAnalise(async () => {
      const r = await analisarQuestoesImport(fd)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao ler o arquivo'); setNomeArquivo(''); return }
      setQuestoes(r.questoes ?? []); setResumo(r.resumo ?? null)
    })
  }

  function confirmar() {
    if (!questoes) return
    startSalvar(async () => {
      const r = await confirmarImportQuestoes(bancoId, questoes)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao importar'); return }
      toast.success(bancoId
        ? `${r.criadas ?? 0} questão(ões) criada(s) e ${r.vinculadas ?? 0} vinculada(s) ao banco`
        : `${r.criadas ?? 0} questão(ões) criada(s) no sistema`)
      if (r.jaExistiam) toast.message(`${r.jaExistiam} já existia(m) no sistema — não duplicada(s).`)
      onDone()
      window.location.assign(bancoId ? `/admin/banco-questoes/${bancoId}?tab=questoes` : '/admin/questoes')
    })
  }

  const podeImportar = !!resumo && resumo.novas + resumo.jaExistem > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input ref={inputRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />

      {!questoes ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={analisando}
            className="flex w-full max-w-md flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60">
            {analisando ? <Loader2 className="h-8 w-8 animate-spin" /> : <FileUp className="h-8 w-8" />}
            <span className="text-sm font-medium">{analisando ? 'Lendo arquivo…' : nomeArquivo || 'Selecionar arquivo (.csv, .txt, .xlsx)'}</span>
            <span className="text-xs">Uma questão por linha, com cabeçalho na 1ª linha.</span>
          </button>
          <button type="button" onClick={baixarModelo} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <Download className="h-4 w-4" /> Baixar modelo de planilha
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-6 pb-1 pt-3 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" /> {resumo?.novas ?? 0} nova(s)</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-400">{resumo?.jaExistem ?? 0} já existe(m)</span>
            {(resumo?.comErro ?? 0) > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-medium text-rose-600 dark:text-rose-400"><AlertTriangle className="h-3 w-3" /> {resumo?.comErro} com erro</span>}
            <button type="button" onClick={() => inputRef.current?.click()} className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><RefreshCw className="h-3.5 w-3.5" /> Trocar arquivo</button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-3">
            <table className="w-full caption-bottom text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="w-24 px-3 py-2 font-medium">Situação</th>
                  <th className="w-40 px-3 py-2 font-medium">Disciplina</th>
                  <th className="px-3 py-2 font-medium">Questão</th>
                  <th className="w-20 px-3 py-2 text-right font-medium">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {questoes.map((q, i) => {
                  const enun = q.enunciado.length > 130 ? q.enunciado.slice(0, 130) + '…' : q.enunciado
                  return (
                    <tr key={i} className={cn('border-b align-top', q.erro && 'bg-rose-500/5')}>
                      <td className="px-3 py-2">
                        {q.erro ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400" title={q.erro}><AlertTriangle className="h-3 w-3" /> Erro</span>
                        ) : q.jaExiste ? (
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Já existe</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" /> Nova</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {q.disciplina ? <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold uppercase text-primary">{q.disciplina}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 leading-relaxed">
                        {enun || <span className="text-muted-foreground">(sem enunciado)</span>}
                        {q.erro && <span className="mt-0.5 block text-xs text-rose-600 dark:text-rose-400">{q.erro}</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-xs capitalize text-muted-foreground">{q.tipo}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3 border-t px-6 py-3">
        <span className="text-sm text-muted-foreground">
          {resumo ? `${resumo.novas} nova(s) · ${resumo.jaExistem} já existe(m) · ${resumo.comErro} com erro (ignorada[s])` : 'Envie um arquivo para ver a relação de questões.'}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDone}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!podeImportar || salvando}>
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Importar
          </Button>
        </div>
      </div>
    </div>
  )
}
