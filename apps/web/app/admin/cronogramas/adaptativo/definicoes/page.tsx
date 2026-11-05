import { AdaptativoTabs } from '@/components/admin/adaptativo-tabs'
import { DefinicoesClient } from './definicoes-client'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — DEFINIÇÃO das metas (cadastro por plataforma) e ANÁLISE (alunos, conclusão, tempo, acertos por meta).
export default function CronogramaAdaptativoDefinicoesPage() {
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cronograma adaptativo · Definição e análise das metas</h1>
        <p className="text-muted-foreground">
          O cadastro das metas da plataforma (aulas e metas de lei seca) — independente de aluno — cruzado com o que os alunos têm nos planos e já fizeram.
        </p>
      </div>
      <AdaptativoTabs />
      <DefinicoesClient />
    </div>
  )
}
