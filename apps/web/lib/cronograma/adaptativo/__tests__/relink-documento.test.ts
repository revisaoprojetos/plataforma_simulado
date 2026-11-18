import { describe, it, expect } from 'vitest'
import { normalizarTituloDoc, ehTesteOuCopia, encontrarSubstituto, calcularRelinks, remapearEstadoComRelink, aplicarRelinksNaAssinatura, type DocAntigo, type DocCandidato } from '../relink-documento'
import { idOrfao, type AssinaturaAS } from '../remap-as'

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const K = (n: number) => `d:${U(n)}`
const sig = (...n: number[]): AssinaturaAS => ({ chaves: n.map(K), discs: n.map(() => 'Penal') })
type Linha = { meta_id: string; estado?: string }

describe('normalizarTituloDoc', () => {
  it('Aula 01 - PDFULL - X == Aula 1 – PDFULL – X (zeros, travessão, caixa, espaços)', () => {
    expect(normalizarTituloDoc('Aula 01 - PDFULL - X')).toBe(normalizarTituloDoc('Aula 1 – PDFULL – X'))
    expect(normalizarTituloDoc('  AULA 01   —  PDFull — Direito Pênal ')).toBe(normalizarTituloDoc('aula 1 - pdfull - direito penal'))
  })
  it('remove sufixos (2) e Cópia, e extensão', () => {
    const base = normalizarTituloDoc('Aula 3 - PDFULL - Y')
    expect(normalizarTituloDoc('Aula 3 - PDFULL - Y (2)')).toBe(base)
    expect(normalizarTituloDoc('Aula 3 - PDFULL - Y - Cópia')).toBe(base)
    expect(normalizarTituloDoc('Cópia de Aula 3 - PDFULL - Y')).toBe(base)
    expect(normalizarTituloDoc('Aula 3 - PDFULL - Y.pdf')).toBe(base)
  })
  it('aulas diferentes continuam diferentes (10 != 1, 2026 preservado)', () => {
    expect(normalizarTituloDoc('Aula 10 - X')).not.toBe(normalizarTituloDoc('Aula 1 - X'))
    expect(normalizarTituloDoc('Lei 2026')).toBe('lei 2026')
    expect(normalizarTituloDoc(null)).toBe('')
  })
  it('ehTesteOuCopia', () => {
    expect(ehTesteOuCopia('Aula 1 - TESTE')).toBe(true)
    expect(ehTesteOuCopia('Aula 1 (Cópia)')).toBe(true)
    expect(ehTesteOuCopia('Aula 1 - PDFULL')).toBe(false)
    expect(ehTesteOuCopia('Contestemunha')).toBe(false)
  })
})

const antigo: DocAntigo = { id: U(1), titulo: 'Aula 01 - PDFULL - X', pasta_id: 'P1', pasta_pai_id: 'PAI', disciplina: 'Penal', deletado: true, deletado_em: '2026-11-11T10:00:00Z' }
const cand = (over: Partial<DocCandidato> = {}): DocCandidato => ({ id: U(9), titulo: 'Aula 1 – PDFULL – X', pasta_id: 'P1', pasta_pai_id: 'PAI', disciplina: 'Penal', publicado: true, criado_em: '2026-11-11T11:00:00Z', ...over })

describe('encontrarSubstituto', () => {
  it('único candidato com mesmo título normalizado/pasta/depois do delete => relinka', () => {
    expect(encontrarSubstituto(antigo, [cand(), cand({ id: U(8), titulo: 'Outra aula' })])).toMatchObject({ tipo: 'unico', candidato: { id: U(9) } })
  })
  it('pasta irmã (mesmo pai) aceita; pasta de outro pai não', () => {
    expect(encontrarSubstituto(antigo, [cand({ pasta_id: 'P2' })]).tipo).toBe('unico')
    expect(encontrarSubstituto(antigo, [cand({ pasta_id: 'P2', pasta_pai_id: 'OUTRO' })]).tipo).toBe('nenhum')
  })
  it('ambíguo (2 candidatos) e zero => NÃO relinka', () => {
    expect(encontrarSubstituto(antigo, [cand(), cand({ id: U(10) })]).tipo).toBe('ambiguo')
    expect(encontrarSubstituto(antigo, []).tipo).toBe('nenhum')
  })
  it('rejeita: antigo não deletado, candidato não publicado, criado ANTES do delete, outra disciplina', () => {
    expect(encontrarSubstituto({ ...antigo, deletado: false }, [cand()]).tipo).toBe('nenhum')
    expect(encontrarSubstituto(antigo, [cand({ publicado: false })]).tipo).toBe('nenhum')
    expect(encontrarSubstituto(antigo, [cand({ criado_em: '2026-11-10T00:00:00Z' })]).tipo).toBe('nenhum')
    expect(encontrarSubstituto(antigo, [cand({ disciplina: 'Civil' })]).tipo).toBe('nenhum')
  })
  it('nunca relinka TESTE/Cópia para aula real', () => {
    expect(encontrarSubstituto(antigo, [cand({ titulo: 'Aula 1 - PDFULL - X (Cópia)' })]).tipo).toBe('nenhum')
    expect(encontrarSubstituto(antigo, [cand({ titulo: 'Aula 1 - PDFULL - X - TESTE' })]).tipo).toBe('nenhum')
  })
})

const docs = (...d: Array<DocAntigo & Partial<DocCandidato>>) => new Map(d.map((x) => [x.id, x]))

