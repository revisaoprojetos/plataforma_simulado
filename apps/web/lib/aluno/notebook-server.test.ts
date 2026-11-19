import { describe, expect, it } from 'vitest'
import {
  calcularOrdem, extrairQuestaoIds, extrairTexto, ordemAoFinal, renumerarOrdens, sanitizarDoc, tabelaAusente, trechoBusca, urlSegura,
} from './notebook-server'

const U = '11111111-1111-4111-8111-111111111111'
const doc = (...content: any[]) => ({ type: 'doc', content })
const p = (text: string, marks?: any[]) => ({ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] })

describe('sanitizarDoc', () => {
  it('aceita doc simples e preserva texto/marks', () => {
    const r = sanitizarDoc(doc(p('olá', [{ type: 'bold' }, { type: 'italic' }])))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.doc.content[0].content[0].marks).toEqual([{ type: 'bold' }, { type: 'italic' }])
  })
  it('rejeita nó desconhecido (image, script)', () => {
    expect(sanitizarDoc(doc({ type: 'image', attrs: { src: 'data:image/png;base64,AAA' } })).ok).toBe(false)
    expect(sanitizarDoc(doc({ type: 'iframe' })).ok).toBe(false)
  })
  it('rejeita mark desconhecida e raiz inválida', () => {
    expect(sanitizarDoc(doc(p('x', [{ type: 'textStyle' }]))).ok).toBe(false)
    expect(sanitizarDoc({ type: 'paragraph' }).ok).toBe(false)
    expect(sanitizarDoc(null).ok).toBe(false)
  })
  it('remove link perigoso mas mantém o texto; mantém https/mailto/relativo', () => {
    const r = sanitizarDoc(doc(
      p('a', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
      p('b', [{ type: 'link', attrs: { href: 'https://x.com/a' } }]),
      p('c', [{ type: 'link', attrs: { href: 'data:text/html,x' } }]),
    ))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.doc.content[0].content[0].marks).toBeUndefined()
      expect(r.doc.content[1].content[0].marks[0].attrs.href).toBe('https://x.com/a')
      expect(r.doc.content[2].content[0].marks).toBeUndefined()
    }
    expect(urlSegura('/aluno/biblioteca/x')).toBe('/aluno/biblioteca/x')
    expect(urlSegura('//evil.com')).toBeNull()
    expect(urlSegura('mailto:a@b.com')).toBe('mailto:a@b.com')
  })
  it('descarta attrs desconhecidos e valida heading/uuid', () => {
    const r = sanitizarDoc(doc({ type: 'heading', attrs: { level: 2, onclick: 'x' }, content: [{ type: 'text', text: 'T' }] }))
    expect(r.ok && r.doc.content[0].attrs).toEqual({ level: 2 })
    expect(sanitizarDoc(doc({ type: 'heading', attrs: { level: 5 } })).ok).toBe(false)
    expect(sanitizarDoc(doc({ type: 'questaoRef', attrs: { questao_id: 'nao-uuid' } })).ok).toBe(false)
    expect(sanitizarDoc(doc({ type: 'questaoRef', attrs: { questao_id: U } })).ok).toBe(true)
  })
  it('grifoSnapshot: texto truncado, link inválido removido', () => {
    const r = sanitizarDoc(doc({ type: 'grifoSnapshot', attrs: { documento_id: U, pagina: 3, texto: 'x'.repeat(5000), link: 'javascript:1', extra: 1 } }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      const at = r.doc.content[0].attrs
      expect(at.texto.length).toBe(2000)
      expect(at.link).toBeUndefined()
      expect(at.extra).toBeUndefined()
    }
  })
  it('limite de profundidade', () => {
    let n: any = p('x')
    for (let i = 0; i < 25; i++) n = { type: 'blockquote', content: [n] }
    expect(sanitizarDoc(doc(n)).ok).toBe(false)
  })
  it('limite de nós e de 2 MB', () => {
    expect(sanitizarDoc(doc(...Array.from({ length: 5001 }, () => ({ type: 'horizontalRule' })))).ok).toBe(false)
    const grande = doc(...Array.from({ length: 30 }, () => p('a'.repeat(100_000))))
    expect(sanitizarDoc(grande).ok).toBe(false)
  })
  it('átomos não carregam content; doc vazio vira parágrafo', () => {
    const r = sanitizarDoc(doc({ type: 'horizontalRule', content: [{ type: 'script' }] }))
    expect(r.ok && r.doc.content[0].content).toBeUndefined()
    const v = sanitizarDoc({ type: 'doc', content: [] })
    expect(v.ok && v.doc.content).toEqual([{ type: 'paragraph' }])
  })
})

