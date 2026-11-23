import { describe, expect, it } from 'vitest'
import {
  agruparBlocos, clampNivel, intervaloBloco, normalizarNiveis, ordenarArvore, planejarMover, reajustarNiveisBloco,
} from './notebook-arvore'
import { CHAVES_FUNDO, PALETA_FUNDO, REGUAS, paginaEditarSchema, secaoEditarSchema, buscaSchema, moverPaginaSchema, copiarPaginaSchema } from './notebook-tipos'
import { colunaAusente, completarPagina, ocorrenciasBusca, limiteLixeiraISO } from './notebook-server'

const U = '11111111-1111-4111-8111-111111111111'
const pg = (id: string, ordem: number, nivel: number, extra: Record<string, unknown> = {}) =>
  ({ id, titulo: id, ordem, nivel, criado_em: '2026-01-01T00:00:00Z', atualizado_em: '2026-01-01T00:00:00Z', ...extra })

describe('clampNivel / normalizarNiveis', () => {
  it('limita a 0..2 e a (anterior + 1)', () => {
    expect(clampNivel(1, null)).toBe(0)          // primeira da seção
    expect(clampNivel(2, 0)).toBe(1)             // não pode pular nível
    expect(clampNivel(2, 1)).toBe(2)
    expect(clampNivel(5, 2)).toBe(2)             // teto
    expect(clampNivel(-3, 2)).toBe(0)
    expect(clampNivel(NaN, 1)).toBe(0)
  })
  it('normaliza a sequência inteira', () => {
    expect(normalizarNiveis([2, 2, 0, 2, 1])).toEqual([0, 1, 0, 1, 1])
    expect(normalizarNiveis([0, 1, 2, 0])).toEqual([0, 1, 2, 0])
    expect(normalizarNiveis([])).toEqual([])
  })
})

describe('agrupamento e ordenação com subpáginas', () => {
  const base = [
    pg('A', 1, 0, { criado_em: '2026-03-01T00:00:00Z', atualizado_em: '2026-03-01T00:00:00Z' }),
    pg('A1', 2, 1, { criado_em: '2026-01-01T00:00:00Z', atualizado_em: '2026-09-01T00:00:00Z' }),
    pg('A2', 3, 2),
    pg('B', 4, 0, { criado_em: '2026-02-01T00:00:00Z', atualizado_em: '2026-05-01T00:00:00Z' }),
    pg('C', 5, 0, { criado_em: '2026-01-15T00:00:00Z', atualizado_em: '2026-06-01T00:00:00Z' }),
    pg('C1', 6, 1),
  ]
  const ids = (l: { id: string }[]) => l.map((x) => x.id)
  it('agruparBlocos: pai + filhos contíguos; órfã inicial abre bloco', () => {
    expect(agruparBlocos(base).map((b) => ids(b))).toEqual([['A', 'A1', 'A2'], ['B'], ['C', 'C1']])
    expect(agruparBlocos([pg('x', 1, 1), pg('y', 2, 2)]).map((b) => ids(b))).toEqual([['x', 'y']])
  })
  it('manual: ordem (e id no empate), independente da entrada embaralhada', () => {
    expect(ids(ordenarArvore([...base].reverse(), 'manual'))).toEqual(['A', 'A1', 'A2', 'B', 'C', 'C1'])
  })
  it('criacao: blocos pela criação do PAI (antigo primeiro); filhos ficam sob o pai na ordem manual', () => {
    // criado do pai: A=03-01, B=02-01, C=01-15 => C, B, A (A1 foi criada antes, mas continua sob A)
    expect(ids(ordenarArvore(base, 'criacao'))).toEqual(['C', 'C1', 'B', 'A', 'A1', 'A2'])
  })
  it('modificacao: bloco pela edição mais recente do bloco (filho conta), mais recente primeiro', () => {
    // A (via A1=09-01) > C (06-01) > B (05-01)
    expect(ids(ordenarArvore(base, 'modificacao'))).toEqual(['A', 'A1', 'A2', 'C', 'C1', 'B'])
  })
  it('titulo: A-Z pt-BR (sem acento/caixa, números naturais) só pelo título do pai', () => {
    const l = [
      pg('1', 1, 0, { titulo: 'Zebra' }), pg('1a', 2, 1, { titulo: 'AAA filho' }),
      pg('2', 3, 0, { titulo: 'árvore' }), pg('3', 4, 0, { titulo: 'Item 10' }), pg('4', 5, 0, { titulo: 'item 2' }),
    ]
    expect(ids(ordenarArvore(l, 'titulo'))).toEqual(['2', '4', '3', '1', '1a'])
  })
  it('empate preserva a ordem manual (estável)', () => {
    const l = [pg('a', 1, 0), pg('b', 2, 0), pg('c', 3, 0)]
    expect(ids(ordenarArvore(l, 'criacao'))).toEqual(['a', 'b', 'c'])
  })
  it('nunca separa filho do pai em nenhum critério', () => {
    for (const modo of ['manual', 'criacao', 'modificacao', 'titulo'] as const) {
      const out = ordenarArvore(base, modo)
      for (const filho of ['A1', 'A2', 'C1']) {
        const i = out.findIndex((x) => x.id === filho)
        const paiIdx = out.slice(0, i).reverse().findIndex((x) => x.nivel === 0)
        expect(paiIdx).toBeGreaterThanOrEqual(0)
        expect(out[i - 1 - paiIdx].id).toBe(filho.startsWith('A') ? 'A' : 'C')
      }
    }
  })
})

