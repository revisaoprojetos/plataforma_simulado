import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getCurrentTenant } from '@/lib/tenant'
import { urlAssinadaOriginal } from '@/lib/conteudo/ingestao'
import { paletaBlocosDoTema } from '@/lib/conteudo/blocos-palette'
import { ConteudoEditor } from './conteudo-editor'
import { PreviaLab } from './previa-lab'

export const dynamic = 'force-dynamic'

export default async function EditarConteudoPage({ params, searchParams }: { params: Promise<{ versaoId: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { versaoId } = await params
  const { preview } = await searchParams
  const access = await getCurrentAccess()
  if (!access.tenantId) notFound()
  const svc = createAdminClient()
  const { data: v } = await svc.from('simulado_conteudo_versoes')
    .select('id, documento_id, numero, arquivo_key, hash_arquivo').eq('tenant_id', access.tenantId).eq('id', versaoId).maybeSingle()
  if (!v || !v.arquivo_key) notFound()
  // Paraleliza as 3 chamadas (doc + URL assinada + tenant) — reduz a latência no localhost (menos ida-e-volta).
  const [docRes, documentUrl, tenant] = await Promise.all([
    svc.from('simulado_conteudo_documentos').select('titulo').eq('tenant_id', access.tenantId).eq('id', v.documento_id).maybeSingle(),
    urlAssinadaOriginal(v.arquivo_key, 3600),
    getCurrentTenant(),
  ])
  const doc = docRes.data
  if (!documentUrl) return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        <p className="font-semibold">Não foi possível abrir o arquivo no storage.</p>
        <p className="mt-2">O documento existe, mas o arquivo original não pôde ser lido (bucket/permissão de storage). Confira o bucket de conteúdos e tente importar de novo.</p>
      </div>
    </div>
  )
  const onlyofficeUrl = process.env.NEXT_PUBLIC_ONLYOFFICE_URL || 'http://localhost:8082'
  const wopiHost = process.env.CONTEUDO_WOPI_HOST || process.env.TESTE_WOPI_HOST || 'http://host.docker.internal:3000'
  const palette = paletaBlocosDoTema(tenant?.tema as any)
  const docVersao = `${v.numero}_${String(v.hash_arquivo || '').slice(0, 8)}`

  // Prévia "Ver com valores" = laboratório COMPLETO (seleção de simulado + sliders), igual ao Teste.
  if (preview === '1') return (
    <PreviaLab versaoId={versaoId} titulo={doc?.titulo || 'Documento'} onlyofficeUrl={onlyofficeUrl} wopiHost={wopiHost} docVersao={docVersao} />
  )

  return (
    <ConteudoEditor
      versaoId={versaoId}
      titulo={doc?.titulo || 'Documento'}
      documentUrl={documentUrl}
      onlyofficeUrl={onlyofficeUrl}
      wopiHost={wopiHost}
      chave={docVersao}
      preview={false}
      palette={palette}
    />
  )
}
