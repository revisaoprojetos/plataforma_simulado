'use client'

import { KpiCard, Painel, Hero, BarrasH, AreaSpark, ListaBusca, BotaoExportar, heatBar, baixarCsv } from '@/components/admin/relatorios/viz'
import { BookOpen, Target, XCircle, ClipboardList, Users, ListChecks, Layers, TrendingUp } from 'lucide-react'

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
    <div className="space-y-5">
      <Hero icon={<BookOpen className="h-6 w-6" />} tom="primary" titulo={d.nome}
        subtitulo="Desempenho da turma na disciplina" acoes={print ? undefined : <BotaoExportar onClick={exportar} />} />

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
