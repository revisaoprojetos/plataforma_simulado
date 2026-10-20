import 'server-only'
import mammoth from 'mammoth'
import { createHash } from 'node:crypto'
import { uploadArquivo, getStorage, PRESETS, validateFile } from '@/lib/storage'
import { createAdminClient } from '@/lib/supabase/server'
import { extrairTextoPdf } from '@/lib/ia/pdf-texto'

// INGESTÃO (Fase 1/2) — recebe o arquivo original, guarda no storage (fonte de edição — N8) e CONVERTE
// para HTML, que o parser de trechos (trechos.ts) estrutura. docx via mammoth (mesmo styleMap da
// Leitura), pdf via camada de texto (pdfjs) embrulhada em <p>, html direto. Server-only.

export type TipoOrigem = 'docx' | 'pdf' | 'html'
// Bucket do storage p/ os originais. CONFIGURÁVEL por env (STORAGE_CONTENT_BUCKET) e com AUTO-RESOLUÇÃO:
// usa o preferido se existir, senão cai no 1º bucket existente da lista (ex.: 'pdfs') — assim o teste
// não trava se o bucket dedicado ainda não foi criado. Resolvido 1x por processo (cache).
export const BUCKET_CONTEUDO = process.env.STORAGE_CONTENT_BUCKET || 'conteudos'
let _bucketCache: string | null = null
export async function resolverBucketConteudo(): Promise<string> {
  if (_bucketCache) return _bucketCache
  const preferidos = [process.env.STORAGE_CONTENT_BUCKET, 'conteudos', 'pdfs', 'discursivas'].filter(Boolean) as string[]
  try {
    // só o provider supabase expõe listBuckets; nos demais, usa o preferido direto.
    const svc = createAdminClient()
    const { data } = await svc.storage.listBuckets()
    if (data && data.length) {
      const existentes = new Set(data.map((b: any) => b.name))
      _bucketCache = preferidos.find((p) => existentes.has(p)) || preferidos[0]
    } else {
      _bucketCache = preferidos[0]
    }
  } catch { _bucketCache = preferidos[0] }
  return _bucketCache
}

const MIME: Record<TipoOrigem, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  html: 'text/html',
}

/** Detecta o tipo pela extensão/mime declarado. */
export function tipoDoArquivo(nome: string, mime?: string): TipoOrigem | null {
  const n = (nome || '').toLowerCase()
  if (n.endsWith('.docx') || /wordprocessingml/.test(mime || '')) return 'docx'
  if (n.endsWith('.pdf') || /pdf/.test(mime || '')) return 'pdf'
  if (n.endsWith('.html') || n.endsWith('.htm') || /html/.test(mime || '')) return 'html'
  return null
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Converte os bytes do arquivo em HTML estruturável. */
export async function converterParaHtml(data: Buffer, tipo: TipoOrigem): Promise<{ html: string; erro?: string }> {
  try {
    if (tipo === 'docx') {
      const r = await mammoth.convertToHtml({ buffer: data }, { styleMap: ['u => u', 'strike => s'] } as any)
      return { html: r.value || '' }
    }
    if (tipo === 'pdf') {
      const texto = await extrairTextoPdf(data, 60)
      if (!texto.trim()) return { html: '', erro: 'PDF sem camada de texto (provável digitalização). Converta para docx ou use OCR.' }
      const html = texto.split(/\n{2,}|\n──────────\n/).map((p) => p.trim()).filter(Boolean)
        .map((p) => `<p>${escaparHtml(p).replace(/\n/g, ' ')}</p>`).join('\n')
      return { html }
    }
    // html
    return { html: data.toString('utf8') }
  } catch (e) {
    return { html: '', erro: (e as any)?.message || 'Falha na conversão.' }
  }
}

/** URL assinada (temporária) do original — usada como document.url do OnlyOffice. */
export async function urlAssinadaOriginal(arquivoKey: string, segundos = 3600): Promise<string | null> {
  try { return await getStorage().getSignedUrl(await resolverBucketConteudo(), arquivoKey, segundos) } catch { return null }
}

/** Baixa os bytes do original (via URL assinada) — para copiar numa nova versão (rascunho de edição). */
export async function baixarOriginal(arquivoKey: string): Promise<Buffer | null> {
  const url = await urlAssinadaOriginal(arquivoKey, 600)
  if (!url) return null
  try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()) } catch { return null }
}

/** Sobe o arquivo original ao storage e devolve a chave (arquivo_key da versão). */
export async function guardarOriginal(input: {
  tenantId: string; documentoId: string; numeroVersao: number; tipo: TipoOrigem; data: Buffer; nome: string; criadoPor?: string | null
}): Promise<{ arquivoKey: string; hash: string } | { erro: string }> {
  const ext = input.tipo
  const path = `conteudo/${input.tenantId}/${input.documentoId}/v${input.numeroVersao}-${Date.now()}.${ext}`
  const preset = input.tipo === 'docx' ? PRESETS.docx : input.tipo === 'pdf' ? PRESETS.documento : PRESETS.html
  // IMPORTANTE: .docx é um ZIP (magic bytes PK..) → o validador detecta 'application/zip'. Validamos
  // passando o mime COMPATÍVEL com a assinatura (senão o anti-spoof rejeita), mas guardamos no storage
  // com o content-type REAL do docx (para o OnlyOffice servir certo).
  const mimeValidacao = input.tipo === 'docx' ? 'application/zip' : input.tipo === 'pdf' ? 'application/pdf' : 'text/html'
  const v = validateFile(input.data, mimeValidacao, preset)
  if (!v.ok) return { erro: v.error || 'Arquivo inválido.' }
  const up = await uploadArquivo({
    tenantId: input.tenantId, bucket: await resolverBucketConteudo(), path, data: input.data, contentType: MIME[input.tipo],
    nome: input.nome, publico: false, criadoPor: input.criadoPor ?? null,
  })
  if (!up.ok) return { erro: up.error || 'Falha ao guardar o arquivo.' }
  const hash = createHash('sha1').update(input.data).digest('hex')
  return { arquivoKey: up.upload?.path || path, hash }
}
