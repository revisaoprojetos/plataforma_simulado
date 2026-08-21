import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { LeituraEditor } from '@/components/admin/leitura-editor'
import type { Documento } from '../actions'

export const dynamic = 'force-dynamic'

export default async function LeituraEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await checkPermission('leitura:view'))) redirect('/admin')
  const access = await getCurrentAccess()
  if (!access.tenantId) redirect('/admin')

  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_documentos').select('*').eq('id', id).eq('tenant_id', access.tenantId).eq('deletado', false).maybeSingle()
  if (!doc) notFound()
  const versao = (doc as any).versao ?? 1
  const { data: cont } = await svc.from('simulado_documento_conteudos').select('html, artigos').eq('documento_id', id).eq('versao', versao).maybeSingle()

  const documento: Documento = {
    id: (doc as any).id, titulo: (doc as any).titulo, descricao: (doc as any).descricao ?? null,
    cor: (doc as any).cor ?? null, icone: (doc as any).icone ?? null, capa_url: (doc as any).capa_url ?? null,
    pasta_id: (doc as any).pasta_id ?? null, versao, publicado: !!(doc as any).publicado,
    desafio_ativo: !!(doc as any).desafio_ativo, desafio_exige_fim: !!(doc as any).desafio_exige_fim,
    desafio_tempo_min: (doc as any).desafio_tempo_min ?? null, artigos: (cont as any)?.artigos ?? 0,
  }

  return <LeituraEditor documento={documento} htmlAtual={(cont as any)?.html ?? ''} podeEditar={await checkPermission('leitura:update')} />
}
