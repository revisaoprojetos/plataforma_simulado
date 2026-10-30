import 'server-only'
import mammoth from 'mammoth'
import { createHash } from 'node:crypto'
import { uploadArquivo, getStorage, PRESETS, validateFile } from '@/lib/storage'
import { createAdminClient } from '@/lib/supabase/server'
import { extrairTextoPdf } from '@/lib/ia/pdf-texto'
import { kindPorArquivo } from '@/lib/biblioteca/tipos-conteudo'
import { ehMidia, arquivoMidia, validacaoMidia, htmlMarcadorMidia, extrairTextoOffice, type KindMidia } from './midia'

// INGESTÃO (Fase 1/2) — recebe o arquivo original, guarda no storage (fonte de edição — N8) e CONVERTE
// para HTML, que o parser de trechos (trechos.ts) estrutura. docx via mammoth (mesmo styleMap da
// Leitura), pdf via camada de texto (pdfjs) embrulhada em <p>, html direto. Server-only.
//
// TIPOS NOVOS (Fase 1 — só ingestão): pptx/xlsx/video/audio são ACEITOS — guardamos o original e
// registramos documento/versão com o tipo correto. O pipeline textual de trechos NÃO vale p/ mídia:
// `converterParaHtml` devolve, p/ esses tipos, um HTML-marcador (0 trechos) — ou, p/ pptx/xlsx, um
// índice de busca leve quando a extração é trivial (ver ./midia). Visualizadores do aluno = fase posterior.

