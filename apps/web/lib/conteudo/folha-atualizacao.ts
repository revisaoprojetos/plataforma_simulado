/**
 * FOLHA DE ATUALIZAÇÃO — página(s) PDF com a ÚLTIMA atualização de um material, para entrar no download do documento
 * (depois da capa, antes da 1ª folha do documento). PURO (pdf-lib, sem banco/storage): recebe os dados já prontos.
 * Visual = o do ÍNDICE dos documentos: título central em maiúsculas (negrito, índigo), entradas com pontilhado até o valor à
 * direita, sem cabeçalho nem rodapé. Fonte: Carlito (equivalente aberta da Calibri, a fonte dos documentos); se não carregar,
 * cai na Helvetica. Caracteres que a fonte não tem viram "?" (nunca quebra a geração).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { CARLITO_BOLD_B64, CARLITO_ITALIC_B64, CARLITO_REGULAR_B64 } from './fonte-carlito'

export interface ItemFolha { texto: string; tipoNome?: string | null; local?: string | null }
export interface DadosFolhaAtualizacao {
  /** Título do material. */
  material: string
  /** "10/11/2026 14:30" (já com as flags de exibição aplicadas); null = data oculta. */
  tag: string | null
  /** Rótulo exibido (ou null). */
  rotulo: string | null
  /** Tipo por extenso (ex.: "Jurisprudência"). */
  tipoNome: string | null
  /** Resumo da atualização. */
  texto: string
  itens: ItemFolha[]
}

const A4: [number, number] = [595.28, 841.89]
const MAX_PAGINAS = 3
const COR = { titulo: rgb(0.294, 0.263, 0.471), texto: rgb(0, 0, 0), suave: rgb(0.25, 0.25, 0.25) }

type Fontes = { reg: PDFFont; neg: PDFFont; ita: PDFFont }

async function carregarFontes(pdf: PDFDocument): Promise<Fontes> {
  try {
    pdf.registerFontkit(fontkit)
    const b = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'))
    const [reg, neg, ita] = await Promise.all([
      pdf.embedFont(b(CARLITO_REGULAR_B64), { subset: true }),
      pdf.embedFont(b(CARLITO_BOLD_B64), { subset: true }),
      pdf.embedFont(b(CARLITO_ITALIC_B64), { subset: true }),
    ])
    return { reg, neg, ita }
  } catch {
    return { reg: await pdf.embedFont(StandardFonts.Helvetica), neg: await pdf.embedFont(StandardFonts.HelveticaBold), ita: await pdf.embedFont(StandardFonts.HelveticaOblique) }
  }
}

const conjuntos = new WeakMap<PDFFont, Set<number>>()
/** Troca o que a fonte não tem por "?" (e normaliza espaços/hífens "especiais"). */
function seguro(font: PDFFont, s: unknown): string {
  let set = conjuntos.get(font)
  if (!set) { set = new Set(font.getCharacterSet()); conjuntos.set(font, set) }
  const base = String(s ?? '').normalize('NFC').replace(/[   ]/g, ' ').replace(/[‐‑‒]/g, '-').replace(/[​-‏⁠﻿]/g, '').replace(/\r/g, '')
  let out = ''
  for (const ch of base) out += ch === '\n' || ch === ' ' || set.has(ch.codePointAt(0) as number) ? ch : '?'
  return out
}

/** Quebra o texto em linhas que cabem em `max` pontos (respeita \n; palavras gigantes são partidas). */
function quebrar(font: PDFFont, texto: string, size: number, max: number): string[] {
  const linhas: string[] = []
  for (const par of texto.split('\n')) {
    let atual = ''
    for (const palavra of par.split(/\s+/).filter(Boolean)) {
      let p = palavra
      while (font.widthOfTextAtSize(p, size) > max) {
        let n = p.length
        while (n > 1 && font.widthOfTextAtSize(p.slice(0, n), size) > max) n--
        if (atual) { linhas.push(atual); atual = '' }
        linhas.push(p.slice(0, n)); p = p.slice(n)
      }
      const t = atual ? `${atual} ${p}` : p
      if (font.widthOfTextAtSize(t, size) <= max) atual = t
      else { linhas.push(atual); atual = p }
    }
    linhas.push(atual)
  }
  while (linhas.length > 1 && linhas[linhas.length - 1] === '') linhas.pop()
  return linhas
}

