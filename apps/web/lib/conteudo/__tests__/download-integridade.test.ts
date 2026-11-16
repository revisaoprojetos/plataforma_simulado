import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'
import PizZip from 'pizzip'
import { decidirDownload, montarPdfComCapa, contentDispositionAnexo, sanitizarNomeArquivo } from '../baixar-pura'
import { montarZip, validarBytesArquivo } from '../download-admin-zip'
import { montarRelatorio, nomeUnico, sanitizarSegmento } from '../download-admin-pura'

// INTEGRIDADE dos downloads da Biblioteca. NAO cobre (precisa de infra real): conversao DOCX->PDF/ODT/RTF/TXT no OnlyOffice,
// storage S3/Supabase, URLs assinadas, sharp (webp->png) e o navegador (blob/ancora). Aqui: pdf-lib/pizzip reais + rotas com mocks.

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const enc = (s: string) => new TextEncoder().encode(s)

async function gerarPdf(n: number, opts: { size?: [number, number]; rot?: number } = {}): Promise<Uint8Array> {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= n; i++) {
    const p = d.addPage(opts.size ?? [595, 842]); p.drawText(`PAG ${i} DE ${n}`, { x: 50, y: 700, size: 24, font: f })
    if (opts.rot) p.setRotation(degrees(opts.rot))
  }
  return d.save()
}
// 1x1 PNG real
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
// JPEG 1x1 real
const JPG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'))

let pdfjs: any = null
async function textoPaginas(bytes: Uint8Array): Promise<string[]> {
  if (!pdfjs) pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise
  const out: string[] = []
  for (let i = 1; i <= doc.numPages; i++) { const pg = await doc.getPage(i); const t = await pg.getTextContent(); out.push(t.items.map((x: any) => x.str).join(' ').trim()) }
  try { await doc.destroy?.() } catch {}
  return out
}
const nPag = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount()