// 'html' é interno da ingestão (vira documento docx no modelo de tipos); os demais casam com KindConteudo.
export type TipoOrigem = 'docx' | 'pdf' | 'html' | KindMidia
// Bucket do storage p/ os originais. CONFIGURÁVEL por env (STORAGE_CONTENT_BUCKET) e com AUTO-RESOLUÇÃO:
// usa o preferido se existir, senão cai no 1º bucket existente da lista (ex.: 'pdfs') — assim o teste
// não trava se o bucket dedicado ainda não foi criado. Resolvido 1x por processo (cache).
export const BUCKET_CONTEUDO = process.env.STORAGE_CONTENT_BUCKET || 'conteudos'
let _bucketCache: string | null = null
export async function resolverBucketConteudo(): Promise<string> {
  if (_bucketCache) return _bucketCache
  const preferidos = [process.env.STORAGE_CONTENT_BUCKET, 'conteudos', 'pdfs', 'discursivas'].filter(Boolean) as string[]
  // Só o provider Supabase expõe listBuckets (auto-resolução p/ não travar se o bucket dedicado ainda
  // não existe). Nos demais (S3/Hetzner/GCS) os buckets são pré-criados → usa o preferido/ env direto.
  if ((process.env.STORAGE_PROVIDER ?? 'supabase') !== 'supabase') {
    _bucketCache = preferidos[0]
    return _bucketCache
  }
  try {
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

const MIME_TEXTUAL: Record<'docx' | 'pdf' | 'html', string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  html: 'text/html',
}

/** Detecta o tipo pela extensão/mime declarado. docx/pdf/html primeiro (preserva 'html' distinto do
 *  mapeamento docx de kindPorArquivo); depois os tipos de mídia/office (pptx/xlsx/video/audio). */
export function tipoDoArquivo(nome: string, mime?: string): TipoOrigem | null {
  const n = (nome || '').toLowerCase()
  if (n.endsWith('.docx') || /wordprocessingml/.test(mime || '')) return 'docx'
  if (n.endsWith('.pdf') || /pdf/.test(mime || '')) return 'pdf'
  if (n.endsWith('.html') || n.endsWith('.htm') || /html/.test(mime || '')) return 'html'
  const k = kindPorArquivo(nome, mime)
  if (k === 'pptx' || k === 'xlsx' || k === 'video' || k === 'audio') return k
  return null
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Remove do HTML do LEITOR as imagens embutidas GRANDES (base64). O mammoth inlina toda imagem como
// data URI; materiais escaneados trazem imagens de vários MB → HTML gigante que (a) estoura o parser de
// trechos e (b) detonaria o egress se guardado em html_rico (plataforma sem CDN). Removemos só as GRANDES
// (tag > ~250k chars ≈ 180KB de imagem); as pequenas (diagramas) ficam. O .docx ORIGINAL no storage
// mantém TODAS as imagens (download intacto). `data:` não contém '>', então `[^>]*` cobre a URI inteira.
const LIMITE_IMG_LEITOR = 250_000
function removerImagensGrandes(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => (tag.length > LIMITE_IMG_LEITOR ? '' : tag))
}

/** Converte os bytes do arquivo em HTML estruturável. Para MÍDIA/OFFICE não força o pipeline textual:
 *  pptx/xlsx tentam um índice de busca leve e, se vazio, caem no HTML-marcador; vídeo/áudio = marcador
 *  direto. O marcador é um comentário → 0 trechos, mas .trim() não-vazio (passa o gate do importador). */
export async function converterParaHtml(data: Buffer, tipo: TipoOrigem): Promise<{ html: string; erro?: string }> {
  try {
    if (ehMidia(tipo)) {
      if (tipo === 'pptx' || tipo === 'xlsx') {
        const indice = await extrairTextoOffice(tipo, data, `.${tipo}`)
        return { html: indice.trim() ? indice : htmlMarcadorMidia(tipo) }
      }
      // vídeo/áudio: sem texto. TODO(fase posterior): transcrição/legenda como índice de busca.
      return { html: htmlMarcadorMidia(tipo) }
    }
    if (tipo === 'docx') {
      // Mapeia os estilos de TÍTULO em português ("Título 1/2/3") para h1/h2/h3 — o mammoth já mapeia os
      // ingleses ("Heading N") por padrão, mas não os PT. Assim o html_rico/trechos ganham hierarquia real
      // (e o sumário por títulos do leitor fica melhor). styleMap custom é ADITIVO ao default do mammoth.
      const r = await mammoth.convertToHtml({ buffer: data }, {
        styleMap: [
          'u => u', 'strike => s',
          "p[style-name='Título 1'] => h1:fresh", "p[style-name='Titulo 1'] => h1:fresh",
          "p[style-name='Título 2'] => h2:fresh", "p[style-name='Titulo 2'] => h2:fresh",
          "p[style-name='Título 3'] => h3:fresh", "p[style-name='Titulo 3'] => h3:fresh",
          "p[style-name='Título 4'] => h4:fresh", "p[style-name='Titulo 4'] => h4:fresh",
          "p[style-name='Título'] => h1:fresh", "p[style-name='Titulo'] => h1:fresh",
        ],
      } as any)
      return { html: removerImagensGrandes(r.value || '') }
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
  // MÍDIA/OFFICE (pptx/xlsx/video/audio): extensão + content-type REAL (do nome) e validação própria
  // (ver ./midia). Guarda o original; os visualizadores do aluno vêm em fase posterior.
  let ext: string
  let contentType: string
  if (ehMidia(input.tipo)) {
    const mid = arquivoMidia(input.tipo as KindMidia, input.nome)
    ext = mid.ext
    contentType = mid.contentType
    const vm = validacaoMidia(input.tipo as KindMidia, input.data, input.nome)
    if (vm.erro) return { erro: vm.erro }
    const res = validateFile(input.data, vm.declaredMime, vm.opts)
    if (!res.ok) return { erro: res.error || 'Arquivo inválido.' }
  } else {
    const tipoTxt = input.tipo as 'docx' | 'pdf' | 'html'
    ext = tipoTxt
    contentType = MIME_TEXTUAL[tipoTxt]
    const preset = tipoTxt === 'docx' ? PRESETS.docx : tipoTxt === 'pdf' ? PRESETS.documento : PRESETS.html
    // IMPORTANTE: .docx é um ZIP (magic bytes PK..) → o validador detecta 'application/zip'. Validamos
    // passando o mime COMPATÍVEL com a assinatura (senão o anti-spoof rejeita), mas guardamos no storage
    // com o content-type REAL do docx (para o OnlyOffice servir certo).
    const mimeValidacao = tipoTxt === 'docx' ? 'application/zip' : tipoTxt === 'pdf' ? 'application/pdf' : 'text/html'
    const v = validateFile(input.data, mimeValidacao, preset)
    if (!v.ok) return { erro: v.error || 'Arquivo inválido.' }
  }
  const path = `conteudo/${input.tenantId}/${input.documentoId}/v${input.numeroVersao}-${Date.now()}.${ext}`
  const up = await uploadArquivo({
    tenantId: input.tenantId, bucket: await resolverBucketConteudo(), path, data: input.data, contentType,
    nome: input.nome, publico: false, criadoPor: input.criadoPor ?? null,
  })
  if (!up.ok) return { erro: up.error || 'Falha ao guardar o arquivo.' }
  const hash = createHash('sha1').update(input.data).digest('hex')
  return { arquivoKey: up.upload?.path || path, hash }
}
