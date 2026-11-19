import { describe, expect, it } from 'vitest'
import {
  LIMITES_EXPORT, contentDisposition, docParaBlocos, escalaFolha, layoutLinhas, nomeArquivoSeguro, parseFormato, tokenizar, tracoParaSvgPath,
} from './notebook-exportar'
import { gerarDocx, gerarPdfDoc, gerarPdfFolha } from './notebook-exportar-arquivos'
import { criarFolhaVazia } from './notebook-folha'

const t = (text: string, marks?: any[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) })
const p = (...c: any[]) => ({ type: 'paragraph', content: c })

const DOC = {
  type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [t('Título')] },
    p(t('negrito', [{ type: 'bold' }]), t(' e '), t('link', [{ type: 'link', attrs: { href: 'https://x.com' } }])),
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('a')), { type: 'orderedList', content: [{ type: 'listItem', content: [p(t('a1'))] }] }] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('feito'))] }, { type: 'taskItem', content: [p(t('aberto'))] }] },
    { type: 'blockquote', content: [p(t('citação'))] },
    { type: 'codeBlock', content: [t('linha1\nlinha2')] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('H1'))] }, { type: 'tableHeader', content: [p(t('H2'))] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('c1'))] }, { type: 'tableCell', content: [p(t('c2'))] }] }] },
    { type: 'grifoSnapshot', attrs: { documento_id: 'd', pagina: 0, texto: 'grifado', documento_titulo: 'Lei' } },
    { type: 'questaoRef', attrs: { questao_id: 'q' } },
    { type: 'horizontalRule' },
  ],
}

describe('docParaBlocos', () => {
  const b = docParaBlocos(DOC)
  it('converte tipos de bloco', () => {
    expect(b.map((x) => x.k)).toEqual(['heading', 'p', 'item', 'item', 'item', 'item', 'quote', 'code', 'tabela', 'custom', 'custom', 'hr'])
  })
  it('listas aninhadas e tarefas', () => {
    expect(b[2]).toMatchObject({ k: 'item', ordenado: false, nivel: 0 })
    expect(b[3]).toMatchObject({ k: 'item', ordenado: true, nivel: 1, n: 1 })
    expect(b[4]).toMatchObject({ tarefa: 'feita' })
    expect(b[5]).toMatchObject({ tarefa: 'aberta' })
  })
  it('marks e link; tabela com cabeçalho; custom', () => {
    expect((b[1] as any).runs[0]).toMatchObject({ t: 'negrito', b: true })
    expect((b[1] as any).runs[2]).toMatchObject({ link: 'https://x.com' })
    expect((b[8] as any).linhas[0]).toEqual({ cabecalho: true, celulas: ['H1', 'H2'] })
    expect(b[9]).toMatchObject({ rotulo: 'Grifo', texto: 'grifado', fonte: 'Lei - p. 1' })
    expect((b[7] as any).linhas).toEqual(['linha1', 'linha2'])
  })
  it('entrada inválida => vazio; respeita limite de blocos', () => {
    expect(docParaBlocos(null)).toEqual([])
    const grande = { type: 'doc', content: Array.from({ length: LIMITES_EXPORT.blocosMax + 50 }, () => p(t('x'))) }
    expect(docParaBlocos(grande).length).toBe(LIMITES_EXPORT.blocosMax)
  })
})

describe('nome de arquivo', () => {
  it('sanea acentos, separadores e vazio', () => {
    expect(nomeArquivoSeguro('Direito Penal: Parte 1/2', 'pdf')).toBe('Direito_Penal_Parte_1_2.pdf')
    expect(nomeArquivoSeguro('..\\..\\etc/passwd', 'pdf')).toBe('etc_passwd.pdf')
    expect(nomeArquivoSeguro('Ação "civil"', 'docx')).toBe('Acao_civil.docx')
    expect(nomeArquivoSeguro('', 'pdf')).toBe('pagina.pdf')
    expect(nomeArquivoSeguro('x'.repeat(300), 'pdf').length).toBeLessThanOrEqual(LIMITES_EXPORT.nomeMax + 4)
  })
  it('content-disposition sem aspas/quebras injetáveis', () => {
    const h = contentDisposition('a"\r\nX-Evil: 1', 'pdf')
    expect(h).not.toMatch(/[\r\n]/)
    expect(h.split('"').length).toBe(3)
    expect(parseFormato('pdf')).toBe('pdf')
    expect(parseFormato('exe')).toBeNull()
  })
})

describe('layoutLinhas', () => {
  const medir = (tk: { texto: string }) => tk.texto.length
  it('quebra por largura e respeita \\n', () => {
    const l = layoutLinhas(tokenizar([{ t: 'aaa bbb ccc\nddd' }]), 7, medir)
    expect(l.map((x) => x.map((y) => y.texto).join(''))).toEqual(['aaa bbb', 'ccc', 'ddd'])
  })
  it('corta palavra maior que a linha', () => {
    const l = layoutLinhas(tokenizar([{ t: 'abcdefghij' }]), 4, medir)
    expect(l.map((x) => x.map((y) => y.texto).join(''))).toEqual(['abcd', 'efgh', 'ij'])
  })
})

describe('folha', () => {
  it('escala e path', () => {
    expect(escalaFolha(1200, 1600)).toBe(0.75)
    expect(escalaFolha(1200, 100000)).toBeLessThan(0.75)
    expect(tracoParaSvgPath([[1, 2, 0.5], [3.456, 4, 0.5]])).toBe('M 1 2 L 3.5 4')
    expect(tracoParaSvgPath([[1, 2, 0.5]])).toContain('L')
    expect(tracoParaSvgPath([])).toBe('')
    const muitos = Array.from({ length: 5000 }, (_, i) => [i, i, 0.5] as [number, number, number])
    expect(tracoParaSvgPath(muitos, 100).split('L').length).toBe(100)
  })
})

describe('geradores', () => {
  it('PDF do doc começa com %PDF', async () => {
    const bytes = await gerarPdfDoc('Título ação', docParaBlocos(DOC))
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
  })
  it('DOCX é um zip (PK)', async () => {
    const buf = await gerarDocx('Título', docParaBlocos(DOC))
    expect(buf.slice(0, 2).toString()).toBe('PK')
  })
  it('PDF da folha com traço e caixa (incl. caractere fora do WinAnsi)', async () => {
    const f = criarFolhaVazia(800, 600)
    f.tracos.push({ id: 'a', ferramenta: 'caneta', cor: 'azul', largura: 3, pontos: [[10, 10, 0.5], [100, 120, 0.5], [200, 50, 0.5]] })
    f.tracos.push({ id: 'b', ferramenta: 'marca-texto', cor: 'amarelo', largura: 20, pontos: [[10, 300, 0.5]] })
    f.caixas.push({ id: 'c', x: 50, y: 50, w: 200, h: 100, z: 1, texto: 'Olá mundo ☑ 😀 muito texto para quebrar linha na caixa' })
    const bytes = await gerarPdfFolha('Folha', f)
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
  })
})
