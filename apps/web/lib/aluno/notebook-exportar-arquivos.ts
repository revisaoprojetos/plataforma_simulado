// Caderno (beta) — geradores de arquivo (fase 4): PDF (pdf-lib) e DOCX (docx) a partir da estrutura de notebook-exportar.ts.
// Sem I/O de banco; sem 'server-only' para ser testável (usado só por route handlers).
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'
import { LineCapStyle, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { rgbDeHex, textoDeCaixa, type CorFolha, type Folha } from '@/lib/aluno/notebook-folha'
import {
  LIMITES_EXPORT, RGB_FOLHA, caixasComTexto, cortarLinha, escalaFolha, layoutLinhas, tokenizar, tracoParaSvgPath, tracosVisiveis,
  type BlocoExp, type Run, type Token,
} from '@/lib/aluno/notebook-exportar'

export class ExportLimite extends Error {}

const A4 = { w: 595.28, h: 841.89, m: 56 }
const CINZA = rgb(0.4, 0.4, 0.45)
const TEXTO = rgb(0.1, 0.1, 0.14)
const LINK = rgb(0.15, 0.39, 0.92)
const FUNDO_CODE = rgb(0.94, 0.94, 0.96)

interface Fontes { reg: PDFFont; b: PDFFont; i: PDFFont; bi: PDFFont; mono: PDFFont }
async function carregarFontes(pdf: PDFDocument): Promise<Fontes> {
  const [reg, b, i, bi, mono] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold), pdf.embedFont(StandardFonts.HelveticaOblique),
    pdf.embedFont(StandardFonts.HelveticaBoldOblique), pdf.embedFont(StandardFonts.Courier),
  ])
  return { reg, b, i, bi, mono }
}
const fonteDe = (f: Fontes, r: Run, negritoBase = false): PDFFont =>
  r.code ? f.mono : (r.b || negritoBase) && r.i ? f.bi : r.b || negritoBase ? f.b : r.i ? f.i : f.reg

/** Troca o que a fonte padrão (WinAnsi) não codifica por '?' (acentos do português são preservados). */
const CONJUNTOS = new WeakMap<PDFFont, Set<number>>()
function conjunto(font: PDFFont): Set<number> {
  let s = CONJUNTOS.get(font)
  if (!s) { s = new Set(font.getCharacterSet()); CONJUNTOS.set(font, s) } // 1 Set por fonte (antes: recriado a cada medição)
  return s
}
function limpar(font: PDFFont, s: string): string {
  const set = conjunto(font)
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number
    out += cp === 160 ? ' ' : set.has(cp) ? ch : '?'
  }
  return out
}

