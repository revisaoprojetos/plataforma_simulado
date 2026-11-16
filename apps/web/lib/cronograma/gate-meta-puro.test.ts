import { describe, it, expect } from 'vitest'
import { bloqueioPorMatriz, bloqueioSemAcesso } from './gate-meta-puro'

describe('gate de meta (matriz = autoridade)', () => {
  const bl = { docFuturo: '2026-11-23', docSemData: '', docFuturo2: '2026-11-20' }
  it('meta futura: bloqueada com a data mais próxima', () => {
    expect(bloqueioPorMatriz(['docFuturo'], bl)).toEqual({ motivo: 'ainda_nao_liberado', liberaEm: '2026-11-23' })
    expect(bloqueioPorMatriz(['docFuturo', 'docFuturo2'], bl)?.liberaEm).toBe('2026-11-20')
    expect(bloqueioPorMatriz(['docSemData'], bl)).toEqual({ motivo: 'ainda_nao_liberado', liberaEm: null })
  })
  it('meta passada / liberada / sem documento: não bloqueia', () => {
    expect(bloqueioPorMatriz(['docPassado'], bl)).toBeNull()
    expect(bloqueioPorMatriz([], bl)).toBeNull()
  })
  it('aluno fora da matriz (liberação total) = lista vazia = tudo liberado', () => {
    expect(bloqueioPorMatriz(['docFuturo'], {})).toBeNull()
  })
  it('item (d): com produto e nenhum doc abre → sem acesso; só-grupo-geral (sem produto) segue o comportamento anterior', () => {
    expect(bloqueioSemAcesso(true, 2, [false, false])).toEqual({ motivo: 'sem_acesso', liberaEm: null })
    expect(bloqueioSemAcesso(true, 2, [false, true])).toBeNull()
    expect(bloqueioSemAcesso(false, 2, [false, false])).toBeNull()
    expect(bloqueioSemAcesso(true, 0, [])).toBeNull()
  })
})