describe('calcularRelinks', () => {
  it('doc 2 apagado e recriado como doc 9 (mesma posição): relink 2 -> 9', () => {
    const r = calcularRelinks(sig(1, 2, 3), sig(1, 9, 3), docs(
      { ...antigo, id: U(2) }, { id: U(9), titulo: 'Aula 1 – PDFULL – X', pasta_id: 'P1', pasta_pai_id: 'PAI', publicado: true, criado_em: '2026-11-11T11:00:00Z', deletado: false },
    ))
    expect(r.relinks).toEqual([{ chaveAntiga: K(2), chaveNova: K(9), docAntigo: U(2), docNovo: U(9), titulo: 'Aula 01 - PDFULL - X' }])
  })
  it('2 antigos disputando o mesmo candidato => nenhum relink (ambíguo)', () => {
    const r = calcularRelinks(sig(1, 2), sig(9), docs({ ...antigo, id: U(1) }, { ...antigo, id: U(2) }, { id: U(9), titulo: 'Aula 1 - PDFULL - X', pasta_id: 'P1', pasta_pai_id: 'PAI', publicado: true, criado_em: '2026-11-12T00:00:00Z', deletado: false }))
    expect(r.relinks).toEqual([])
    expect(r.ambiguos).toHaveLength(2)
  })
  it('antigo sem dados (purgado, sem snapshot) => indisponível', () => {
    const r = calcularRelinks(sig(1), sig(9), new Map())
    expect(r.relinks).toEqual([])
    expect(r.indisponiveis[0]).toMatchObject({ docAntigo: U(1) })
  })
})

describe('remapearEstadoComRelink (progresso não desloca nem órfã)', () => {
  const relinks = [{ chaveAntiga: K(2), chaveNova: K(9), docAntigo: U(2), docNovo: U(9), titulo: 't' }]
  it('aula recriada: progresso migra p/ a posição do substituto; vizinhas intactas; sem órfã', () => {
    const r = remapearEstadoComRelink<Linha>({
      cfg: { paginasLidas: { '1': 7 } }, plano: { 'pf:0': ['2026-11-12', 1], 'pf:1': ['2026-11-13', 1], 'pf:2': ['2026-11-14', 1] }, revs: {}, detalhes: {},
      metas: [{ meta_id: 'pf:0', estado: 'done' }, { meta_id: 'pf:1', estado: 'done' }, { meta_id: 'pf:2', estado: 'parcial' }],
    }, sig(1, 2, 3), sig(1, 9, 3), relinks)
    expect(r.metas.map((m) => m.meta_id)).toEqual(['pf:0', 'pf:1', 'pf:2'])
    expect(r.plano['pf:1']).toEqual(['2026-11-13', 1])
    expect(r.stats.aulasOrfas).toBe(0)
    expect((r.cfg.paginasLidas as Record<string, number>)['1']).toBe(7)
    expect(r.cfg.orfas).toBeUndefined()
  })
  it('SEM relink o mesmo cenário gera órfã (prova do ganho) e o progresso fica guardado', () => {
    const r = remapearEstadoComRelink<Linha>({ cfg: {}, plano: { 'pf:1': ['2026-11-13', 1] }, revs: {}, detalhes: {}, metas: [{ meta_id: 'pf:1', estado: 'done' }] }, sig(1, 2, 3), sig(1, 9, 3), [])
    expect(r.stats.aulasOrfas).toBe(1)
    expect(r.metas[0].meta_id).toBe(idOrfao(K(2), 'pf:#'))
  })
  it('órfã antiga (og:<antiga>) vira restaurada na posição do substituto; mudanca.de mantém o id ORIGINAL do banco', () => {
    const ogAntigo = idOrfao(K(2), 'pf:#')
    const r = remapearEstadoComRelink<Linha>({
      cfg: { orfas: { [K(2)]: { pag: 5, plano: { 'pf:#': ['2026-11-13', 1] } } } }, plano: {}, revs: {}, detalhes: {},
      metas: [{ meta_id: ogAntigo, estado: 'done' }],
    }, sig(1, 3), sig(1, 9, 3), relinks) // a antiga já NÃO tinha o doc 2 na assinatura
    expect(r.cfg.orfas).toBeUndefined()
    expect(r.mudancas).toEqual([{ de: ogAntigo, para: 'pf:1' }])
    expect(r.plano['pf:1']).toEqual(['2026-11-13', 1])
    expect((r.cfg.paginasLidas as Record<string, number>)['1']).toBe(5)
  })
  it('aplicarRelinksNaAssinatura só troca as chaves relinkadas', () => {
    expect(aplicarRelinksNaAssinatura(sig(1, 2, 3), relinks).chaves).toEqual([K(1), K(9), K(3)])
  })
})

describe('material indisponível (sem substituto): nada some nem desloca', () => {
  it('doc 2 apagado sem recriação: vizinhas acompanham, a aula vira órfã guardada (não é reapontada a outra aula)', () => {
    const r = remapearEstadoComRelink<Linha>({
      cfg: {}, plano: { 'pf:0': ['2026-11-12', 1], 'pf:1': ['2026-11-13', 1], 'pf:2': ['2026-11-14', 1] }, revs: {}, detalhes: {},
      metas: [{ meta_id: 'pf:1', estado: 'done' }, { meta_id: 'pf:2', estado: 'parcial' }],
    }, sig(1, 2, 3), sig(1, 3), [])
    const porId = Object.fromEntries(r.metas.map((m) => [m.meta_id, m.estado]))
    expect(porId['pf:1']).toBe('parcial') // aula 3 agora é a posição 1, com SEU progresso
    expect(porId[idOrfao(K(2), 'pf:#')]).toBe('done') // progresso da aula 2 guardado, não reapontado
    expect((r.cfg.orfas as Record<string, unknown>)[K(2)]).toBeTruthy()
  })
})
