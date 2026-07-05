'use client'

import { Kpi, Grafico, Barras, Linha, baixarCsv } from '@/components/admin/relatorios/kit'
import { ClipboardList, Trophy, Target, Clock, TrendingUp, FileSpreadsheet } from 'lucide-react'

export type DadosRelatorioEstudante = {
  nome: string
  simulados: number
  notaMedia: number | null
  melhorNota: number | null
  acertoMedio: number | null
  tempoMedioMin: number | null
  evolucao: { rotulo: string; nota: number }[]
  porDisciplina: { nome: string; aluno: number; turma: number }[]
  historico: { simulado: string; quando: string; nota: number | null; acerto: number; tempo: string }[]
}

export function RelatorioEstudanteView({ d }: { d: DadosRelatorioEstudante }) {
  const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))

  function exportar() {
    const linhas: (string | number | null)[][] = [
      ['Relatório do estudante', d.nome],
      ['Simulados', d.simulados, 'Nota média', nota(d.notaMedia), 'Melhor', nota(d.melhorNota), 'Acerto médio', d.acertoMedio != null ? `${d.acertoMedio}%` : '—'],
      [],
      ['Histórico'], ['Simulado', 'Quando', 'Nota', 'Acerto %', 'Tempo'],
      ...d.historico.map((h) => [h.simulado, h.quando, nota(h.nota), h.acerto, h.tempo]),
      [],
      ['Acerto por disciplina (aluno x turma)'], ['Disciplina', 'Aluno %', 'Turma %'],
      ...d.porDisciplina.map((x) => [x.nome, x.aluno, x.turma]),
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Simulados feitos" valor={d.simulados} icon={<ClipboardList className="h-4 w-4" />} tom="primary" />
        <Kpi label="Nota média" valor={nota(d.notaMedia)} sub={`melhor ${nota(d.melhorNota)}`} icon={<Trophy className="h-4 w-4" />} tom="amber" />
        <Kpi label="Acerto médio" valor={d.acertoMedio != null ? `${d.acertoMedio}%` : '—'} icon={<Target className="h-4 w-4" />} tom="emerald" />
        <Kpi label="Tempo médio" valor={d.tempoMedioMin != null ? `${d.tempoMedioMin}min` : '—'} icon={<Clock className="h-4 w-4" />} tom="violet" />
        <Kpi label="Tendência" valor={d.evolucao.length >= 2 ? (d.evolucao[d.evolucao.length - 1].nota >= d.evolucao[0].nota ? '↑ subindo' : '↓ caindo') : '—'} icon={<TrendingUp className="h-4 w-4" />} tom="sky" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {d.evolucao.length > 0 && (
          <Grafico titulo="Evolução da nota">
            <Linha data={d.evolucao} x="rotulo" series={[{ key: 'nota', nome: 'Nota' }]} area />
          </Grafico>
        )}
        {d.porDisciplina.length > 0 && (
          <Grafico titulo="Acerto por disciplina — aluno x turma (%)">
            <Barras data={d.porDisciplina} x="nome" series={[{ key: 'aluno', nome: 'Aluno' }, { key: 'turma', nome: 'Turma', cor: '#94a3b8' }]} />
          </Grafico>
        )}
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h3 className="text-sm font-semibold">Histórico de simulados</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">Simulado</th>
                <th className="px-4 py-2 font-medium">Quando</th>
                <th className="px-4 py-2 font-medium">Nota</th>
                <th className="px-4 py-2 font-medium">Acerto</th>
                <th className="px-4 py-2 font-medium">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {d.historico.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Sem simulados finalizados ainda.</td></tr>
              ) : d.historico.map((h, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">{h.simulado}</td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{h.quando}</td>
                  <td className="px-4 py-2 tabular-nums">{nota(h.nota)}</td>
                  <td className="px-4 py-2 tabular-nums">{h.acerto}%</td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{h.tempo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
