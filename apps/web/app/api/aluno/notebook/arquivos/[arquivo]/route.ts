import { NextRequest, NextResponse } from 'next/server'
import { autenticarBeta, resp404 } from '@/lib/aluno/notebook-api'
import { MIME_POR_EXT, parseArquivoId } from '@/lib/aluno/notebook-texto'
import { getStorage } from '@/lib/storage'
import { BucketCadernoAusente, bucketArquivosNotebook, caminhoArquivoNotebook } from '@/lib/aluno/notebook-arquivos-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
type Ctx = { params: Promise<{ arquivo: string }> }

// GET /api/aluno/notebook/arquivos/<uuid>.<ext>[?nome=...] — serve o arquivo SOMENTE ao dono (tenant+estudante da sessão).
// Imagem = inline; demais = attachment. nosniff + CSP sandbox; cache privado.
export async function GET(request: NextRequest, { params }: Ctx) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { arquivo } = await params
  const p = parseArquivoId(arquivo)
  if (!p) return resp404()
  let bytes: Uint8Array | null = null
  try { bytes = await getStorage().download(await bucketArquivosNotebook(), caminhoArquivoNotebook(a.tenantId, a.estudanteId, `${p.id}.${p.ext}`)) } catch (e) {
    if (e instanceof BucketCadernoAusente) return NextResponse.json({ ok: false, code: 'storage_indisponivel', message: e.message }, { status: 503 })
    bytes = null
  }
  if (!bytes) return resp404()
  const nome = (request.nextUrl.searchParams.get('nome') ?? `arquivo.${p.ext}`).replace(/[^\w.\- À-ÿ]+/g, '_').slice(0, 120) || `arquivo.${p.ext}`
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': MIME_POR_EXT[p.ext] ?? 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `${p.imagem ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
