import Link from 'next/link'
import { PieChart, ClipboardList, BookOpen, GraduationCap, Trophy, ArrowRight, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tom = 'primary' | 'amber'

const areas: { title: string; description: string; icon: any; href: string; tom: Tom }[] = [
  { title: 'Relatório Gráfico', description: 'Visão geral da plataforma em gráficos: tendências por dia/semana/mês/ano, taxas, médias e volume de tudo que acontece.', icon: PieChart, href: '/admin/relatorios/graficos', tom: 'primary' },
  { title: 'Relatório Simulado', description: 'Análise completa de um simulado: acerto, nota média, ranking, desempenho por questão e por disciplina.', icon: ClipboardList, href: '/admin/relatorios/simulados', tom: 'primary' },
  { title: 'Relatório Disciplina', description: 'Taxa de acerto/erro de uma disciplina, em quais simulados apareceu e a evolução da turma.', icon: BookOpen, href: '/admin/relatorios/disciplinas', tom: 'primary' },
  { title: 'Relatório Estudantes', description: 'Análise por estudante: evolução, progresso por disciplina e comparação com a turma, com gráficos.', icon: GraduationCap, href: '/admin/relatorios/estudantes', tom: 'primary' },
  { title: 'Ranking', description: 'Classificação de pontuação dos estudantes por simulado, com critérios configuráveis e download do caderno.', icon: Trophy, href: '/admin/relatorios/ranking', tom: 'amber' },
]

const TOM: Record<Tom, { accent: string; chip: string; glow: string }> = {
  primary: { accent: 'from-primary/70 to-primary/5', chip: 'bg-primary/12 text-primary', glow: 'bg-primary/15' },
  amber: { accent: 'from-amber-500/70 to-amber-400/5', chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', glow: 'bg-amber-500/15' },
}

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BarChart3 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Análise &amp; Relatórios</h1>
          <p className="text-muted-foreground">Desempenho da plataforma, simulados, disciplinas e estudantes — em gráficos e exportável.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((card) => {
          const tom = TOM[card.tom]
          return (
            <Link key={card.href} href={card.href}
              className="group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', tom.accent)} />
              <div className={cn('pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-60 blur-3xl transition-opacity group-hover:opacity-100', tom.glow)} />
              <div className="relative flex-1">
                <div className="mb-3 flex items-center justify-between">
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110', tom.chip)}>
                    <card.icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <h3 className="mb-1.5 font-semibold">{card.title}</h3>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