describe('bloco e mover entre seções', () => {
  it('intervaloBloco = página + seguintes de nível maior', () => {
    expect(intervaloBloco([0, 1, 2, 1, 0, 1], 0)).toEqual([0, 4])
    expect(intervaloBloco([0, 1, 2, 1, 0, 1], 1)).toEqual([1, 3])
    expect(intervaloBloco([0, 1, 2, 1, 0, 1], 4)).toEqual([4, 6])
  })
  it('reajustarNiveisBloco: raiz clamp pelo vizinho; filhos acompanham o delta', () => {
    expect(reajustarNiveisBloco([1, 2], null)).toEqual([0, 1])    // vai ser a 1ª do destino
    expect(reajustarNiveisBloco([0, 1, 2], 1)).toEqual([0, 1, 2]) // nível 0 é sempre válido
    expect(reajustarNiveisBloco([2, 2], 0)).toEqual([1, 2])       // raiz limitada a 1; filho respeita raiz+1
  })
  const destino = [{ id: 'd1', ordem: 1024, nivel: 0 }, { id: 'd2', ordem: 2048, nivel: 1 }, { id: 'd3', ordem: 3072, nivel: 0 }]
  const bloco = [{ id: 'm', nivel: 0 }, { id: 'm1', nivel: 1 }]
  it('ao fim: ordens após a última', () => {
    const r = planejarMover(destino, bloco)!
    expect(r.sequenciaFinal).toEqual(['d1', 'd2', 'd3', 'm', 'm1'])
    expect(r.ordens.get('m')).toBe(4096)
    expect(r.ordens.get('m1')).toBe(5120)
    expect(r.renumerou).toBe(false)
  })
  it('antes de uma página: ponto médio entre vizinhos, ordem estritamente crescente', () => {
    const r = planejarMover(destino, bloco, 'd3')!
    expect(r.sequenciaFinal).toEqual(['d1', 'd2', 'm', 'm1', 'd3'])
    const a = r.ordens.get('m')!, b = r.ordens.get('m1')!
    expect(a).toBeGreaterThan(2048); expect(b).toBeGreaterThan(a); expect(b).toBeLessThan(3072)
  })
  it('no início: ordens antes da primeira', () => {
    const r = planejarMover(destino, bloco, 'd1')!
    expect(r.sequenciaFinal.slice(0, 2)).toEqual(['m', 'm1'])
    expect(r.ordens.get('m1')!).toBeLessThan(1024)
  })
  it('seção vazia e antes_de_id inexistente', () => {
    expect(planejarMover([], bloco)!.ordens.get('m')).toBe(1024)
    expect(planejarMover(destino, bloco, 'nao-existe')).toBeNull()
    expect(planejarMover(destino, [])).toBeNull()
  })
  it('espaço esgotado => renumera tudo em 1024*n', () => {
    const apertado = [{ id: 'x', ordem: 1, nivel: 0 }, { id: 'y', ordem: 1 + 1e-7, nivel: 0 }]
    const r = planejarMover(apertado, [{ id: 'm', nivel: 0 }], 'y')!
    expect(r.renumerou).toBe(true)
    expect(r.ordens.get('x')).toBe(1024); expect(r.ordens.get('m')).toBe(2048); expect(r.ordens.get('y')).toBe(3072)
  })
  it('reordenar dentro da mesma seção ignora o próprio bloco no destino', () => {
    const seq = [{ id: 'a', ordem: 1024, nivel: 0 }, { id: 'a1', ordem: 2048, nivel: 1 }, { id: 'b', ordem: 3072, nivel: 0 }]
    const r = planejarMover(seq, [{ id: 'a', nivel: 0 }, { id: 'a1', nivel: 1 }], null)!
    expect(r.sequenciaFinal).toEqual(['b', 'a', 'a1'])
  })
  it('bloco cai sob um pai de nível 0: subpágina vira 1ª-nível válido', () => {
    const r = planejarMover([{ id: 'p', ordem: 1024, nivel: 0 }], [{ id: 's', nivel: 2 }], null)!
    expect(r.niveisBloco.get('s')).toBe(1)
  })
})

