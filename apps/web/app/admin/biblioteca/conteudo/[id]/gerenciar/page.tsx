import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { checkPermission } from '@/lib/auth/permissions'
import { carregarGerenciamento } from '@/app/admin/biblioteca/gestao-actions'
import { GerenciarConteudoClient } from './gerenciar-conteudo-client'

export const metadata: Metadata = { title: 'Gerenciamento do conteúdo' }
export const dynamic = 'force-dynamic'

export default async function GerenciarConteudoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await checkPermission('configuracoes:view'))) notFound()
  const dados = await carregarGerenciamento(id)
  if (!dados.ok || !dados.base) notFound()
  return (
    <div className="w-full">
      <GerenciarConteudoClient dados={dados} />
    </div>
  )
}
