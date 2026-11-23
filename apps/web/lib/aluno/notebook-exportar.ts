// Caderno (beta) — EXPORTAR página (fase 4): conversão PURA doc TipTap -> estrutura simples de blocos, layout de linhas,
// geometria da folha livre e nome de arquivo. Sem I/O, sem pdf-lib/docx (os geradores ficam em notebook-exportar-arquivos.ts).
import { caixaTemConteudo, type CorFolha, type Folha } from '@/lib/aluno/notebook-folha'

export const LIMITES_EXPORT = {
  blocosMax: 5000,
  paginasPdfMax: 300,
  bytesMax: 20 * 1024 * 1024,
  nomeMax: 80,
  pontosPorTracoPdf: 2000,
  pdfPontoMax: 14000, // pdf-lib/Acrobat: página até 14400 pt
  tokenMax: 500,      // palavra/linha de código maior que isso é QUEBRADA em pedaços/cortada ANTES do layout (anti-DoS)
  linhaCodeMax: 500,
  linhasMax: 20000,   // teto de linhas por layout (300 páginas × ~60 linhas já é o limite do PDF)
  celulaMax: 5000,    // caracteres por célula de tabela
} as const

/** Parte `s` em pedaços de até `n` caracteres (por code points, nunca no meio de um par substituto). */
export function partirTexto(s: string, n: number): string[] {
  if (s.length <= n) return [s]
  const out: string[] = []
  let i = 0
  while (i < s.length) {
    let j = Math.min(i + n, s.length)
    if (j < s.length && s.charCodeAt(j - 1) >= 0xd800 && s.charCodeAt(j - 1) <= 0xdbff) j--
    out.push(s.slice(i, j))
    i = j
  }
  return out
}

/** Corta a linha em `max` caracteres com reticências. */
export const cortarLinha = (s: string, max: number = LIMITES_EXPORT.linhaCodeMax): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

export type FormatoExport = 'pdf' | 'docx'
export const parseFormato = (v: string | null): FormatoExport | null => (v === 'pdf' || v === 'docx' ? v : null)
export const MIME_EXPORT: Record<FormatoExport, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

// ---------------------------------------------------------------- estrutura
export interface Run { t: string; b?: boolean; i?: boolean; u?: boolean; s?: boolean; code?: boolean; link?: string }
export type BlocoExp =
  | { k: 'heading'; nivel: 1 | 2 | 3; runs: Run[] }
  | { k: 'p'; runs: Run[]; nivel?: number }
  | { k: 'item'; ordenado: boolean; n: number; nivel: number; tarefa?: 'feita' | 'aberta'; runs: Run[] }
  | { k: 'quote'; runs: Run[] }
  | { k: 'code'; linhas: string[] }
  | { k: 'tabela'; linhas: { cabecalho: boolean; celulas: string[] }[] }
  | { k: 'hr' }
  | { k: 'custom'; rotulo: string; texto: string; fonte?: string }

const eh = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

function runsDe(no: any, out: Run[] = [], prof = 0): Run[] {
  if (!eh(no) || prof > 30) return out
  if (no.type === 'text' && typeof no.text === 'string') {
    const r: Run = { t: no.text }
    for (const m of Array.isArray(no.marks) ? no.marks : []) {
      if (m?.type === 'bold') r.b = true
      else if (m?.type === 'italic') r.i = true
      else if (m?.type === 'underline') r.u = true
      else if (m?.type === 'strike') r.s = true
      else if (m?.type === 'code') r.code = true
      else if (m?.type === 'link' && typeof m.attrs?.href === 'string') r.link = m.attrs.href
    }
    out.push(r)
  } else if (no.type === 'hardBreak') out.push({ t: '\n' })
  else if (Array.isArray(no.content)) for (const c of no.content) runsDe(c, out, prof + 1)
  return out
}

export const textoDeRuns = (runs: Run[]): string => runs.map((r) => r.t).join('')

function customDe(no: any): BlocoExp | null {
  const at = eh(no.attrs) ? no.attrs : {}
  if (no.type === 'grifoSnapshot') {
    const fonte = [typeof at.documento_titulo === 'string' ? at.documento_titulo : '', typeof at.pagina === 'number' ? `p. ${at.pagina + 1}` : '']
      .filter(Boolean).join(' - ')
    return { k: 'custom', rotulo: 'Grifo', texto: typeof at.texto === 'string' ? at.texto : '', fonte: fonte || undefined }
  }
  if (no.type === 'anotacaoRef') return { k: 'custom', rotulo: 'Anotação', texto: typeof at.texto === 'string' ? at.texto : '' }
  if (no.type === 'questaoRef') return { k: 'custom', rotulo: 'Questão', texto: 'Questão vinculada (disponível no caderno online).' }
  return null
}

