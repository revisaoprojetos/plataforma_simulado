// Caderno (beta) — TESTES DE INTEGRIDADE (lógica pura): sanitização, round-trips, limites, exportação hostil, upload, cota/bucket.
// As rotas (isolamento tenant+estudante, idempotência, lixeira, árvore) estão em notebook-integridade-rotas.test.ts.
import { describe, expect, it } from 'vitest'
import { colunaAusente, extrairQuestaoIds, extrairTexto, extrairTextoFolha, rpcAusente, sanitizarDoc, sanitizarTinta, tabelaAusente, urlSegura } from './notebook-server'
import { LIMITES, ROTA_ARQUIVOS_NOTEBOOK } from './notebook-tipos'
import { LIMITES_FOLHA, criarFolhaVazia, excedeLimitesBaratos, validarFolha } from './notebook-folha'
import { avaliarCota, decidirBucketCaderno, extrairArquivosNotebook, validarUploadNotebook } from './notebook-texto'
import { LIMITES_EXPORT, docParaBlocos, layoutLinhas, maiorPrefixo, partirTexto, tokenizar, type Token } from './notebook-exportar'
import { gerarDocx, gerarPdfDoc, gerarPdfFolha, xmlSeguro } from './notebook-exportar-arquivos'
import { sniffMime } from '../storage/validate'

const U = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const doc = (...content: any[]) => ({ type: 'doc', content })
const p = (text: string, marks?: any[]) => ({ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] })
const ms = async (fn: () => unknown | Promise<unknown>) => { const t = Date.now(); await fn(); return Date.now() - t }

// ================================================================ (2) sanitização
describe('integridade: sanitização do doc (lista branca)', () => {
  it('links javascript:/data:/vbscript:/protocol-relative são descartados; texto fica', () => {
    for (const href of ['javascript:alert(1)', ' JaVaScRiPt:x', 'data:text/html,<script>', 'vbscript:x', '//evil.com', 'file:///etc/passwd', 'java\nscript:alert(1)']) {
      const r = sanitizarDoc(doc(p('x', [{ type: 'link', attrs: { href } }])))
      expect(r.ok).toBe(true)
      if (r.ok) expect(JSON.stringify(r.doc)).not.toMatch(/href/)
    }
    expect(urlSegura('https://ok.com/a?b=1')).toBe('https://ok.com/a?b=1')
  })

  it('nós proibidos (script, iframe, svg, html cru) e marks proibidas rejeitam o doc', () => {
    for (const type of ['script', 'iframe', 'svg', 'object', 'embed', 'html', 'style']) expect(sanitizarDoc(doc({ type })).ok).toBe(false)
    expect(sanitizarDoc(doc(p('x', [{ type: 'script' }]))).ok).toBe(false)
    expect(sanitizarDoc(doc({ type: 'doc', content: [] })).ok).toBe(false) // doc aninhado
  })

  it('imagem só aceita a rota autenticada do caderno (nada de http/data/traversal/outro tenant)', () => {
    const ok = `${ROTA_ARQUIVOS_NOTEBOOK}/${U}.png`
    expect(sanitizarDoc(doc({ type: 'image', attrs: { src: ok } })).ok).toBe(true)
    for (const src of ['https://evil.com/a.png', 'data:image/png;base64,AAAA', `${ROTA_ARQUIVOS_NOTEBOOK}/../../x.png`, `${ROTA_ARQUIVOS_NOTEBOOK}/${U}.svg`, `/api/aluno/outra/${U}.png`, `${ROTA_ARQUIVOS_NOTEBOOK}/${U}.png?x=1`, 'javascript:1']) {
      expect(sanitizarDoc(doc({ type: 'image', attrs: { src } })).ok).toBe(false)
    }
    expect(sanitizarDoc(doc({ type: 'anexo', attrs: { arquivo: '../../etc/passwd' } })).ok).toBe(false)
    expect(sanitizarDoc(doc({ type: 'anexo', attrs: { arquivo: `${U}.exe` } })).ok).toBe(false)
  })

  it('limites: profundidade, nº de nós, bytes e rects', () => {
    let n: any = p('x')
    for (let i = 0; i < LIMITES.docProfundidadeMax + 3; i++) n = { type: 'blockquote', content: [n] }
    expect(sanitizarDoc(doc(n)).ok).toBe(false)
    expect(sanitizarDoc(doc(...Array.from({ length: LIMITES.docNosMax + 1 }, () => ({ type: 'paragraph' })))).ok).toBe(false)
    const grande = doc(...Array.from({ length: 25 }, () => p('a'.repeat(100_000))))
    expect(sanitizarDoc(grande).ok).toBe(false) // > 2 MB
    expect(sanitizarDoc(doc({ type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(LIMITES.textoNoMax + 1) }] })).ok).toBe(false)
    const rects = Array.from({ length: LIMITES.rectsMax + 1 }, () => ({ x0: 0, y0: 0, x1: 1, y1: 1 }))
    expect(sanitizarDoc(doc({ type: 'grifoSnapshot', attrs: { texto: 'x', rects } })).ok).toBe(false)
  })

  it('attrs desconhecidos são descartados em todos os nós (sem rejeitar)', () => {
    const r = sanitizarDoc(doc({ type: 'paragraph', attrs: { onclick: 'x', style: 'color:red', marca: 'importante', estilo: 'hack' }, content: [{ type: 'text', text: 'a' }] }))
    expect(r.ok && r.doc.content[0].attrs).toEqual({ marca: 'importante' })
  })
})

