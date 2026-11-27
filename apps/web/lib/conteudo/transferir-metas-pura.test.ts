import { describe, it, expect } from 'vitest'
import { avaliarTransferencia, linhasAntesDepois, nadaATransferir, mensagemTransferida, CONTAGENS_VAZIAS, ITENS_PADRAO, type DocResumo } from './transferir-metas-pura'

const doc = (o: Partial<DocResumo> = {}): DocResumo => ({ id: 'a', titulo: 'Aula 1', status: 'publicado', deletado: false, tipo: 'pdf', emAulas: true, ...o })

describe('avaliarTransferencia', () => {
  it('sem destino: sem bloqueio nem aviso', () => {
    expect(avaliarTransferencia(doc(), null, CONTAGENS_VAZIAS)).toEqual({ bloqueios: [], avisos: [] })
  })
  it('bloqueia destino arquivado, na lixeira ou igual à origem', () => {
    expect(avaliarTransferencia(doc(), doc({ id: 'b', status: 'arquivado' }), CONTAGENS_VAZIAS).bloqueios).toHaveLength(1)
    expect(avaliarTransferencia(doc(), doc({ id: 'b', deletado: true }), CONTAGENS_VAZIAS).bloqueios).toHaveLength(1)
    expect(avaliarTransferencia(doc(), doc(), CONTAGENS_VAZIAS).bloqueios[0]).toMatch(/mesmo documento/)
  })
  it('avisa formato diferente, destino fora das aulas, rascunho e planos não transferíveis', () => {
    const r = avaliarTransferencia(doc(), doc({ id: 'b', tipo: 'docx', emAulas: false, status: 'rascunho' }), { ...CONTAGENS_VAZIAS, planosConflito: 2, planosLegados: 1, planosOrfas: 3 })
    expect(r.bloqueios).toEqual([])
    expect(r.avisos.length).toBe(6)
  })
})

describe('linhasAntesDepois / nadaATransferir', () => {
  const c = { ...CONTAGENS_VAZIAS, planosTransferiveis: 10, metasTransferiveis: 60, metasConcluidas: 7, metaConteudo: 4, defsAtivas: 2 }
  it('calcula antes → depois só do que está marcado', () => {
    const l = linhasAntesDepois(c, ITENS_PADRAO, { planos: 5, defs: 1, metaConteudo: 0 }, 12)
    const planos = l.find((x) => x.chave === 'planos')!
    expect([planos.origemAntes, planos.origemDepois, planos.destinoAntes, planos.destinoDepois]).toEqual([12, 2, 5, 15])
    expect(l.find((x) => x.chave === 'conteudoMeta')!.destinoDepois).toBe(4)
    expect(linhasAntesDepois(c, { planos: false, conteudoMeta: false, catalogo: false }, { planos: 0, defs: 0, metaConteudo: 0 }, 0)).toEqual([])
  })
  it('nada a transferir', () => {
    expect(nadaATransferir(CONTAGENS_VAZIAS, { planos: true, conteudoMeta: true, catalogo: false })).toBe(true)
    expect(nadaATransferir(c, { planos: true, conteudoMeta: false, catalogo: false })).toBe(false)
    expect(nadaATransferir(CONTAGENS_VAZIAS, ITENS_PADRAO)).toBe(false) // catálogo marcado ainda ressincroniza
  })
  it('mensagem', () => {
    expect(mensagemTransferida({ planos: 1, metas: 1, metaConteudo: 0, arquivou: false })).toContain('1 plano (1 meta)')
    expect(mensagemTransferida({ planos: 2, metas: 9, metaConteudo: 3, arquivou: true })).toContain('Origem arquivada')
  })
})
