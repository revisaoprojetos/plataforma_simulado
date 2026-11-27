import { describe, it, expect } from 'vitest'
import {
  dependenciasVazias, somarDependencia, temVinculos, resumoDependencias, mensagemBloqueio, mensagemEmUso, mensagemPastaEmUso,
  particionarPorVinculos, mensagemLoteParcial, pastasEsvaziadas, contagemPartesQueBloqueia, MSG_NAO_VERIFICADO, ALTERNATIVAS_EM_USO,
  type Dependencias,
} from './dependencias-documento-pura'

const dep = (p: Partial<Record<Parameters<typeof somarDependencia>[1], number>>, extra?: Partial<Dependencias>): Dependencias => {
  const d = dependenciasVazias()
  for (const [k, v] of Object.entries(p)) somarDependencia(d, k as any, v as number)
  return { ...d, ...extra }
}

describe('decisão de bloqueio', () => {
  it('documento sem vínculo está livre', () => {
    expect(temVinculos(dependenciasVazias())).toBe(false)
    expect(temVinculos(undefined)).toBe(false)
  })
  it('qualquer vínculo ou "em uso" bloqueia', () => {
    expect(temVinculos(dep({ grifos: 1 }))).toBe(true)
    expect(temVinculos(dep({}, { emUso: true }))).toBe(true)
  })
  it('somarDependencia ignora zero/negativo/NaN e mantém total', () => {
    const d = dependenciasVazias()
    somarDependencia(d, 'grifos', 0); somarDependencia(d, 'metas', -3); somarDependencia(d, 'caderno', NaN)
    somarDependencia(d, 'grifos', 2); somarDependencia(d, 'grifos', 3)
    expect(d.total).toBe(5); expect(d.porTipo).toEqual({ grifos: 5 })
  })
})

describe('mensagens em pt-BR', () => {
  it('resumo na ordem estável, singular/plural e milhar', () => {
    expect(resumoDependencias(dep({ metas: 1, grifos: 1234 }))).toBe('1.234 grifos/anotações de alunos, 1 meta de cronograma')
  })
  it('mensagem de bloqueio traz título, detalhe e alternativas', () => {
    const m = mensagemBloqueio(dep({ grifos: 2, metas: 3 }), 'CF/88')
    expect(m).toContain('“CF/88”'); expect(m).toContain('2 grifos/anotações de alunos'); expect(m).toContain('3 metas de cronograma')
    expect(m).toContain('não pode ser excluído'); expect(m).toContain('Substituir documento'); expect(m).toContain('Ocultar')
  })
  it('só "em uso" (sem vínculos contados) usa a mensagem de uso', () => {
    const m = mensagemBloqueio(dep({}, { emUso: true, planosAtivos: 4 }), 'Lei X')
    expect(m).toContain('em uso em 4 planos de alunos ativos'); expect(m).toContain(ALTERNATIVAS_EM_USO)
  })
  it('mensagemEmUso por ação sugere Substituir e Ocultar', () => {
    for (const a of ['excluir', 'mover', 'despublicar', 'categoria', 'pasta'] as const) {
      const m = mensagemEmUso(a, 'Doc', 1)
      expect(m).toContain('1 plano de aluno ativo'); expect(m).toContain('Substituir documento'); expect(m).toContain('Ocultar')
    }
    expect(mensagemEmUso('mover')).toContain('movido de pasta')
  })
  it('mensagem de pasta', () => {
    expect(mensagemPastaEmUso('Penal', 3, 'excluída')).toContain('contém 3 documentos em uso')
    expect(mensagemPastaEmUso(undefined, 1, 'movida')).toContain('1 documento em uso')
  })
})

describe('lote parcial', () => {
  const docs = [{ id: 'a', titulo: 'A' }, { id: 'b', titulo: 'B' }, { id: 'c', titulo: 'C' }]
  it('processa os livres e devolve bloqueados com motivo', () => {
    const deps = new Map([['a', dep({ grifos: 5 })], ['b', dependenciasVazias()], ['c', dep({}, { emUso: true })]])
    const r = particionarPorVinculos(docs, deps)
    expect(r.livres.map((d) => d.id)).toEqual(['b'])
    expect(r.bloqueados.map((b) => b.id)).toEqual(['a', 'c'])
    expect(r.bloqueados[0].motivo).toContain('5 grifos')
    expect(r.bloqueados[0].total).toBe(5)
  })
  it('falha FECHADA: sem dependências verificadas, todos bloqueados', () => {
    const r = particionarPorVinculos(docs, new Map())
    expect(r.livres).toHaveLength(0)
    expect(r.bloqueados.every((b) => b.motivo === MSG_NAO_VERIFICADO)).toBe(true)
  })
  it('mensagem do lote', () => {
    expect(mensagemLoteParcial(10, 0)).toBe('')
    expect(mensagemLoteParcial(10, 3)).toContain('3 de 10')
    expect(mensagemLoteParcial(1, 1)).toContain('Nenhum documento foi excluído')
    expect(mensagemLoteParcial(4, 4)).toContain('todos têm vínculos')
  })
})

describe('pasta esvaziada (auditoria)', () => {
  it('só pastas sem vivos restantes entram, com os ids que saíram', () => {
    const saindo = [{ id: 'd1', pasta_id: 'p1' }, { id: 'd2', pasta_id: 'p1' }, { id: 'd3', pasta_id: 'p2' }, { id: 'd4', pasta_id: null }]
    const r = pastasEsvaziadas(saindo, new Map([['p1', 0], ['p2', 2]]))
    expect([...r.keys()]).toEqual(['p1']); expect(r.get('p1')).toEqual(['d1', 'd2'])
  })
  it('pasta ausente do mapa conta como vazia', () => {
    expect(pastasEsvaziadas([{ id: 'x', pasta_id: 'p9' }], new Map()).get('p9')).toEqual(['x'])
  })
})

describe('partes e seleções (Fase 9)', () => {
  it('seleções sempre bloqueiam; partes só ativas; soft-delete ignora partes ativas', () => {
    expect(contagemPartesQueBloqueia(undefined)).toEqual({ partes: 0, selecoes: 0 })
    expect(contagemPartesQueBloqueia({ partesAtivas: 0, selecoes: 0 })).toEqual({ partes: 0, selecoes: 0 }) // só arquivadas
    expect(contagemPartesQueBloqueia({ partesAtivas: 2, selecoes: 0 })).toEqual({ partes: 2, selecoes: 0 })
    expect(contagemPartesQueBloqueia({ partesAtivas: 2, selecoes: 1 }, { softDelete: true })).toEqual({ partes: 0, selecoes: 1 })
  })
  it('rótulos e bloqueio', () => {
    const d = dependenciasVazias()
    somarDependencia(d, 'partes', 1); somarDependencia(d, 'selecoes', 3)
    expect(temVinculos(d)).toBe(true)
    expect(resumoDependencias(d)).toBe('1 parte de documento ativa, 3 seleções de meta (parte/documento)')
  })
  it('comportamento antigo intacto sem partes', () => {
    expect(resumoDependencias(dep({ grifos: 2 }))).toBe('2 grifos/anotações de alunos')
  })
})
