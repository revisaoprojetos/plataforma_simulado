import { describe, it, expect } from 'vitest'
import { hashAS, mapaPorChave, remapearId, remapearEstado, remapearUltimosTemas, resolverAulaDaMeta, docIdDaChave, assinaturaDoCfg, camposAssinatura, lerOrfao, parteAula, type AssinaturaAS } from '../remap-as'

const U = (n: number) => `d:00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const sig = (...n: number[]): AssinaturaAS => ({ chaves: n.map(U), discs: n.map(() => 'Penal') })
type Linha = { meta_id: string; estado?: string; tempo_seg?: number }
const ent = (over: Partial<Parameters<typeof remapearEstado<Linha>>[0]> = {}) => ({
  cfg: {}, plano: {}, revs: {}, detalhes: {}, metas: [] as Linha[], ...over,
})

describe('hash e assinatura', () => {
  it('é determinístico e sensível à ordem/conteúdo', () => {
    expect(hashAS(sig(1, 2, 3).chaves)).toBe(hashAS(sig(1, 2, 3).chaves))
    expect(hashAS(sig(1, 2, 3).chaves)).not.toBe(hashAS(sig(1, 3, 2).chaves))
    expect(hashAS(sig(1, 2).chaves, ['A', 'B'])).not.toBe(hashAS(sig(1, 2).chaves, ['A', 'C']))
  })
  it('assinaturaDoCfg: ausente => null; presente => lista', () => {
    expect(assinaturaDoCfg({})).toBeNull()
    expect(assinaturaDoCfg(camposAssinatura(sig(1, 2)))?.chaves).toEqual(sig(1, 2).chaves)
  })
})

describe('remapearId', () => {
  it('documento removido do MEIO: as seguintes acompanham a aula (nunca a posição)', () => {
    const m = mapaPorChave(sig(1, 2, 3, 4).chaves, sig(1, 3, 4).chaves)
    expect(remapearId('pf:0', m)).toMatchObject({ tipo: 'igual', id: 'pf:0' })
    expect(remapearId('pf:2', m)).toMatchObject({ tipo: 'movida', id: 'pf:1' }) // aula 3 agora é a posição 1
    expect(remapearId('fl:3', m)).toMatchObject({ tipo: 'movida', id: 'fl:2' })
    const o = remapearId('pf:1', m) // aula 2 sumiu
    expect(o.tipo).toBe('orfa')
    expect(lerOrfao(o.id)).toEqual({ chave: U(2), tpl: 'pf:#' })
  })
  it('formatos compostos: pp, revisão, reforço, histórico, rf/rq, lp/jp intocados', () => {
    const m = mapaPorChave(sig(1, 2, 3).chaves, sig(3, 1, 2).chaves) // reordenado
    expect(remapearId('pp:0:2', m).id).toBe('pp:1:2')
    expect(remapearId('pf:2:revisao:5', m).id).toBe('pf:0:revisao:5')
    expect(remapearId('fl:1:reforco:7', m).id).toBe('fl:2:reforco:7')
    expect(remapearId('qu:0:hist:3', m).id).toBe('qu:1:hist:3')
    expect(remapearId('rf:9:2', m).id).toBe('rf:9:0')
    expect(remapearId('rq:9:1', m).id).toBe('rq:9:2')
    expect(remapearId('lp:12:3', m)).toMatchObject({ tipo: 'igual', id: 'lp:12:3' })
    expect(remapearId('jp:4', m).id).toBe('jp:4')
  })
  it('documento inserido: o novo NÃO herda; os existentes deslocam pela chave', () => {
    const m = mapaPorChave(sig(1, 2).chaves, sig(1, 9, 2).chaves)
    expect(m.novasIdx).toEqual([1])
    expect(remapearId('pf:1', m).id).toBe('pf:2')
    expect([...m.paraNovo.values()]).not.toContain(1)
  })
  it('renomeado (mesma chave de documento): continua a mesma aula', () => {
    const a = { chaves: [U(1), U(2)], discs: ['Penal', 'Penal'] }
    const n = { chaves: [U(2), U(1)], discs: ['Penal', 'Penal'] } // só a ordem por título mudou
    expect(remapearId('pf:0', mapaPorChave(a.chaves, n.chaves)).id).toBe('pf:1')
  })
  it('órfão volta quando o documento volta (ida e volta preserva o id original)', () => {
    const m1 = mapaPorChave(sig(1, 2, 3).chaves, sig(1, 3).chaves)
    const o = remapearId('pf:1', m1).id
    const m2 = mapaPorChave(sig(1, 3).chaves, sig(1, 2, 3).chaves)
    expect(remapearId(o, m2)).toMatchObject({ tipo: 'restaurada', id: 'pf:1' })
  })
  it('índice fora da assinatura antiga: órfão sem volta', () => {
    const r = remapearId('pf:99', mapaPorChave(sig(1).chaves, sig(1).chaves))
    expect(r.tipo).toBe('orfa'); expect(lerOrfao(r.id)?.chave).toBe('i:99')
  })
})

describe('remapearEstado', () => {
  const A = sig(1, 2, 3, 4)
  const base = () => ent({
    cfg: { paginasLidas: { '0': 10, '1': 20, '2': 30 }, partesLidas: { '3': 2 }, remanejadas: { 'pf:2': { desde: '2026-11-10', minutos: 30, detalhe: { origem: 'qu:2:hist:1', pai: 'pf:2' } } }, sobras: { 'fl:1': 5 }, ultimosTemas: { Penal: 1 } },
    plano: { 'pf:0': ['2026-11-01', 1], 'pf:1': ['2026-11-02', 1], 'pf:2': ['2026-11-03', 1], 'fl:1': ['2026-11-04', 0.5], 'lp:5:1': ['2026-11-05', 0.5] },
    revs: { '3': [['rf:3:1', '2026-11-20'], ['rf:3:2', '2026-11-20']] },
    detalhes: { 'pf:2': { pai: 'pf:1', continuacao: true } },
    metas: [{ meta_id: 'pf:0', estado: 'done' }, { meta_id: 'pf:1', estado: 'done', tempo_seg: 60 }, { meta_id: 'pf:2', tempo_seg: 30 }, { meta_id: 'lp:5:1', estado: 'done' }],
  })

  it('remove a aula 2 do meio: progresso da aula 3 vai para a posição 1; a aula 2 vira órfã preservada', () => {
    const r = remapearEstado<Linha>(base(), A, sig(1, 3, 4))
    const ids = r.metas.map((x) => x.meta_id)
    expect(ids).toContain('pf:0')
    expect(ids).toContain('lp:5:1')
    // aula 3 (tempo 30) agora é pf:1 — a aula 2 (done, 60s) NÃO pode ter ficado em pf:1
    expect(r.metas.find((x) => x.meta_id === 'pf:1')).toEqual({ meta_id: 'pf:1', tempo_seg: 30 })
    const orf = r.metas.find((x) => x.meta_id.startsWith('og:'))!
    expect(orf).toMatchObject({ estado: 'done', tempo_seg: 60 })
    expect(lerOrfao(orf.meta_id)).toEqual({ chave: U(2), tpl: 'pf:#' })
    // grade: pf:1 antigo (órfã) sai; pf:2 → pf:1; fl:1 (órfã, com linha? não tem linha) é descartada
    expect(Object.keys(r.plano).sort()).toEqual(['lp:5:1', 'pf:0', 'pf:1'])
    expect(r.plano['pf:1']).toEqual(['2026-11-03', 1])
    expect(r.stats.gradeRemovida).toBe(1) // fl:1 sem linha de progresso
    // contadores por aula
    expect(r.cfg.paginasLidas).toEqual({ '0': 10, '1': 30 })
    expect(r.cfg.partesLidas).toEqual({ '2': 2 })
    expect((r.cfg.orfas as Record<string, { pag?: number }>)[U(2)].pag).toBe(20)
    // remanejada acompanha a aula 3 (chave pf:1) e os ids internos
    expect(r.cfg.remanejadas).toEqual({ 'pf:1': { desde: '2026-11-10', minutos: 30, detalhe: { origem: 'qu:1:hist:1', pai: 'pf:1' } } })
    // revisão congelada: aula 1 (idx1=aula2 órfã, sem linha → descartada), aula 2 (idx2=aula3) → idx 1
    expect(r.revs['3']).toEqual([['rf:3:1', '2026-11-20']])
    // detalhes: pai de pf:2 era pf:1 (aula 2 órfã) → removido
    expect(r.detalhes).toEqual({ 'pf:1': { continuacao: true } })
    // ultimosTemas: Penal até posição 1 (aulas 1 e 2); só a 1 sobrevive no prefixo contíguo → posição 0
    expect(r.cfg.ultimosTemas).toEqual({ Penal: 0 })
    expect(r.stats).toMatchObject({ aulasMovidas: 2, aulasOrfas: 1, aulasNovas: 0, metasOrfas: 1, metasMovidas: 1 })
  })

  it('o documento volta: restaura progresso, grade e contadores no novo índice', () => {
    const r1 = remapearEstado<Linha>(base(), A, sig(1, 3, 4))
    const r2 = remapearEstado<Linha>({ cfg: r1.cfg, plano: r1.plano, revs: r1.revs, detalhes: r1.detalhes, metas: r1.metas }, sig(1, 3, 4), sig(1, 2, 3, 4))
    expect(r2.metas.find((x) => x.meta_id === 'pf:1')).toMatchObject({ estado: 'done', tempo_seg: 60 })
    expect(r2.metas.find((x) => x.meta_id === 'pf:2')).toEqual({ meta_id: 'pf:2', tempo_seg: 30 })
    expect(r2.metas.some((x) => x.meta_id.startsWith('og:'))).toBe(false)
    expect(r2.plano['pf:1']).toEqual(['2026-11-02', 1]) // grade da aula 2 volta (tinha progresso)
    expect(r2.plano['pf:2']).toEqual(['2026-11-03', 1])
    expect((r2.cfg.paginasLidas as Record<string, number>)['1']).toBe(20)
    expect(r2.cfg.orfas).toBeUndefined()
  })

  it('inserção no início: tudo desloca +1 e a aula nova não herda nada', () => {
    const r = remapearEstado<Linha>(base(), A, sig(9, 1, 2, 3, 4))
    expect(r.metas.map((x) => x.meta_id).sort()).toEqual(['lp:5:1', 'pf:1', 'pf:2', 'pf:3'])
    expect(r.metas.find((x) => x.meta_id === 'pf:0')).toBeUndefined() // a aula nova (pos 0) não tem progresso
    expect(r.metas.find((x) => x.meta_id === 'pf:2')).toMatchObject({ estado: 'done', tempo_seg: 60 })
    expect(r.cfg.paginasLidas).toEqual({ '1': 10, '2': 20, '3': 30 })
    expect(r.stats.aulasNovas).toBe(1)
    expect(r.cfg.ultimosTemas).toEqual({}) // aula nova no início do prefixo: conservador (nunca marca a nova como estudada)
  })

  it('swap/ciclo (reordenação por renomeação): sem colisão e sem perda', () => {
    const r = remapearEstado<Linha>(ent({ metas: [{ meta_id: 'pf:0', estado: 'done' }, { meta_id: 'pf:1', tempo_seg: 5 }, { meta_id: 'pf:2', tempo_seg: 7 }] }), sig(1, 2, 3), sig(2, 3, 1))
    const por = Object.fromEntries(r.metas.map((x) => [x.meta_id, x]))
    expect(por['pf:2']).toMatchObject({ estado: 'done' }) // aula 1 foi para o fim
    expect(por['pf:0']).toMatchObject({ tempo_seg: 5 })
    expect(por['pf:1']).toMatchObject({ tempo_seg: 7 })
    expect(new Set(r.metas.map((x) => x.meta_id)).size).toBe(3)
  })

  it('idempotente: reaplicar com a mesma assinatura não muda nada', () => {
    const r1 = remapearEstado<Linha>(base(), A, sig(1, 3, 4))
    const r2 = remapearEstado<Linha>({ cfg: r1.cfg, plano: r1.plano, revs: r1.revs, detalhes: r1.detalhes, metas: r1.metas }, sig(1, 3, 4), sig(1, 3, 4))
    expect(r2.cfg).toEqual(r1.cfg); expect(r2.plano).toEqual(r1.plano); expect(r2.revs).toEqual(r1.revs)
    expect(r2.detalhes).toEqual(r1.detalhes); expect(r2.metas).toEqual(r1.metas); expect(r2.mudancas).toEqual([])
  })

  it('progresso NUNCA migra para a aula errada: cada linha mantém a chave do documento de origem', () => {
    const antes = sig(1, 2, 3, 4, 5)
    const depois = { chaves: [U(5), U(7), U(2), U(1)], discs: ['Penal', 'Penal', 'Penal', 'Penal'] }
    const linhas = antes.chaves.map((c, i) => ({ meta_id: `pf:${i}`, tempo_seg: i + 1 })) // tempo = 1 + índice antigo (marca de origem)
    const r = remapearEstado<Linha>(ent({ metas: linhas }), antes, depois)
    for (const x of r.metas) {
      const o = lerOrfao(x.meta_id)
      const chaveAgora = o ? o.chave : depois.chaves[parteAula(x.meta_id)!.idx]
      expect(chaveAgora).toBe(antes.chaves[x.tempo_seg! - 1]) // a linha continua na aula de onde veio
    }
  })

  it('não muta a entrada', () => {
    const e = base(); const copia = JSON.stringify(e)
    remapearEstado<Linha>(e, A, sig(1, 3, 4))
    expect(JSON.stringify(e)).toBe(copia)
  })
})

describe('ultimosTemas', () => {
  it('sem mudança de prefixo => igual; disciplina que sumiu => removida', () => {
    expect(remapearUltimosTemas({ Penal: 2 }, sig(1, 2, 3, 4), sig(1, 2, 3, 4))).toEqual({ Penal: 2 })
    expect(remapearUltimosTemas({ Penal: 2 }, sig(1, 2, 3), { chaves: [U(1)], discs: ['Civil'] })).toEqual({})
  })
})

describe('resolverAulaDaMeta', () => {
  it('resolve pela chave gravada no plano (não pelo número)', () => {
    const plano = { cfg: camposAssinatura(sig(10, 20, 30)) }
    expect(resolverAulaDaMeta(plano, 'pf:1')).toMatchObject({ indice: 1, chave: U(20), docId: '00000000-0000-4000-8000-000000000020', orfa: false })
    expect(resolverAulaDaMeta(plano, 'pf:2:revisao:4')?.docId).toBe('00000000-0000-4000-8000-000000000030')
    expect(resolverAulaDaMeta(plano, 'rf:3:0')?.docId).toBe('00000000-0000-4000-8000-000000000010')
    expect(resolverAulaDaMeta(plano, 'lp:1:1')).toBeNull()
  })
  it('órfã e legado', () => {
    const o = remapearId('pf:1', mapaPorChave(sig(1, 2).chaves, sig(1).chaves)).id
    expect(resolverAulaDaMeta({ cfg: {} }, o)).toMatchObject({ orfa: true, docId: '00000000-0000-4000-8000-000000000002', indice: null })
    expect(resolverAulaDaMeta({ cfg: {} }, 'pf:0', sig(7).chaves)?.docId).toBe('00000000-0000-4000-8000-000000000007')
    expect(resolverAulaDaMeta({ cfg: {} }, 'pf:5')).toMatchObject({ chave: null, orfa: true })
  })
  it('docIdDaChave aceita sufixo #n e ignora t:/c:', () => {
    expect(docIdDaChave(U(1) + '#2')).toBe('00000000-0000-4000-8000-000000000001')
    expect(docIdDaChave('t:Penal|Aula 1')).toBeNull(); expect(docIdDaChave('c:abc12345')).toBeNull(); expect(docIdDaChave(null)).toBeNull()
  })
})
