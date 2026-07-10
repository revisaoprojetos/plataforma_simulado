import Link from 'next/link'
import { PieChart, ClipboardList, BookOpen, GraduationCap, Trophy, ArrowRight } from 'lucide-react'

const areas = [
  { title: 'Relatório Gráfico', description: 'Visão geral da plataforma em gráficos: tendências por dia/semana/mês/ano, taxas, médias e volume de tudo que acontece.', icon: PieChart, href: '/admin/relatorios/graficos', accent: 'from-primary/70 to-primary/5', chip: 'bg-primary/15 text-primary', glow: 'bg-primary/15' },
  { title: 'Relatório Simulado', description: 'Selecione um simulado e veja a análise completa: acerto, nota média, ranking, desempenho por questão e por disciplina.', icon: ClipboardList, href: '/admin/relatorios/simulados', accent: 'from-sky-500/70 to-sky-500/5', chip: 'bg-sky-500/15 text-sky-600 dark:text-sky-400', glow: 'bg-sky-500/15' },
  { title: 'Relatório Disciplina', description: 'Selecione uma disciplina e veja taxa de acerto/erro, em quais simulados apareceu e a evolução da turma.', icon: BookOpen, href: '/admin/relatorios/disciplinas', accent: 'from-emerald-500/70 to-emerald-500/5', chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', glow: 'bg-emerald-500/15' },
  { title: 'Relatório Estudantes', description: 'Análise detalhada por estudante: evolução, progresso por disciplina e comparação com a turma, com gráficos.', icon: GraduationCap, href: '/admin/relatorios/estudantes', accent: 'from-violet-500/70 to-violet-500/5', chip: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', glow: 'bg-violet-500/15' },
  { title: 'Ranking', description: 'Selecione um simulado e gere o ranking de pontuação dos estudantes, com download do caderno de ranking.', icon: Trophy, href: '/admin/relatorios/ranking', accent: 'from-amber-500/70 to-amber-500/5', chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', glow: 'bg-amber-500/15' },
]

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Análise</h1>
        <p className="text-muted-foreground">Relatórios e gráficos de desempenho da plataforma, simulados, disciplinas e estudantes.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((card) => (
          <Link key={card.href} href={card.href}
            className="group relative h-full overflow-hidden rounded-2xl border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`} />
            <div className={`pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full blur-3xl transition-opacity group-hover:opacity-100 ${card.glow} opacity-60`} />
            <div className="relative">
              <div className="mb-3 flex items-center justify-between">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110 ${card.chip}`}>
                  <card.icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
              <h3 className="mb-1.5 font-semibold">{card.title}</h3>
              <p className="text-sm text-muted-foreground">{card.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
