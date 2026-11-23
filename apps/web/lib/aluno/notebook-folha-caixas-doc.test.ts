import { describe, expect, it } from 'vitest'
import {
  FOLHA_VERSAO, LIMITES_FOLHA, adicionarCaixa, ajustarAlturaCaixa, atualizarDocCaixa, caixaTemConteudo, criarFolhaVazia, docDeTexto, docTemConteudo,
  migrarFolha, serializarFolha, textoDeCaixa, textoDeDoc, validarFolha, type Folha,
} from './notebook-folha'
import { extrairTextoFolha, sanitizarTinta } from './notebook-server'
import { caixasComTexto } from './notebook-exportar'

const UUID = '3f2b8c1e-0a4d-4e6f-9b1a-7c5d2e8f4a10'
const docRico = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Título' }] },
    { type: 'paragraph', attrs: { marca: 'importante' }, content: [{ type: 'text', text: 'negrito', marks: [{ type: 'bold' }] }, { type: 'text', text: ' e ' }, { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://exemplo.com' } }] }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item 1' }] }] }] },
  ],
}
const folhaCom = (caixa: Record<string, unknown>): Folha => ({ ...criarFolhaVazia(), caixas: [{ id: 'c1', x: 10, y: 20, w: 200, h: 80, z: 1, ...caixa }] })
const docGrande = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(LIMITES_FOLHA.textoCaixa + 1) }] }] }

describe('migração texto -> doc (v1/v2 -> v3)', () => {
  it('FOLHA_VERSAO é 3 e folha nova é v3', () => {
    expect(FOLHA_VERSAO).toBe(3)
    expect(criarFolhaVazia().versao).toBe(3)
  })
  it('docDeTexto: 1 parágrafo por linha, linha vazia vira parágrafo vazio, CRLF tratado', () => {
    expect(docDeTexto('a\nb')).toEqual({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
    ] })
    expect((docDeTexto('a\r\n\r\nb').content as unknown[]).length).toBe(3)
    expect((docDeTexto('a\n\nb').content as any[])[1]).toEqual({ type: 'paragraph' })
  })
  it('v2 com texto vira doc em memória, sem texto legado; não muta a entrada', () => {
    const v2 = { ...folhaCom({ texto: 'linha 1\nlinha 2' }), versao: 2 as const }
    const r = validarFolha(JSON.parse(JSON.stringify(v2)))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.folha.versao).toBe(3)
    expect(r.folha.caixas[0].texto).toBeUndefined()
    expect(textoDeDoc(r.folha.caixas[0].doc)).toBe('linha 1\nlinha 2')
    expect(v2.caixas[0].texto).toBe('linha 1\nlinha 2')
  })
  it('v1 com caixa sem texto: continua sem doc (vazia)', () => {
    const r = validarFolha({ ...folhaCom({ texto: '' }), versao: 1 })
    expect(r.ok && r.folha.caixas[0].doc).toBeUndefined()
    expect(r.ok && r.folha.caixas[0].texto).toBeUndefined()
  })
  it('se há doc e texto, o doc vence; migrar é idempotente (mesma ref quando já v3 limpo)', () => {
    const m = migrarFolha({ ...folhaCom({ texto: 'velho', doc: docRico }), versao: 2 })
    expect(m.caixas[0].doc).toBe(docRico)
    expect(m.caixas[0].texto).toBeUndefined()
    expect(migrarFolha(m)).toBe(m)
    const limpa = folhaCom({ doc: docRico })
    expect(migrarFolha(limpa)).toBe(limpa)
  })
  it('aceita v3 com doc e preserva na ida e volta', () => {
    const r = validarFolha(serializarFolha(folhaCom({ doc: docRico })))
    expect(r.ok && r.folha.caixas[0].doc).toEqual(docRico)
  })
  it('rejeita doc fora do formato e texto gigante', () => {
    expect(validarFolha(folhaCom({ doc: { type: 'paragraph' } })).ok).toBe(false)
    expect(validarFolha(folhaCom({ doc: docDeTexto('x'.repeat(LIMITES_FOLHA.textoCaixa)) })).ok).toBe(true)
    expect(validarFolha(folhaCom({ doc: docGrande })).ok).toBe(false)
  })
})

