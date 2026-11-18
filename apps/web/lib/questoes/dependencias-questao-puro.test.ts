import { describe, expect, it } from 'vitest'
import {
  FONTES_VINCULO, acumular, descreverVinculos, mensagemRecusa, mensagemRecusaBanco, motivoQuestao,
  particionarQuestoes, type MapaDependencias,
} from './dependencias-questao-puro'

const fonte = (t: string) => FONTES_VINCULO.find((f) => f.tabela === t)!

describe('dependencias-questao-puro', () => {
  it('cobre as tabelas críticas (respostas, simulados, documentos, cronograma, cadernos)', () => {
    const t = FONTES_VINCULO.map((f) => f.tabela)
    for (const x of ['simulado_prova_questoes', 'simulado_respostas_objetivas', 'simulado_documento_questoes', 'simulado_cronograma_meta_questoes', 'simulado_aluno_caderno_itens', 'simulado_leitura_respostas']) {
      expect(t).toContain(x)
    }
    expect(new Set(t).size).toBe(t.length)
  })

  it('acumular soma por tabela e ignora zero/id vazio', () => {
    const m: MapaDependencias = new Map()
    acumular(m, fonte('simulado_respostas_objetivas'), 'q1', 3)
    acumular(m, fonte('simulado_respostas_objetivas'), 'q1', 2)
    acumular(m, fonte('simulado_prova_questoes'), 'q1', 1)
    acumular(m, fonte('simulado_prova_questoes'), 'q2', 0)
    acumular(m, fonte('simulado_prova_questoes'), null, 4)
    expect(m.get('q1')!.find((d) => d.tabela === 'simulado_respostas_objetivas')!.qtd).toBe(5)
    expect(m.has('q2')).toBe(false)
    expect(m.size).toBe(1)
  })

  it('particiona livres x bloqueadas preservando ordem e deduplicando', () => {
    const m: MapaDependencias = new Map()
    acumular(m, fonte('simulado_prova_questoes'), 'b')
    const r = particionarQuestoes(['a', 'b', 'c', 'a', ''], m)
    expect(r.livres).toEqual(['a', 'c'])
    expect(r.bloqueadas.map((x) => x.id)).toEqual(['b'])
    expect(r.bloqueadas[0].motivo).toContain('simulados')
  })

  it('agrupa rótulos repetidos na descrição', () => {
    const m: MapaDependencias = new Map()
    acumular(m, fonte('simulado_aluno_caderno_itens'), 'q', 2)
    acumular(m, fonte('simulado_aluno_caderno_questoes'), 'q', 1)
    expect(descreverVinculos(m.get('q')!)).toBe('3 cadernos de alunos')
    expect(motivoQuestao(m.get('q')!)).toBe('Em uso: 3 cadernos de alunos.')
  })

  it('mensagem de recusa: singular, plural, limite e rótulos', () => {
    const m: MapaDependencias = new Map()
    for (const id of ['q1', 'q2', 'q3', 'q4', 'q5']) acumular(m, fonte('simulado_respostas_objetivas'), id, 7)
    const { bloqueadas } = particionarQuestoes([...m.keys()], m)
    expect(mensagemRecusa([])).toBe('')
    const um = mensagemRecusa(bloqueadas.slice(0, 1), { rotulos: new Map([['q1', 'Q-12']]) })
    expect(um).toContain('esta questão')
    expect(um).toContain('Q-12: 7 respostas de alunos')
    const varias = mensagemRecusa(bloqueadas, { max: 2 })
    expect(varias).toContain('5 questões')
    expect(varias).toContain('(+3 outras)')
    expect(varias).toContain('Arquivar')
  })

  it('mensagem de banco', () => {
    expect(mensagemRecusaBanco('Banco X', 4, '10 respostas de alunos')).toContain('"Banco X"')
    expect(mensagemRecusaBanco(null, 1, 'x')).toContain('este banco')
  })
})
