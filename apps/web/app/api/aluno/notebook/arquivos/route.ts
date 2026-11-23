import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { autenticarBeta, limiteEscrita, resp400, resp429 } from '@/lib/aluno/notebook-api'
import { LIMITES, ROTA_ARQUIVOS_NOTEBOOK } from '@/lib/aluno/notebook-tipos'
import { avaliarCota, validarUploadNotebook } from '@/lib/aluno/notebook-texto'
import { tabelaAusente } from '@/lib/aluno/notebook-server'
import { getStorage, sniffMime } from '@/lib/storage'
import { BucketCadernoAusente, bucketArquivosNotebook, caminhoArquivoNotebook } from '@/lib/aluno/notebook-arquivos-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST /api/aluno/notebook/arquivos  (multipart: file, tipo='imagem'|'arquivo')
//   -> 201 {ok, arquivo:{id, ext, url, nome, tamanho, tipo}} | 400/413/415 validação | 503 storage indisponível
// Valida tamanho (5 MB imagem / 10 MB arquivo), extensão e MAGIC BYTES (helper lib/storage/validate). Caminho por tenant/estudante.
export async function POST(request: NextRequest) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  if (!limiteEscrita(`arq:${a.estudanteId}`, 4, 1000)) return resp429()

  // content-length OBRIGATÓRIO e dentro do limite ANTES de bufferizar o corpo (formData() lê tudo em memória).
  const cl = request.headers.get('content-length')
  if (cl === null) return NextResponse.json({ ok: false, code: 'content_length_obrigatorio', message: 'Envio sem tamanho declarado.' }, { status: 411 })
  const tam = Number(cl)
  if (!Number.isFinite(tam) || tam <= 0) return resp400('Content-Length inválido.')
  if (tam > LIMITES.anexoBytesMax + 512 * 1024) return NextResponse.json({ ok: false, code: 'arquivo_grande', message: 'Arquivo acima do limite.' }, { status: 413 })
  let form: FormData
  try { form = await request.formData() } catch { return resp400('Envio inválido.') }
  const file = form.get('file')
  if (!(file instanceof File)) return resp400('Nenhum arquivo enviado.')
  const tipo = form.get('tipo') === 'imagem' ? 'imagem' : 'arquivo'

  const bytes = new Uint8Array(await file.arrayBuffer())
  const v = validarUploadNotebook({ nome: file.name || (tipo === 'imagem' ? 'imagem' : 'arquivo'), mimeDeclarado: (file.type || '').toLowerCase(), bytes, tipo }, sniffMime)
  if (!v.ok) return NextResponse.json({ ok: false, code: 'arquivo_invalido', message: v.erro }, { status: v.status })

  // cota por aluno (tabela opcional): ausente => só vale o limite por requisição. Corrida entre uploads simultâneos pode ultrapassar
  // a cota por poucos itens (aceito; o rate limit de 4/s por aluno limita o estrago).
  const usados = await a.svc.from('simulado_aluno_notebook_arquivos').select('bytes').eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).limit(LIMITES.cotaArquivosQtd + 1)
  if (usados.error && !tabelaAusente(usados.error)) { console.error('[notebook] arquivos.cota:', (usados.error as { code?: string }).code) }
  if (!usados.error) {
    const c = avaliarCota((usados.data ?? []).map((r: any) => ({ bytes: Number(r.bytes) || 0 })), bytes.byteLength)
    if (!c.ok) return NextResponse.json({ ok: false, code: 'cota_excedida', message: c.motivo === 'qtd' ? `Limite de ${LIMITES.cotaArquivosQtd} arquivos atingido.` : 'Cota de armazenamento do caderno atingida.' }, { status: 413 })
  }

  const id = randomUUID()
  const nome = `${id}.${v.ext}`
  try {
    await getStorage().upload({
      bucket: await bucketArquivosNotebook(), path: caminhoArquivoNotebook(a.tenantId, a.estudanteId, nome), data: bytes,
      contentType: v.contentType.split(';')[0], publico: false, cacheControl: '3600',
    })
  } catch (e) {
    console.error('[notebook] arquivos.upload:', (e as Error)?.message)
    const semBucket = e instanceof BucketCadernoAusente
    return NextResponse.json({ ok: false, code: 'storage_indisponivel', message: semBucket ? e.message : 'Armazenamento indisponível no momento. Tente de novo mais tarde.' }, { status: 503 })
  }
  if (!usados.error) { // registro da cota (best-effort)
    const r = await a.svc.from('simulado_aluno_notebook_arquivos').insert({ tenant_id: a.tenantId, estudante_id: a.estudanteId, arquivo: nome, bytes: bytes.byteLength })
    if (r.error) console.error('[notebook] arquivos.registro:', (r.error as { code?: string }).code)
  }
  return NextResponse.json({ ok: true, arquivo: { id, ext: v.ext, arquivo: nome, url: `${ROTA_ARQUIVOS_NOTEBOOK}/${nome}`, nome: v.nomeSeguro, tamanho: bytes.byteLength, tipo } }, { status: 201 })
}
