import { getCurrentAccess } from '@/lib/auth/permissions'
import { listarProdutos } from '@/lib/produtos/produtos'
import { ProdutosClient } from './produtos-client'

export const dynamic = 'force-dynamic'

export default async function ProdutosPage() {
  const access = await getCurrentAccess()
  const produtos = access.tenantId ? await listarProdutos(access.tenantId) : []
  const podeEditar = access.isAdmin || access.permissions.includes('produtos:manage')
  return <ProdutosClient produtosIniciais={produtos} podeEditar={podeEditar} />
}
