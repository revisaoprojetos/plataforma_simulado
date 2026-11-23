import { describe, expect, it } from 'vitest'
import { criarFilaCriacao, inserirAntesDe, posicaoNova, servidorAplicouNivel } from './notebook-criacao'

const L = [{ id: 'a', nivel: 0, ordem: 1024 }, { id: 'b', nivel: 1, ordem: 2048 }, { id: 'c', nivel: 0, ordem: 3072 }]
const M = { tipo: 'texto' as const, secaoId: 's' }

describe('posicaoNova', () => {
  it('lista vazia e fim da lista', () => {
    expect(posicaoNova([])).toEqual({ indice: 0, antesDeId: null, nivel: 0, ordem: 1024 })
    expect(posicaoNova(L)).toEqual({ indice: 3, antesDeId: null, nivel: 0, ordem: 3072 + 1024 })
  })
  it('subpágina: depois do grupo do pai, nível pai+1', () => {
    const p = posicaoNova(L, 'a')
    expect(p).toMatchObject({ indice: 2, antesDeId: 'c', nivel: 1 })
    expect(p.ordem).toBe((2048 + 3072) / 2)
  })
  it('subpágina de subpágina: nível 2; teto 2', () => {
    expect(posicaoNova(L, 'b').nivel).toBe(2)
    expect(posicaoNova([{ id: 'x', nivel: 0 }, { id: 'y', nivel: 1 }, { id: 'z', nivel: 2 }], 'z').nivel).toBe(2)
  })
  it('pai desconhecido cai no fim, nível 0', () => { expect(posicaoNova(L, 'zz')).toMatchObject({ indice: 3, nivel: 0 }) })
  it('cliques rápidos: cada nova vê a anterior (ordens distintas e crescentes)', () => {
    let lista: { id: string; nivel: number; ordem: number }[] = [...L]
    const ordens: number[] = []
    for (let i = 0; i < 5; i++) { const p = posicaoNova(lista); ordens.push(p.ordem); lista = inserirAntesDe(lista, { id: `n${i}`, nivel: 0, ordem: p.ordem }, p.antesDeId) }
    expect(new Set(ordens).size).toBe(5)
    expect([...ordens].sort((a, b) => a - b)).toEqual(ordens)
  })
})

describe('inserirAntesDe', () => {
  it('insere antes / no fim', () => {
    expect(inserirAntesDe([{ id: 'a' }], { id: 'n' }, null).map((x) => x.id)).toEqual(['a', 'n'])
    expect(inserirAntesDe([{ id: 'a' }, { id: 'b' }], { id: 'n' }, 'b').map((x) => x.id)).toEqual(['a', 'n', 'b'])
  })
})

describe('servidorAplicouNivel', () => {
  it('nível 0 sempre ok; senão precisa vir igual', () => {
    expect(servidorAplicouNivel(0, undefined)).toBe(true)
    expect(servidorAplicouNivel(1, 1)).toBe(true)
    expect(servidorAplicouNivel(1, undefined)).toBe(false)
  })
})

describe('fila de criação', () => {
  it('sem pendência => undefined; pendente => versão; depois de concluir some', async () => {
    const f = criarFilaCriacao()
    expect(await f.aguardar('x')).toBeUndefined()
    const p = f.registrar('x', async () => 3, M)
    expect(f.pendente('x')).toBe(true); expect(f.meta('x')?.tipo).toBe('texto')
    expect(await f.aguardar('x')).toBe(3); await p
    await Promise.resolve()
    expect(f.pendente('x')).toBe(false)
  })
  it('falha => null', async () => {
    const f = criarFilaCriacao()
    const p = f.registrar('y', async () => null, M)
    expect(await f.aguardar('y')).toBeNull(); await p
  })
  it('serializa as criações na ordem dos cliques', async () => {
    const f = criarFilaCriacao(); const log: string[] = []
    const lento = (n: string, ms: number) => () => new Promise<number>((r) => setTimeout(() => { log.push(n); r(1) }, ms))
    f.registrar('1', lento('1', 20), M)
    f.registrar('2', lento('2', 1), M)
    await f.aguardar('2')
    expect(log).toEqual(['1', '2'])
  })
  it('exceção vira null e não derruba a cadeia', async () => {
    const f = criarFilaCriacao()
    f.registrar('a', async () => { throw new Error('x') }, M)
    expect(await f.aguardar('a')).toBeNull()
    f.registrar('b', async () => 2, M)
    expect(await f.aguardar('b')).toBe(2)
  })
})