/** Converte o doc em lista PLANA de blocos (listas aninhadas viram itens com `nivel`). */
export function docParaBlocos(doc: unknown): BlocoExp[] {
  const out: BlocoExp[] = []
  const cheio = () => out.length >= LIMITES_EXPORT.blocosMax

  const lista = (no: any, ordenado: boolean, nivel: number, prof: number) => {
    let n = ordenado && Number.isInteger(no.attrs?.start) ? no.attrs.start : 1
    for (const li of Array.isArray(no.content) ? no.content : []) {
      if (cheio()) return
      const tarefa = li.type === 'taskItem' ? (li.attrs?.checked === true ? 'feita' : 'aberta') : undefined
      let primeiro = true
      for (const f of Array.isArray(li.content) ? li.content : []) {
        if (f.type === 'bulletList' || f.type === 'orderedList' || f.type === 'taskList') lista(f, f.type === 'orderedList', nivel + 1, prof + 1)
        else if (f.type === 'paragraph' && primeiro) {
          out.push({ k: 'item', ordenado, n, nivel, ...(tarefa ? { tarefa } : {}), runs: runsDe(f) })
          primeiro = false
        } else bloco(f, prof + 1, nivel + 1)
      }
      if (primeiro) out.push({ k: 'item', ordenado, n, nivel, ...(tarefa ? { tarefa } : {}), runs: [] })
      n++
    }
  }

  const bloco = (no: any, prof: number, recuo = 0) => {
    if (!eh(no) || prof > 30 || cheio()) return
    switch (no.type) {
      case 'paragraph': out.push({ k: 'p', runs: runsDe(no), ...(recuo ? { nivel: recuo } : {}) }); return
      case 'heading': out.push({ k: 'heading', nivel: ([1, 2, 3].includes(no.attrs?.level) ? no.attrs.level : 3) as 1 | 2 | 3, runs: runsDe(no) }); return
      case 'bulletList': case 'taskList': lista(no, false, recuo, prof); return
      case 'orderedList': lista(no, true, recuo, prof); return
      case 'blockquote':
        for (const c of Array.isArray(no.content) ? no.content : []) {
          if (c.type === 'paragraph') out.push({ k: 'quote', runs: runsDe(c) })
          else bloco(c, prof + 1, recuo)
        }
        return
      case 'codeBlock': out.push({ k: 'code', linhas: textoDeRuns(runsDe(no)).replace(/\r/g, '').split('\n', LIMITES_EXPORT.linhasMax).map((l) => cortarLinha(l)) }); return
      case 'horizontalRule': out.push({ k: 'hr' }); return
      case 'table': {
        const linhas: { cabecalho: boolean; celulas: string[] }[] = []
        for (const tr of Array.isArray(no.content) ? no.content : []) {
          if (tr.type !== 'tableRow') continue
          const cels = Array.isArray(tr.content) ? tr.content : []
          linhas.push({
            cabecalho: cels.length > 0 && cels.every((c: any) => c.type === 'tableHeader'),
            celulas: cels.slice(0, 50).map((c: any) => (Array.isArray(c.content) ? c.content : []).map((p: any) => textoDeRuns(runsDe(p))).join('\n').slice(0, LIMITES_EXPORT.celulaMax)),
          })
        }
        if (linhas.length) out.push({ k: 'tabela', linhas })
        return
      }
      case 'grifoSnapshot': case 'anotacaoRef': case 'questaoRef': { const c = customDe(no); if (c) out.push(c); return }
      case 'doc': for (const c of Array.isArray(no.content) ? no.content : []) bloco(c, prof + 1, recuo); return
      default: if (Array.isArray(no.content)) for (const c of no.content) bloco(c, prof + 1, recuo)
    }
  }
  bloco(doc, 0)
  return out
}

// ---------------------------------------------------------------- nome de arquivo
/** ASCII seguro p/ Content-Disposition (sem acentos, sem separadores/aspas/controles), com extensão. */
export function nomeArquivoSeguro(titulo: string | null | undefined, ext: string): string {
  const base = (titulo ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _.-]+/g, ' ').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim()
    .replace(/^[.\s_-]+|[.\s_-]+$/g, '')
    .slice(0, LIMITES_EXPORT.nomeMax).trim().replace(/ /g, '_')
  return `${base || 'pagina'}.${ext}`
}

