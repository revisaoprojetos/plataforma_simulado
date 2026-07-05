'use client'

import { Kpi, Grafico, Barras } from '@/components/admin/relatorios/kit'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import type { TipoSimulado } from '@/lib/simulado/tipo'
import { Users, CheckCircle2, Target, Trophy, Clock, FileSpreadsheet } from 'lucide-react'

export type DadosRelatorioSimulado = {
  titulo: string
  tipo: TipoSimulado | null
  totalSessoes: number
  finalizadas: number
  notaMedia: number | null
  melhorNota: number | null
  acertoMedio: number | null
  tempoMedioMin: number | null
  porDisciplina: { nome: string; pct: number; ac: number; tt: number }[]
  porQuestao: { rotulo: string; pct: number; ac: number; tt: number }[]
  distribuicao: { faixa: string; alunos: number }[]
  ranking: { pos: number; nome: string; nota: number | null; acerto: number; tempo: string }[]
}

function baixarCsv(nomeArq: string, linhas: (string | number | null)[][]) {
  const esc = (v: string | number | null) => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = `${nomeArq}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(a.href)
}

export function RelatorioSimuladoView({ d }: { d: DadosRelatorioSimulado }) {
  const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))

  function exportar() {
    const nomeArq = d.titulo.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_') + '_relatorio'
    const linhas: (string | number | null)[][] = [
      ['Relatório do simulado', d.titulo],
      ['Sessões', d.totalSessoes, 'Finalizadas', d.finalizadas, 'Nota média', nota(d.notaMedia), 'Acerto médio', d.acertoMedio != null ? `${d.acertoMedio}%` : '—'],
      [],
      ['Ranking'], ['Posição', 'Estudante', 'Nota', 'Acerto %', 'Tempo'],
      ...d.ranking.map((r) => [r.pos, r.nome, nota(r.nota), r.acerto, r.tempo]),
      [],
      ['Acerto por disciplina'], ['Disciplina', 'Acerto %', 'Acertos', 'Total'],
      ...d.porDisciplina.map((x) => [x.nome, x.pct, x.ac, x.tt]),
      [],
      ['Acerto por questão'], ['Questão', 'Acerto %', 'Acertos', 'Total'],
      ...d.porQuestao.map((x) => [x.rotulo, x.pct, x.ac, x.tt]),
    ]
    baixarCsv(nomeArq, linhas)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{d.titulo}</h2>
          <TipoSimuladoBadge tipo={d.tipo} />
        </div>
        <button type="button" onClick={exportar} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          <FileSpreadsheet className="h-4 w-4" /> Exportar (CSV/Excel)
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Sessões" valor={d.totalSessoes} sub={`${d.finalizadas} finalizadas`} icon={<Users className="h-4 w-4" />} tom="primary" />
        <Kpi label="Nota média" valor={nota(d.notaMedia)} sub={`melhor ${nota(d.melhorNota)}`} icon={<Trophy className="h-4 w-4" />} tom="amber" />
        <Kpi label="Acerto médio" valor={d.acertoMedio != null ? `${d.acertoMedio}%` : '—'} icon={<Target className="h-4 w-4" />} tom="emerald" />
        <Kpi label="Finalizadas" valor={d.finalizadas} sub={d.totalSessoes ? `${Math.round((d.finalizadas / d.totalSessoes) * 100)}% do total` : '—'} icon={<CheckCircle2 className="h-4 w-4" />} tom="sky" />
        <Kpi label="Tempo médio" valor={d.tempoMedioMin != null ? `${d.tempoMedioMin}min` : '—'} icon={<Clock className="h-4 w-4" />} tom="violet" />
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        {d.porDisciplina.length > 0 && (
          <Grafico titulo="Acerto por disciplina (%)">
            <Barras data={d.porDisciplina} x="nome" series={[{ key: 'pct', nome: 'Acerto %' }]} />
          </Grafico>
        )}
        {d.distribuicao.length > 0 && (
          <Grafico titulo="Distribuição de notas">
            <Barras data={d.distribuicao} x="faixa" series={[{ key: 'alunos', nome: 'Estudantes', cor: '#22c55e' }]} />
          </Grafico>
        )}
      </div>

      {d.porQuestao.length > 0 && (
        <Grafico titulo="Acerto por questão (%) — menores primeiro (mais difíceis)" altura={300}>
          <Barras data={d.porQuestao} x="rotulo" series={[{ key: 'pct', nome: 'Acerto %', cor: '#f59e0b' }]} />
        </Grafico>
      )}

      {/* Ranking */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h3 className="text-sm font-semibold">Ranking dos estudantes</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Estudante</th>
                <th className="px-4 py-2 font-medium">Nota</th>
                <th className="px-4 py-2 font-medium">Acerto</th>
                <th className="px-4 py-2 font-medium">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {d.ranking.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Sem sessões finalizadas ainda.</td></tr>
              ) : d.ranking.map((r) => (
                <tr key={r.pos} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-semibold tabular-nums">{r.pos}º</td>
                  <td className="px-4 py-2 font-medium">{r.nome}</td>
                  <td className="px-4 py-2 tabular-nums">{nota(r.nota)}</td>
                  <td className="px-4 py-2 tabular-nums">{r.acerto}%</td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.tempo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