describe('validação de fundo / régua / nível / ordenar_por', () => {
  const base = { versao: 1, client_op_id: U }
  it('paleta fixa: 16 chaves únicas', () => {
    expect(PALETA_FUNDO.length).toBe(16)
    expect(new Set(CHAVES_FUNDO).size).toBe(16)
    expect(PALETA_FUNDO.every((c) => /^[a-z0-9_]{1,20}$/.test(c.chave) && c.rotulo.length > 0)).toBe(true)
  })
  it('fundo: só chaves da paleta (ou null)', () => {
    expect(paginaEditarSchema.safeParse({ ...base, fundo: 'amarelo' }).success).toBe(true)
    expect(paginaEditarSchema.safeParse({ ...base, fundo: null }).success).toBe(true)
    expect(paginaEditarSchema.safeParse({ ...base, fundo: '#ff0000' }).success).toBe(false)
    expect(paginaEditarSchema.safeParse({ ...base, fundo: 'inexistente' }).success).toBe(false)
  })
  it('régua: lista branca (ou null)', () => {
    for (const r of REGUAS) expect(paginaEditarSchema.safeParse({ ...base, regua: r }).success).toBe(true)
    expect(paginaEditarSchema.safeParse({ ...base, regua: null }).success).toBe(true)
    expect(paginaEditarSchema.safeParse({ ...base, regua: 'gigante' }).success).toBe(false)
  })
  it('nível: inteiro 0..2', () => {
    expect(paginaEditarSchema.safeParse({ ...base, nivel: 2 }).success).toBe(true)
    expect(paginaEditarSchema.safeParse({ ...base, nivel: 3 }).success).toBe(false)
    expect(paginaEditarSchema.safeParse({ ...base, nivel: -1 }).success).toBe(false)
    expect(paginaEditarSchema.safeParse({ ...base, nivel: 1.5 }).success).toBe(false)
  })
  it('ordenar_por da seção', () => {
    for (const o of ['manual', 'criacao', 'modificacao', 'titulo']) expect(secaoEditarSchema.safeParse({ ordenar_por: o }).success).toBe(true)
    expect(secaoEditarSchema.safeParse({ ordenar_por: 'tamanho' }).success).toBe(false)
  })
  it('mover / copiar / busca: corpos', () => {
    expect(moverPaginaSchema.safeParse({ secao_id: U }).success).toBe(true)
    expect(moverPaginaSchema.safeParse({ secao_id: U, antes_de_id: null }).success).toBe(true)
    expect(moverPaginaSchema.safeParse({ secao_id: 'x' }).success).toBe(false)
    expect(copiarPaginaSchema.safeParse({ secao_id: U }).success).toBe(false) // client_op_id obrigatório
    expect(copiarPaginaSchema.safeParse({ secao_id: U, client_op_id: U }).success).toBe(true)
    expect(buscaSchema.safeParse({ q: 'ab', escopo: 'pagina', pagina_id: U }).success).toBe(true)
    expect(buscaSchema.safeParse({ q: 'ab', escopo: 'tudo' }).success).toBe(false)
  })
})

describe('tolerância à migração e utilitários', () => {
  it('colunaAusente', () => {
    expect(colunaAusente({ code: '42703' })).toBe(true)
    expect(colunaAusente({ code: 'PGRST204' })).toBe(true)
    expect(colunaAusente({ message: 'column simulado_aluno_notebook_paginas.nivel does not exist' })).toBe(true)
    expect(colunaAusente({ code: '23505' })).toBe(false)
    expect(colunaAusente(null)).toBe(false)
  })
  it('completarPagina aplica defaults do legado', () => {
    const p = completarPagina({ id: 'a', secao_id: 's', titulo: 't', tipo_pagina: 'texto', ordem: 1, atualizado_em: 'x' })
    expect(p).toMatchObject({ nivel: 0, fundo: null, regua: null, criado_em: null })
  })
  it('ocorrenciasBusca devolve trechos de todas as ocorrências', () => {
    const t = 'prescrição ' + 'x'.repeat(300) + ' outra prescrição aqui ' + 'y'.repeat(300) + ' prescrição final'
    const o = ocorrenciasBusca(t, 'prescrição')
    expect(o.length).toBe(3)
    expect(o.every((s) => s.toLowerCase().includes('prescrição'))).toBe(true)
    expect(ocorrenciasBusca('nada', 'prescrição')).toEqual([])
    expect(ocorrenciasBusca('aaa aaa aaa', 'aaa', 2).length).toBeLessThanOrEqual(2)
  })
  it('limite da lixeira = 60 dias', () => {
    const agora = Date.parse('2026-11-23T12:00:00Z')
    expect(limiteLixeiraISO(agora)).toBe('2026-09-24T12:00:00.000Z')
  })
})