describe('integridade: sanitização da folha (tinta)', () => {
  const traco = (n: number) => ({ id: `t${n}`, ferramenta: 'caneta', cor: 'tinta', largura: 2, pontos: Array.from({ length: n }, (_, i) => [i, i, 0.5]) })
  const caixa = (i: number) => ({ id: `c${i}`, x: 0, y: 0, w: 100, h: 50, z: i })

  it('folha vazia/normal é aceita', () => {
    expect(sanitizarTinta(criarFolhaVazia()).ok).toBe(true)
    expect(sanitizarTinta({ ...criarFolhaVazia(), tracos: [traco(10)] }).ok).toBe(true)
  })

  it('limites: caixas, traços, pontos por traço, pontos totais e bytes', () => {
    expect(sanitizarTinta({ ...criarFolhaVazia(), caixas: Array.from({ length: LIMITES_FOLHA.caixas + 1 }, (_, i) => caixa(i)) }).ok).toBe(false)
    expect(sanitizarTinta({ ...criarFolhaVazia(), tracos: Array.from({ length: LIMITES_FOLHA.tracos + 1 }, () => traco(1)) }).ok).toBe(false)
    expect(sanitizarTinta({ ...criarFolhaVazia(), tracos: [traco(LIMITES_FOLHA.pontosPorTraco + 1)] }).ok).toBe(false)
    // total de pontos: 8 traços de 20000 = 160k > 150k (barato, ANTES do zod)
    const muitos = { ...criarFolhaVazia(), tracos: Array.from({ length: 8 }, () => traco(20000)) }
    expect(excedeLimitesBaratos(muitos)).toMatch(/pontos/i)
    const t0 = Date.now()
    expect(validarFolha(muitos).ok).toBe(false)
    expect(Date.now() - t0).toBeLessThan(500) // recusa sem rodar o zod pesado
    expect(sanitizarTinta({ ...criarFolhaVazia(), tracos: Array.from({ length: 6 }, () => traco(20000)) }).ok).toBe(false) // > 1 MB
  })

  it('doc da caixa passa pela MESMA lista branca (script/imagem externa => recusa a folha)', () => {
    const f = (d: any) => ({ ...criarFolhaVazia(), caixas: [{ ...caixa(1), doc: d }] })
    expect(sanitizarTinta(f(doc(p('ok')))).ok).toBe(true)
    expect(sanitizarTinta(f(doc({ type: 'iframe' }))).ok).toBe(false)
    expect(sanitizarTinta(f(doc({ type: 'image', attrs: { src: 'https://evil.com/x.png' } }))).ok).toBe(false)
  })
})

