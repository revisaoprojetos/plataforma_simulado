import { describe, it, expect } from 'vitest'
import * as M30 from '../motor30'
import dados from '../catalogo-html.json'
import { descrever, ORDEM, type AS, type WLP } from '../engine'
import { auditarPlano } from '../auditar-plano'
import type { Cfg28, AulaAS, ItemLP } from '../motor28'
import type { ItemGX } from '../gx-tipos'

const CAT = dados as unknown as { aulas: Array<string[] | null>; ordem: number[]; ordemLP: number[]; legprocs: Array<{ disc: string; lei?: string; texto?: string }> }
const AS_ = CAT.aulas.map((a) => (a ? [...a] : ['', '', '', 0, '', ''])) as unknown as AulaAS[]
const LP = CAT.ordemLP.map((i) => ({ id: 'lp:1:' + i, disc: CAT.legprocs[i].disc, lei: CAT.legprocs[i].lei || '', texto: CAT.legprocs[i].texto || '' })) as unknown as ItemLP[]
const WLP_: WLP = []
const GX: ItemGX[] = [{ id: 'gx:resumo:bbbb2222', slug: 'resumo', nomeTipo: 'Resumo', disc: 'Direito Civil', titulo: 'Resumo 1', doc: 'doc-2', min: 30, prioridade: 5, ordem: 0 }]
const MAPA = Object.fromEntries(GX.map((g) => [g.id, g]))

describe('engine.descrever — gx', () => {
  it('sem mapa/GX vazio: ids existentes descrevem igual (lp/jp/pf)', () => {
    const lp = LP[0]
    const base = descrever(lp.id, AS_ as unknown as AS, WLP_, { [lp.id]: lp })
    expect(descrever(lp.id, AS_ as unknown as AS, WLP_, { [lp.id]: lp }, null)).toEqual(base)
    expect(descrever(lp.id, AS_ as unknown as AS, WLP_, { [lp.id]: lp }, {})).toEqual(base)
    expect(descrever('pf:0', AS_ as unknown as AS, WLP_, null, MAPA)).toEqual(descrever('pf:0', AS_ as unknown as AS, WLP_))
  })
  it('item gx traz tipo, nome do tipo, disciplina e documento', () => {
    const d = descrever(GX[0].id, AS_ as unknown as AS, WLP_, null, MAPA)
    expect(d).toMatchObject({ tipo: 'gx', texto: 'Resumo 1', disc: 'Direito Civil', doc: 'doc-2', slugCat: 'resumo', lei: 'Resumo' })
  })
  it('gx sem mapa não quebra e ORDEM tem gx depois dos existentes', () => {
    expect(descrever('gx:resumo:zzzzzzzz', AS_ as unknown as AS, WLP_).tipo).toBe('gx')
    expect(ORDEM.gx).toBeGreaterThan(ORDEM.lp)
    expect(ORDEM.pf).toBe(0)
  })
})

describe('auditar-plano com gx', () => {
  it('metas gx na grade não geram anomalia', () => {
    const cfg = { start: '2026-01-05', horas: [4, 4, 4, 4, 4, 0, 0], discs: ['Direito Civil'], metas: { pf: true, fl: true, qu: true, lp: true }, arranjo: 'pdf', revisao: { ativa: true, cada: 8 } } as unknown as Cfg28
    const r = M30.gerarPlano(JSON.parse(JSON.stringify(cfg)), AS_, LP, {}, null, { ordem: CAT.ordem, hoje: '2026-01-05', gx: GX })
    expect(Object.keys(r.plano).some((k) => k.startsWith('gx:'))).toBe(true)
    const { 'gx:resumo:bbbb2222': _g, ...semGx } = r.plano
    void _g
    const chaves = AS_.map((a, i) => String(a[1] ?? i))
    const discs = AS_.map((a) => String(a[0] ?? ''))
    const run = (grade: Record<string, [string, number]>) => auditarPlano({ grade, cfg: { ...cfg, chavesAS: chaves } as never, linhas: [], atual: { chaves, discs } })
    const com = run(r.plano as never), sem = run(semGx as never)
    expect(com.map((a) => a.tipo + a.metaId)).toEqual(sem.map((a) => a.tipo + a.metaId))
    expect(com.some((a) => (a.metaId || '').startsWith('gx:'))).toBe(false)
  }, 120000)
})
