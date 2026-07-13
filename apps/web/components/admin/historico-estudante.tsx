'use client'

import { Fragment, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SessaoAcoesMenu } from './sessao-acoes-menu'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import type { TipoSimulado } from '@/lib/simulado/tipo'
import { Search, ChevronDown, Clock, Timer, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

type Disc = { nome: string; ac: number; tt: number }
export type SessaoRow = {
  id: string
  titulo: string
  statusLabel: string
  statusVariant: 'default' | 'secondary' | 'outline'
  iniciado: string
  finalizado: string
  ac: number
  tt: number
  nota: number | null
  posicao: number | null
  tentativa: number
  tempoLabel: string
  mediaLabel: string
  porGrupo: Disc[]
  porDisciplina: Disc[]
  cadId: string | null
  mods: { id: string; nome: string }[]
  simuladoId: string
  temResultado: boolean
  tipo?: TipoSimulado | null
}

const pctTone = (p: number) =>
  p >= 70 ? 'text-emerald-600 dark:text-emerald-400' : p >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'

const GRUPO_CORES = ['#4f7fff', '#8b5cf6', '#ef4444', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16']

export function HistoricoEstudante({ rows, estudanteId, estudanteNome }: { rows: SessaoRow[]; estudanteId: string; estudanteNome?: string }) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const q = busca.trim().toLowerCase()
  const filtradas = q ? rows.filter((r) => r.titulo.toLowerCase().includes(q)) : rows

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Histórico de simulados</CardTitle>
        <span className="text-xs text-muted-foreground">{rows.length} sessão(ões)</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Busca */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar simulado…"
            className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>

        {/* Tabela rolável */}
        <div className="scroll-claro max-h-[480px] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Simulado</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Iniciado</th>
                <th className="px-3 py-2.5 font-medium">Finalizado</th>
                <th className="px-3 py-2.5 font-medium">Acertos</th>
                <th className="px-3 py-2.5 text-center font-medium">Pontuação</th>
                <th className="px-3 py-2.5 text-center font-medium">Ações</th>
                <th className="px-3 py-2.5 text-center font-medium">Expandir</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtradas.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">Nenhum simulado encontrado.</td></tr>
              ) : filtradas.map((r) => {
                const pct = r.tt > 0 ? Math.round((r.ac / r.tt) * 100) : null
                const exp = aberto === r.id
                return (
                  <Fragment key={r.id}>
                    <tr className={cn('transition-colors hover:bg-muted/40', exp && 'bg-muted/30')}>
                      <td className="px-3 py-2.5 font-medium"><span className="inline-flex items-center gap-2">{r.titulo}<TipoSimuladoBadge tipo={r.tipo} /></span></td>
                      <td className="px-3 py-2.5"><Badge variant={r.statusVariant}>{r.statusLabel}</Badge></td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{r.iniciado}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{r.finalizado}</td>
                      <td className="px-3 py-2.5">
                        {r.tt > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                            <span className="tabular-nums text-xs text-muted-foreground">{r.ac}/{r.tt}</span>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center font-semibold tabular-nums">{r.nota != null ? r.nota.toFixed(2) : '—'}</td>
                      <td className="px-3 py-2.5"><div className="flex justify-center"><SessaoAcoesMenu cadId={r.cadId} mods={r.mods} estudanteId={estudanteId} sessaoId={r.id} simuladoId={r.simuladoId} temResultado={r.temResultado} estudanteNome={estudanteNome} simuladoTitulo={r.titulo} /></div></td>
                      <td className="px-3 py-2.5 text-center">
                        <button type="button" onClick={() => setAberto(exp ? null : r.id)} aria-expanded={exp} title={exp ? 'Ocultar' : 'Expandir'}
                          className={cn('inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors', exp ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:border-primary hover:text-primary')}>
                          <ChevronDown className={cn('h-4 w-4 transition-transform', exp && 'rotate-180')} />
                        </button>
                      </td>
                    </tr>
                    {exp && (
                      <tr>
                        <td colSpan={8} className="bg-muted/20 px-3 pb-4 pt-2">
                          <DetalheSessao r={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export function DetalheSessao({ r }: { r: SessaoRow }) {
  const pct = r.tt > 0 ? Math.round((r.ac / r.tt) * 100) : 0
  return (
    <div className="animate-page space-y-3">
      <div className="flex flex-wrap gap-2">
        <Metrica icon={Clock} label="Tempo de prova" valor={r.tempoLabel} />
        <Metrica icon={Timer} label="Média / questão" valor={r.mediaLabel} />
        <Metrica icon={BookOpen} label="Acertos" valor={<><b>{r.ac}</b><span className="text-muted-foreground">/{r.tt}</span> <span className={cn('text-xs font-semibold', pctTone(pct))}>{pct}%</span></>} />
      </div>
      {r.porGrupo.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {r.porGrupo.map((g, i) => {
            const cor = GRUPO_CORES[i % GRUPO_CORES.length]
            const p = g.tt > 0 ? Math.round((g.ac / g.tt) * 100) : 0
            return (
              <div key={g.nome} className="rounded-xl border p-3" style={{ borderColor: `${cor}55`, background: `${cor}0d` }}>
                <p className="text-sm font-bold uppercase tracking-wide" style={{ color: cor }}>{g.nome}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: `${cor}22` }}><div className="h-full rounded-full" style={{ width: `${p}%`, background: cor }} /></div>
                  <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: cor }}>{g.ac}/{g.tt}</span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{p}%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {r.porDisciplina.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Por disciplina</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {r.porDisciplina.map((d) => {
              const p = d.tt > 0 ? Math.round((d.ac / d.tt) * 100) : 0
              return (
                <div key={d.nome} className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate" title={d.nome}>{d.nome}</span>
                  <span className="shrink-0 tabular-nums"><b>{d.ac}</b><span className="text-muted-foreground">/{d.tt}</span></span>
                  <span className={cn('w-9 shrink-0 text-right text-xs font-semibold tabular-nums', pctTone(p))}>{p}%</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function Metrica({ icon: Icon, label, valor }: { icon: React.ComponentType<{ className?: string }>; label: string; valor: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
      <span className="text-muted-foreground">{label}</span>
      <span>{valor}</span>
    </span>
  )
}
