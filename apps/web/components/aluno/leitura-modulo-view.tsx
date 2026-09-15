'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Route, BarChart3, Check, Lock, AlertTriangle, ArrowRight, Search, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TrilhaGigante, type Trilha } from '@/components/aluno/trilha-simulados'
import type { AulaDesempenho } from '@/lib/leitura/trilha'
import { buscarNaTrilha, type ResultadoBuscaTrilha } from '@/app/aluno/(portal)/leitura/busca-actions'

/** Visão de um módulo do LegProc Digital: tabs Trilha | Desempenho + aviso de questões pendentes. */
export function LeituraModuloView({ modulo, trilha, desempenho, pendentes, aulasPendentes }: {
  modulo: string
  trilha: Trilha
  desempenho: AulaDesempenho[]
  pendentes: number
  aulasPendentes: number
}) {
  // 1ª aula com questões pendentes (leitura feita) → alvo do CTA do aviso.
  const alvoPend = desempenho.find((a) => a.leituraConcluida && a.questoesPendentes > 0)

  // Busca (artigo/palavra) nas aulas do módulo → abre a aula no ponto.
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<ResultadoBuscaTrilha[] | null>(null)
  const [buscando, iniciarBusca] = useTransition()
  const estadoDe = new Map(desempenho.map((a) => [a.id, a.estado]))
  const buscaRef = useRef<HTMLDivElement>(null)
  function onBuscar(e: React.FormEvent) {
    e.preventDefault()
    const termo = q.trim()
    if (termo.length < 2) { setResultados([]); return }
    iniciarBusca(async () => {
      const r = await buscarNaTrilha(modulo, termo)
      setResultados(r.resultados)
    })
  }
  function limparBusca() { setQ(''); setResultados(null) }
  // Fecha o dropdown de resultados ao clicar fora.
  useEffect(() => {
    if (resultados === null) return
    const onDown = (e: MouseEvent) => { if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) setResultados(null) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [resultados])

  return (
    <div className="space-y-4">
      {/* Aviso de questões pendentes */}
      {pendentes > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Você tem <strong>{pendentes}</strong> {pendentes === 1 ? 'questão pendente' : 'questões pendentes'} em{' '}
            <strong>{aulasPendentes}</strong> {aulasPendentes === 1 ? 'aula' : 'aulas'} — conclua para fechar a aula.
          </span>
          {alvoPend?.id && (
            <Link href={`/aluno/leitura/${alvoPend.id}/questoes`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500">
              Responder agora <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      <Tabs defaultValue="trilha">
        {/* Mesma linha: tabs sublinhadas (esquerda) + busca compacta (direita).
            items-end → o indicador da trilha encosta na linha de baixo (borda do wrapper). */}
        <div className="flex items-end justify-between gap-3 border-b">
          <TabsList className="w-fit border-b-0">
            <TabsTrigger value="trilha"><Route className="h-4 w-4" /> Trilha</TabsTrigger>
            <TabsTrigger value="desempenho"><BarChart3 className="h-4 w-4" /> Desempenho</TabsTrigger>
          </TabsList>

          <div ref={buscaRef} className="relative mb-1.5 w-full max-w-[15rem] shrink-0">
            <form onSubmit={onBuscar}>
              {buscando
                ? <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                : <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nas aulas…" aria-label="Buscar artigo ou palavra nas aulas"
                className="h-9 w-full rounded-lg border bg-[var(--input-bg,transparent)] pl-8 pr-8 text-sm outline-none focus:ring-1 focus:ring-ring" />
              {q && (
                <button type="button" onClick={limparBusca} aria-label="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              )}
            </form>

            {/* Resultados em dropdown (sem empurrar o layout) */}
            {resultados !== null && (
              <div className="absolute right-0 top-full z-30 mt-1.5 max-h-[60vh] w-80 max-w-[85vw] space-y-1.5 overflow-y-auto rounded-xl border bg-card p-1.5 shadow-lg">
                {buscando ? (
                  <p className="px-1 py-3 text-center text-sm text-muted-foreground">Buscando…</p>
                ) : resultados.length === 0 ? (
                  <p className="px-1 py-3 text-center text-sm text-muted-foreground">Nada encontrado nas aulas deste módulo.</p>
                ) : resultados.map((r) => {
                  const bloqueada = estadoDe.get(r.docId) === 'bloqueado'
                  const inner = (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{r.titulo}</span>
                        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{r.ocorrencias}×</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.trecho}</p>
                    </>
                  )
                  return bloqueada ? (
                    <div key={r.docId} className="cursor-not-allowed rounded-lg border border-dashed px-3 py-2 opacity-60" title="Conclua a aula anterior para abrir">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Bloqueada</div>
                      {inner}
                    </div>
                  ) : (
                    <Link key={r.docId} href={`/aluno/leitura/${r.docId}?busca=${encodeURIComponent(q.trim())}`}
                      className="block rounded-lg border px-3 py-2 transition-colors hover:border-primary/50 hover:bg-muted/40">
                      {inner}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <TabsContent value="trilha" className="pt-4">
          <div className="overflow-x-auto pb-10"><TrilhaGigante trilhas={[trilha]} gamAtivo={false} reto semFundo /></div>
        </TabsContent>
        <TabsContent value="desempenho" className="pt-4">
          <DesempenhoModulo desempenho={desempenho} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function DesempenhoModulo({ desempenho }: { desempenho: AulaDesempenho[] }) {
  const concluidas = desempenho.filter((a) => a.estado === 'concluido').length
  const totalQ = desempenho.reduce((s, a) => s + a.questoesTotal, 0)
  const respQ = desempenho.reduce((s, a) => s + a.questoesRespondidas, 0)

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResumoCard label="Aulas concluídas" valor={`${concluidas}/${desempenho.length}`} />
        <ResumoCard label="Questões respondidas" valor={totalQ ? `${respQ}/${totalQ}` : '—'} />
        <ResumoCard label="Progresso do módulo" valor={`${desempenho.length ? Math.round((concluidas / desempenho.length) * 100) : 0}%`} />
        <ResumoCard label="Pendentes" valor={String(desempenho.reduce((s, a) => s + (a.leituraConcluida ? a.questoesPendentes : 0), 0))} destaque={desempenho.some((a) => a.leituraConcluida && a.questoesPendentes > 0)} />
      </div>

      {/* Tabela por aula */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Aula</th>
              <th className="px-4 py-2.5 font-medium">Leitura</th>
              <th className="px-4 py-2.5 font-medium">Questões</th>
              <th className="px-4 py-2.5 text-right font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {desempenho.length === 0 ? (
              <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">Nenhuma aula neste módulo.</td></tr>
            ) : desempenho.map((a) => {
              const bloqueada = a.estado === 'bloqueado'
              return (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    {bloqueada ? (
                      <span className="block truncate font-medium text-muted-foreground">{a.titulo}</span>
                    ) : (
                      <Link href={`/aluno/leitura/${a.id}`} className="block truncate font-medium hover:text-primary hover:underline">{a.titulo}</Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.leituraConcluida ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Concluída</span>
                    ) : bloqueada ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(a.leituraPct)}%` }} /></span>
                        <span className="tabular-nums text-xs text-muted-foreground">{Math.round(a.leituraPct)}%</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.questoesTotal === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="tabular-nums">{a.questoesRespondidas}/{a.questoesTotal}</span>
                        {a.leituraConcluida && a.questoesPendentes > 0 && (
                          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">{a.questoesPendentes} pendente{a.questoesPendentes > 1 ? 's' : ''}</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.estado === 'concluido' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" /> Concluída</span>
                    ) : bloqueada ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"><Lock className="h-3 w-3" /> Bloqueada</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Em andamento</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ResumoCard({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className={cn('rounded-xl border bg-card p-3 shadow-sm', destaque && 'border-amber-500/40 bg-amber-500/5')}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-lg font-bold tabular-nums', destaque && 'text-amber-600 dark:text-amber-400')}>{valor}</p>
    </div>
  )
}
