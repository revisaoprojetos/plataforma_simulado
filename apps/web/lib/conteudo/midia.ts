import 'server-only'

// MÍDIA / OFFICE da Biblioteca (Fase 1 — só INGESTÃO). Habilita PPTX, XLSX, vídeo e áudio: guarda o
// ORIGINAL no storage e registra documento/versão com o tipo correto. O pipeline de TRECHOS/html_rico
// é TEXTUAL (docx/pdf/html) — aqui NÃO forçamos mídia nele:
//   • PPTX/XLSX: extração LEVE de texto (libs já presentes: pizzip/exceljs) só p/ índice de busca; se
//     vier vazia (ou .ppt/.xls binário antigo), devolve um HTML-marcador SEM trechos.
//   • Vídeo/áudio: sem texto → HTML-marcador (0 trechos).
// O HTML-marcador é um COMENTÁRIO: `extrairTrechosHtml`/`injetarUidsNoHtml` removem comentários → 0
// trechos, mas `.trim()` é não-vazio (passa o gate do importador). html_rico já está desativado na
// reconciliação, então mídia nasce naturalmente com html_rico vazio.
// Server-only (imports dinâmicos das libs pesadas só quando há PPTX/XLSX).

import { sniffMime, type ValidateOptions } from '@/lib/storage/validate'

export type KindMidia = 'pptx' | 'xlsx' | 'video' | 'audio'

/** É um tipo de MÍDIA/OFFICE (fora do pipeline textual docx/pdf/html)? */
export function ehMidia(tipo: string): tipo is KindMidia {
  return tipo === 'pptx' || tipo === 'xlsx' || tipo === 'video' || tipo === 'audio'
}

// content-type por extensão REAL do arquivo (preserva webm/mov/ogg… ao servir depois).
const CT_POR_EXT: Record<string, string> = {
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg',
}
const CT_PADRAO: Record<KindMidia, string> = {
  pptx: CT_POR_EXT.pptx, xlsx: CT_POR_EXT.xlsx, video: 'video/mp4', audio: 'audio/mpeg',
}
const EXT_PADRAO: Record<KindMidia, string> = { pptx: 'pptx', xlsx: 'xlsx', video: 'mp4', audio: 'mp3' }

/** Extensão (sem ponto) do nome do arquivo, minúscula. '' se não houver. */
export function extDe(nome: string): string {
  const m = /\.([a-z0-9]+)\s*$/i.exec((nome || '').toLowerCase())
  return m ? m[1] : ''
}

/** Extensão a usar no storage + content-type REAL (do nome; fallback por kind). */
export function arquivoMidia(kind: KindMidia, nome: string): { ext: string; contentType: string } {
  const ext = extDe(nome) || EXT_PADRAO[kind]
  const contentType = CT_POR_EXT[ext] || CT_PADRAO[kind]
  return { ext, contentType }
}

const MB = 1024 * 1024
const LIMITE_BYTES: Record<KindMidia, number> = {
  pptx: 50 * MB, xlsx: 50 * MB, video: 2048 * MB, audio: 200 * MB,
}

/**
 * Opções de validação (tamanho + MIME compatível com a assinatura) p/ um arquivo de mídia/office.
 * - PPTX/XLSX modernos são ZIP (magic PK..) → o sniffer detecta 'application/zip'; validamos com esse
 *   mime (como o .docx) e guardamos com o content-type real do office.
 * - .ppt/.xls antigos (OLE) e vídeo/áudio não têm assinatura no sniffer → vale o declarado (só tamanho).
 *   Guard anti-spoof leve: se a assinatura detectada for de OUTRO formato conhecido (img/pdf/zip posando
 *   de vídeo/áudio), rejeita.
 * Devolve o `declaredMime` a passar p/ validateFile + o content-type a gravar no storage.
 */