describe('(a) PDF com capa: nenhuma pagina perdida, ordem e conteudo preservados', () => {
  const N = 8
  it.each([1, 2, 4, 8])('pagina inicial %i: total = 1 + (N - (pi-1)), capa 1a, resto na ordem', async (pi) => {
    const base = await gerarPdf(N)
    const dec = decidirDownload('pdf', 'http://x/capa.png', pi)
    expect(dec.descartarAntes).toBe(pi - 1)
    const out = await montarPdfComCapa(base, { tipo: 'png', bytes: PNG }, { descartarAntes: dec.descartarAntes, titulo: 'Titulo' })
    expect(await nPag(out)).toBe(1 + (N - (pi - 1)))
    const txt = await textoPaginas(out)
    expect(txt[0]).toBe('')
    for (let k = 0; k < N - (pi - 1); k++) expect(txt[k + 1]).toBe(`PAG ${pi + k} DE ${N}`)
  })
  it('pagina inicial > total: nunca descarta tudo (fica a ultima) + capa', async () => {
    const out = await montarPdfComCapa(await gerarPdf(5), { tipo: 'png', bytes: PNG }, { descartarAntes: 99 })
    expect(await textoPaginas(out)).toEqual(['', 'PAG 5 DE 5'])
  })
  it('PDF de 1 pagina (com e sem pagina inicial alta)', async () => {
    expect(await nPag(await montarPdfComCapa(await gerarPdf(1), { tipo: 'png', bytes: PNG }))).toBe(2)
    expect(await nPag(await montarPdfComCapa(await gerarPdf(1), { tipo: 'jpg', bytes: JPG }, { descartarAntes: 3 }))).toBe(2)
  })
  it('sem capa: decisao = original, nada descartado', () => {
    for (const c of [null, undefined, '', '   ']) expect(decidirDownload('pdf', c, 5)).toEqual({ formato: 'pdf', comCapa: false, descartarAntes: 0 })
    expect(decidirDownload('docx', null, 3).formato).toBe('docx')
  })
  it('paginaInicial invalida (0, -1, NaN, 2.9)', () => {
    expect(decidirDownload('pdf', 'u', 0).descartarAntes).toBe(0)
    expect(decidirDownload('pdf', 'u', -4).descartarAntes).toBe(0)
    expect(decidirDownload('pdf', 'u', NaN).descartarAntes).toBe(0)
    expect(decidirDownload('pdf', 'u', 2.9).descartarAntes).toBe(1)
  })
  it('capa tem a MESMA dimensao da pagina do documento', async () => {
    const out = await PDFDocument.load(await montarPdfComCapa(await gerarPdf(3, { size: [400, 600] }), { tipo: 'png', bytes: PNG }))
    expect(out.getPage(0).getSize()).toEqual({ width: 400, height: 600 })
    expect(out.getPage(1).getSize()).toEqual({ width: 400, height: 600 })
  })
  it('capa em PDF (ate 5 paginas) entra na frente, documento intacto', async () => {
    const out = await montarPdfComCapa(await gerarPdf(3), { tipo: 'pdf', bytes: await gerarPdf(2) }, { descartarAntes: 1 })
    expect(await textoPaginas(out)).toEqual(['PAG 1 DE 2', 'PAG 2 DE 2', 'PAG 2 DE 3', 'PAG 3 DE 3'])
  })
  it('paginas rotacionadas mantem a rotacao', async () => {
    const out = await PDFDocument.load(await montarPdfComCapa(await gerarPdf(2, { rot: 90 }), { tipo: 'png', bytes: PNG }))
    expect(out.getPage(1).getRotation().angle).toBe(90); expect(out.getPage(2).getRotation().angle).toBe(90)
  })
  it('PDF/capa invalidos lancam (chamador cai no original)', async () => {
    await expect(montarPdfComCapa(enc('nao sou pdf'), { tipo: 'png', bytes: PNG })).rejects.toThrow()
    await expect(montarPdfComCapa(await gerarPdf(2), { tipo: 'png', bytes: enc('lixo') })).rejects.toThrow()
  })
  it('PDF criptografado e RECUSADO (antes: ignoreEncryption salvava paginas ilegiveis)', async () => {
    const d = await PDFDocument.create(); d.addPage()
    const bytes = await d.save()
    const s = Buffer.from(bytes).toString('latin1').replace('/Root', '/Encrypt << /Filter /Standard /V 1 /R 2 /O (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) /U (bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) /P -4 >>\n/Root')
    await expect(montarPdfComCapa(Uint8Array.from(Buffer.from(s, 'latin1')), { tipo: 'png', bytes: PNG })).rejects.toThrow()
  })
})

