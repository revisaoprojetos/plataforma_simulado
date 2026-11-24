import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { DefinicoesClient } from './definicoes-client'

// Admin: Cronograma Adaptativo — DEFINIÇÃO das metas (cadastro por plataforma) e ANÁLISE (alunos, conclusão, tempo, acertos por meta).
export default function CronogramaAdaptativoDefinicoesPage() {
  return (
    <div className="w-full space-y-4">
      <TituloTela titulo="Análise das metas" descricao="O cadastro das metas da plataforma (aulas e metas de lei seca) — independente de aluno — cruzado com o que os alunos têm nos planos e já fizeram." />
      <DefinicoesClient />
    </div>
  )
}
