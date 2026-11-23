import { describe, it, expect } from 'vitest'
import { diagnosticarInsuficiencia, ehInsuficiencia, maxSemanasEfetivo, ErroPlanoInviavel } from '../diagnostico-insuficiencia'
import type { AulaAS } from '../motor28'

const aula = (disc: string, nome: string, pag: number): AulaAS => [disc, '', nome, pag, '', '']
const SEM = [2, 2, 2, 2, 2, 2, 2]

describe('diagnosticarInsuficiencia', () => {
  it('aula maior que a soma dos 3 melhores dias', () => {
    // 600 pg a 17 pg/h ≈ 35,3 h; 3 melhores dias de 2 h = 6 h
    const d = diagnosticarInsuficiencia({ cfg: { horas: SEM, discs: ['A'] }, AS: [aula('A', 'Gigante', 600), aula('A', 'Pequena', 20)] })
    expect(d.causa).toBe('aula_maior_que_melhores_dias')
    expect(d.detalhes.aula?.nome).toBe('Gigante')
    expect(d.detalhes.melhoresDiasHoras).toBe(6)
    expect(d.mensagem).toContain('Gigante')
    expect(d.mensagem).toContain('3 melhores dias')
    expect(d.mensagem).toContain('Nenhuma alteração foi aplicada')
  })
  it('limite: aula exatamente igual à soma dos melhores dias cabe (não é A1)', () => {
    // 34 pg a 17 pg/h = 2 h → min 120; um único dia de 2 h
    const d = diagnosticarInsuficiencia({ cfg: { horas: [2, 0, 0, 0, 0, 0, 0], discs: ['A'] }, AS: [aula('A', 'Cabe', 34)] })
    expect(d.causa).not.toBe('aula_maior_que_melhores_dias')
  })
  it('usa a rotina datada mais favorável', () => {
    const d = diagnosticarInsuficiencia({ cfg: { horas: [1, 1, 1, 0, 0, 0, 0], rotinas: [{ horas: [8, 8, 8, 0, 0, 0, 0] }], discs: ['A'] }, AS: [aula('A', 'X', 200)] })
    expect(d.causa).not.toBe('aula_maior_que_melhores_dias') // 200 pg / 17 ≈ 11,8 h ≤ 24 h
  })
  it('velocidade manual suspeita (<8 pg/h)', () => {
    const d = diagnosticarInsuficiencia({ cfg: { horas: SEM, discs: ['A'], vel: 3 }, AS: [aula('A', 'Aula', 100)] })
    expect(d.causa).toBe('velocidade_suspeita')
    expect(d.mensagem).toContain('3 pg/h')
    expect(d.mensagem).toContain('Nenhuma alteração foi aplicada')
  })
  it('limite da velocidade: 8 pg/h não é suspeita', () => {
    const d = diagnosticarInsuficiencia({ cfg: { horas: SEM, discs: ['A'], vel: 8 }, AS: [aula('A', 'Aula', 300)] })
    expect(d.causa).not.toBe('velocidade_suspeita')
  })
  it('velocidade baixa sem problema não acusa velocidade', () => {
    const d = diagnosticarInsuficiencia({ cfg: { horas: [10, 10, 10, 10, 10, 10, 10], discs: ['A'], vel: 5 }, AS: [aula('A', 'Aula', 30)] })
    expect(d.causa).toBe('disponibilidade_insuficiente')
  })
  it('carga acima do teto de semanas', () => {
    // 20 aulas de 34 pg = 2 h cada = 40 h; semana de 7 h → 6 semanas > teto 3 (cada aula cabe nos melhores dias)
    const AS = Array.from({ length: 20 }, (_, i) => aula('A', 'A' + i, 34))
    const d = diagnosticarInsuficiencia({ cfg: { horas: [1, 1, 1, 1, 1, 1, 1], discs: ['A'] }, AS, maxSemanas: 3 })
    expect(d.causa).toBe('carga_acima_do_teto')
    expect(d.detalhes.semanasNecessarias).toBe(6)
    expect(d.mensagem).toContain('3 semanas')
  })
  it('só considera disciplinas selecionadas', () => {
    const d = diagnosticarInsuficiencia({ cfg: { horas: SEM, discs: ['A'] }, AS: [aula('B', 'Fora', 900), aula('A', 'Dentro', 20)] })
    expect(d.causa).toBe('disponibilidade_insuficiente')
  })
  it('fallback sem horas', () => {
    const d = diagnosticarInsuficiencia({ cfg: { horas: [0, 0, 0, 0, 0, 0, 0], discs: ['A'] }, AS: [aula('A', 'X', 10)] })
    expect(d.causa).toBe('aula_maior_que_melhores_dias') // 0 h nos melhores dias: nada cabe
  })
})

describe('auxiliares', () => {
  it('ehInsuficiencia por nome/código', () => {
    expect(ehInsuficiencia({ codigo: 'insuficiencia' })).toBe(true)
    expect(ehInsuficiencia(Object.assign(new Error('x'), { name: 'ErroInsuficiencia' }))).toBe(true)
    expect(ehInsuficiencia(new Error('x'))).toBe(false)
    expect(ehInsuficiencia(null)).toBe(false)
  })
  it('maxSemanasEfetivo espelha o motor (min 20, teto do horizonte)', () => {
    expect(maxSemanasEfetivo({ maxSemanas: 5 })).toBe(20)
    expect(maxSemanasEfetivo({ maxSemanas: 200 })).toBe(200)
    expect(maxSemanasEfetivo({ maxSemanas: 9999 })).toBe(600)
    expect(maxSemanasEfetivo(null)).toBe(600)
  })
  it('ErroPlanoInviavel carrega causa e detalhes (mapeado a 422 na rota)', () => {
    const e = new ErroPlanoInviavel('carga_acima_do_teto', 'msg', { vel: 17, velManual: false })
    expect(e.codigo).toBe('plano_inviavel')
    expect(e.causa).toBe('carga_acima_do_teto')
    expect(e).toBeInstanceOf(Error)
  })
})
