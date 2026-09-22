'use client'

import { Users, BookCheck, Flame, Zap, Download, TrendingUp, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RelatorioModulo } from '@/lib/leitura/relatorio'

const fmt = (n: number) => n.toLocaleString('pt-BR')
const fmtSeg = (s: number) => (!s ? '—' : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`)
const diaCurto = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }

function Kpi({ icon: Icon, label, valor, sub, tom = 'text-primary' }: { icon: typeof Users; label: string; valor: string | number; sub?: string; tom?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className={cn('h-4 w-4', tom)} /> {label}</div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

function TopLista({ titulo, itens, unidade, icon: Icon }: { titulo: string; itens: { nome: string; email: string | null; valor: number }[]; unidade: string; icon: typeof Flame }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {titulo}</h3>
      {itens.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Sem dados ainda.</p> : (
        <ol className="space-y-1.5">
          {itens.map((t, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.nome}</span>
                {t.email && <span className="block truncate text-[11px] text-muted-foreground">{t.email}</span>}
              </span>
              <span className="shrink-0 font-bold tabular-nums text-primary">{fmt(t.valor)} <span className="text-[11px] font-normal text-muted-foreground">{unidade}</span></span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function LeituraRelatorio({ rel, moduloId }: { rel: RelatorioModulo; moduloId: string }) {
  const maxDia = Math.max(1, ...rel.porDia.map((d) => d.alunos))
  return (
    <div className="space-y-4">
      {/* Cabeçalho + exportar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Relatório do módulo</h2>
          <p className="text-xs text-muted-foreground">Adesão, sequências, pontuação e tempos por aula. Exporte tudo em Excel (várias abas + resumo).</p>
        </div>
        <a href={`/api/admin/leitura/relatorio-excel?modulo=${moduloId}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
          <Download className="h-4 w-4" /> Baixar Excel
        </a>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Users} label="Alunos participantes" valor={fmt(rel.totalAlunos)} sub={`${rel.mediaAulasPorAluno} aulas/aluno em média`} />
        <Kpi icon={BookCheck} label="Aulas concluídas" valor={fmt(rel.aulasConcluidasTotal)} sub={`de ${rel.totalAulas} aulas no módulo`} />
        <Kpi icon={Flame} label="Sequência" valor={rel.seqMedia} sub={`maior: ${rel.seqMaior} dias`} tom="text-amber-500" />
        <Kpi icon={Zap} label="Pontos (média)" valor={fmt(rel.pontosMedia)} sub={`maior: ${fmt(rel.pontosMaior)} · total ${fmt(rel.pontosTotal)}`} />
      </div>

      {/* Adesão por dia */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Adesão por dia</h3>
        {rel.porDia.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma aula concluída ainda.</p> : (
          <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ minHeight: 140 }}>
            {rel.porDia.map((d) => (
              <div key={d.dia} className="flex min-w-[34px] flex-1 flex-col items-center gap-1" title={`${d.dia}: ${d.alunos} alunos · ${d.aulas} aulas`}>
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{d.alunos}</span>
                <div className="flex w-full items-end justify-center" style={{ height: 96 }}>
                  <div className="w-full max-w-[26px] rounded-t bg-primary/80" style={{ height: `${Math.round((d.alunos / maxDia) * 96)}px` }} />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">{diaCurto(d.dia)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top listas */}
      <div className="grid gap-3 lg:grid-cols-2">
        <TopLista titulo="Maiores sequências" itens={rel.topSequencia} unidade="dias" icon={Flame} />
        <TopLista titulo="Maiores pontuações" itens={rel.topPontos} unidade="pts" icon={Zap} />
      </div>

      {/* Por aula */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b p-4"><h3 className="flex items-center gap-1.5 text-sm font-semibold"><Clock className="h-4 w-4 text-primary" /> Por aula</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted text-left text-muted-foreground">
              <tr>
                <th className="w-14 px-4 py-2.5 text-center font-medium">Dia</th>
                <th className="px-4 py-2.5 font-medium">Aula</th>
                <th className="px-4 py-2.5 text-center font-medium">Concluíram</th>
                <th className="px-4 py-2.5 text-center font-medium">Leitura (méd.)</th>
                <th className="px-4 py-2.5 text-center font-medium">Quiz (méd.)</th>
              </tr>
            </thead>
            <tbody>
              {rel.porAula.map((a) => (
                <tr key={a.docId} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-center tabular-nums text-muted-foreground">{a.ordem}</td>
                  <td className="px-4 py-2.5"><span className="block truncate font-medium">{a.titulo}</span></td>
                  <td className="px-4 py-2.5 text-center tabular-nums font-semibold">{fmt(a.concluiram)}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-muted-foreground">{fmtSeg(a.leituraMediaSeg)}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-muted-foreground">{fmtSeg(a.quizMediaSeg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