export function validacaoMidia(kind: KindMidia, data: Buffer, nome: string): {
  declaredMime: string; contentType: string; opts: ValidateOptions; erro?: string
} {
  const { contentType } = arquivoMidia(kind, nome)
  const maxBytes = LIMITE_BYTES[kind]
  const detectado = sniffMime(data) // 'application/zip' p/ xlsx/pptx; null p/ ppt/xls/video/audio

  if (kind === 'pptx' || kind === 'xlsx') {
    if (detectado === 'application/zip') {
      return { declaredMime: 'application/zip', contentType, opts: { permitidos: ['application/zip', contentType], maxBytes } }
    }
    // .ppt/.xls binário (OLE) — sem assinatura conhecida: aceita pelo declarado.
    if (detectado && detectado !== contentType) {
      return { declaredMime: contentType, contentType, opts: { permitidos: [contentType], maxBytes }, erro: 'O conteúdo do arquivo não corresponde a uma apresentação/planilha.' }
    }
    return { declaredMime: contentType, contentType, opts: { permitidos: [contentType], maxBytes } }
  }

  // vídeo / áudio: sem assinatura no sniffer → só tamanho; rejeita se a assinatura for de outro formato.
  if (detectado && detectado !== contentType) {
    return { declaredMime: contentType, contentType, opts: { permitidos: [contentType], maxBytes }, erro: 'O conteúdo do arquivo não corresponde a um vídeo/áudio.' }
  }
  return { declaredMime: contentType, contentType, opts: { permitidos: [contentType], maxBytes } }
}

/** HTML-marcador (comentário) — não-vazio p/ o gate do importador, 0 trechos na extração. */
export function htmlMarcadorMidia(kind: KindMidia): string {
  return `<!-- conteudo:${kind} (midia/office) — sem extracao textual de trechos -->`
}

/**
 * Extração LEVE de texto de PPTX/XLSX (só índice de busca). Trivial com as libs já presentes
 * (pizzip/exceljs). Devolve HTML (um <p> por slide/linha) ou '' quando não dá (ppt/xls binário, vazio,
 * erro). O chamador cai no html-marcador quando vier ''. NÃO é o visualizador do aluno (fase posterior).
 */
export async function extrairTextoOffice(kind: 'pptx' | 'xlsx', data: Buffer, nome: string): Promise<string> {
  const ext = extDe(nome)
  try {
    if (kind === 'pptx') {
      if (ext && ext !== 'pptx') return '' // .ppt binário antigo: sem extração trivial
      const PizZip = (await import('pizzip')).default as any
      const zip = new PizZip(data)
      const nomes = Object.keys(zip.files || {})
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
        .sort((a, b) => (parseInt(a.replace(/\D+/g, ''), 10) || 0) - (parseInt(b.replace(/\D+/g, ''), 10) || 0))
      const paras: string[] = []
      for (const n of nomes) {
        const xml = zip.file(n)?.asText?.() as string | undefined
        if (!xml) continue
        const textos = (xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [])
          .map((t) => t.replace(/<[^>]+>/g, '')).join(' ').replace(/\s+/g, ' ').trim()
        if (textos) paras.push(textos)
      }
      return paras.map((p) => `<p>${escaparHtml(p)}</p>`).join('\n')
    }
    // xlsx
    if (ext && ext !== 'xlsx') return '' // .xls binário antigo: sem extração trivial
    const ExcelJS = (await import('exceljs')).default as any
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(data)
    const paras: string[] = []
    wb.eachSheet((ws: any) => {
      const linhas: string[] = []
      ws.eachRow({ includeEmpty: false }, (row: any) => {
        const vals = (row.values as any[]) || []
        const cels = vals.map((v) => celToText(v)).filter(Boolean)
        if (cels.length) linhas.push(cels.join(' | '))
      })
      const corpo = linhas.join(' ').replace(/\s+/g, ' ').trim()
      if (corpo) paras.push(`${ws.name ? escaparHtml(String(ws.name)) + ': ' : ''}${escaparHtml(linhas.join(' '))}`)
    })
    return paras.map((p) => `<p>${p}</p>`).join('\n')
  } catch {
    return ''
  }
}

function celToText(v: any): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    if ('text' in v && v.text != null) return String(v.text)
    if ('result' in v && v.result != null) return String(v.result)
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join('')
    if ('hyperlink' in v && v.text != null) return String(v.text)
    return ''
  }
  return String(v)
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