// ================================================================ (4) round-trips
describe('integridade: round-trips', () => {
  it('doc importado (grifoSnapshot SEM pagina/documento_id, com attrs da importação) é aceito e estável', () => {
    const importado = doc(
      { type: 'grifoSnapshot', attrs: { texto: 'trecho grifado', origem_anotacao_id: U, origem_item_id: U2, link: null } },
      { type: 'anotacaoRef', attrs: { origem_tabela: 'simulado_aluno_caderno_itens', origem_id: U, html_legado: '<p>x</p>' } },
      { type: 'paragraph' },
    )
    const r = sanitizarDoc(importado)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const g = r.doc.content[0]
    expect(g.attrs).toEqual({ texto: 'trecho grifado' }) // origem_* descartados, sem pagina/documento_id
    const r2 = sanitizarDoc(r.doc) // salvar de novo (autosave) não muda nada
    expect(r2.ok && r2.doc).toEqual(r.doc)
  })

  it('grifoSnapshot normal (com documento_id e pagina, inclusive 0 e pagina:null do front) faz round-trip', () => {
    const normal = { type: 'grifoSnapshot', attrs: { documento_id: U, pagina: 0, texto: 'x', documento_titulo: 'Lei', rects: [{ x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.2 }], inicio: 1, fim: 9 } }
    const r = sanitizarDoc(doc(normal))
    expect(r.ok && r.doc.content[0].attrs).toMatchObject({ documento_id: U, pagina: 0, texto: 'x', inicio: 1, fim: 9 })
    const comNull = sanitizarDoc(doc({ type: 'grifoSnapshot', attrs: { documento_id: U, pagina: null, texto: 'y' } }))
    expect(comNull.ok && comNull.doc.content[0].attrs).toEqual({ documento_id: U, texto: 'y' })
  })

  it('grifoSnapshot com valor presente porém inválido continua rejeitado', () => {
    expect(sanitizarDoc(doc({ type: 'grifoSnapshot', attrs: { documento_id: 'nao-uuid', texto: 'x' } })).ok).toBe(false)
    expect(sanitizarDoc(doc({ type: 'grifoSnapshot', attrs: { documento_id: U, pagina: -1, texto: 'x' } })).ok).toBe(false)
    expect(sanitizarDoc(doc({ type: 'grifoSnapshot', attrs: { documento_id: U, pagina: 1.5, texto: 'x' } })).ok).toBe(false)
  })

  it('texto_busca: inclui texto, grifo e anotação; ignora questaoRef; extrai ids de questões', () => {
    const d = doc(p('olá mundo'), { type: 'grifoSnapshot', attrs: { texto: 'grifado' } }, { type: 'anotacaoRef', attrs: { texto: 'nota' } }, { type: 'questaoRef', attrs: { questao_id: U } })
    const t = extrairTexto(d)
    expect(t).toContain('olá mundo'); expect(t).toContain('grifado'); expect(t).toContain('nota'); expect(t).not.toContain(U)
    expect(extrairQuestaoIds(d)).toEqual([U])
    expect(extrairTextoFolha({ caixas: [{ x: 5, y: 1, texto: 'b' }, { x: 0, y: 0, doc: doc(p('a')) }] })).toBe('a\nb')
  })

  it('arquivos referenciados (imagem/anexo, inclusive em caixas da folha) são extraídos e deduplicados', () => {
    const d = doc({ type: 'image', attrs: { src: `${ROTA_ARQUIVOS_NOTEBOOK}/${U}.png` } }, { type: 'image', attrs: { src: `${ROTA_ARQUIVOS_NOTEBOOK}/${U}.png` } }, { type: 'anexo', attrs: { arquivo: `${U2}.pdf` } })
    const folha = { caixas: [{ doc: doc({ type: 'image', attrs: { src: `${ROTA_ARQUIVOS_NOTEBOOK}/${U2}.jpg` } }) }] }
    expect(extrairArquivosNotebook([d, folha]).sort()).toEqual([`${U}.png`, `${U2}.jpg`, `${U2}.pdf`].sort())
    expect(extrairArquivosNotebook([null, 'x', 1])).toEqual([])
  })

  it('erros de banco: classificação de migração pendente / RPC ausente', () => {
    expect(rpcAusente({ code: 'PGRST202' })).toBe(true)
    expect(rpcAusente({ code: '42883' })).toBe(true)
    expect(rpcAusente({ code: '23505' })).toBe(false)
    expect(tabelaAusente({ code: '42P01' })).toBe(true)
    expect(colunaAusente({ code: '42703' })).toBe(true)
  })
})

