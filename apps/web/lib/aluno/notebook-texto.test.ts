import { describe, expect, it } from 'vitest'
import { sniffMime } from '@/lib/storage/validate'
import { sanitizarDoc } from './notebook-server'
import {
  agruparMarcas, arquivoAnexoValido, formatarTamanho, normalizarLink, corValida, extrairMarcas, familiaValida, parseArquivoId, srcImagemValido, tamanhoFonteValido, validarUploadNotebook,
} from './notebook-texto'

const U = '11111111-1111-4111-8111-111111111111'
const doc = (...content: any[]) => ({ type: 'doc', content })
const p = (text: string, marks?: any[], attrs?: any) => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] })

describe('validadores de estilo', () => {
  it('cor: hex/token/var; rejeita rgb, url e injeção', () => {
    expect(corValida('#aabbcc')).toBe('#aabbcc')
    expect(corValida('amarelo')).toBe('amarelo')
    expect(corValida('var(--brand)')).toBe('var(--brand)')
    expect(corValida('rgb(1,2,3)')).toBeNull()
    expect(corValida('red;background:url(x)')).toBeNull()
    expect(corValida('#abc')).toBeNull()
  })
  it('fonte e tamanho', () => {
    expect(familiaValida('Segoe UI')).toBe('Segoe UI')
    expect(familiaValida("Times New Roman")).toBe('Times New Roman')
    expect(familiaValida('a;color:red')).toBeNull()
    expect(familiaValida('x(y)')).toBeNull()
    expect(tamanhoFonteValido('16px')).toBe('16px')
    expect(tamanhoFonteValido(18)).toBe('18px')
    expect(tamanhoFonteValido('2px')).toBeNull()
    expect(tamanhoFonteValido('999px')).toBeNull()
    expect(tamanhoFonteValido('1em')).toBeNull()
  })
})

describe('sanitizarDoc — onda 2a', () => {
  it('textStyle/highlight/sub/sup: mantém válidos e descarta inválidos', () => {
    const r = sanitizarDoc(doc(p('x', [
      { type: 'textStyle', attrs: { color: '#112233', fontFamily: 'Arial', fontSize: '18px', onclick: 'x' } },
      { type: 'highlight', attrs: { color: 'rgb(0,0,0)' } }, { type: 'subscript' },
    ]), p('y', [{ type: 'textStyle', attrs: { color: 'javascript:1' } }])))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.doc.content[0].content[0].marks).toEqual([
        { type: 'textStyle', attrs: { color: '#112233', fontFamily: 'Arial', fontSize: '18px' } }, { type: 'highlight' }, { type: 'subscript' },
      ])
      expect(r.doc.content[1].content[0].marks).toBeUndefined()
    }
  })
  it('atributos de bloco: alinhamento, recuo, marca, estilo; descarta o resto', () => {
    const r = sanitizarDoc(doc(
      p('a', undefined, { textAlign: 'center', indent: 2, marca: 'importante', estilo: 'titulo_pagina', style: 'x' }),
      { type: 'heading', attrs: { level: 6, textAlign: 'evil', marca: 'nao' }, content: [{ type: 'text', text: 'h' }] },
    ))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.doc.content[0].attrs).toEqual({ textAlign: 'center', indent: 2, marca: 'importante', estilo: 'titulo_pagina' })
      expect(r.doc.content[1].attrs).toEqual({ level: 6 })
    }
  })
  it('image: só src da rota autenticada do caderno', () => {
    const ok = `/api/aluno/notebook/arquivos/${U}.png`
    expect(sanitizarDoc(doc({ type: 'image', attrs: { src: ok, width: 300, alt: 'a' } })).ok).toBe(true)
    for (const src of ['https://evil.com/a.png', `/api/aluno/notebook/arquivos/${U}.svg`, `/api/aluno/notebook/arquivos/../x.png`, 'data:image/png;base64,AA', `//x/${U}.png`]) {
      expect(sanitizarDoc(doc({ type: 'image', attrs: { src } })).ok).toBe(false)
    }
    const r = sanitizarDoc(doc({ type: 'image', attrs: { src: ok, width: 99999, onerror: 'x' } }))
    expect(r.ok && r.doc.content[0].attrs).toEqual({ src: ok })
  })
  it('anexo: exige <uuid>.<ext> permitida', () => {
    const r = sanitizarDoc(doc({ type: 'anexo', attrs: { arquivo: `${U}.pdf`, nome: 'Apostila.pdf', tamanho: 1234 } }))
    expect(r.ok && r.doc.content[0].attrs).toEqual({ arquivo: `${U}.pdf`, nome: 'Apostila.pdf', tamanho: 1234 })
    expect(sanitizarDoc(doc({ type: 'anexo', attrs: { arquivo: `${U}.exe`, nome: 'x' } })).ok).toBe(false)
    expect(sanitizarDoc(doc({ type: 'anexo', attrs: { arquivo: '../../etc/passwd' } })).ok).toBe(false)
  })
  it('helpers de arquivo', () => {
    expect(srcImagemValido(`/api/aluno/notebook/arquivos/${U.toUpperCase()}.JPG`)).toBe(`/api/aluno/notebook/arquivos/${U}.jpg`)
    expect(arquivoAnexoValido(`${U}.png`)).toBeNull()
    expect(parseArquivoId(`${U}.webp`)).toEqual({ id: U, ext: 'webp', imagem: true })
    expect(parseArquivoId(`${U}.docx`)?.imagem).toBe(false)
    expect(parseArquivoId('x.png')).toBeNull()
  })
})

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1])
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1])
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1])
const txt = new TextEncoder().encode('olá mundo')

