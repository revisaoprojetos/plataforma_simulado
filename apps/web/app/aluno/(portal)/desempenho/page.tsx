import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { montarRelatorioEstudante } from '@/app/admin/relatorios/estudantes/_dados'
import { RelatorioEstudanteView } from '@/app/admin/relatorios/estudantes/relatorio-estudante-view'
import { BarChart3 } from 'lucide-react'

export const dynamic = 'force-dynamic'

// "Meu Desempenho" do aluno: reusa o MESMO motor de relatório do admin (KPIs, evolução,
// acerto por disciplina aluno×turma, histórico), escopado ao próprio estudante. O estudanteId
// vem da sessão assinada (getSessaoAluno) — o aluno só enxerga o próprio id (sem IDOR).
export default async function DesempenhoAlunoPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const svc = createAdminClient()
  const dados = await montarRelatorioEstudante(svc, sessao.estudanteId, sessao.tenantId)

  if (!dados || dados.simulados === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border bg-muted/30 p-10 text-center">
          <BarChart3 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Seu desempenho aparecerá aqui</h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Finalize ao menos um simulado para ver sua evolução, o acerto por disciplina e a comparação com a média da turma.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <RelatorioEstudanteView d={dados} />
    </div>
  )
}
