import { describe, it, expect } from 'vitest'
import {
  dataBaseDaAula, decidirLiberacao, paramsEfetivos, excecoesAplicaveis, resolverExcecao, formatarRotuloLiberacao,
  ROTULO_BLOQUEADO_ADMIN, SEM_PLANO, type ExcecaoLib,
} from './liberacao-aulas-decisao'

const td = (data_cronograma: string | null, offset_dias = 28, data_manual: string | null = null) => ({ data_cronograma, data_manual, offset_dias })

describe('dataBaseDaAula (trilhas)', () => {
  it('casa em várias trilhas: menor data', () => {
    const r = dataBaseDaAula([{ nome: 'Extensivo 6 Dias', datas: td('2026-12-14') }, { nome: '9 Matérias', datas: td('2026-12-01') }], '2027-01-01')
    expect(r).toEqual({ data: '2026-11-03', trilha: '9 Matérias' })
  })
  it('trilha que não traz a aula não contribui', () => {
    const r = dataBaseDaAula([{ nome: 'A', datas: td(null) }, { nome: 'B', datas: td('2026-12-14') }], '2026-01-01')
    expect(r).toEqual({ data: '2026-11-16', trilha: 'B' })
  })
  it('nenhuma traz a aula (ou nenhuma casa): planilha', () => {
    expect(dataBaseDaAula([{ nome: 'A', datas: td(null) }], '2026-12-01')).toEqual({ data: '2026-12-01', trilha: null })
    expect(dataBaseDaAula([], '2026-12-01')).toEqual({ data: '2026-12-01', trilha: null })
  })
  it('data_manual vence o offset; trilha posterior à planilha ainda vale (substitui)', () => {
    expect(dataBaseDaAula([{ nome: 'A', datas: td('2026-12-14', 28, '2027-02-01') }], '2026-01-01')).toEqual({ data: '2027-02-01', trilha: 'A' })
  })
  it('a data da trilha alimenta decidirLiberacao no lugar da planilha', () => {
    const d = dataBaseDaAula([{ nome: 'A', datas: td('2026-12-14') }], '2026-01-01')
    const r = decidirLiberacao({ cfg: paramsEfetivos({}), linha: { data_liberacao: d.data }, plano: SEM_PLANO, hoje: '2026-11-12' })
    expect(r).toMatchObject({ liberada: false, liberaEm: '2026-11-16' })
  })
})

const ALUNO = { estudanteId: 'e1', grupos: new Set(['g1']) }
const exc = (o: Partial<ExcecaoLib>): ExcecaoLib => ({ alvo_tipo: 'aula', alvo_id: 'a1', estudante_id: 'e1', grupo_id: null, acao: 'liberar', ...o })
const AGORA = '2026-11-12T12:00:00.000Z'

describe('exceções', () => {
  it('escopo aluno e grupo (membro); outro aluno/grupo não vale', () => {
    const l = [exc({}), exc({ estudante_id: null, grupo_id: 'g1', alvo_id: 'a2' }), exc({ estudante_id: 'e9', alvo_id: 'a3' }), exc({ estudante_id: null, grupo_id: 'g9', alvo_id: 'a4' })]
    expect(excecoesAplicaveis(l, ALUNO, AGORA).map((e) => e.alvo_id)).toEqual(['a1', 'a2'])
  })
  it('ignora expiradas e inativas', () => {
    const l = [exc({ expira_em: '2026-11-12T11:00:00.000Z' }), exc({ ativo: false }), exc({ expira_em: '2026-11-13T00:00:00.000Z', alvo_id: 'a5' })]
    expect(excecoesAplicaveis(l, ALUNO, AGORA).map((e) => e.alvo_id)).toEqual(['a5'])
  })
  it('módulo vale para as aulas dentro (cadeia)', () => {
    expect(resolverExcecao(['aula', 'mod'], [exc({ alvo_tipo: 'modulo', alvo_id: 'mod' })])?.acao).toBe('liberar')
    expect(resolverExcecao(['outra', 'mod2'], [exc({ alvo_tipo: 'modulo', alvo_id: 'mod' })])).toBeNull()
  })
  it('bloquear vence liberar no mesmo alvo e em qualquer nível', () => {
    expect(resolverExcecao(['a1'], [exc({ acao: 'liberar' }), exc({ acao: 'bloquear', estudante_id: null, grupo_id: 'g1', motivo: 'inadimplente' })])).toMatchObject({ acao: 'bloquear', motivo: 'inadimplente' })
    expect(resolverExcecao(['aula', 'mod'], [exc({ alvo_id: 'aula', acao: 'liberar' }), exc({ alvo_id: 'mod', alvo_tipo: 'modulo', acao: 'bloquear' })])?.acao).toBe('bloquear')
  })
  it('sem exceções → null', () => { expect(resolverExcecao(['a1'], [])).toBeNull() })
})

describe('rótulo com trilha', () => {
  it('inclui o nome da trilha (sem semana desconhecida)', () => {
    expect(formatarRotuloLiberacao({ origem: 'planilha', data: '2026-11-16', trilha: 'Extensivo 6 Dias' })).toBe('Libera em seg., 16/11/2026 · cronograma Extensivo 6 Dias')
  })
  it('com semana conhecida', () => {
    expect(formatarRotuloLiberacao({ origem: 'planilha', data: '2026-11-16', trilha: 'Extensivo 6 Dias', semana: 3 })).toBe('Libera em seg., 16/11/2026 · cronograma Extensivo 6 Dias · semana 3')
  })
  it('sem trilha mantém o formato antigo', () => {
    expect(formatarRotuloLiberacao({ origem: 'planilha', data: '2026-11-16', semana: 3 })).toBe('Libera em seg., 16/11/2026 · semana 3 do cronograma')
  })
  it('mensagem de bloqueio manual', () => { expect(ROTULO_BLOQUEADO_ADMIN).toBe('Bloqueado pelo administrador') })
})
