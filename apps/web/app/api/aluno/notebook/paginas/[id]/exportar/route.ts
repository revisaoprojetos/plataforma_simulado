import { NextRequest, NextResponse } from 'next/server'
import { autenticarBeta, limiteEscrita, resp400, resp404, resp429, respErroDb } from '@/lib/aluno/notebook-api'
import { LIMITES_EXPORT, MIME_EXPORT, contentDisposition, docParaBlocos, parseFormato } from '@/lib/aluno/notebook-exportar'
import { ExportLimite, gerarDocx, gerarPdfDoc, gerarPdfFolha } from '@/lib/aluno/notebook-exportar-arquivos'
import { validarFolha } from '@/lib/aluno/notebook-folha'
import { uuidSchema } from '@/lib/aluno/notebook-tipos'

export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

const erro = (status: number, code: string, message: string) => NextResponse.json({ ok: false, code, message }, { status })

// GET /api/aluno/notebook/paginas/:id/exportar?formato=pdf|docx
//  -> 200 arquivo (attachment) | 403 download_indisponivel (interruptor central) | 404 | 413 grande demais | 422 folha inválida
// Folha livre: só PDF (traços + caixas de texto; o PDF de fundo NÃO é incluído). docx de folha => 400.
export async function GET(request: NextRequest, { params }: Ctx) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  const formato = parseFormato(request.nextUrl.searchParams.get('formato'))
  if (!formato) return resp400('formato deve ser pdf ou docx.')

  // Exportação do Caderno beta NÃO está sob o interruptor central (vale só p/ materiais de conteúdo).
  if (!limiteEscrita(`exp:${a.estudanteId}`, 3, 10_000)) return resp429()

  const { data, error } = await a.svc.from('simulado_aluno_notebook_paginas').select('id, titulo, tipo_pagina, doc, tinta')
    .eq('id', id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).is('deletado_em', null).maybeSingle()
  if (error) return respErroDb(error, 'exportar.get')
  if (!data) return resp404()

  try {
    let bytes: Uint8Array | Buffer
    if (data.tipo_pagina === 'folha_livre') {
      if (formato !== 'pdf') return resp400('Folha livre só pode ser exportada em PDF.')
      const v = validarFolha(data.tinta)
      if (!v.ok) return erro(422, 'folha_invalida', 'A folha desta página não pôde ser lida.')
      bytes = await gerarPdfFolha(data.titulo, v.folha)
    } else {
      const blocos = docParaBlocos(data.doc)
      bytes = formato === 'pdf' ? await gerarPdfDoc(data.titulo, blocos) : await gerarDocx(data.titulo, blocos)
    }
    if (bytes.byteLength > LIMITES_EXPORT.bytesMax) return erro(413, 'arquivo_grande', 'Página grande demais para exportar.')
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': MIME_EXPORT[formato],
        'Content-Disposition': contentDisposition(data.titulo, formato),
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    if (e instanceof ExportLimite) return erro(413, 'arquivo_grande', e.message)
    console.error('[notebook] exportar:', (e as Error)?.message)
    return erro(500, 'erro_interno', 'Não foi possível gerar o arquivo. Tente novamente.')
  }
}
