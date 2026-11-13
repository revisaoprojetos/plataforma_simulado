import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getCurrentTenant } from '@/lib/tenant'
import { urlFonteOnlyOffice } from '@/lib/conteudo/fonte-onlyoffice'
import { paletaBlocosDoTema } from '@/lib/conteudo/blocos-palette'
import { ConteudoEditor } from './conteudo-editor'
import { emitirTokenOO } from '@/lib/seguranca/token-onlyoffice'
import { PreviaLab } from './previa-lab'
import { registroVersoesAtivo } from '@/lib/conteudo/atualizacoes-registro'

export const dynamic = 'force-dynamic'

export default async function EditarConteudoPage({ params, searchParams }: { params: Promise<{ versaoId: string }>; searchParams: Promise<{ preview?: string; origem?: string }> }) {
  const { versaoId } = await params
  const { preview, origem } = await searchParams
  const access = await getCurrentAccess()
  if (!access.tenantId) notFound()
  const svc = createAdminClient()
  const { data: v } = await svc.from('simulado_conteudo_versoes')
    .select('id, documento_id, numero, arquivo_key, hash_arquivo').eq('tenant_id', access.tenantId).eq('id', versaoId).maybeSingle()
  if (!v || !v.arquivo_key) notFound()
  // Paraleliza as 3 chamadas (doc + URL assinada + tenant) — reduz a latência no localhost (menos ida-e-volta).
  const [docRes, documentUrl, tenant] = await Promise.all([
    svc.from('simulado_conteudo_documentos').select('titulo, categoria').eq('tenant_id', access.tenantId).eq('id', v.documento_id).maybeSingle(),
    urlFonteOnlyOffice(v.arquivo_key, 3600),
    getCurrentTenant(),
  ])
  const doc = docRes.data
  // "Voltar" conforme a ORIGEM do documento: `categoria='modelo_caderno'` (área de Caderno) ≠ Biblioteca.
  // `origem` (query ?origem=/admin/...) tem prioridade p/ retornar à página EXATA de onde veio (ex.: a montagem
  // do banco), com validação anti open-redirect (só caminho interno /admin/...). Senão cai no default da área.
  const ehCaderno = (doc as any)?.categoria === 'modelo_caderno'
  const origemSegura = typeof origem === 'string' && /^\/admin\//.test(origem) && !origem.startsWith('//') ? origem : ''
  const voltarHref = origemSegura || (ehCaderno ? '/admin/cadernos-teste' : '/admin/biblioteca')
  const voltarLabel = origemSegura ? 'Voltar' : (ehCaderno ? 'Cadernos de teste' : 'Biblioteca')

  // "Registrar atualização" (ponto de versão do professor): só p/ materiais da Biblioteca (não modelos de caderno) e quem edita conteúdo.
  const p = access.permissions
  const podeRegistrar = !ehCaderno && (access.isAdmin || p.includes('*') || p.includes('configuracoes:update') || p.includes('biblioteca:update') || p.includes('produtos:manage'))
  const registroAtivo = podeRegistrar ? await registroVersoesAtivo(svc, access.tenantId) : false

  const onlyofficeUrl = process.env.NEXT_PUBLIC_ONLYOFFICE_URL || 'http://localhost:8082'
  const wopiHost = process.env.CONTEUDO_WOPI_HOST || process.env.TESTE_WOPI_HOST || 'http://host.docker.internal:3000'
  const palette = paletaBlocosDoTema(tenant?.tema as any)
  // Token do plugin (leitura, escopo do tenant): o plugin roda em iframe sem cookie de terceiros e o repassa nas rotas /api/teste/*.
  const ooToken = emitirTokenOO({ docId: versaoId, escopo: 'ler', tenantId: access.tenantId })
  const docVersao = `${v.numero}_${String(v.hash_arquivo || '').slice(0, 8)}`

  // Prévia "Ver com valores" = laboratório COMPLETO (seleção de simulado + sliders), igual ao Teste.
  if (preview === '1') return (
    <PreviaLab versaoId={versaoId} titulo={doc?.titulo || 'Documento'} onlyofficeUrl={onlyofficeUrl} wopiHost={wopiHost} docVersao={docVersao} />
  )

  return (
    <ConteudoEditor
      versaoId={versaoId}
      documentoId={v.documento_id}
      titulo={doc?.titulo || 'Documento'}
      documentUrl={documentUrl}
      onlyofficeUrl={onlyofficeUrl}
      wopiHost={wopiHost}
      chave={docVersao}
      preview={false}
      palette={palette}
      ooToken={ooToken}
      voltarHref={voltarHref}
      voltarLabel={voltarLabel}
      podeRegistrar={podeRegistrar}
      registroAtivo={podeRegistrar && registroAtivo}
    />
  )
}