// ================================================================ (7) exportação com entradas hostis
describe('integridade: exportação hostil termina rápido e sem erro', () => {
  const medir = (t: Token) => t.texto.length * 6
  const tk = (texto: string): Token => ({ texto, run: { t: texto } })

  it('layoutLinhas: 100k caracteres sem espaço em < 1 s (busca binária + token limitado)', async () => {
    const tempo = await ms(() => {
      const linhas = layoutLinhas(tokenizar([{ t: 'a'.repeat(100_000) }]), 400, medir)
      expect(linhas.length).toBeGreaterThan(100)
      expect(linhas.every((l) => l.reduce((s, x) => s + medir(x), 0) <= 400)).toBe(true)
    })
    expect(tempo).toBeLessThan(1000)
  })

  it('layoutLinhas: token gigante direto (sem tokenizar) também é contido, e o nº de linhas é limitado', async () => {
    expect(await ms(() => layoutLinhas([tk('b'.repeat(1_000_000))], 100, medir))).toBeLessThan(1500)
    const l = layoutLinhas([tk('c'.repeat(200_000))], 12, medir, 50)
    expect(l.length).toBeLessThanOrEqual(50)
  })

  it('maiorPrefixo acha o maior prefixo que cabe; partirTexto não corta par substituto', () => {
    expect(maiorPrefixo(tk('x'.repeat(100)), 60, medir)).toBe(10)
    expect(maiorPrefixo(tk('x'.repeat(100)), 1, medir)).toBe(1) // nem 1 char cabe: avança 1 (sem laço infinito)
    const partes = partirTexto('a'.repeat(4) + '😀' + 'b'.repeat(4), 5)
    expect(partes.join('')).toBe('aaaa😀bbbb')
    for (const x of partes) expect(x).not.toMatch(/[\ud800-\udbff]$/)
  })

  it('PDF: palavra de 100k, linha de código de 100k e célula de tabela de 100k terminam em < 5 s', async () => {
    const d = doc(
      p('z'.repeat(100_000)),
      { type: 'codeBlock', content: [{ type: 'text', text: 'k'.repeat(100_000) + '\n' + 'curto' }] },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p('t'.repeat(100_000))] }, { type: 'tableCell', content: [p('ok')] }] }] },
    )
    const blocos = docParaBlocos(d)
    const code = blocos.find((b) => b.k === 'code') as any
    expect(code.linhas[0].length).toBeLessThanOrEqual(LIMITES_EXPORT.linhaCodeMax)
    let bytes: Uint8Array | undefined
    const tempo = await ms(async () => { bytes = await gerarPdfDoc('Título hostil', blocos) })
    expect(tempo).toBeLessThan(5000)
    expect(bytes!.byteLength).toBeGreaterThan(500)
  })

  it('PDF/DOCX: controles XML, NUL, substitutos soltos e emoji não quebram', async () => {
    const hostil = `a\u0000b\u0001c\u0008d\ud800e\udc00f￾g😀h\tj`
    const blocos = docParaBlocos(doc(p(hostil), { type: 'codeBlock', content: [{ type: 'text', text: hostil }] }))
    await expect(gerarPdfDoc(hostil, blocos)).resolves.toBeInstanceOf(Uint8Array)
    const buf = await gerarDocx(hostil, blocos)
    expect(buf.byteLength).toBeGreaterThan(500)
    expect(xmlSeguro(hostil)).toBe('abcdefg😀h\tj')
    expect(xmlSeguro('ok\n\r\t')).toBe('ok\n\r\t')
  })

  it('DOCX com 100k sem espaço, tabela e custom termina em < 5 s', async () => {
    const blocos = docParaBlocos(doc(
      p('w'.repeat(100_000)),
      { type: 'grifoSnapshot', attrs: { texto: 'g'.repeat(2000) } },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p('c'.repeat(100_000))] }] }] },
    ))
    expect(await ms(() => gerarDocx('T', blocos))).toBeLessThan(5000)
  })

  it('PDF: muitos blocos/profundidade hostil são limitados (blocosMax) e a folha livre gigante exporta', async () => {
    let n: any = p('fundo')
    for (let i = 0; i < 100; i++) n = { type: 'blockquote', content: [n] }
    expect(docParaBlocos(doc(n)).length).toBeLessThan(LIMITES_EXPORT.blocosMax)
    const blocos = docParaBlocos(doc(...Array.from({ length: 6000 }, (_, i) => p(`linha ${i}`))))
    expect(blocos.length).toBeLessThanOrEqual(LIMITES_EXPORT.blocosMax)
    const f = { ...criarFolhaVazia(), caixas: [{ id: 'c', x: 0, y: 0, w: 300, h: 200, z: 1, texto: 'q'.repeat(20_000) }] }
    expect(await ms(() => gerarPdfFolha('Folha', f as any))).toBeLessThan(5000)
  })
})