/** PDF da folha de atualização (1 a 3 páginas) no tamanho `[w, h]` (padrão A4). */
export async function montarFolhaAtualizacaoPdf(d: DadosFolhaAtualizacao, tamanho: [number, number] = A4): Promise<Uint8Array> {
  const W = tamanho[0] > 50 ? tamanho[0] : A4[0], H = tamanho[1] > 50 ? tamanho[1] : A4[1]
  const pdf = await PDFDocument.create()
  const { reg, neg, ita } = await carregarFontes(pdf)
  // Margens proporcionais às do índice dos documentos (esquerda ~14%, direita ~9,6%, topo ~12%, base ~9%).
  const mL = W * 0.143, mR = W * 0.096, util = W - mL - mR, topo = H * 0.115, fundo = H * 0.09

  let pg!: PDFPage, y = 0
  const paginas: PDFPage[] = []
  const novaPagina = () => { pg = pdf.addPage([W, H]); paginas.push(pg); y = H - topo }
  const cabe = (altura: number) => { if (y - altura < fundo) { if (paginas.length >= MAX_PAGINAS) return false; novaPagina() } return true }
  novaPagina()

  // Título central (como o do índice): maiúsculas, negrito, índigo.
  const TS = 17
  for (const l of quebrar(neg, seguro(neg, (d.material || 'Material').toUpperCase()), TS, util).slice(0, 4)) {
    pg.drawText(l, { x: mL + (util - neg.widthOfTextAtSize(l, TS)) / 2, y: y - TS, size: TS, font: neg, color: COR.titulo })
    y -= TS * 1.25
  }
  y -= 14

  /** Entrada de índice: texto (quebra em linhas) + pontilhado + valor à direita na última linha. */
  const entrada = (texto: string, direita: string | null, o: { font: PDFFont; size: number; recuo?: number; cor?: ReturnType<typeof rgb>; gap?: number }): boolean => {
    const recuo = o.recuo ?? 0
    const dir = direita ? seguro(o.font, direita) : ''
    const wDir = dir ? o.font.widthOfTextAtSize(dir, o.size) : 0
    const linhas = quebrar(o.font, seguro(o.font, texto), o.size, util - recuo - (wDir ? wDir + 10 : 0))
    const lh = o.size * 1.45
    if (!cabe(linhas.length * lh)) return false
    linhas.forEach((l, i) => {
      const ly = y - o.size
      pg.drawText(l, { x: mL + recuo, y: ly, size: o.size, font: o.font, color: o.cor ?? COR.texto })
      if (i === linhas.length - 1 && dir) {
        const x0 = mL + recuo + o.font.widthOfTextAtSize(l, o.size) + 2, x1 = W - mR - wDir - 2
        const ponto = o.font.widthOfTextAtSize('.', o.size)
        const n = Math.floor((x1 - x0) / ponto)
        if (n > 2) pg.drawText('.'.repeat(n), { x: x1 - n * ponto, y: ly, size: o.size, font: o.font, color: o.cor ?? COR.texto })
        pg.drawText(dir, { x: W - mR - wDir, y: ly, size: o.size, font: o.font, color: o.cor ?? COR.texto })
      }
      y -= lh
    })
    y -= o.gap ?? 4
    return true
  }

  // Cabeça: UMA linha — "Data da versão ........ 10/11/2026" (só o dia; sem rótulo/tipo). Data oculta = sem cabeça.
  const dataVersao = d.tag ? d.tag.trim().split(/\s+/)[0] : null
  if (dataVersao) { entrada('Data da versão', dataVersao, { font: neg, size: 13 }); y -= 4 }

  // Resumo = só o texto do relatório (itálico, como os subitens do índice)
  const resumo = (d.texto ?? '').trim()
  if (resumo) {
    for (const par of resumo.split(/\n+/).filter(Boolean)) if (!entrada(par, null, { font: ita, size: 11, gap: 6 })) break
    y -= 6
  }

  // Alterações: cada item vira uma entrada com o local (ou o tipo) à direita
  if (d.itens.length) {
    if (cabe(60)) entrada(`ALTERAÇÕES (${d.itens.length})`, null, { font: neg, size: 13, recuo: util * 0.04, gap: 6 })
    let escritos = 0
    for (const it of d.itens) {
      if (!entrada(it.texto, it.local || it.tipoNome || null, { font: ita, size: 11, gap: 6 })) break
      escritos++
    }
    if (escritos < d.itens.length) entrada(`… e mais ${d.itens.length - escritos} alteração(ões). Consulte o registro completo na plataforma.`, null, { font: reg, size: 10, gap: 0 })
  }

  pdf.setTitle('Folha de atualização')
  return pdf.save()
}
