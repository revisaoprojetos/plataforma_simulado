import { notFound } from 'next/navigation'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { listarRegras, listarProdutosParaSeletor, listarStatusMappings, listarPedidos } from '@/lib/integracoes/liberacao/dados'
import { LIBERACAO_REGRAS_ATIVO } from '@/lib/flags'
import { LiberacaoClient } from './liberacao-client'

export const dynamic = 'force-dynamic'

export default async function LiberacaoPage() {
  // KILL-SWITCH: liberação desligada (default) → área indisponível (não lê tabelas que podem não existir).
  if (!LIBERACAO_REGRAS_ATIVO) notFound()
  const access = await getCurrentAccess()
  const tenantId = access.tenantId
  if (!tenantId) return <div className="w-full p-6 text-sm text-muted-foreground">Tenant não resolvido — recarregue a página.</div>
  const podeEditar = access.isAdmin || access.permissions.includes('liberacao:manage')
  const [regras, produtos, statusMaps, pedidos] = await Promise.all([
    listarRegras(tenantId),
    listarProdutosParaSeletor(tenantId),
    listarStatusMappings(tenantId),
    listarPedidos(tenantId, { page: 1 }),
  ])
  return <LiberacaoClient regras={regras} produtos={produtos} statusMaps={statusMaps} pedidosInicial={pedidos} podeEditar={podeEditar} />
}