describe('extrairTexto / questaoIds', () => {
  it('extrai texto, grifo e anotação; ignora questaoRef', () => {
    const d = doc(
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Título' }] },
      p('corpo'),
      { type: 'questaoRef', attrs: { questao_id: U } },
      { type: 'grifoSnapshot', attrs: { texto: 'trecho grifado' } },
      { type: 'anotacaoRef', attrs: { texto: 'nota' } },
    )
    const t = extrairTexto(d)
    expect(t).toContain('Título')
    expect(t).toContain('corpo')
    expect(t).toContain('trecho grifado')
    expect(t).toContain('nota')
    expect(t).not.toContain(U)
    expect(extrairQuestaoIds(d)).toEqual([U])
  })
  it('trunca em 200.000 caracteres', () => {
    const d = doc(...Array.from({ length: 5 }, () => p('a'.repeat(60_000))))
    expect(extrairTexto(d).length).toBeLessThanOrEqual(200_000)
  })
  it('trechoBusca centra no termo', () => {
    expect(trechoBusca('a'.repeat(200) + ' prescrição penal ' + 'b'.repeat(200), 'prescrição')).toContain('prescrição')
  })
})

describe('ordem por ponto médio', () => {
  it('casos de borda', () => {
    expect(calcularOrdem(null, null)).toEqual({ ordem: 1024, renumerar: false })
    expect(calcularOrdem(2048, null)).toEqual({ ordem: 3072, renumerar: false })
    expect(calcularOrdem(null, 1024)).toEqual({ ordem: 0, renumerar: false })
    expect(calcularOrdem(1024, 2048)).toEqual({ ordem: 1536, renumerar: false })
  })
  it('pede renumeração quando o espaço acaba', () => {
    expect(calcularOrdem(1, 1 + 1e-7).renumerar).toBe(true)
  })
  it('auxiliares', () => {
    expect(ordemAoFinal(null)).toBe(1024)
    expect(ordemAoFinal(5000)).toBe(6024)
    expect(renumerarOrdens(3)).toEqual([1024, 2048, 3072])
  })
})

describe('tabelaAusente', () => {
  it('detecta códigos de migração pendente', () => {
    expect(tabelaAusente({ code: '42P01' })).toBe(true)
    expect(tabelaAusente({ code: 'PGRST205' })).toBe(true)
    expect(tabelaAusente({ code: '23505' })).toBe(false)
    expect(tabelaAusente(null)).toBe(false)
  })
})

describe('folha livre (tinta)', () => {
  it('sanitizarTinta aceita folha válida e rejeita inválida/grande', async () => {
    const { sanitizarTinta, tintaVazia, extrairTextoFolha } = await import('./notebook-server')
    const { adicionarCaixa } = await import('./notebook-folha')
    expect(sanitizarTinta(tintaVazia()).ok).toBe(true)
    expect(sanitizarTinta({ versao: 2 }).ok).toBe(false)
    expect(sanitizarTinta('lixo{').ok).toBe(false)
    const grande = JSON.stringify({ ...tintaVazia(), x: 'a'.repeat(1_100_000) })
    expect(sanitizarTinta(grande).ok).toBe(false)
    const f = adicionarCaixa(adicionarCaixa(tintaVazia(), { id: 'b', x: 10, y: 200, texto: 'segunda' }), { id: 'a', x: 10, y: 50, texto: 'primeira' })
    expect(extrairTextoFolha(f)).toBe('primeira\nsegunda')
    expect(extrairTextoFolha(null)).toBe('')
  })
  it('schemas aceitam tinta e normalizam tipo_pagina', async () => {
    const { paginaCriarSchema, paginaEditarSchema } = await import('./notebook-tipos')
    const base = { secao_id: U, client_op_id: U }
    expect(paginaCriarSchema.parse({ ...base, tipo_pagina: 'folha' }).tipo_pagina).toBe('folha_livre')
    expect(paginaCriarSchema.parse({ ...base, tipo_pagina: 'folha_livre' }).tipo_pagina).toBe('folha_livre')
    expect(paginaCriarSchema.safeParse({ ...base, tipo_pagina: 'x' }).success).toBe(false)
    expect(paginaEditarSchema.safeParse({ versao: 1, client_op_id: U, tinta: { versao: 1 } }).success).toBe(true)
    expect(paginaEditarSchema.safeParse({ versao: 1, client_op_id: U }).success).toBe(false)
  })
})
