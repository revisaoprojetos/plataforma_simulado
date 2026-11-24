import { describe, expect, it } from 'vitest'
import {
  agregarPorDisciplina, cardsPorTipo, cardsPrincipais, paginarDisciplinasGerador, situacaoCobertura, totalMetas, fmtN,
  type ResumoCronograma,
} from './cronogramas-resumo'

const base = (lado: 'gerador' | 'adaptativo'): ResumoCronograma => ({
  lado, aulas: 10, disciplinas: 2, links: 5, cronogramas: 3,
  metasPorTipo: { pdfull: 4, pdflash: 3, pdfight: lado === 'gerador' ? null : 2, quest: 1, legproc: 0, juris: null },
})

describe('resumo unificado', () => {
  it('mesmos rótulos e ordem nos dois lados', () => {
    const a = cardsPrincipais(base('gerador')).map((c) => c.rotulo)
    expect(a).toEqual(cardsPrincipais(base('adaptativo')).map((c) => c.rotulo))
    expect(a).toEqual(['Aulas', 'Disciplinas / conjuntos', 'Metas', 'Links / materiais', 'Cronogramas / planos'])
    expect(cardsPorTipo(base('gerador')).map((c) => c.rotulo)).toEqual(['PDFull', 'PDFlash', 'PDFight', 'Questões', 'LegProc', 'Jurisprudência'])
  })
  it('null vira "não se aplica" e fica fora do total', () => {
    const c = cardsPorTipo(base('gerador'))
    expect(c.find((x) => x.id === 'pdfight')).toMatchObject({ valor: 'não se aplica', naoSeAplica: true })
    expect(totalMetas(base('gerador').metasPorTipo)).toBe(8)
    expect(fmtN(null)).toBe('—')
  })
})

describe('disciplinas do Gerador', () => {
  const linhas = agregarPorDisciplina(
    [{ disciplina: 'Direito Penal', aulas: 3, itens: 9 }, { disciplina: 'Civil', aulas: 0, itens: 0 }],
    [{ disciplina: 'direito penal', tipo: 'flash', n: 5 }, { disciplina: 'Direito Penal', tipo: 'pdfull', n: 2 }, { disciplina: 'Direito Penal', tipo: 'xyz', n: 1 }, { disciplina: 'Civil', tipo: 'quest', n: 4 }],
    [{ disciplina: 'Direito Penal', n: 3 }],
  )
  it('agrega por nome normalizado', () => {
    const p = linhas.find((l) => l.disciplina === 'Direito Penal')!
    expect(p).toMatchObject({ aulas: 3, pdflash: 5, pdfull: 2, outros: 1, metas: 8, links: 3 })
  })
  it('situação de cobertura', () => {
    expect(situacaoCobertura({ aulas: 3, metas: 8, links: 3 })).toBe('completa')
    expect(situacaoCobertura({ aulas: 3, metas: 8, links: 1 })).toBe('parcial')
    expect(situacaoCobertura({ aulas: 3, metas: 0, links: 3 })).toBe('sem-metas')
    expect(situacaoCobertura({ aulas: 0, metas: 3, links: 0 })).toBe('sem-aulas')
  })
  it('busca, ordenação e paginação', () => {
    expect(paginarDisciplinasGerador(linhas, { q: 'PENAL' }).total).toBe(1)
    expect(paginarDisciplinasGerador(linhas, { ord: 'metas', dir: 'desc' }).itens[0].disciplina).toBe('Direito Penal')
    expect(paginarDisciplinasGerador(linhas, { situ: 'sem-aulas' }).itens[0].disciplina).toBe('Civil')
    const p = paginarDisciplinasGerador(linhas, { porPagina: 1, pagina: 9 })
    expect(p.pagina).toBe(2)
    expect(p.totalPaginas).toBe(2)
  })
})