// ================================================================ PDF de texto
export async function gerarPdfDoc(titulo: string, blocos: BlocoExp[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(limpar((await pdf.embedFont(StandardFonts.Helvetica)), titulo).slice(0, 200))
  pdf.setProducer('Plataforma de Simulados')
  const f = await carregarFontes(pdf)
  const largTotal = A4.w - 2 * A4.m
  let page: PDFPage = pdf.addPage([A4.w, A4.h])
  let y = A4.h - A4.m

  const novaPagina = () => {
    if (pdf.getPageCount() >= LIMITES_EXPORT.paginasPdfMax) throw new ExportLimite('Página grande demais para exportar.')
    page = pdf.addPage([A4.w, A4.h]); y = A4.h - A4.m
  }
  const garante = (alt: number) => { if (y - alt < A4.m) novaPagina() }

  /** Desenha runs com quebra de linha; `x0` recuo, `tam` tamanho, `negrito` força negrito (títulos). */
  const paragrafo = (runs: Run[], o: { x0?: number; tam: number; negrito?: boolean; cor?: ReturnType<typeof rgb>; espacoDepois?: number; primeiraLinhaPrefixo?: string }) => {
    const x0 = A4.m + (o.x0 ?? 0)
    const larg = largTotal - (o.x0 ?? 0)
    const lh = o.tam * 1.4
    const tokens = tokenizar(runs)
    const medir = (t: Token) => fonteDe(f, t.run, o.negrito).widthOfTextAtSize(limpar(fonteDe(f, t.run, o.negrito), t.texto), o.tam)
    const linhas = layoutLinhas(tokens, larg, medir)
    let primeira = true
    for (const ln of linhas) {
      garante(lh)
      y -= lh
      if (primeira && o.primeiraLinhaPrefixo) {
        page.drawText(limpar(f.reg, o.primeiraLinhaPrefixo), { x: x0 - f.reg.widthOfTextAtSize(limpar(f.reg, o.primeiraLinhaPrefixo), o.tam) - 4, y, size: o.tam, font: f.reg, color: TEXTO })
      }
      primeira = false
      let x = x0
      for (const tk of ln) {
        const fonte = fonteDe(f, tk.run, o.negrito)
        const txt = limpar(fonte, tk.texto)
        const w = fonte.widthOfTextAtSize(txt, o.tam)
        const cor = tk.run.link ? LINK : (o.cor ?? TEXTO)
        page.drawText(txt, { x, y, size: o.tam, font: fonte, color: cor })
        if (tk.run.u || tk.run.link) page.drawLine({ start: { x, y: y - 1.5 }, end: { x: x + w, y: y - 1.5 }, thickness: 0.6, color: cor })
        if (tk.run.s) page.drawLine({ start: { x, y: y + o.tam * 0.3 }, end: { x: x + w, y: y + o.tam * 0.3 }, thickness: 0.6, color: cor })
        x += w
      }
    }
    y -= o.espacoDepois ?? 4
  }

  paragrafo([{ t: titulo || 'Sem título' }], { tam: 20, negrito: true, espacoDepois: 10 })
  const TAM = { 1: 17, 2: 14.5, 3: 12.5 } as const

  for (const b of blocos) {
    switch (b.k) {
      case 'heading': y -= 6; paragrafo(b.runs, { tam: TAM[b.nivel], negrito: true, espacoDepois: 4 }); break
      case 'p': paragrafo(b.runs, { tam: 11, x0: (b.nivel ?? 0) * 16 }); break
      case 'item': {
        const prefixo = b.tarefa ? (b.tarefa === 'feita' ? '[x]' : '[ ]') : b.ordenado ? `${b.n}.` : '•'
        paragrafo(b.runs, { tam: 11, x0: 18 + b.nivel * 16, primeiraLinhaPrefixo: prefixo, espacoDepois: 2 })
        break
      }
      case 'quote': {
        const y0 = y
        const pg = pdf.getPageCount()
        paragrafo(b.runs, { tam: 11, x0: 14, cor: CINZA })
        if (pdf.getPageCount() === pg) page.drawLine({ start: { x: A4.m + 2, y: y0 }, end: { x: A4.m + 2, y: y + 3 }, thickness: 2, color: CINZA })
        break
      }
      case 'code':
        for (const ln of b.linhas) {
          garante(13)
          y -= 13
          page.drawRectangle({ x: A4.m, y: y - 3, width: largTotal, height: 13, color: FUNDO_CODE })
          let txt = limpar(f.mono, cortarLinha(ln.replace(/\t/g, '    ')))
          if (txt.length > 1 && f.mono.widthOfTextAtSize(txt, 9) > largTotal - 8) { // linha longa é cortada (busca binária, sem laço O(n²))
            let lo = 1, hi = txt.length - 1
            while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (f.mono.widthOfTextAtSize(txt.slice(0, mid), 9) <= largTotal - 8) lo = mid; else hi = mid - 1 }
            txt = txt.slice(0, lo)
          }
          page.drawText(txt, { x: A4.m + 4, y, size: 9, font: f.mono, color: TEXTO })
        }
        y -= 6
        break
      case 'hr': garante(12); y -= 8; page.drawLine({ start: { x: A4.m, y }, end: { x: A4.m + largTotal, y }, thickness: 0.8, color: CINZA }); y -= 6; break
      case 'custom': {
        paragrafo([{ t: `${b.rotulo}: `, b: true }, { t: b.texto, i: true }], { tam: 10.5, x0: 10, espacoDepois: b.fonte ? 0 : 6 })
        if (b.fonte) paragrafo([{ t: b.fonte }], { tam: 9, x0: 10, cor: CINZA, espacoDepois: 6 })
        break
      }
      case 'tabela': {
        const cols = Math.max(1, ...b.linhas.map((l) => l.celulas.length))
        const cw = largTotal / cols
        for (const l of b.linhas) {
          const fonte = l.cabecalho ? f.b : f.reg
          const colunas = Array.from({ length: cols }, (_, c) => layoutLinhas(tokenizar([{ t: l.celulas[c] ?? '' }]), cw - 8, (t) => fonte.widthOfTextAtSize(limpar(fonte, t.texto), 9.5)))
          const nl = Math.max(1, ...colunas.map((c) => c.length))
          const alt = nl * 13 + 6
          garante(alt)
          const topo = y
          for (let c = 0; c < cols; c++) {
            page.drawRectangle({ x: A4.m + c * cw, y: topo - alt, width: cw, height: alt, borderColor: CINZA, borderWidth: 0.5, color: l.cabecalho ? FUNDO_CODE : undefined })
            colunas[c].forEach((ln, i) => page.drawText(limpar(fonte, ln.map((t) => t.texto).join('')), { x: A4.m + c * cw + 4, y: topo - 12 - i * 13, size: 9.5, font: fonte, color: TEXTO }))
          }
          y -= alt
        }
        y -= 6
        break
      }
    }
  }
  return pdf.save()
}

