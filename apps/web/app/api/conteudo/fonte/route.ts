import { NextResponse } from 'next/server'
import { getStorage } from '@/lib/storage'
import { resolverBucketConteudo } from '@/lib/conteudo/ingestao'
import { lerTokenFonte } from '@/lib/conteudo/fonte-onlyoffice'

// Serve o arquivo-fonte (.docx/pdf) ao Document Server do OnlyOffice — server-to-server, PROVIDER-
// INDEPENDENTE: lê via getStorage() (baixarOriginal), então funciona igual no Supabase e no s3/Hetzner.
// É o que destrava STORAGE_PROVIDER=s3: o OnlyOffice baixa DAQUI (app, host alcançável), nunca do
// Hetzner direto (presigned que o container não alcança). Autorizado por token curto (arquivo_key
// assinado), sem exigir sessão — a chamada é DS→app, como /api/conteudo/docs/[versaoId]/preview.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CT: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  html: 'text/html',
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t')
  if (!t) return new NextResponse('bad request', { status: 400 })
  const key = await lerTokenFonte(t)
  if (!key) return new NextResponse('forbidden', { status: 403 })
  // GetObject DIRETO do SDK (não presigned+fetch): não depende de o presigned ser alcançável/assinável,
  // só das credenciais S3 — mais robusto p/ a conversão no s3/Hetzner (e idêntico no Supabase).
  const buf = await getStorage().download(await resolverBucketConteudo(), key)
  if (!buf) return new NextResponse('not found', { status: 404 })
  const ext = key.split('.').pop()?.toLowerCase() || 'docx'
  const ct = CT[ext] || 'application/octet-stream'
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'content-type': ct,
      'content-disposition': `inline; filename="fonte.${ext}"`,
      'cache-control': 'no-store',
    },
  })
}