// ================================================================ (8) upload
describe('integridade: upload (magic bytes, mime, SVG/HTML)', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
  const enc = (s: string) => new TextEncoder().encode(s)
  const imagem = (bytes: Uint8Array, mime = '', nome = 'a.png') => validarUploadNotebook({ nome, mimeDeclarado: mime, bytes, tipo: 'imagem' }, sniffMime)
  const arquivo = (bytes: Uint8Array, nome: string, mime = '') => validarUploadNotebook({ nome, mimeDeclarado: mime, bytes, tipo: 'arquivo' }, sniffMime)

  it('imagem válida passa; a extensão vem da ASSINATURA, não do nome', () => {
    const r = imagem(png, 'image/png', 'foto.jpg')
    expect(r.ok && r.ext).toBe('png')
  })
  it('mime declarado divergente da assinatura é rejeitado (415)', () => {
    const r = imagem(png, 'image/jpeg')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(415)
    expect(imagem(jpg, 'image/png').ok).toBe(false)
  })
  it('SVG, HTML, JS e executáveis disfarçados de imagem são rejeitados', () => {
    expect(imagem(enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml', 'x.svg').ok).toBe(false)
    expect(imagem(enc('<html><script>alert(1)</script></html>'), 'image/png', 'x.png').ok).toBe(false)
    expect(imagem(enc('MZ\u0090\u0000'), 'image/png', 'x.png').ok).toBe(false)
  })
  it('anexo: extensão fora da lista, html/svg/exe e PDF falso são rejeitados', () => {
    for (const nome of ['a.html', 'a.svg', 'a.exe', 'a.js', 'a.php', 'a']) expect(arquivo(enc('<script>'), nome).ok).toBe(false)
    expect(arquivo(enc('não sou pdf'), 'a.pdf').ok).toBe(false)
    expect(arquivo(enc('texto simples'), 'a.txt').ok).toBe(true)
    expect(arquivo(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), 'a.pdf').ok).toBe(true)
  })
  it('vazio e acima do limite', () => {
    expect(imagem(new Uint8Array(0)).ok).toBe(false)
    const grande = new Uint8Array(LIMITES.imagemBytesMax + 1); grande.set(png)
    const r = imagem(grande, 'image/png')
    expect(!r.ok && r.status).toBe(413)
  })
  it('cota por aluno: por quantidade e por bytes', () => {
    expect(avaliarCota([], 1).ok).toBe(true)
    expect(avaliarCota(Array.from({ length: LIMITES.cotaArquivosQtd }, () => ({ bytes: 1 })), 1)).toEqual({ ok: false, motivo: 'qtd' })
    expect(avaliarCota([{ bytes: LIMITES.cotaArquivosBytes - 10 }], 11)).toEqual({ ok: false, motivo: 'bytes' })
    expect(avaliarCota([{ bytes: LIMITES.cotaArquivosBytes - 10 }], 10).ok).toBe(true)
  })
})

describe('integridade: bucket privado do caderno (falha fechado em produção)', () => {
  it('com STORAGE_CADERNO_BUCKET usa o bucket informado em qualquer ambiente', () => {
    expect(decidirBucketCaderno('caderno-privado', 'production')).toEqual({ bucket: 'caderno-privado' })
    expect(decidirBucketCaderno('  b  ', 'development')).toEqual({ bucket: 'b' })
  })
  it('sem a variável: produção FALHA (nunca cai no bucket público de conteúdo); dev/teste permitem o fallback', () => {
    expect(decidirBucketCaderno(undefined, 'production')).toEqual({ erro: 'bucket_ausente' })
    expect(decidirBucketCaderno('   ', 'production')).toEqual({ erro: 'bucket_ausente' })
    expect(decidirBucketCaderno(undefined, 'development')).toEqual({ fallback: true })
    expect(decidirBucketCaderno('', 'test')).toEqual({ fallback: true })
  })
})
