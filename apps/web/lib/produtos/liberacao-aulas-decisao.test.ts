import { describe, it, expect } from 'vitest'
import { decidirLiberacao, paramsEfetivos, ehDispCronograma, formatarRotuloLiberacao, type PlanoAula } from './liberacao-aulas-decisao'

const hoje = '2026-11-11'
const P = (o = {}) => paramsEfetivos(o)
const linha = (d: string) => ({ data_liberacao: d })
const plano = (o: Partial<PlanoAula> = {}): PlanoAula => ({ tem: true, noPlano: true, dataMeta: null, concluida: false, ...o })
const SEM: PlanoAula = { tem: false, noPlano: false, dataMeta: null, concluida: false }

describe('decidirLiberacao', () => {
  it('cfg desligada não interfere', () => {
    const r = decidirLiberacao({ cfg: { ...P(), ativo: false }, linha: linha('2027-01-01'), plano: SEM, hoje })
    expect(r.liberada).toBe(true); expect(r.interfere).toBe(false)
  })
  it('sem plano: planilha futura bloqueia com data; passada libera', () => {
    expect(decidirLiberacao({ cfg: P(), linha: linha('2026-12-01'), plano: SEM, hoje })).toMatchObject({ liberada: false, liberaEm: '2026-12-01', motivo: 'planilha' })
    expect(decidirLiberacao({ cfg: P(), linha: linha('2026-11-11'), plano: SEM, hoje }).liberada).toBe(true)
  })
  it('sem plano: liberado / atual', () => {
    expect(decidirLiberacao({ cfg: P({ sem_plano: 'liberado' }), linha: linha('2030-01-01'), plano: SEM, hoje }).liberada).toBe(true)
    expect(decidirLiberacao({ cfg: P({ sem_plano: 'atual' }), linha: linha('2030-01-01'), plano: SEM, hoje })).toMatchObject({ liberada: true, interfere: false })
  })
  it('com plano: concluir_meta bloqueia sem data até concluir', () => {
    expect(decidirLiberacao({ cfg: P(), linha: linha('2026-01-01'), plano: plano({ dataMeta: '2026-01-02' }), hoje })).toMatchObject({ liberada: false, liberaEm: null, motivo: 'concluir-meta' })
    expect(decidirLiberacao({ cfg: P(), linha: linha('2026-01-01'), plano: plano({ concluida: true }), hoje }).liberada).toBe(true)
  })
  it('com plano: modo plano usa data da meta - dias_antes', () => {
    const cfg = P({ com_plano: 'plano', dias_antes: 3 })
    expect(decidirLiberacao({ cfg, linha: linha('2026-01-01'), plano: plano({ dataMeta: '2026-11-14' }), hoje }).liberada).toBe(true)
    expect(decidirLiberacao({ cfg, linha: linha('2026-01-01'), plano: plano({ dataMeta: '2026-11-15' }), hoje })).toMatchObject({ liberada: false, liberaEm: '2026-11-12' })
  })
  it('com plano: mais_cedo = menor entre planilha e plano', () => {
    const cfg = P({ com_plano: 'mais_cedo' })
    expect(decidirLiberacao({ cfg, linha: linha('2026-11-01'), plano: plano({ dataMeta: '2027-01-01' }), hoje }).liberada).toBe(true)
    expect(decidirLiberacao({ cfg, linha: linha('2027-02-01'), plano: plano({ dataMeta: '2026-11-10' }), hoje }).liberada).toBe(true)
    expect(decidirLiberacao({ cfg, linha: linha('2027-02-01'), plano: plano({ dataMeta: '2027-01-01' }), hoje }).liberaEm).toBe('2027-01-01')
  })
  it('aula fora do plano usa a planilha', () => {
    expect(decidirLiberacao({ cfg: P(), linha: linha('2026-12-01'), plano: plano({ noPlano: false }), hoje })).toMatchObject({ liberada: false, liberaEm: '2026-12-01', motivo: 'fora-do-plano' })
  })
})

describe('paramsEfetivos / guard', () => {
  it('regra manda; cfg é padrão; fixo por último', () => {
    expect(paramsEfetivos({ com_plano: 'plano' }, { sem_plano: 'liberado', dias_antes: 2 })).toEqual({ sem_plano: 'liberado', com_plano: 'plano', dias_antes: 2 })
    expect(paramsEfetivos({})).toEqual({ sem_plano: 'planilha', com_plano: 'concluir_meta', dias_antes: 0 })
    expect(paramsEfetivos({ dias_antes: 999 }).dias_antes).toBe(365)
  })
  it('ehDispCronograma', () => { expect(ehDispCronograma({ tipo: 'cronograma' })).toBe(true); expect(ehDispCronograma({ tipo: 'data' })).toBe(false); expect(ehDispCronograma(null)).toBe(false) })
})

describe('formatarRotuloLiberacao', () => {
  it('plano com data e semana', () => {
    expect(formatarRotuloLiberacao({ origem: 'plano', data: '2026-11-16', semana: 3 })).toBe('Libera em seg., 16/11/2026 · semana 3 do seu cronograma')
  })
  it('planilha (sem cronograma) com semana da planilha', () => {
    expect(formatarRotuloLiberacao({ origem: 'planilha', data: '2026-11-16', semana: 5 })).toBe('Libera em seg., 16/11/2026 · semana 5 do cronograma')
    expect(formatarRotuloLiberacao({ origem: 'planilha', data: '2026-11-21' })).toBe('Libera em sáb., 21/11/2026')
  })
  it('plano só com dia da semana + semana', () => {
    expect(formatarRotuloLiberacao({ origem: 'plano', diaSemana: 1, semana: 3 })).toBe('Libera na segunda-feira da semana 3 do seu cronograma')
    expect(formatarRotuloLiberacao({ origem: 'plano', diaSemana: 6, semana: 2 })).toBe('Libera no sábado da semana 2 do seu cronograma')
  })
  it('concluir meta com previsão', () => {
    expect(formatarRotuloLiberacao({ origem: 'concluir', data: '2026-11-16', semana: 3 })).toBe('Libera ao concluir a meta (prevista para seg., 16/11 · semana 3)')
    expect(formatarRotuloLiberacao({ origem: 'concluir', diaSemana: 1, semana: 3 })).toBe('Libera ao concluir a meta (prevista para segunda-feira · semana 3)')
  })
  it('sem informação suficiente → null (UI usa o texto padrão)', () => {
    expect(formatarRotuloLiberacao({ origem: 'concluir' })).toBeNull()
    expect(formatarRotuloLiberacao({ origem: 'planilha' })).toBeNull()
    expect(formatarRotuloLiberacao({ origem: 'plano', data: 'lixo' })).toBeNull()
  })
})
