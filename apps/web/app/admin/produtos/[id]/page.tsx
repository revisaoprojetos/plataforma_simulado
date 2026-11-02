import { notFound } from 'next/navigation'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getProdutoDetalhe, listarMembrosProduto } from '@/lib/produtos/produtos'
import { ProdutoEditor } from './produto-editor'

export const dynamic = 'force-dynamic'

export default async function ProdutoEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await getCurrentAccess()
  if (!access.tenantId) notFound()
  const produto = await getProdutoDetalhe(access.tenantId, id)
  if (!produto) notFound()
  const membros = await listarMembrosProduto(access.tenantId, id)
  const podeEditar = access.isAdmin || access.permissions.includes('produtos:manage')
  return <ProdutoEditor produto={produto} membrosIniciais={membros} podeEditar={podeEditar} />
}
