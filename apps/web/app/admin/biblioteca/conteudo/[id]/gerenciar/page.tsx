import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { checkPermission } from '@/lib/auth/permissions'
import { carregarGerenciamento } from '@/app/admin/biblioteca/gestao-actions'
import { GerenciarConteudoClient } from './gerenciar-conteudo-client'
import { listarQuestoesConjunto, listarDisciplinasTenant } from './questoes-actions'
import { QuestoesGerenciarClient } from './questoes-gerenciar-client'

export const metadata: Metadata = { title: 'Gerenciamento do conteúdo' }
export const dynamic = 'force-dynamic'

export default async function GerenciarConteudoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await checkPermission('configuracoes:view'))) notFound()
  const dados = await carregarGerenciamento(id)
  if (!dados.ok || !dados.base) notFound()

  // Card "Conjunto de questões": gestão PRÓPRIA (adicionar do banco / importar), sem editor de documento.
  if (dados.base.kind === 'questoes') {
    const [q, disciplinas] = await Promise.all([listarQuestoesConjunto(id), listarDisciplinasTenant()])
    return (
      <div className="w-full">
        <QuestoesGerenciarClient
          base={{ id: dados.base.id, titulo: dados.base.titulo, status: dados.base.status }}
          itensIniciais={q.ok && q.itens ? q.itens : []}
          disciplinas={disciplinas}
        />
      </div>
    )
  }

  return (
    <div className="w-full">
      <GerenciarConteudoClient dados={dados} />
    </div>
  )
}