// ================================================================ PDF da folha livre (SVG path dos traços + caixas)
export async function gerarPdfFolha(titulo: string, folha: Folha): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setProducer('Plataforma de Simulados')
  const f = await carregarFontes(pdf)
  pdf.setTitle(limpar(f.reg, titulo).slice(0, 200))
  const s = escalaFolha(folha.largura, folha.altura)
  const W = folha.largura * s, H = folha.altura * s
  const page = pdf.addPage([W, H])

  for (const c of caixasComTexto(folha)) {
    const x = c.x * s, w = c.w * s, h = c.h * s, topo = H - c.y * s
    page.drawRectangle({ x, y: topo - h, width: w, height: h, borderColor: CINZA, borderWidth: 0.4 })
    const tam = Math.max(6, 14 * s)
    const linhas = layoutLinhas(tokenizar([{ t: textoDeCaixa(c) }]), Math.max(10, w - 6), (t) => f.reg.widthOfTextAtSize(limpar(f.reg, t.texto), tam))
    const max = Math.max(1, Math.floor((h - 4) / (tam * 1.3)))
    linhas.slice(0, max).forEach((ln, i) => page.drawText(limpar(f.reg, ln.map((t) => t.texto).join('')), { x: x + 3, y: topo - tam - i * tam * 1.3 - 1, size: tam, font: f.reg, color: TEXTO }))
  }
  for (const t of tracosVisiveis(folha)) {
    const d = tracoParaSvgPath(t.pontos)
    if (!d) continue
    const [r, g, b] = rgbDeHex(t.cor) ?? RGB_FOLHA[t.cor as CorFolha] ?? RGB_FOLHA.tinta
    const marca = t.ferramenta === 'marca-texto'
    page.drawSvgPath(d, {
      x: 0, y: H, scale: s, borderColor: rgb(r, g, b), borderWidth: Math.max(0.3, t.largura * s),
      borderOpacity: marca ? 0.35 : 1, borderLineCap: LineCapStyle.Round,
    })
  }
  return pdf.save()
}

