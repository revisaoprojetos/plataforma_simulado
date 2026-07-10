'use client'

import { useMemo, useState } from 'react'
import { KpiCard, Painel, Hero, BarrasH, Colunas, AreaSpark, Donut, BotaoExportar, baixarCsv } from '@/components/admin/relatorios/viz'
import { ClipboardList, Users, Activity, CheckCircle2, Trophy, Target, BookOpen, ListChecks, LayoutDashboard, TrendingUp, PieChart, BarChart3 } from 'lucide-react'

type SessaoLite = { data: string | null; nota: number | null; acerto: number | null }
export type DadosRelatorioGrafico = {
  totais: { simulados: number; estudantes: number; sessoes: number; finalizadas: number; questoes: number; respostas: number }
  notaMediaGeral: number | null
  acertoMedioGeral: number | null
  sessoes: SessaoLite[]
  porStatus: { nome: string; valor: number }[]
  porDisciplina: { nome: string; pct: number; tt: number }[]
  distribuicaoNotas: { faixa: string; alunos: number }[]
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
type Gran = 'dia' | 'semana' | 'mes' | 'ano'
const GRANS: { id: Gran; label: string }[] = [{ id: 'dia', label: 'Dia' }, { id: 'semana', label: 'Semana' }, { id: 'mes', label: 'Mês' }, { id: 'ano', label: 'Ano' }]

function semanaISO(d: Date) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dia = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dia); const ano = t.getUTCFullYear(); const n = Math.ceil(((t.getTime() - Date.UTC(ano, 0, 1)) / 86400000 + 1) / 7); return { ano, n } }
function chaveErotulo(iso: string, g: Gran): { k: string; r: string } {
  const d = new Date(iso)
  if (g === 'dia') return { k: iso.slice(0, 10), r: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }
  if (g === 'semana') { const w = semanaISO(d); return { k: `${w.ano}-${String(w.n).padStart(2, '0')}`, r: `S${w.n}/${String(w.ano).slice(2)}` } }
  if (g === 'ano') return { k: `${d.getFullYear()}`, r: `${d.getFullYear()}` }
  return { k: `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`, r: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` }
}

export function RelatorioGraficoView({ d, print }: { d: DadosRelatorioGrafico; print?: boolean }) {
  const [g, setG] = useState<Gran>('mes')
  const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))

  const serie = useMemo(() => {
    const m = new Map<string, { r: string; sessoes: number; somaNota: number; nNota: number; somaAc: number; nAc: number }>()
    for (const s of d.sessoes) {
      if (!s.data) continue
      const { k, r } = chaveErotulo(s.data, g)
      const cur = m.get(k) ?? { r, sessoes: 0, somaNota: 0, nNota: 0, somaAc: 0, nAc: 0 }
      cur.sessoes++
      if (s.nota != null) { cur.somaNota += s.nota; cur.nNota++ }
      if (s.acerto != null) { cur.somaAc += s.acerto; cur.nAc++ }
      m.set(k, cur)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => ({
      periodo: v.r, sessoes: v.sessoes,
      notaMedia: v.nNota ? Math.round((v.somaNota / v.nNota) * 10) / 10 : 0,
      acertoMedio: v.nAc ? Math.round(v.somaAc / v.nAc) : 0,
    }))
  }, [d.sessoes, g])

  const granLabel = GRANS.find((x) => x.id === g)?.label.toLowerCase()

  function exportar() {
    const linhas: (string | number | null)[][] = [
      ['Relatório gráfico — visão geral'],
      ['Simulados', d.totais.simulados, 'Estudantes', d.totais.estudantes, 'Sessões', d.totais.sessoes, 'Finalizadas', d.totais.finalizadas],
      ['Nota média', nota(d.notaMediaGeral), 'Acerto médio', d.acertoMedioGeral != null ? `${d.acertoMedioGeral}%` : '—', 'Questões', d.totais.questoes, 'Respostas', d.totais.respostas],
      [],
      [`Série temporal (${g})`], ['Período', 'Sessões', 'Nota média', 'Acerto %'],
      ...serie.map((x) => [x.periodo, x.sessoes, nota(x.notaMedia), x.acertoMedio]),
      [],
      ['Acerto por disciplina'], ['Disciplina', 'Acerto %', 'Respostas'],
      ...d.porDisciplina.map((x) => [x.nome, x.pct, x.tt]),
    ]
    baixarCsv('relatorio_grafico_geral', linhas)
  }

  return (
    <div className="space-y-5">
      <Hero icon={<LayoutDashboard className="h-6 w-6" />} tom="primary" titulo="Visão geral da plataforma"
        subtitulo="Tendências e desempenho consolidados"
        acoes={print ? undefined : (
          <>
            <div className="inline-flex rounded-xl border bg-card/80 p-0.5 shadow-sm backdrop-blur">
              {GRANS.map((x) => (
                <button key={x.id} type="button" onClick={() => setG(x.id)}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${g === x.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}>{x.label}</button>
              ))}
            </div>
            <BotaoExportar onClick={exportar} />
          </>
        )} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <KpiCard label="Simulados" valor={d.totais.simulados} icon={<ClipboardList className="h-4 w-4" />} tom="primary" />
        <KpiCard label="Estudantes" valor={d.totais.estudantes} icon={<Users className="h-4 w-4" />} tom="sky" />
        <KpiCard label="Sessões" valor={d.totais.sessoes} icon={<Activity className="h-4 w-4" />} tom="violet" />
        <KpiCard label="Finalizadas" valor={d.totais.finalizadas} icon={<CheckCircle2 className="h-4 w-4" />} tom="emerald" />
        <KpiCard label="Nota média" valor={nota(d.notaMediaGeral)} icon={<Trophy className="h-4 w-4" />} tom="amber" />
        <KpiCard label="Acerto médio" valor={d.acertoMedioGeral != null ? `${d.acertoMedioGeral}%` : '—'} icon={<Target className="h-4 w-4" />} tom="emerald" />
        <KpiCard label="Questões" valor={d.totais.questoes} icon={<BookOpen className="h-4 w-4" />} tom="primary" />
        <KpiCard label="Respostas" valor={d.totais.respostas} icon={<ListChecks className="h-4 w-4" />} tom="sky" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo={`Sessões por período`} sub={`Agrupado por ${granLabel}`} tom="primary" icon={<Activity className="h-4 w-4" />}>
          <Colunas itens={serie.map((x) => ({ rotulo: x.periodo, valor: x.sessoes }))} tom="primary" altura={200} formato={(n) => `${n} sessão(ões)`} />
        </Painel>
        <Painel titulo="Acerto médio por período" sub={`Média de acerto (%) por ${granLabel}`} tom="emerald" icon={<TrendingUp className="h-4 w-4" />}>
          <AreaSpark pontos={serie.map((x) => ({ rotulo: x.periodo, valor: x.acertoMedio }))} tom="emerald" min={0} max={100} formato={(n) => `${n}%`} />
        </Painel>
        <Painel titulo="Acerto por disciplina" sub="Verde = domínio alto · vermelho = ponto fraco" tom="amber" icon={<BookOpen className="h-4 w-4" />}>
          <BarrasH itens={d.porDisciplina.map((x) => ({ rotulo: x.nome, valor: x.pct, sub: `${x.tt} resp.` }))} pct heat />
        </Painel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Painel titulo="Sessões por status" tom="sky" icon={<PieChart className="h-4 w-4" />}>
            <Donut itens={d.porStatus.map((x) => ({ rotulo: x.nome, valor: x.valor }))} />
          </Painel>
          <Painel titulo="Distribuição de notas" sub="Estudantes por faixa" tom="violet" icon={<BarChart3 className="h-4 w-4" />}>
            <Colunas itens={d.distribuicaoNotas.map((x) => ({ rotulo: x.faixa, valor: x.alunos }))} tom="violet" altura={150} formato={(n) => `${n} aluno(s)`} />
          </Painel>
        </div>
      </div>
    </div>
  )
}
