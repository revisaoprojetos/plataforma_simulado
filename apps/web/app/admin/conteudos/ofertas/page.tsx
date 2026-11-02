import { getCurrentAccess } from '@/lib/auth/permissions'
import { listarOfertas } from '@/lib/integracoes/liberacao/ofertas'
import { listarProdutosParaSeletor } from '@/lib/integracoes/liberacao/dados'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { OfertasClient } from './ofertas-client'
import { normalizarFiltrosOferta, filtrarOrdenarOfertas } from './oferta-util'

export const dynamic = 'force-dynamic'
const PP = [5, 10, 25, 50]

// OFERTA (Estúdio): índice de ofertas (agrupam produtos para liberação). Busca/filtros/ordenação/
// paginação aplicados AQUI (servidor) a partir da querystring; o client só renderiza a página atual.
export default async function OfertasPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('liberacao:view') || access.permissions.includes('liberacao:manage'))) return <SemAcessoArea />
  const podeEditar = access.isAdmin || access.permissions.includes('liberacao:manage')
  if (!access.tenantId) return <div className="w-full p-6 text-sm text-muted-foreground">Tenant não resolvido — recarregue a página.</div>

  const sp = await searchParams
  const [todas, produtos] = await Promise.all([
    listarOfertas(access.tenantId),
    listarProdutosParaSeletor(access.tenantId),
  ])

  const lista = filtrarOrdenarOfertas(todas, normalizarFiltrosOferta(sp))
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const perPage = PP.includes(Number(sp.pp)) ? Number(sp.pp) : 10
  const rows = lista.slice((page - 1) * perPage, page * perPage)

  return <OfertasClient rows={rows} total={lista.length} totalGeral={todas.length} produtos={produtos} podeEditar={podeEditar} />
}
