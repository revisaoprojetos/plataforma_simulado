'use client'

import { Kpi, Grafico, Barras, Linha, baixarCsv } from '@/components/admin/relatorios/kit'
import { BookOpen, Target, XCircle, ClipboardList, Users, ListChecks, FileSpreadsheet } from 'lucide-react'

export type DadosRelatorioDisciplina = {
  nome: string
  totalQuestoes: number
  respostas: number
  acertoPct: number | null
  numSimulados: number
  numEstudantes: number
  porSimulado: { titulo: string; pct: number; ac: number; tt: number }[]
  porAssunto: { nome: string; pct: number; ac: number; tt: number }[]
  evolucao: { mes: string; pct: number }[]
}

export function RelatorioDisciplinaView({ d }: { d: DadosRelatorioDisciplina }) {
  const erro = d.acertoPct != null ? 100 - d.acertoPct : null

  function exportar() {
    const linhas: (string | number | null)[][] = [
      ['Relatório da disciplina', d.nome],
      ['Questões', d.totalQuestoes, 'Respostas', d.respostas, 'Acerto', d.acertoPct != null ? `${d.acertoPct}%` : '—', 'Simulados', d.numSimulados, 'Estudantes', d.numEstudantes],
      [],
      ['Por simulado'], ['Simulado', 'Acerto %', 'Acertos', 'Total'],
      ...d.porSimulado.map((x) => [x.titulo, x.pct, x.ac, x.tt]),
      [],
      ['Por assunto'], ['Assunto', 'Acerto %', 'Acertos', 'Total'],
      ...d.porAssunto.map((x) => [x.nome, x.pct, x.ac, x.tt]),
    ]
    baixarCsv(`${d.nome}_relatorio`, linhas)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{d.nome}</h2>
        <button type="button" onClick={exportar} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          <FileSpreadsheet className="h-4 w-4" /> Exportar (CSV/Excel)
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Questões" valor={d.totalQuestoes} icon={<BookOpen className="h-4 w-4" />} tom="primary" />
        <Kpi label="Respostas" valor={d.respostas} icon={<ListChecks className="h-4 w-4" />} tom="sky" />
        <Kpi label="Acerto" valor={d.acertoPct != null ? `${d.acertoPct}%` : '—'} icon={<Target className="h-4 w-4" />} tom="emerald" />
        <Kpi label="Erro" valor={erro != null ? `${erro}%` : '—'} icon={<XCircle className="h-4 w-4" />} tom="rose" />
        <Kpi label="Simulados" valor={d.numSimulados} icon={<ClipboardList className="h-4 w-4" />} tom="amber" />
        <Kpi label="Estudantes" valor={d.numEstudantes} icon={<Users className="h-4 w-4" />} tom="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {d.porAssunto.length > 0 && (
          <Grafico titulo="Acerto por assunto (%)">
            <Barras data={d.porAssunto} x="nome" series={[{ key: 'pct', nome: 'Acerto %' }]} />
          </Grafico>
        )}
        {d.evolucao.length > 0 && (
          <Grafico titulo="Evolução do acerto (por mês)">
            <Linha data={d.evolucao} x="mes" series={[{ key: 'pct', nome: 'Acerto %', cor: '#22c55e' }]} area />
          </Grafico>
        )}
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h3 className="text-sm font-semibold">Desempenho por simulado</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">Simulado</th>
                <th className="px-4 py-2 font-medium">Questões respondidas</th>
                <th className="px-4 py-2 font-medium">Acerto</th>
              </tr>
            </thead>
            <tbody>
              {d.porSimulado.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Sem respostas para esta disciplina ainda.</td></tr>
              ) : d.porSimulado.map((x, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">{x.titulo}</td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{x.tt}</td>
                  <td className="px-4 py-2 tabular-nums">{x.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
