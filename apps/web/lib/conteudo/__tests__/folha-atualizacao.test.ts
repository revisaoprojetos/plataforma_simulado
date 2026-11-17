import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { montarFolhaAtualizacaoPdf } from '../folha-atualizacao'
import { montarPdfComCapa } from '../baixar-pura'

const dados = {
  material: 'Aula 06 – PDFULL – Direito Administrativo',
  tag: '10/11/2026 14:30', rotulo: 'Atualizado', tipoNome: 'Legislação',
  texto: 'Art. 5º atualizado pela Lei 15.000/2026. Inclusão de nova súmula do STJ → conteúdo ✓ revisado 😀.',
  itens: [{ texto: 'Art. 5º, inciso II, passa a vigorar com nova redação.', tipoNome: 'Legislação', local: 'Art. 5º' }, { texto: 'Nova súmula incluída.', tipoNome: 'Jurisprudência', local: null }],
}

async function pdfBase(paginas: number, w = 595.28, h = 841.89) {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < paginas; i++) d.addPage([w, h]).drawText(`PAGINA-${i + 1}`, { x: 50, y: 700, size: 20, font: f })
  return d.save()
}

describe('folha de atualização', () => {
  it('gera PDF válido (1 página) e não quebra com caracteres fora do alfabeto latino', async () => {
    const b = await montarFolhaAtualizacaoPdf(dados)
    const d = await PDFDocument.load(b)
    expect(d.getPageCount()).toBe(1)
  })
  it('muitos itens: no máximo 3 páginas, sem estourar', async () => {
    const itens = Array.from({ length: 80 }, (_, i) => ({ texto: `Alteração número ${i + 1}: ` + 'texto longo '.repeat(20), tipoNome: 'Correção', local: `Art. ${i + 1}` }))
    const d = await PDFDocument.load(await montarFolhaAtualizacaoPdf({ ...dados, itens }))
    expect(d.getPageCount()).toBeLessThanOrEqual(3)
    expect(d.getPageCount()).toBeGreaterThan(1)
  })
  it('sem data/rótulo/itens: ainda gera', async () => {
    const d = await PDFDocument.load(await montarFolhaAtualizacaoPdf({ material: 'X', tag: null, rotulo: null, tipoNome: null, texto: 'Sem atualizações.', itens: [] }))
    expect(d.getPageCount()).toBe(1)
  })
})

describe('montarPdfComCapa + folha: ordem = capa → folha → documento', () => {
  it('capa em PDF: capa(300x300), folha, depois as 2 páginas do documento', async () => {
    const base = await pdfBase(2)
    const capa = await pdfBase(1, 300, 300)
    const out = await PDFDocument.load(await montarPdfComCapa(base, { tipo: 'pdf', bytes: capa }, { folha: (w, h) => montarFolhaAtualizacaoPdf(dados, [w, h]) }))
    expect(out.getPageCount()).toBe(4)
    expect(out.getPage(0).getSize().width).toBeCloseTo(300, 0) // capa
    expect(out.getPage(1).getSize().width).toBeCloseTo(595.28, 0) // folha (tamanho do documento)
    expect(out.getPage(2).getSize().width).toBeCloseTo(595.28, 0)
  })
  it('sem capa: a folha vai na frente da 1ª folha do documento', async () => {
    const base = await pdfBase(3, 400, 600)
    const out = await PDFDocument.load(await montarPdfComCapa(base, null, { folha: (w, h) => montarFolhaAtualizacaoPdf(dados, [w, h]) }))
    expect(out.getPageCount()).toBe(4)
    expect(out.getPage(0).getSize().width).toBeCloseTo(400, 0) // folha herdou o tamanho do documento
  })
  it('com "página inicial" (descartar 1): capa e folha entram, a página oculta sai', async () => {
    const base = await pdfBase(3)
    const capa = await pdfBase(1, 300, 300)
    const out = await PDFDocument.load(await montarPdfComCapa(base, { tipo: 'pdf', bytes: capa }, { descartarAntes: 1, folha: (w, h) => montarFolhaAtualizacaoPdf(dados, [w, h]) }))
    expect(out.getPageCount()).toBe(1 + 1 + 2) // capa + folha + 2 do documento
  })
  it('sem folha: comportamento antigo (capa + documento)', async () => {
    const base = await pdfBase(2)
    const capa = await pdfBase(1, 300, 300)
    const out = await PDFDocument.load(await montarPdfComCapa(base, { tipo: 'pdf', bytes: capa }))
    expect(out.getPageCount()).toBe(3)
  })
})
