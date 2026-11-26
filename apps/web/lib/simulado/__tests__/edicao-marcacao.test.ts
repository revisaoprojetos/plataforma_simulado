import { describe, it, expect } from 'vitest'
import { planejarEdicao, letraDaAlternativa, type AltEdicao } from '../edicao-marcacao'
import { calcularNota, type NotaContexto } from '../nota-pura'

const alts: AltEdicao[] = [
  { id: 'a', correta: false, ordem: 0 }, { id: 'b', correta: true, ordem: 1 },
  { id: 'c', correta: false, ordem: 2 }, { id: 'd', correta: false, ordem: 3 }, { id: 'e', correta: false, ordem: 4 },
]

describe('planejarEdicao', () => {
  it('1ª edição: preserva a original do aluno e recorrige', () => {
    const p = planejarEdicao({ alts, atual: { alternativa_id: 'c' }, nova: 'b' }) as any
    expect(p.acao).toBe('gravar')
    expect(p.alternativa_id).toBe('b')
    expect(p.correta).toBe(true)
    expect(p.pontuacao).toBe(1)
    expect(p.marcacao_editada).toBe(true)
    expect(p.marcacao_original_alternativa_id).toBe('c')
    expect(p.primeiraEdicao).toBe(true)
    expect(p.snapshot_gabarito).toEqual({ alternativa_id: 'b', correta: true, letra: 'B' })
  })

  it('2ª edição mantém a original da 1ª', () => {
    const p = planejarEdicao({ alts, atual: { alternativa_id: 'b', marcacao_editada: true, marcacao_original_alternativa_id: 'c' }, nova: 'd' }) as any
    expect(p.marcacao_original_alternativa_id).toBe('c')
    expect(p.primeiraEdicao).toBe(false)
    expect(p.correta).toBe(false)
    expect(p.pontuacao).toBe(0)
  })

  it('em branco → alternativa: original = em branco (null) com editada=true', () => {
    const p = planejarEdicao({ alts, atual: null, nova: 'b' }) as any
    expect(p.marcacao_editada).toBe(true)
    expect(p.marcacao_original_alternativa_id).toBeNull()
    expect(p.original).toBeNull()
    expect(p.correta).toBe(true)
  })

  it('alternativa → em branco: mantém a linha, sem acerto/erro, guardando a original', () => {
    const p = planejarEdicao({ alts, atual: { alternativa_id: 'c' }, nova: null }) as any
    expect(p.acao).toBe('gravar')
    expect(p.alternativa_id).toBeNull()
    expect(p.correta).toBeNull()
    expect(p.snapshot_gabarito).toBeNull()
    expect(p.marcacao_original_alternativa_id).toBe('c')
  })

  it('restaurar volta à original e limpa os campos de edição', () => {
    const p = planejarEdicao({ alts, atual: { alternativa_id: 'b', marcacao_editada: true, marcacao_original_alternativa_id: 'c' }, nova: null, restaurar: true }) as any
    expect(p.alternativa_id).toBe('c')
    expect(p.correta).toBe(false)
    expect(p.marcacao_editada).toBe(false)
    expect(p.marcacao_original_alternativa_id).toBeNull()
    expect(p.restaurou).toBe(true)
  })

  it('restaurar com original em branco apaga a linha', () => {
    const p = planejarEdicao({ alts, atual: { alternativa_id: 'b', marcacao_editada: true, marcacao_original_alternativa_id: null }, nova: null, restaurar: true }) as any
    expect(p.acao).toBe('apagar')
    expect(p.restaurou).toBe(true)
  })

  it('escolher manualmente a original equivale a restaurar', () => {
    const p = planejarEdicao({ alts, atual: { alternativa_id: 'b', marcacao_editada: true, marcacao_original_alternativa_id: 'c' }, nova: 'c' }) as any
    expect(p.restaurou).toBe(true)
    expect(p.marcacao_editada).toBe(false)
  })

  it('erros: sem mudança, alternativa de outra questão, restaurar sem edição', () => {
    expect(planejarEdicao({ alts, atual: { alternativa_id: 'c' }, nova: 'c' })).toHaveProperty('erro')
    expect(planejarEdicao({ alts, atual: { alternativa_id: 'c' }, nova: 'zzz' })).toHaveProperty('erro')
    expect(planejarEdicao({ alts, atual: { alternativa_id: 'c' }, nova: null, restaurar: true })).toHaveProperty('erro')
    expect(planejarEdicao({ alts, atual: null, nova: null })).toHaveProperty('erro')
  })

  it('letraDaAlternativa respeita a ordem', () => {
    expect(letraDaAlternativa([...alts].reverse(), 'b')).toBe('B')
    expect(letraDaAlternativa(alts, null)).toBeNull()
  })
})

describe('recálculo da nota após a edição (regra canônica)', () => {
  const ctx = (extra: Partial<NotaContexto> = {}): NotaContexto => ({ totalQuestoes: 100, anuladas: new Map(), tipoCorrecao: 'pontuacao', ...extra })
  const resp = (n: number) => Array.from({ length: n }, (_, i) => ({ questao_id: `q${i}`, correta: true as boolean | null }))

  it('79 acertos → +5 trocas = 84', () => {
    const antes = [...resp(79), ...Array.from({ length: 5 }, (_, i) => ({ questao_id: `x${i}`, correta: false as boolean | null }))]
    expect(calcularNota(antes, ctx())).toBe(79)
    const depois = [...resp(79), ...Array.from({ length: 5 }, (_, i) => ({ questao_id: `x${i}`, correta: true as boolean | null }))]
    expect(calcularNota(depois, ctx())).toBe(84)
  })

  it('questão anulada continua não contando como acerto da resposta (ponto já garantido)', () => {
    const c = ctx({ anuladas: new Map([['q0', 'pontua_todos' as const]]) })
    expect(calcularNota([{ questao_id: 'q0', correta: false }], c)).toBe(1)
    expect(calcularNota([{ questao_id: 'q0', correta: true }], c)).toBe(1)
  })

  it('CEBRASPE: em branco editado (correta=null) não desconta; erro desconta', () => {
    const c = ctx({ totalQuestoes: 10, tipoCorrecao: 'cebraspe' })
    const base = [{ questao_id: 'a', correta: true }, { questao_id: 'b', correta: false }]
    expect(calcularNota(base, c)).toBe(0)
    expect(calcularNota([base[0], { questao_id: 'b', correta: null }], c)).toBe(10)
  })
})