/** Content-Disposition com filename ASCII (+ filename* UTF-8 do título original saneado de controles/aspas). */
export function contentDisposition(titulo: string | null | undefined, ext: string): string {
  const ascii = nomeArquivoSeguro(titulo, ext)
  const orig = (titulo ?? '').replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITES_EXPORT.nomeMax)
  if (!orig) return `attachment; filename="${ascii}"`
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(orig)}.${ext}`
}

// ---------------------------------------------------------------- layout de linhas (medir injetado)
export interface Token { texto: string; run: Run }

/** Quebra runs em tokens (palavras e espaços), tratando '\n' como token de quebra. */
export function tokenizar(runs: Run[]): Token[] {
  const out: Token[] = []
  for (const r of runs) {
    const partes = r.t.replace(/\r/g, '').replace(/\t/g, '    ').split(/(\n|[ ]+)/).filter((x) => x !== '')
    for (const p of partes) for (const pedaco of partirTexto(p, LIMITES_EXPORT.tokenMax)) out.push({ texto: pedaco, run: r })
  }
  return out
}

/** Maior prefixo de `t` (>=1 char) que cabe em `largura`, por BUSCA BINÁRIA (O(log n) medições; assume largura monotônica no prefixo). */
export function maiorPrefixo(t: Token, largura: number, medir: (t: Token) => number): number {
  let lo = 1
  let hi = Math.max(1, t.texto.length - 1)
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (medir({ ...t, texto: t.texto.slice(0, mid) }) <= largura) lo = mid
    else hi = mid - 1
  }
  return lo
}

/**
 * Distribui tokens em linhas de até `largura`; palavra maior que a linha é cortada em pedaços (busca binária).
 * Anti-DoS: token > tokenMax é partido ANTES de medir e o total de linhas é limitado a `maxLinhas`.
 */
export function layoutLinhas(tokens: Token[], largura: number, medir: (t: Token) => number, maxLinhas: number = LIMITES_EXPORT.linhasMax): Token[][] {
  const linhas: Token[][] = []
  let atual: Token[] = []
  let w = 0
  const cheio = () => linhas.length >= maxLinhas
  const fecha = () => { while (atual.length && /^ +$/.test(atual[atual.length - 1].texto)) atual.pop(); linhas.push(atual); atual = []; w = 0 }
  for (const tk of tokens) {
    if (cheio()) break
    if (tk.texto === '\n') { fecha(); continue }
    const pedacos = tk.texto.length > LIMITES_EXPORT.tokenMax ? partirTexto(tk.texto, LIMITES_EXPORT.tokenMax).map((x) => ({ ...tk, texto: x })) : [tk]
    for (const p0 of pedacos) {
      if (cheio()) break
      let t = p0
      let tw = medir(t)
      if (/^ +$/.test(t.texto) && atual.length === 0) continue // sem espaço no início da linha
      while (tw > largura && t.texto.length > 1 && !cheio()) { // palavra gigante: corta
        const n = maiorPrefixo(t, largura, medir)
        if (atual.length) fecha()
        atual.push({ ...t, texto: t.texto.slice(0, n) }); fecha()
        t = { ...t, texto: t.texto.slice(n) }; tw = medir(t)
      }
      if (cheio()) break
      if (w + tw > largura && atual.length) { fecha(); if (/^ +$/.test(t.texto)) continue }
      atual.push(t); w += tw
    }
  }
  if (!cheio() && (atual.length || linhas.length === 0)) fecha()
  return linhas
}

// ---------------------------------------------------------------- folha livre (tinta) -> PDF
/** Cores (RGB 0..1) do PDF por NOME da paleta — o arquivo precisa de valor real; o app só persiste o nome. */
export const RGB_FOLHA: Record<CorFolha, [number, number, number]> = {
  tinta: [0.1, 0.1, 0.16], primaria: [0.43, 0.16, 0.85], vermelho: [0.86, 0.15, 0.15], laranja: [0.92, 0.45, 0.05],
  amarelo: [0.98, 0.8, 0.08], verde: [0.09, 0.64, 0.29], azul: [0.15, 0.39, 0.92], rosa: [0.86, 0.15, 0.47],
}
/** px da folha -> pt do PDF (1px = 0,75pt), reduzido se passar do limite do PDF. */
export function escalaFolha(largura: number, altura: number): number {
  return Math.min(0.75, LIMITES_EXPORT.pdfPontoMax / Math.max(largura, altura, 1))
}
/** Path SVG "M x y L ..." (y para baixo, como na folha), com decimação uniforme acima do limite. */
export function tracoParaSvgPath(pontos: [number, number, number][], max: number = LIMITES_EXPORT.pontosPorTracoPdf): string {
  if (pontos.length === 0) return ''
  let pts = pontos
  if (pts.length > max) {
    const passo = (pts.length - 1) / (max - 1)
    pts = Array.from({ length: max }, (_, i) => pontos[Math.round(i * passo)])
  }
  const f = (n: number) => String(Math.round(n * 10) / 10)
  const [x0, y0] = pts[0]
  if (pts.length === 1) return `M ${f(x0)} ${f(y0)} L ${f(x0 + 0.1)} ${f(y0)}`
  return `M ${f(x0)} ${f(y0)} ` + pts.slice(1).map(([x, y]) => `L ${f(x)} ${f(y)}`).join(' ')
}
/** Traços exportáveis (borracha não desenha). */
export const tracosVisiveis = (f: Folha) => f.tracos.filter((t) => t.ferramenta !== 'borracha')
/** Caixas com texto, na ordem de z. */
export const caixasComTexto = (f: Folha) => [...f.caixas].sort((a, b) => a.z - b.z).filter((c) => caixaTemConteudo(c))
