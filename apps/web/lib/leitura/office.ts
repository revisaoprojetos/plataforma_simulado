import 'server-only'
import { getStorage } from '@/lib/storage'
import { resolverBucketConteudo } from '@/lib/conteudo/ingestao'

// OnlyOffice na Leitura — caminho OPCIONAL/BETA (ligado por tenant em tema.leitura_onlyoffice). NÃO
// substitui o editor atual. É LOSSY (o HTML rico da Leitura — grifos/selos/dispositivos — não sobrevive
// ao docx), então só serve para editar documentos simples e IMPORTAR de volta ao RASCUNHO via mammoth
// (o mesmo caminho auditado de importar Word). O docx fica num caminho determinístico por documento.
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const caminhoOfficeLeitura = (tenantId: string, documentoId: string) => `leitura-office/${tenantId}/${documentoId}.docx`

/** Gera um .docx a partir do HTML do rascunho e guarda no caminho determinístico (upsert). Devolve URL assinada. */
export async function gerarEArmazenarDocx(tenantId: string, documentoId: string, html: string): Promise<string | null> {
  // @ts-ignore html-to-docx não publica tipos
  const mod: any = await import('html-to-docx')
  const HTMLtoDOCX = mod.default || mod
  const out: any = await HTMLtoDOCX(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`, null, { table: { row: { cantSplit: true } } })
  const bytes: Buffer = Buffer.isBuffer(out) ? out : Buffer.from(out?.arrayBuffer ? await out.arrayBuffer() : out)
  const bucket = await resolverBucketConteudo()
  const path = caminhoOfficeLeitura(tenantId, documentoId)
  await getStorage().upload({ bucket, path, data: bytes, contentType: MIME_DOCX, upsert: true })
  try { return await getStorage().getSignedUrl(bucket, path, 3600) } catch { return null }
}

/** Sobrescreve o docx guardado (chamado pelo callback do OnlyOffice ao salvar). */
export async function salvarDocxEditado(tenantId: string, documentoId: string, bytes: Buffer): Promise<void> {
  const bucket = await resolverBucketConteudo()
  await getStorage().upload({ bucket, path: caminhoOfficeLeitura(tenantId, documentoId), data: bytes, contentType: MIME_DOCX, upsert: true })
}

/** Baixa o docx guardado (para importar de volta via mammoth). */
export async function baixarDocxLeitura(tenantId: string, documentoId: string): Promise<Buffer | null> {
  const bucket = await resolverBucketConteudo()
  try {
    const url = await getStorage().getSignedUrl(bucket, caminhoOfficeLeitura(tenantId, documentoId), 600)
    const r = await fetch(url)
    if (!r.ok) return null
    return Buffer.from(await r.arrayBuffer())
  } catch { return null }
}
