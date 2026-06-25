import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClipboardList, User, BookOpen, ArrowRight } from 'lucide-react'

const relatorioCards = [
  {
    title: 'Relatórios por Simulado',
    description:
      'Veja estatísticas detalhadas de cada simulado: taxa de acerto, nota média, ranking de estudantes e comparativo por questão.',
    icon: ClipboardList,
    href: '/admin/relatorios/simulados',
  },
  {
    title: 'Relatórios por Estudante',
    description:
      'Acompanhe a evolução individual de cada estudante: histórico de simulados, progresso por disciplina e desempenho ao longo do tempo.',
    icon: User,
    href: '/admin/relatorios/estudantes',
  },
  {
    title: 'Relatórios por Disciplina',
    description:
      'Analise o desempenho da turma agrupado por disciplina e assunto para identificar pontos de dificuldade coletivos.',
    icon: BookOpen,
    href: '/admin/relatorios/disciplinas',
  },
]

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground">
          Análise de desempenho da plataforma, simulados e estudantes
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {relatorioCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="group h-full cursor-pointer transition-colors hover:border-primary/50">
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <card.icon className="h-5 w-5" />
                </div>
                <CardTitle className="flex items-center justify-between">
                  {card.title}
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Exportação de PDF</CardTitle>
          <CardDescription>
            Gere relatórios completos em PDF para distribuição. O relatório inclui o caderno de respostas, gabarito, prova realizada e estatísticas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Acesse a aba <strong>Sessões</strong> de um simulado específico para solicitar a exportação em PDF de um estudante ou de toda a turma.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
