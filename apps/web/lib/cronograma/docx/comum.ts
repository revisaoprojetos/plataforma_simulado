import 'server-only'

/**
 * Utilitários compartilhados pelos dois DOCX do cronograma.
 *
 * Segue o padrão de `lib/caderno-teste/exportar-docx.ts` (hx, sz, celula, tabela), com
 * três coisas que não existiam no repositório:
 *  · A4 PAISAGEM;
 *  · imagens de capa/cabeçalho/rodapé lidas de `public/cronograma`;
 *  · hyperlink com estilo — sem declarar o character style "Hyperlink" no Document, o
 *    link funciona mas sai preto e sem sublinhado, ou seja, não parece link.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import {
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  ImageRun,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  type IParagraphOptions,
} from 'docx'

/** '#rrggbb' → 'RRGGBB', que é o que a lib docx aceita. */
export const hx = (c?: string) => {
  const h = (c || '').replace('#', '')
  return /^[0-9a-fA-F]{6}$/.test(h) ? h.toUpperCase() : '000000'
}

/** px → half-points, a unidade que o Word entende. */
export const sz = (px: number) => Math.max(8, Math.round(px * 1.5))

export const BRANCO = 'FFFFFF'

const semBorda = (cor = BRANCO) => ({ style: BorderStyle.NONE, size: 0, color: cor })
export const SEM_BORDA = {
  top: semBorda(),
  bottom: semBorda(),
  left: semBorda(),
  right: semBorda(),
  insideHorizontal: semBorda(),
  insideVertical: semBorda(),
}

const borda = (cor: string) => ({ style: BorderStyle.SINGLE, size: 4, color: cor })
export const COM_BORDA = (cor = 'D4D4D8') => ({
  top: borda(cor),
  bottom: borda(cor),
  left: borda(cor),
  right: borda(cor),
  insideHorizontal: borda(cor),
  insideVertical: borda(cor),
})

export function texto(
  conteudo: string,
  opts: { size?: number; bold?: boolean; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } & IParagraphOptions = {},
): Paragraph {
  const { size = sz(10), bold, color, align, ...resto } = opts
  return new Paragraph({
    alignment: align,
    children: [new TextRun({ text: conteudo, size, bold, color: color ? hx(color) : undefined })],
    ...resto,
  })
}

/** Link clicável e com cara de link — exige o style 'Hyperlink' declarado no Document. */
export function link(rotulo: string, url: string, size = sz(8)): Paragraph {
  return new Paragraph({
    children: [
      new ExternalHyperlink({
        children: [new TextRun({ text: rotulo, size, color: '0563C1', underline: { type: UnderlineType.SINGLE } })],
        link: url,
      }),
    ],
  })
}

export function celula(
  children: Paragraph[],
  opts: { bg?: string; widthPct?: number; colSpan?: number; bordas?: boolean } = {},
): TableCell {
  return new TableCell({
    children: children.length ? children : [new Paragraph('')],
    shading: opts.bg ? { type: ShadingType.CLEAR, color: 'auto', fill: hx(opts.bg) } : undefined,
    width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: opts.colSpan,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: opts.bordas === false ? SEM_BORDA : undefined,
  })
}

export function tabela(rows: TableRow[], opts: { bordas?: string } = {}): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: opts.bordas === undefined ? SEM_BORDA : COM_BORDA(hx(opts.bordas)),
    rows,
  })
}

/** Faixa de largura total, usada nos cabeçalhos de semana. */
export function faixa(conteudo: string, bg: string, opts: { size?: number } = {}): Table {
  return tabela([
    new TableRow({
      children: [celula([texto(conteudo, { size: opts.size ?? sz(11), bold: true, color: '#ffffff' })], { bg, widthPct: 100 })],
    }),
  ])
}

// ─────────────────────────────────────────────────────────────────────────────
// Imagens

const DIR_ARTES = path.join(process.cwd(), 'public', 'cronograma')

/**
 * Lê uma arte de `public/cronograma`. Devolve `null` se o arquivo não existir — o
 * documento sai sem a imagem em vez de a exportação inteira falhar por um asset ausente.
 */
export async function lerArte(arquivo: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(DIR_ARTES, arquivo))
  } catch {
    return null
  }
}

export type Artes = {
  capa: Buffer | null
  capaFicha: Buffer | null
  cabecalho: Buffer | null
  rodape: Buffer | null
}

export async function carregarArtes(): Promise<Artes> {
  const [capa, capaFicha, cabecalho, rodape] = await Promise.all([
    lerArte('cronograma-capa.png'),
    lerArte('ficha-capa.png'),
    lerArte('cronograma-cabecalho.jpg'),
    lerArte('cronograma-rodape.png'),
  ])
  return { capa, capaFicha, cabecalho, rodape }
}

/** Imagem ocupando a largura útil da página (A4 paisagem, margens de 720 twips). */
export function imagem(dados: Buffer, largura: number, altura: number, tipo: 'png' | 'jpg' = 'png'): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [new ImageRun({ data: new Uint8Array(dados), transformation: { width: largura, height: altura }, type: tipo })],
  })
}

/** A4 paisagem: 29,7 × 21 cm. Em twips, 16838 × 11906. */
export const PAGINA_PAISAGEM = {
  size: { width: 16838, height: 11906, orientation: 'landscape' as const },
  margin: { top: 720, bottom: 720, left: 720, right: 720 },
}

/** Estilos do Document — sem o 'Hyperlink' declarado, os links saem sem cara de link. */
export const ESTILOS = {
  characterStyles: [
    {
      id: 'Hyperlink',
      name: 'Hyperlink',
      basedOn: 'DefaultParagraphFont',
      run: { color: '0563C1', underline: { type: UnderlineType.SINGLE } },
    },
  ],
}

/** Nome de arquivo seguro: sem acento e sem caractere que o navegador recuse. */
export function nomeArquivo(base: string): string {
  return base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80)
}