// ================================================================ DOCX
/** Remove o que o XML 1.0 proíbe (controles C0 exceto \t \n \r, U+FFFE/FFFF e substitutos soltos) — senão o Word acusa arquivo corrompido. */
const XML_ILEGAL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g
export const xmlSeguro = (s: string): string => String(s ?? '').replace(XML_ILEGAL, '')

function runsDocx(runs: Run[], extra: { bold?: boolean; size?: number } = {}) {
  const out: (TextRun | ExternalHyperlink)[] = []
  for (const r of runs) {
    const partes = xmlSeguro(r.t).replace(/\r/g, '').split('\n')
    partes.forEach((p, idx) => {
      const tr = new TextRun({
        text: p, bold: r.b || extra.bold, italics: r.i, underline: r.u || r.link ? {} : undefined, strike: r.s,
        font: r.code ? 'Courier New' : undefined, size: extra.size, color: r.link ? '2563EB' : undefined, break: idx > 0 ? 1 : undefined,
      })
      out.push(r.link ? new ExternalHyperlink({ link: r.link, children: [tr] }) : tr)
    })
  }
  return out
}

export async function gerarDocx(titulo: string, blocos: BlocoExp[]): Promise<Buffer> {
  titulo = xmlSeguro(titulo)
  const filhos: (Paragraph | Table)[] = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: titulo || 'Sem título' })] })]
  const NIVEL = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 } as const
  for (const b of blocos) {
    switch (b.k) {
      case 'heading': filhos.push(new Paragraph({ heading: NIVEL[b.nivel], children: runsDocx(b.runs) })); break
      case 'p': filhos.push(new Paragraph({ children: runsDocx(b.runs), indent: b.nivel ? { left: 360 * b.nivel } : undefined })); break
      case 'item': {
        const prefixo = b.tarefa ? (b.tarefa === 'feita' ? '[x] ' : '[ ] ') : b.ordenado ? `${b.n}. ` : '• '
        filhos.push(new Paragraph({ indent: { left: 360 * (b.nivel + 1), hanging: 280 }, children: [new TextRun({ text: prefixo }), ...runsDocx(b.runs)] }))
        break
      }
      case 'quote':
        filhos.push(new Paragraph({ indent: { left: 360 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: '9CA3AF', space: 8 } }, children: runsDocx(b.runs.map((r) => ({ ...r, i: true }))) }))
        break
      case 'code':
        for (const ln of b.linhas) filhos.push(new Paragraph({ shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' }, children: [new TextRun({ text: xmlSeguro(cortarLinha(ln)).replace(/\t/g, '    '), font: 'Courier New', size: 19 })] }))
        break
      case 'hr': filhos.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '9CA3AF', space: 1 } }, children: [] })); break
      case 'custom':
        filhos.push(new Paragraph({
          indent: { left: 240 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: '7C3AED', space: 8 } },
          children: [new TextRun({ text: `${xmlSeguro(b.rotulo)}: `, bold: true }), new TextRun({ text: xmlSeguro(b.texto), italics: true }), ...(b.fonte ? [new TextRun({ text: `  (${xmlSeguro(b.fonte)})`, color: '6B7280', size: 18 })] : [])],
        }))
        break
      case 'tabela': {
        const cols = Math.max(1, ...b.linhas.map((l) => l.celulas.length))
        filhos.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: b.linhas.map((l) => new TableRow({
            tableHeader: l.cabecalho,
            children: Array.from({ length: cols }, (_, c) => new TableCell({
              shading: l.cabecalho ? { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' } : undefined,
              children: xmlSeguro(l.celulas[c] ?? '').split('\n').map((t) => new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: t, bold: l.cabecalho })] })),
            })),
          })),
        }))
        filhos.push(new Paragraph({ children: [] }))
        break
      }
    }
  }
  const doc = new Document({ title: titulo || 'Sem título', creator: 'Plataforma de Simulados', sections: [{ children: filhos }] })
  return Packer.toBuffer(doc)
}
