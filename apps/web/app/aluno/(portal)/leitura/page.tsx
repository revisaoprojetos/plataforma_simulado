import { redirect } from 'next/navigation'
import { Library } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { LEITURA_ATIVA } from '@/lib/flags'
import { carregarTrilhaLeituraAluno } from '@/lib/leitura/trilha'
import { TrilhaGigante } from '@/components/aluno/trilha-simulados'

export const dynamic = 'force-dynamic'

export default async function LeituraAlunoPage() {
  if (!LEITURA_ATIVA) redirect('/aluno')
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const trilhas = await carregarTrilhaLeituraAluno(sessao.estudanteId, sessao.tenantId)
  const total = trilhas.reduce((a, t) => a + t.total, 0)
  const done = trilhas.reduce((a, t) => a + t.done, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Library className="h-6 w-6 text-primary" /> LegProc Digital</h1>
        <p className="text-muted-foreground">
          {total > 0
            ? <>Sua trilha de aulas — leia e desbloqueie as questões de cada uma. <span className="font-semibold text-foreground">{done}/{total}</span> concluídas.</>
            : 'Aulas de leitura organizadas em trilha: leia primeiro e libere as questões.'}
        </p>
      </div>

      {trilhas.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhuma aula disponível ainda.</div>
      ) : (
        <div className="overflow-x-auto pb-10"><TrilhaGigante trilhas={trilhas} gamAtivo={false} /></div>
      )}
    </div>
  )
}
