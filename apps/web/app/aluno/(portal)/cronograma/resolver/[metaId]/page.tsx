import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarQuestoesDaMeta } from '../../resolver-actions'
import { ResolverClient } from './resolver-client'

export const dynamic = 'force-dynamic'

export default async function ResolverPage({
  params,
  searchParams,
}: {
  params: Promise<{ metaId: string }>
  searchParams: Promise<{ voltar?: string }>
}) {
  const { metaId } = await params
  const { voltar } = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  // Só aceita retorno interno do aluno (evita open-redirect).
  const back = voltar && voltar.startsWith('/aluno') ? voltar : '/aluno/cronograma'
  const r = await carregarQuestoesDaMeta(metaId)

  if (!r.ok || !r.questoes) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Link href={back} className="text-sm text-primary hover:underline">← Voltar ao cronograma</Link>
        <p className="mt-4 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">{r.error ?? 'Não foi possível carregar as questões.'}</p>
      </div>
    )
  }

  return <ResolverClient titulo={r.titulo ?? 'Resolução'} questoes={r.questoes} voltar={back} />
}
