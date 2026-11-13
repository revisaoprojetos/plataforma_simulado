import { describe, it, expect } from 'vitest'
import { decidirAulaComExcecao, paramsEfetivos, regraCronogramaGovernante, SEM_PLANO } from './liberacao-aulas-decisao'
import { explicarLiberacaoAluno, type AulaConsulta } from './liberacao-consulta-aluno'

const hoje = '2026-11-11'
const agora = '2026-11-11T12:00:00.000Z'
const P = paramsEfetivos({})
const aula = (o: Partial<AulaConsulta> = {}): AulaConsulta => ({ id: 'a1', titulo: 'Aula 1', moduloId: 'm1', disciplina: 'Civil', dataPlanilha: '2026-12-01', porTrilha: {}, ...o })

describe('núcleo único: decidirAulaComExcecao', () => {
  it('exceção vence a decisão normal', () => {
    expect(decidirAulaComExcecao({ excecao: { acao: 'liberar' }, cfg: P, linha: { data_liberacao: '2030-01-01' }, plano: SEM_PLANO, hoje }).liberada).toBe(true)
    expect(decidirAulaComExcecao({ excecao: { acao: 'bloquear' }, cfg: P, linha: { data_liberacao: '2020-01-01' }, plano: SEM_PLANO, hoje }).liberada).toBe(false)
  })
  it('sem exceção = decidirLiberacao (planilha)', () => {
    const d = decidirAulaComExcecao({ excecao: null, cfg: P, linha: { data_liberacao: '2026-12-01' }, plano: SEM_PLANO, hoje })
    expect(d.liberada).toBe(false); expect(d.liberaEm).toBe('2026-12-01')
  })
})

describe('regraCronogramaGovernante', () => {
  const crono = { tipo: 'cronograma' }
  const mods = new Map([['m1', { id: 'm1', pai_id: null, disponibilidade: crono }], ['a1', { id: 'a1', pai_id: 'm1', disponibilidade: { tipo: 'na_matricula' } }]])
  const propria = (_id: string, base: unknown) => ({ d: base, seg: false })
  it('herda do ancestral quando a própria é neutra', () => { expect(regraCronogramaGovernante('a1', { tipo: 'na_matricula' }, mods, propria)).toBe(crono) })
  it('não governa quando ninguém tem cronograma', () => { expect(regraCronogramaGovernante('a1', { tipo: 'na_matricula' }, new Map([['a1', { id: 'a1', pai_id: null }]]), propria)).toBeNull() })
})

describe('explicarLiberacaoAluno (consulta admin)', () => {
  it('planilha SEM regra de cronograma não tem efeito (corrige o falso "desligado")', () => {
    const r = explicarLiberacaoAluno({ hoje, agora, gateAtivo: false, aulas: [aula()], trilhasAluno: [], excecoes: [], nucleo: { paramsDe: () => P, governada: () => false, plano: () => SEM_PLANO } })[0]
    expect(r.liberada).toBe(true); expect(r.origem).toBe('sem-regra')
  })
  it('com regra e gate desligado, a regra vale', () => {
    const r = explicarLiberacaoAluno({ hoje, agora, gateAtivo: false, aulas: [aula()], trilhasAluno: [], excecoes: [], nucleo: { paramsDe: () => P, governada: () => true, plano: () => SEM_PLANO } })[0]
    expect(r.liberada).toBe(false); expect(r.origem).toBe('planilha'); expect(r.dataEfetiva).toBe('2026-12-01')
  })
  it('plano fixado com com_plano=plano usa a data da meta', () => {
    const p = paramsEfetivos({ com_plano: 'plano' })
    const r = explicarLiberacaoAluno({ hoje, agora, gateAtivo: true, aulas: [aula()], trilhasAluno: [], excecoes: [], nucleo: { paramsDe: () => p, governada: () => true, plano: () => ({ tem: true, noPlano: true, dataMeta: '2026-11-05', concluida: false }) } })[0]
    expect(r.liberada).toBe(true); expect(r.origem).toBe('plano')
  })
  it('bloquear vence liberar (mesma regra do motor)', () => {
    const exc = (acao: 'liberar' | 'bloquear', alvoTipo: 'aula' | 'modulo', alvoId: string) => ({ id: acao + alvoId, alvoTipo, alvoId, acao, escopo: 'aluno' as const, expiraEm: null, ativo: true })
    const r = explicarLiberacaoAluno({ hoje, agora, gateAtivo: true, aulas: [aula()], trilhasAluno: [], excecoes: [exc('liberar', 'aula', 'a1'), exc('bloquear', 'modulo', 'm1')] })[0]
    expect(r.liberada).toBe(false); expect(r.origem).toBe('excecao')
  })
})
