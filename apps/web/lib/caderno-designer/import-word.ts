import 'server-only'
import mammoth from 'mammoth'
import { parse, type HTMLElement } from 'node-html-parser'
import { genId, RUNNING_PADRAO, type Block, type CadernoDoc } from './types'

/**
 * Conversor de Word (.docx) → documento do caderno (CadernoDoc / blocos).
 *
 * Usa o mammoth para ler o .docx como HTML semântico (títulos, parágrafos, negrito,
 * imagens, listas, tabelas) e mapeia cada elemento para os blocos do editor. Tabelas
 * são "achatadas" — o conteúdo (parágrafos internos) vira blocos editáveis — porque o
 * caderno não tem um bloco de tabela genérico e assim nada de texto se perde.
 *
 * v1: importa a ESTRUTURA e o CONTEÚDO fiéis (o admin refina no editor). O mapeamento
 * fino para os blocos de diagnóstico (diag-pilares/diag-disciplina/condição) é a próxima
 * iteração, calibrada visualmente.
 */

type Align = 'left' | 'center' | 'right' | 'justify'

function bloco(type: string, attributes: Record<string, unknown>, innerBlocks?: Block[]): Block {
  return innerBlocks ? { id: genId('b'), type, attributes, innerBlocks } : { id: genId('b'), type, attributes }
}

/** Placeholders comuns do Word → variáveis do caderno. */
function mapearVars(s: string): string {
  return (s || '')
    .replace(/\[\s*NOME\s+COMPLETO\s+(?:DO\s+)?ALUNO\s*\]/gi, '{nome}')
    .replace(/\[\s*NOME\s*\]/gi, '{nome}')
}

function limpar(t: string): string {
  return mapearVars(t.replace(/ /g, ' ').replace(/\s+/g, ' ').trim())
}

function alignDe(el: HTMLElement): Align {
  const st = (el.getAttribute('style') || '').toLowerCase().replace(/\s+/g, '')
  if (st.includes('text-align:center')) return 'center'
  if (st.includes('text-align:right')) return 'right'
  if (st.includes('text-align:justify')) return 'justify'
  return 'left'
}

/** Parágrafo inteiro em negrito? (aproximação: todo o texto está dentro de <strong>/<b>). */
function todoNegrito(el: HTMLElement): boolean {
  const txt = el.text.replace(/\s+/g, ' ').trim()
  if (!txt) return false
  const fortes = el.querySelectorAll('strong, b').map((s) => s.text.replace(/\s+/g, ' ').trim()).join(' ').replace(/\s+/g, ' ').trim()
  return fortes.length > 0 && fortes.length >= txt.length - 2
}

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/** Converte um <p>/<h*>/<li> em um bloco (título, imagem ou texto). Retorna null se vazio. */
function elementoParaBloco(el: HTMLElement, prefixo = ''): Block | null {
  const tag = (el.rawTagName || '').toLowerCase()
  const texto = limpar(el.text)

  // Parágrafo que é só uma imagem → bloco de imagem.
  const img = el.querySelector('img')
  if (img && !texto) {
    const url = img.getAttribute('src') || ''
    if (!url) return null
    return bloco('imagem', { url, largura: 100, align: alignDe(el) })
  }

  if (!texto) return null

  if (HEADINGS.has(tag)) {
    const nivel = Math.min(3, Math.max(1, Number(tag[1]) || 2))
    return bloco('titulo-secao', {
      texto: prefixo + texto, nivel, align: alignDe(el), cor: '', mostrarLinha: false,
      fonte: '', italico: false, sublinhado: false, espacamento: 4,
    })
  }

  return bloco('texto-livre', {
    texto: prefixo + texto, align: alignDe(el), size: 12, bold: todoNegrito(el),
    italico: false, sublinhado: false, color: '', fonte: '', lineHeight: 1.5, espacamento: 4,
  })
}

export type ResultadoImportWord = { doc: CadernoDoc; avisos: string[]; resumo: { blocos: number; imagens: number; tabelas: number } }

/** Converte o buffer de um .docx em um CadernoDoc. */
export async function converterWordParaDoc(buffer: Buffer): Promise<ResultadoImportWord> {
  const avisos: string[] = []
  const { value: html, messages } = await mammoth.convertToHtml({ buffer })
  for (const m of messages) if (m.type === 'warning' && avisos.length < 20) avisos.push(m.message)

  const root = parse(html)
  const blocks: Block[] = []
  let imagens = 0
  let tabelas = 0
  const push = (b: Block | null) => { if (b) { blocks.push(b); if (b.type === 'imagem') imagens++ } }

  for (const node of root.childNodes as any[]) {
    const el = node as HTMLElement
    const tag = (el.rawTagName || '').toLowerCase()
    if (!tag) continue // nó de texto solto

    if (tag === 'table') {
      tabelas++
      // Achata: cada parágrafo/heading interno vira um bloco (nada se perde).
      const internos = el.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')
      if (internos.length) {
        for (const p of internos) push(elementoParaBloco(p))
      } else {
        const t = limpar(el.text)
        if (t) push(bloco('texto-livre', { texto: t, align: 'left', size: 12, bold: false, italico: false, sublinhado: false, color: '', fonte: '', lineHeight: 1.5, espacamento: 4 }))
      }
      // Separa visualmente as seções que vinham em tabelas distintas.
      push(bloco('separador', { espessura: 1, estilo: 'solido', cor: '' }))
      continue
    }

    if (tag === 'ul' || tag === 'ol') {
      const ordenada = tag === 'ol'
      el.querySelectorAll('li').forEach((li, i) => push(elementoParaBloco(li, ordenada ? `${i + 1}. ` : '• ')))
      continue
    }

    if (HEADINGS.has(tag) || tag === 'p') { push(elementoParaBloco(el)); continue }
  }

  // Remove um separador final órfão.
  while (blocks.length && blocks[blocks.length - 1].type === 'separador') blocks.pop()

  const doc: CadernoDoc = {
    versao: 1,
    pages: [{ id: genId('page'), kind: 'conteudo', titulo: 'Importado do Word', blocks }],
    cabecalho: [], rodape: [], running: { ...RUNNING_PADRAO },
  }
  return { doc, avisos, resumo: { blocos: blocks.length, imagens, tabelas } }
}
