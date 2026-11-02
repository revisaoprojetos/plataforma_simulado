import { notFound } from 'next/navigation'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { obterOferta } from '@/lib/integracoes/liberacao/ofertas'
import { listarProdutosParaSeletor } from '@/lib/integracoes/liberacao/dados'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { OfertaEditarClient } from './oferta-editar-client'

export const dynamic = 'force-dynamic'

// OFERTA › editor (identidade + produtos + janela de acesso). A oferta é criada na lista e aberta pelo id.
export default async function OfertaPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('liberacao:view') || access.permissions.includes('liberacao:manage'))) return <SemAcessoArea />
  const podeEditar = access.isAdmin || access.permissions.includes('liberacao:manage')
  if (!access.tenantId) return <div className="w-full p-6 text-sm text-muted-foreground">Tenant não resolvido — recarregue a página.</div>

  const { id } = await params
  const [oferta, produtos] = await Promise.all([
    obterOferta(access.tenantId, id),
    listarProdutosParaSeletor(access.tenantId),
  ])
  if (!oferta) notFound()

  return <OfertaEditarClient oferta={oferta} produtos={produtos} podeEditar={podeEditar} />
}