describe('validarUploadNotebook', () => {
  const v = (nome: string, mime: string, bytes: Uint8Array, tipo: 'imagem' | 'arquivo') => validarUploadNotebook({ nome, mimeDeclarado: mime, bytes, tipo }, sniffMime)
  it('imagem: valida pela assinatura e ignora a extensão do nome', () => {
    const r = v('foto.exe', 'image/png', png, 'imagem')
    expect(r.ok && r.ext).toBe('png')
    expect(v('a.png', 'image/jpg', jpg, 'imagem').ok).toBe(true)
  })
  it('imagem: rejeita spoof, tipo errado, vazio e grande', () => {
    expect(v('a.png', 'image/jpeg', png, 'imagem').ok).toBe(false)
    expect(v('a.png', 'image/png', pdf, 'imagem').ok).toBe(false)
    expect(v('a.png', 'image/png', new Uint8Array(0), 'imagem').ok).toBe(false)
    const grande = new Uint8Array(5 * 1024 * 1024 + 1); grande.set(png)
    const r = v('a.png', 'image/png', grande, 'imagem'); expect(!r.ok && r.status).toBe(413)
    expect(v('a.svg', 'image/svg+xml', new TextEncoder().encode('<svg onload=1>'), 'imagem').ok).toBe(false)
  })
  it('arquivo: pdf/office/txt conferem extensão x assinatura', () => {
    expect(v('a.pdf', 'application/pdf', pdf, 'arquivo').ok).toBe(true)
    expect(v('a.docx', '', zip, 'arquivo').ok).toBe(true)
    expect(v('a.txt', 'text/plain', txt, 'arquivo').ok).toBe(true)
    expect(v('a.pdf', 'application/pdf', zip, 'arquivo').ok).toBe(false)
    expect(v('a.docx', '', pdf, 'arquivo').ok).toBe(false)
    expect(v('a.txt', '', png, 'arquivo').ok).toBe(false)
    expect(v('a.txt', '', new Uint8Array([65, 0, 66]), 'arquivo').ok).toBe(false)
    expect(v('a.exe', '', zip, 'arquivo').ok).toBe(false)
    expect(v('a.html', '', txt, 'arquivo').ok).toBe(false)
  })
  it('arquivo: limite de 10 MB e nome higienizado', () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1); big.set(pdf)
    expect(v('a.pdf', '', big, 'arquivo').ok).toBe(false)
    const r = v('../a<b>.pdf', '', pdf, 'arquivo')
    expect(r.ok && r.nomeSeguro).toBe('.._a_b_.pdf')
  })
})

describe('extrairMarcas', () => {
  const d = doc(
    p('normal'),
    p('importante!', undefined, { marca: 'importante' }),
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('feito')] }, { type: 'taskItem', attrs: { checked: false }, content: [p('pendente')] }] },
    { type: 'heading', attrs: { level: 2, marca: 'pergunta' }, content: [{ type: 'text', text: 'e agora?' }] },
  )
  it('lista marcas e A Fazer com texto e estado', () => {
    const m = extrairMarcas(d)
    expect(m.map((x) => [x.tipo, x.texto, x.feito])).toEqual([
      ['importante', 'importante!', undefined], ['a_fazer', 'feito', true], ['a_fazer', 'pendente', false], ['pergunta', 'e agora?', undefined],
    ])
  })
  it('posições seguem a contagem do ProseMirror', () => {
    // p('normal') = 2+6 = 8 -> parágrafo marcado em 8; 'importante!' = 2+11 = 13 -> taskList em 21; taskItem em 22
    const m = extrairMarcas(d)
    expect(m[0].pos).toBe(8)
    expect(m[1].pos).toBe(22)
  })
  it('agrupa por tipo na ordem canônica e respeita o máximo', () => {
    expect(agruparMarcas(extrairMarcas(d)).map((g) => g.tipo)).toEqual(['a_fazer', 'importante', 'pergunta'])
    expect(extrairMarcas(d, 2)).toHaveLength(2)
    expect(extrairMarcas(null)).toEqual([])
  })
})

describe('normalizarLink / formatarTamanho', () => {
  it('aceita https/http/mailto/relativo e completa domínio e e-mail', () => {
    expect(normalizarLink('https://a.com/x')).toBe('https://a.com/x')
    expect(normalizarLink('www.a.com.br')).toBe('https://www.a.com.br')
    expect(normalizarLink('a@b.com')).toBe('mailto:a@b.com')
    expect(normalizarLink('/aluno/nova/cadernos/onenote?pagina=x')).toBe('/aluno/nova/cadernos/onenote?pagina=x')
  })
  it('rejeita esquemas perigosos, espaços e vazio', () => {
    for (const v of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.com', 'a b.com', '', 'ftp://x.com', 'texto']) expect(normalizarLink(v)).toBeNull()
  })
  it('formata tamanho', () => {
    expect(formatarTamanho(500)).toBe('500 B')
    expect(formatarTamanho(2048)).toBe('2.0 KB')
    expect(formatarTamanho(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
