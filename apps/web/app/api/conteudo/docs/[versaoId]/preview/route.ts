import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { baixarOriginal } from '@/lib/conteudo/ingestao'
import { renderPreviaDocx } from '@/lib/conteudo/previa-docx'
import { DADOS_PREVIA } from '@/lib/teste/previa-dados'

// Prévia "Ver com valores" da Biblioteca: baixa o .docx da versão (storage), preenche os {campos}/laços
// com dados de exemplo (docxtemplater) e devolve o .docx preenchido — SEM tocar no original. Server-to-
// server (o Document Server baixa daqui): resolve o tenant pela própria versão.
export const dynamic = 'force-dynamic'
const DOCX_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export async function GET(_req: Request, { params }: { params: Promise<{ versaoId: string }> }) {
  const { versaoId } = await params
  const svc = createAdminClient()
  // arquivo_key SEMPRE (coluna antiga, sempre no cache do PostgREST).
  const { data: v } = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('id', versaoId).maybeSingle()
  if (!v?.arquivo_key) return new NextResponse('not found', { status: 404 })
  // previa_dados TOLERANTE: a coluna pode não estar no cache do PostgREST (pós-migração). Se falhar, cai no
  // exemplo estático — a prévia NÃO quebra por isso.
  let previa: any = null
  try { const r = await svc.from('simulado_conteudo_versoes').select('previa_dados').eq('id', versaoId).maybeSingle(); previa = (r as any)?.data?.previa_dados ?? null } catch { previa = null }
  const buf = await baixarOriginal(v.arquivo_key)
  if (!buf) return new NextResponse('not found', { status: 404 })
  const dados = (previa && typeof previa === 'object') ? previa : DADOS_PREVIA
  const out = await renderPreviaDocx(buf, dados as any)
  return new NextResponse(new Uint8Array(out), {
    headers: { 'content-type': DOCX_CT, 'content-disposition': `inline; filename="${versaoId}-previa.docx"`, 'cache-control': 'no-store' },
  })
}
