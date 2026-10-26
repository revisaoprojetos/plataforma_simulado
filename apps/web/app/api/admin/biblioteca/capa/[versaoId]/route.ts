import { NextRequest, NextResponse } from 'next/server'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'
import { getStorage } from '@/lib/storage'
import { resolverBucketConteudo } from '@/lib/conteudo/ingestao'

// CAPA do card (1ª página do .docx, PNG cacheado por versão/hash). LAZY: o <img> do card só chama esta
// rota quando entra no viewport (loading="lazy"), então nunca há "thundering herd" no carregamento da pasta.
// NUNCA gera OnlyOffice aqui (só lê o cache): se a capa não existe, devolve 404 → o card cai no placeholder.
// A geração acontece sob demanda ao ABRIR o documento (pdfPreviewDocumento/thumb), nunca a partir do grid.
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ versaoId: string }> }) {
  const { versaoId } = await params
  if (!/^[0-9a-f-]{10,40}$/i.test(versaoId)) return new NextResponse(null, { status: 400 })
  if (!(await checkPermission('configuracoes:view'))) return new NextResponse(null, { status: 403 })
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return new NextResponse(null, { status: 400 })
  try {
    const svc = createAdminClient()
    const { data: v } = await svc.from('simulado_conteudo_versoes').select('hash_arquivo').eq('tenant_id', tenantId).eq('id', versaoId).maybeSingle()
    if (!v) return new NextResponse(null, { status: 404 })
    const h8 = String((v as { hash_arquivo?: string }).hash_arquivo || '').slice(0, 8)
    const path = `conteudo-thumbs/${tenantId}/${versaoId}_${h8}_r1k.png`
    const bucket = await resolverBucketConteudo()
    const st = getStorage()
    if (!(await st.exists(bucket, path))) return new NextResponse(null, { status: 404 })
    const url = await st.getSignedUrl(bucket, path, 3600)
    // 302 para a URL assinada; o browser cacheia a resposta curta (não a imagem) por 10 min.
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, max-age=600' } })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