describe('(b) ZIP: bytes identicos, nomes, duplicados, estrutura, relatorio', () => {
  it('todos os arquivos presentes com sha256 identico, estrutura e duplicados', async () => {
    const pdfA = await gerarPdf(3), pdfB = await gerarPdf(5)
    const docx = (() => { const z = new PizZip(); z.file('word/document.xml', '<w/>'); return z.generate({ type: 'uint8array' }) as Uint8Array })()
    const txt = enc('Ol\u00e1, a\u00e7\u00e3o \u2014 \u00e7\u00e3\u00f5 \u{1F600}')
    const entradas = [
      { dir: 'Direito/Penal', titulo: 'Lei 8.112', ext: 'pdf', bytes: pdfA },
      { dir: 'Direito/Penal', titulo: 'Lei 8.112', ext: 'pdf', bytes: pdfB },
      { dir: 'Direito/Penal', titulo: 'LEI 8.112', ext: 'pdf', bytes: pdfB },
      { dir: '', titulo: 'Resum\u00e3o a\u00e7\u00e3o \u{1F600}', ext: 'docx', bytes: docx },
      { dir: '', titulo: 'Anota\u00e7\u00f5es', ext: 'txt', bytes: txt },
      { dir: '', titulo: 'a/b\\c:d*e?f"g<h>i|j', ext: 'pdf', bytes: pdfA },
      { dir: '', titulo: 'CON', ext: 'pdf', bytes: pdfA }, { dir: '', titulo: 'nul', ext: 'pdf', bytes: pdfA },
      { dir: '', titulo: '..', ext: 'pdf', bytes: pdfA }, { dir: '', titulo: '   ', ext: 'pdf', bytes: pdfA },
      { dir: '', titulo: 'Termina com ponto.', ext: 'pdf', bytes: pdfA },
      { dir: '', titulo: 'x'.repeat(400), ext: 'pdf', bytes: pdfA },
      { dir: '', titulo: '_relatorio', ext: 'txt', bytes: txt },
      { dir: '', titulo: 'vazio', ext: 'pdf', bytes: new Uint8Array(0) },
    ]
    const rel = montarRelatorio({ geradoEm: new Date(), total: 15, ok: 14, falhas: [{ titulo: 'X', formato: 'pdf', mensagem: 'OnlyOffice fora' }], avisos: [], incluirCapa: true, formatos: ['PDF'] })
    const { bytes, caminhos } = montarZip(entradas, rel)
    const z = new PizZip(bytes)
    expect(Object.keys(z.files).filter((k) => !k.endsWith('/')).length).toBe(entradas.length + 1)
    entradas.forEach((e, i) => { expect(sha(z.file(caminhos[i])!.asUint8Array())).toBe(sha(e.bytes)) })
    expect(caminhos.slice(0, 3)).toEqual(['Direito/Penal/Lei 8.112.pdf', 'Direito/Penal/Lei 8.112 (2).pdf', 'Direito/Penal/LEI 8.112 (3).pdf'])
    expect(caminhos[3]).toBe('Resum\u00e3o a\u00e7\u00e3o \u{1F600}.docx')
    expect(new Set(caminhos.map((c) => c.toLowerCase())).size).toBe(caminhos.length)
    for (const c of caminhos) { const base = c.split('/').pop()!; expect(base).not.toMatch(/[\\:*?"<>|]/); expect(base).not.toMatch(/^(con|nul|prn|aux)(\.|$)/i); expect(base.split('.')[0].endsWith(' ')).toBe(false) }
    expect(caminhos).not.toContain('_relatorio.txt')
    const r = z.file('_relatorio.txt')!.asText()
    expect(r).toContain('OnlyOffice fora'); expect(r).toContain('\r\n')
    expect(Buffer.from(z.file('_relatorio.txt')!.asUint8Array()).subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
  })
  it('nomes nao-ASCII: flag UTF-8 (bit 11) no diretorio central', () => {
    const { bytes } = montarZip([{ dir: 'Pasta \u00e7', titulo: 'a\u00e7\u00e3o', ext: 'pdf', bytes: enc('%PDF-1.4 x') }], 'r')
    const buf = Buffer.from(bytes)
    const i = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    expect(buf.readUInt16LE(i + 8) & 0x0800).toBe(0x0800)
    expect(buf.includes(Buffer.from('Pasta \u00e7/a\u00e7\u00e3o.pdf', 'utf8'))).toBe(true)
  })
  it('arquivo grande (20 MB) e binario com os 256 valores de byte saem identicos', () => {
    const big = new Uint8Array(20 * 1024 * 1024); for (let i = 0; i < big.length; i++) big[i] = (i * 31 + (i >> 8)) & 255
    const { bytes, caminhos } = montarZip([{ dir: '', titulo: 'grande', ext: 'pdf', bytes: big }, { dir: '', titulo: 'bin', ext: 'rtf', bytes: Uint8Array.from({ length: 256 }, (_, i) => i) }], 'r')
    const z = new PizZip(bytes)
    expect(sha(z.file(caminhos[0])!.asUint8Array())).toBe(sha(big))
    expect(Array.from(z.file(caminhos[1])!.asUint8Array())).toEqual(Array.from({ length: 256 }, (_, i) => i))
  })
  it('Uint8Array VIEW de buffer maior (byteOffset != 0) nao vaza bytes vizinhos', () => {
    const pool = new Uint8Array(100).fill(7); const view = pool.subarray(10, 20); view.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const { bytes, caminhos } = montarZip([{ dir: '', titulo: 'v', ext: 'pdf', bytes: view }], 'r')
    expect(Array.from(new PizZip(bytes).file(caminhos[0])!.asUint8Array())).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
  it('nomeUnico / sanitizarSegmento', () => {
    const u = new Set<string>(); expect([nomeUnico(u, 'a/x.pdf'), nomeUnico(u, 'a/x.pdf'), nomeUnico(u, 'A/X.pdf')]).toEqual(['a/x.pdf', 'a/x (2).pdf', 'A/X (3).pdf'])
    expect(sanitizarSegmento('CON')).not.toBe('CON'); expect(sanitizarSegmento('a/b')).not.toContain('/'); expect(sanitizarSegmento('..')).toBeTruthy()
    expect(sanitizarSegmento('Fim.  ')).toBe('Fim')
  })
  it('item invalido e separado pela validacao (nao entra no ZIP)', async () => {
    expect(validarBytesArquivo(new Uint8Array(0), 'pdf')).toMatch(/vazio/)
    expect(validarBytesArquivo(enc('<html>erro</html>'), 'pdf')).toMatch(/PDF/)
    expect(validarBytesArquivo(enc('<html>erro</html>'), 'docx')).toMatch(/docx/)
    expect(validarBytesArquivo(await gerarPdf(1), 'pdf')).toBeNull()
    expect(validarBytesArquivo(enc('{\\rtf1 x}'), 'rtf')).toBeNull()
    expect(validarBytesArquivo(enc('texto'), 'txt')).toBeNull()
  })
})

describe('(c) PDFs resultantes reabrem e renderizam texto na 1a e ultima pagina', () => {
  it('com capa JPG + pagina inicial', async () => {
    const out = await montarPdfComCapa(await gerarPdf(6), { tipo: 'jpg', bytes: JPG }, { descartarAntes: 2, titulo: 'Acao & "Titulo"' })
    expect((await PDFDocument.load(out)).getPageCount()).toBe(5)
    const t = await textoPaginas(out); expect(t[1]).toBe('PAG 3 DE 6'); expect(t[t.length - 1]).toBe('PAG 6 DE 6')
  })
})

describe('(e) cabecalhos / nomes', () => {
  it.each(['Lei 8.112/90 \u2014 A\u00e7\u00e3o "Penal" \u00e7', "O'Brien (rev) *x*; 100%", '\u65e5\u672c\u8a9e \u{1F600}', 'Documento sem nada'])('Content-Disposition seguro: %s', (t) => {
    const cd = contentDispositionAnexo(sanitizarNomeArquivo(t, 'pdf'))
    expect(cd).toMatch(/^attachment; filename="[\x20-\x7e]*"; filename\*=UTF-8''[A-Za-z0-9%._~-]+$/)
    expect(/filename="([^"]*)"/.exec(cd)![1]).not.toMatch(/["\\;%]/)
    expect(decodeURIComponent(/filename\*=UTF-8''(.+)$/.exec(cd)![1]).endsWith('.pdf')).toBe(true)
    expect(() => new Headers({ 'Content-Disposition': cd })).not.toThrow()
  })
  it('titulo que ja termina na extensao nao duplica', () => { expect(sanitizarNomeArquivo('Apostila.pdf', 'pdf')).toBe('Apostila.pdf'); expect(sanitizarNomeArquivo('', 'docx')).toBe('Documento.docx') })
})

// ── rota do aluno (mocks de sessao/banco/storage) ──
const h = vi.hoisted(() => ({ arquivos: new Map<string, Uint8Array>(), capaUrl: null as string | null, pagina: null as number | null, tipo: 'pdf' as 'pdf' | 'docx', titulo: 'Aula A\u00e7\u00e3o "1"' }))
vi.mock('@/lib/aluno-session', () => ({ getSessaoAluno: async () => ({ estudanteId: 'e1', tenantId: 't1' }) }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/cronograma/adaptativo/liberacao', () => ({ liberacaoDoc: async () => ({ bloqueado: false }) }))
vi.mock('@/lib/conteudo/politica-download', () => ({ registrarDownload: async () => {} }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ ok: true }) }))
vi.mock('@/lib/acessos/registro', () => ({ registrarAtividade: async () => {} }))
vi.mock('@/lib/conteudo/capa-pagina-server', () => ({ capaEPaginaDoDocumento: async () => ({ capaUrl: h.capaUrl, paginaInicial: h.pagina }) }))
vi.mock('@/lib/conteudo/leitor', () => ({ prepararDownloadAluno: async () => ({ ok: true, titulo: h.titulo, tipoOrigem: h.tipo, urlOriginal: 'mem://orig', urlPdf: async () => 'mem://pdf' }) }))
vi.mock('@/lib/conteudo/capa-bytes', () => ({
  buscar: async (u: string) => h.arquivos.get(u) ?? null,
  carregarCapa: async (u: string) => { const b = h.arquivos.get(u); return b ? { tipo: 'png', bytes: b } : null },
}))
const DOC = '11111111-1111-4111-8111-111111111111'

describe('(3) rota do aluno /api/aluno/biblioteca/baixar', () => {
  beforeEach(() => { h.arquivos.clear(); h.capaUrl = null; h.pagina = null; h.tipo = 'pdf' })
  const chamar = async () => { const { GET } = await import('@/app/api/aluno/biblioteca/baixar/route'); return GET({ nextUrl: new URL(`http://app.test/api/aluno/biblioteca/baixar?doc=${DOC}`) } as any) }

  it('sem capa: bytes identicos ao original, Content-Length real, nome certo', async () => {
    const orig = await gerarPdf(7); h.arquivos.set('mem://orig', orig)
    const r = await chamar(); const body = new Uint8Array(await r.arrayBuffer())
    expect(r.status).toBe(200); expect(sha(body)).toBe(sha(orig)); expect(Number(r.headers.get('content-length'))).toBe(orig.byteLength)
    expect(r.headers.get('content-type')).toBe('application/pdf')
    expect(decodeURIComponent(/filename\*=UTF-8''(.+)$/.exec(r.headers.get('content-disposition')!)![1])).toBe(sanitizarNomeArquivo(h.titulo, 'pdf'))
  })
  it('com capa + pagina inicial 3: capa 1a, paginas 3..N na ordem, Content-Length real', async () => {
    h.arquivos.set('mem://orig', await gerarPdf(7)); h.arquivos.set('mem://pdf', await gerarPdf(7)); h.arquivos.set('http://capa', PNG)
    h.capaUrl = 'http://capa'; h.pagina = 3
    const r = await chamar(); const body = new Uint8Array(await r.arrayBuffer())
    expect(r.status).toBe(200); expect(Number(r.headers.get('content-length'))).toBe(body.byteLength)
    expect(await textoPaginas(body)).toEqual(['', 'PAG 3 DE 7', 'PAG 4 DE 7', 'PAG 5 DE 7', 'PAG 6 DE 7', 'PAG 7 DE 7'])
  })
  it('capa que falha ao carregar: entrega o ORIGINAL integro', async () => {
    const orig = await gerarPdf(4); h.arquivos.set('mem://orig', orig); h.arquivos.set('mem://pdf', orig); h.capaUrl = 'http://capa-inexistente'; h.pagina = 2
    const r = await chamar(); expect(sha(new Uint8Array(await r.arrayBuffer()))).toBe(sha(orig))
  })
  it('DOCX com capa usa o PDF convertido; DOCX sem capa: bytes identicos + content-type docx', async () => {
    h.tipo = 'docx'; const docx = enc('PK\u0003\u0004zzz'); h.arquivos.set('mem://orig', docx)
    let r = await chamar(); expect(sha(new Uint8Array(await r.arrayBuffer()))).toBe(sha(docx)); expect(r.headers.get('content-type')).toContain('wordprocessingml')
    h.arquivos.set('mem://pdf', await gerarPdf(3)); h.arquivos.set('http://capa', PNG); h.capaUrl = 'http://capa'; h.pagina = 2
    r = await chamar(); expect(await textoPaginas(new Uint8Array(await r.arrayBuffer()))).toEqual(['', 'PAG 2 DE 3', 'PAG 3 DE 3']); expect(r.headers.get('content-type')).toBe('application/pdf')
  })
})
