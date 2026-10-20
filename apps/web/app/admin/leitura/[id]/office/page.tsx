import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenant } from '@/lib/tenant'
import { limparCabecalhoHtml } from '@/lib/leitura/limpar-cabecalho'
import { gerarEArmazenarDocx } from '@/lib/leitura/office'
import { LeituraOfficeClient } from './office-client'

export const dynamic = 'force-dynamic'

export default async function LeituraOfficePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // BETA opcional: só quando o tenant liga tema.leitura_onlyoffice. Fora disso, não existe.
  const tenant = await getCurrentTenant()
  if (!(tenant?.tema as any)?.leitura_onlyoffice) notFound()
  if (!(await checkPermission('leitura:update'))) redirect('/admin')
  const access = await getCurrentAccess()
  if (!access.tenantId) redirect('/admin')

  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_documentos').select('id, titulo, versao, versao_rascunho').eq('id', id).eq('tenant_id', access.tenantId).eq('deletado', false).maybeSingle()
  if (!doc) notFound()
  const rasc = (doc as any).versao_rascunho ?? (doc as any).versao ?? 1
  const { data: cont } = await svc.from('simulado_documento_conteudos').select('html').eq('documento_id', id).eq('versao', rasc).maybeSingle()
  const html = limparCabecalhoHtml((cont as any)?.html ?? '')
  if (!html.trim()) notFound()

  const documentUrl = await gerarEArmazenarDocx(access.tenantId, id, html)
  if (!documentUrl) notFound()
  const onlyofficeUrl = process.env.NEXT_PUBLIC_ONLYOFFICE_URL || 'http://localhost:8082'
  const wopiHost = process.env.CONTEUDO_WOPI_HOST || process.env.TESTE_WOPI_HOST || 'http://host.docker.internal:3000'

  return (
    <LeituraOfficeClient
      documentoId={id}
      titulo={(doc as any).titulo || 'Documento'}
      documentUrl={documentUrl}
      onlyofficeUrl={onlyofficeUrl}
      callbackUrl={`${wopiHost}/api/leitura/office/${id}/callback`}
      chave={`leituraoff_${id}_${Date.now()}`}
    />
  )
}
