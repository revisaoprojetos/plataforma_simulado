'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Route, BarChart3, Check, Lock, AlertTriangle, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TrilhaGigante, type Trilha } from '@/components/aluno/trilha-simulados'
import type { AulaDesempenho } from '@/lib/leitura/trilha'

type Aba = 'trilha' | 'desempenho'

/** Visão de um módulo do LegProc Digital: tabs Trilha | Desempenho + aviso de questões pendentes. */
export function LeituraModuloView({ modulo, trilha, desempenho, pendentes, aulasPendentes }: {
  modulo: string
  trilha: Trilha
  desempenho: AulaDesempenho[]
  pendentes: number
  aulasPendentes: number
}) {
  const [aba, setAba] = useState<Aba>('trilha')
  // 1ª aula com questões pendentes (leitura feita) → alvo do CTA do aviso.
  const alvoPend = desempenho.find((a) => a.leituraConcluida && a.questoesPendentes > 0)

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

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl border bg-muted/40 p-1 text-sm">
        {([['trilha', 'Trilha', Route], ['desempenho', 'Desempenho', BarChart3]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setAba(k)}
            className={cn('inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-medium transition-colors',
              aba === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {aba === 'trilha' ? (
        <div className="overflow-x-auto pb-10"><TrilhaGigante trilhas={[trilha]} gamAtivo={false} reto semFundo /></div>
      ) : (
        <DesempenhoModulo desempenho={desempenho} />
      )}
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