describe('operações da caixa com doc', () => {
  it('adicionarCaixa nasce sem doc; com texto inicial grava doc', () => {
    expect(adicionarCaixa(criarFolhaVazia(), { id: 'a', x: 0, y: 0 }).caixas[0].doc).toBeUndefined()
    expect(textoDeCaixa(adicionarCaixa(criarFolhaVazia(), { id: 'a', x: 0, y: 0, texto: 'oi' }).caixas[0])).toBe('oi')
  })
  it('atualizarDocCaixa: grava, no-op com mesma ref, recusa texto gigante, remove texto legado', () => {
    const f = folhaCom({ texto: 'velho' })
    const g = atualizarDocCaixa(f, 'c1', docRico)
    expect(g.caixas[0].doc).toBe(docRico)
    expect(g.caixas[0].texto).toBeUndefined()
    expect(atualizarDocCaixa(g, 'c1', docRico)).toBe(g)
    expect(atualizarDocCaixa(g, 'c1', docGrande)).toBe(g)
  })
  it('ajustarAlturaCaixa só muda se a diferença passa de 1px; respeita mínimo', () => {
    const f = folhaCom({})
    expect(ajustarAlturaCaixa(f, 'c1', 80.5)).toBe(f)
    expect(ajustarAlturaCaixa(f, 'c1', 150).caixas[0].h).toBe(150)
    expect(ajustarAlturaCaixa(f, 'c1', 5).caixas[0].h).toBe(28)
  })
  it('conteúdo: vazio descarta; imagem conta como conteúdo', () => {
    expect(docTemConteudo({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(false)
    expect(docTemConteudo(docDeTexto('  \n '))).toBe(false)
    expect(docTemConteudo(docRico)).toBe(true)
    expect(docTemConteudo({ type: 'doc', content: [{ type: 'image', attrs: { src: '/x' } }] })).toBe(true)
    expect(caixaTemConteudo({ texto: ' ' })).toBe(false)
    expect(caixaTemConteudo({ texto: 'a' })).toBe(true)
  })
})

describe('extração de texto (busca/exportação)', () => {
  it('textoDeDoc: blocos por linha, listas e células', () => {
    expect(textoDeDoc(docRico)).toBe('Título\nnegrito e link\nitem 1')
    const tabela = { type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [
      { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
      { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
    ] }] }] }
    expect(textoDeDoc(tabela).replace(/\s+/g, ' ')).toBe('A B')
  })
  it('extrairTextoFolha: doc (v3) e texto legado, na ordem y/x; caixa vazia ignorada', () => {
    const f: Folha = { ...criarFolhaVazia(), caixas: [
      { id: 'b', x: 10, y: 200, w: 100, h: 50, z: 1, doc: docDeTexto('segunda') },
      { id: 'a', x: 10, y: 50, w: 100, h: 50, z: 2, texto: 'primeira' },
      { id: 'v', x: 10, y: 10, w: 100, h: 50, z: 3, doc: { type: 'doc', content: [{ type: 'paragraph' }] } },
      { id: 'r', x: 10, y: 120, w: 100, h: 50, z: 4, doc: docRico },
    ] }
    expect(extrairTextoFolha(f)).toBe('primeira\nTítulo\nnegrito e link\nitem 1\nsegunda')
  })
  it('exportação: caixasComTexto lê o doc; caixa vazia fica de fora', () => {
    const f: Folha = { ...criarFolhaVazia(), caixas: [
      { id: 'a', x: 0, y: 0, w: 100, h: 50, z: 2, doc: docDeTexto('oi') },
      { id: 'b', x: 0, y: 0, w: 100, h: 50, z: 1, texto: 'legado' },
      { id: 'c', x: 0, y: 0, w: 100, h: 50, z: 3 },
    ] }
    expect(caixasComTexto(f).map((c) => c.id)).toEqual(['b', 'a'])
  })
})

describe('sanitizarTinta com doc nas caixas (lista branca do servidor)', () => {
  it('aceita doc válido, descarta link perigoso mantendo o texto e remove attrs desconhecidos', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', attrs: { x: 1, marca: 'pergunta' }, content: [
      { type: 'text', text: 'oi', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }, { type: 'bold' }] },
    ] }] }
    const r = sanitizarTinta(folhaCom({ doc }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const p: any = (r.folha.caixas[0].doc as any).content[0]
    expect(p.attrs).toEqual({ marca: 'pergunta' })
    expect(p.content[0].marks).toEqual([{ type: 'bold' }])
    expect(r.folha.versao).toBe(3)
  })
  it('recusa nó/mark fora da lista branca, imagem externa e anexo inválido', () => {
    const ok = (no: unknown) => sanitizarTinta(folhaCom({ doc: { type: 'doc', content: [no] } })).ok
    expect(ok({ type: 'script' })).toBe(false)
    expect(ok({ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'evil' }] }] })).toBe(false)
    expect(ok({ type: 'image', attrs: { src: 'https://evil.com/x.png' } })).toBe(false)
    expect(ok({ type: 'anexo', attrs: { arquivo: '../../etc/passwd' } })).toBe(false)
    expect(ok({ type: 'questaoRef', attrs: { questao_id: 'nao-uuid' } })).toBe(false)
    expect(ok({ type: 'questaoRef', attrs: { questao_id: UUID } })).toBe(true)
  })
  it('migra caixa legada (texto) ao validar e devolve só doc', () => {
    const r = sanitizarTinta({ ...folhaCom({ texto: 'abc' }), versao: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.folha.caixas[0].texto).toBeUndefined()
    expect(textoDeDoc(r.folha.caixas[0].doc)).toBe('abc')
  })
  it('limite de 1 MB continua valendo com docs', () => {
    const caixas = Array.from({ length: 70 }, (_, i) => ({ id: 'c' + i, x: 0, y: 0, w: 100, h: 100, z: i, doc: docDeTexto('a'.repeat(LIMITES_FOLHA.textoCaixa)) }))
    expect(sanitizarTinta({ ...criarFolhaVazia(), caixas }).ok).toBe(false)
  })
})
