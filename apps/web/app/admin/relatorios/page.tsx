import Link from 'next/link'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, ClipboardList, BookOpen, GraduationCap, Trophy, ArrowRight } from 'lucide-react'

const areas = [
  { title: 'Relatório Gráfico', description: 'Visão geral da plataforma em gráficos: tendências por dia/semana/mês/ano, taxas, médias e volume de tudo que acontece.', icon: PieChart, href: '/admin/relatorios/graficos' },
  { title: 'Relatório Simulado', description: 'Selecione um simulado e veja a análise completa: acerto, nota média, ranking, desempenho por questão e por disciplina.', icon: ClipboardList, href: '/admin/relatorios/simulados' },
  { title: 'Relatório Disciplina', description: 'Selecione uma disciplina e veja taxa de acerto/erro, em quais simulados apareceu e a evolução da turma.', icon: BookOpen, href: '/admin/relatorios/disciplinas' },
  { title: 'Relatório Estudantes', description: 'Análise detalhada por estudante: evolução, progresso por disciplina e comparação com a turma, com gráficos.', icon: GraduationCap, href: '/admin/relatorios/estudantes' },
  { title: 'Ranking', description: 'Selecione um simulado e gere o ranking de pontuação dos estudantes, com download do caderno de ranking.', icon: Trophy, href: '/admin/relatorios/ranking' },
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
          <Link key={card.href} href={card.href}>
            <Card className="group h-full cursor-pointer transition-colors hover:border-primary/50">
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <card.icon className="h-5 w-5" />
                </div>
                <CardTitle className="flex items-center justify-between gap-2">
                  {card.title}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
