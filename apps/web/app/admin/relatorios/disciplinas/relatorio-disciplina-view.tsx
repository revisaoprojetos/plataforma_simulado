'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { KpiCard, Painel, Hero, BarrasH, AreaSpark, ListaBusca, heatBar, baixarCsv } from '@/components/admin/relatorios/viz'
import { novoWorkbook, cabecalho, secao, titulo, corPct, dropdown, baixarWorkbook, nomeArquivo } from '@/lib/relatorios/excel-kit'
import { BookOpen, Target, XCircle, ClipboardList, Users, ListChecks, Layers, TrendingUp, FileText, FileSpreadsheet, Loader2 } from 'lucide-react'

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

export function RelatorioDisciplinaView({ d, print }: { d: DadosRelatorioDisciplina; print?: boolean }) {
  const erro = d.acertoPct != null ? 100 - d.acertoPct : null
  const [gerando, setGerando] = useState(false)

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

  async function exportarExcel() {
    if (gerando) return
    setGerando(true)
    try {
      const wb = await novoWorkbook()

      // Aba 1 — Resumo
      const ws = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] })
      ws.columns = [{ width: 34 }, { width: 18 }]
      titulo(ws, d.nome, 'Relatório da disciplina — desempenho da turma', 2)
      secao(ws, 'Resumo', 2)
      cabecalho(ws, ['Indicador', 'Valor'])
      ws.addRow(['Questões', d.totalQuestoes])
      ws.addRow(['Respostas', d.respostas])
      ws.addRow(['Acerto médio (%)', d.acertoPct ?? '—'])
      ws.addRow(['Simulados', d.numSimulados])
      ws.addRow(['Estudantes', d.numEstudantes])

      // Aba 2 — Por assunto (estilo verticalizado: % colorido + prioridade/status)
      const wa = wb.addWorksheet('Por assunto', { views: [{ state: 'frozen', ySplit: 1 }] })
      cabecalho(wa, ['Assunto', 'Acerto (%)', 'Acertos', 'Total', 'Prioridade', 'Status'])
      for (const x of d.porAssunto) {
        const row = wa.addRow([x.nome, x.pct, x.ac, x.tt, '', ''])
        const c = row.getCell(2); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: corPct(x.pct) } }; c.alignment = { horizontal: 'center' }
      }
      wa.getColumn(1).width = 44; wa.getColumn(2).width = 12; wa.getColumn(3).width = 10; wa.getColumn(4).width = 10; wa.getColumn(5).width = 14; wa.getColumn(6).width = 16
      wa.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } }
      dropdown(wa, 5, d.porAssunto.length + 1, ['Alta', 'Média', 'Baixa'])
      dropdown(wa, 6, d.porAssunto.length + 1, ['Não estudado', 'Estudando', 'Revisar', 'Dominado'])

      // Aba 3 — Por simulado
      const wsm = wb.addWorksheet('Por simulado', { views: [{ state: 'frozen', ySplit: 1 }] })
      cabecalho(wsm, ['Simulado', 'Acerto (%)', 'Acertos', 'Total'])
      for (const x of d.porSimulado) {
        const row = wsm.addRow([x.titulo, x.pct, x.ac, x.tt])
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: corPct(x.pct) } }
      }
      wsm.getColumn(1).width = 44; wsm.getColumn(2).width = 12; wsm.getColumn(3).width = 10; wsm.getColumn(4).width = 10

      await baixarWorkbook(wb, nomeArquivo(d.nome, 'relatorio'))
    } catch {
      toast.error('Erro ao gerar o Excel.')
    } finally {
      setGerando(false)
    }
  }

  const botoes = (
    <div className="flex gap-2">
      <button type="button" onClick={exportar} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">
        <FileText className="h-4 w-4" /> CSV
      </button>
      <button type="button" onClick={exportarExcel} disabled={gerando} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60">
        {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel
      </button>
    </div>
  )

  return (
    <div className="space-y-5">
      <Hero icon={<BookOpen className="h-6 w-6" />} tom="primary" titulo={d.nome}
        subtitulo="Desempenho da turma na disciplina" acoes={print ? undefined : botoes} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Questões" valor={d.totalQuestoes} icon={<BookOpen className="h-4 w-4" />} tom="primary" />
        <KpiCard label="Respostas" valor={d.respostas} icon={<ListChecks className="h-4 w-4" />} tom="sky" />
        <KpiCard label="Acerto" valor={d.acertoPct != null ? `${d.acertoPct}%` : '—'} icon={<Target className="h-4 w-4" />} tom="emerald" />
        <KpiCard label="Erro" valor={erro != null ? `${erro}%` : '—'} icon={<XCircle className="h-4 w-4" />} tom="rose" />
        <KpiCard label="Simulados" valor={d.numSimulados} icon={<ClipboardList className="h-4 w-4" />} tom="amber" />
        <KpiCard label="Estudantes" valor={d.numEstudantes} icon={<Users className="h-4 w-4" />} tom="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Acerto por assunto" sub="Onde a turma vai bem e onde precisa reforçar" tom="emerald" icon={<Layers className="h-4 w-4" />}>
          <BarrasH itens={d.porAssunto.map((x) => ({ rotulo: x.nome, valor: x.pct, sub: `${x.ac}/${x.tt}` }))} pct heat />
        </Painel>
        <Painel titulo="Evolução do acerto" sub="Média de acerto da disciplina por mês" tom="sky" icon={<TrendingUp className="h-4 w-4" />}>
          <AreaSpark pontos={d.evolucao.map((x) => ({ rotulo: x.mes, valor: x.pct }))} tom="emerald" min={0} max={100} formato={(n) => `${n}%`} />
        </Painel>
      </div>

      <Painel titulo="Desempenho por simulado" sub="Em quais simulados a disciplina apareceu" tom="amber" icon={<ClipboardList className="h-4 w-4" />}>
        <ListaBusca itens={d.porSimulado} placeholder="Buscar simulado pelo título…" vazio="Sem respostas para esta disciplina ainda." print={print}
          filtro={(x, t) => x.titulo.toLowerCase().includes(t)}>
          {(x, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border bg-card p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{x.titulo}</div>
                <div className="text-xs text-muted-foreground">{x.ac}/{x.tt} respondidas</div>
              </div>
              <div className="hidden w-40 shrink-0 sm:block">
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${heatBar(x.pct)}`} style={{ width: `${x.pct}%` }} /></div>
              </div>
              <div className="w-14 shrink-0 text-right text-sm font-bold tabular-nums">{x.pct}%</div>
            </div>
          )}
        </ListaBusca>
      </Painel>
    </div>
  )
}
