import { describe, expect, it } from 'vitest'
import { auditarPlano, contarPorTipo, type EntradaAuditoria } from '../auditar-plano'

const atual = { chaves: ['d:A', 'd:B', 'd:C', 'd:D'], discs: ['Civil', 'Civil', 'Penal', 'Penal'] }
const cfgOk = { chavesAS: atual.chaves, discsAS: atual.discs, discs: ['Civil', 'Penal'] }
const base = (p: Partial<EntradaAuditoria> = {}): EntradaAuditoria => ({ grade: { 'pf:0': ['2026-11-01', 1] }, cfg: cfgOk, linhas: [], atual, ...p })
const tipos = (e: EntradaAuditoria) => auditarPlano(e).map((a) => a.tipo)

describe('auditarPlano', () => {
  it('plano saudável não tem anomalias', () => {
    expect(auditarPlano(base({ grade: { 'pf:0': ['2026-11-01', 1], 'fl:0': ['2026-11-09', 1], 'qu:0': ['2026-11-15', 1] }, linhas: [{ meta_id: 'pf:0', estado: 'done', aula_key: 'd:A' }] }))).toEqual([])
  })
  it('plano_sem_assinatura e grade_vazia', () => {
    expect(tipos(base({ cfg: { discs: ['Civil'] }, grade: {} }))).toEqual(['plano_sem_assinatura', 'grade_vazia'])
  })
  it('feito_em_aula_diferente: aula_key difere da chave atual da posição', () => {
    const r = auditarPlano(base({ linhas: [{ meta_id: 'pf:1', estado: 'done', aula_key: 'd:X', concluido_em: '2026-11-17' }] }))
    const a = r.find((x) => x.tipo === 'feito_em_aula_diferente')!
    expect(a).toMatchObject({ metaId: 'pf:1', aulaAtual: 'd:B', aulaGravada: 'd:X', data: '2026-11-17' })
  })
  it('id_fora_do_catalogo na grade e no progresso', () => {
    const t = tipos(base({ grade: { 'pf:0': ['2026-11-01', 1], 'pf:9': ['2026-11-02', 1] }, linhas: [{ meta_id: 'fl:8', estado: 'done' }] }))
    expect(t.filter((x) => x === 'id_fora_do_catalogo')).toHaveLength(2)
  })
  it('revisao_antes_do_estudo: fl antes do pf não feito', () => {
    const r = auditarPlano(base({ grade: { 'pf:0': ['2026-11-10', 1], 'fl:0': ['2026-11-05', 1] } }))
    expect(r.map((a) => a.tipo)).toEqual(['revisao_antes_do_estudo'])
  })
  it('aula_sem_pdfull_na_grade respeita ultimosTemas (0-based por disciplina) e qu:hist', () => {
    const grade = { 'pf:0': ['2026-11-01', 1], 'fl:1': ['2026-11-09', 1], 'qu:2:hist:1': ['2026-11-01', 1], 'fl:3': ['2026-11-09', 1] } as EntradaAuditoria['grade']
    // Civil: ultimo=1 (aulas 0 e 1 já estudadas); Penal sem declaração → fl:3 sem pf é anomalia, qu:2:hist não
    const r = auditarPlano(base({ grade, cfg: { ...cfgOk, ultimosTemas: { Civil: 1 } } }))
    expect(r.filter((a) => a.tipo === 'aula_sem_pdfull_na_grade').map((a) => a.metaId)).toEqual(['fl:3'])
  })
  it('aula seguinte à declarada só pode ter qu:hist', () => {
    const grade = { 'qu:1:hist:1': ['2026-11-01', 1], 'pf:0': ['2026-11-01', 1] } as EntradaAuditoria['grade']
    expect(tipos(base({ grade, cfg: { ...cfgOk, ultimosTemas: { Civil: 0 } } }))).toEqual([])
    const grade2 = { 'qu:1': ['2026-11-12', 1] } as EntradaAuditoria['grade']
    expect(tipos(base({ grade: grade2, cfg: { ...cfgOk, ultimosTemas: { Civil: 0 } } }))).toEqual(['aula_sem_pdfull_na_grade'])
  })
  it('materia_fora_da_selecao compara nomes normalizados (acento/caixa)', () => {
    const ok = base({ cfg: { ...cfgOk, discs: ['CÍVIL', 'penal'] }, grade: { 'pf:0': ['2026-11-01', 1], 'pf:2': ['2026-11-02', 1] } })
    expect(tipos(ok)).toEqual([])
    const ruim = base({ cfg: { ...cfgOk, discs: ['Penal'] }, grade: { 'pf:0': ['2026-11-01', 1] } })
    expect(tipos(ruim)).toEqual(['materia_fora_da_selecao'])
  })
  it('meta_orfa (og:)', () => {
    const r = auditarPlano(base({ linhas: [{ meta_id: 'og:d%3AZ:pf:#', estado: 'done' }] }))
    expect(r[0]).toMatchObject({ tipo: 'meta_orfa', aulaGravada: 'd:Z', aulaAtual: null })
  })
  it('contarPorTipo conta planos distintos', () => {
    const a = auditarPlano(base({ grade: {} })), b = auditarPlano(base({ grade: { 'pf:0': ['2026-11-01', 1] } }))
    const c = contarPorTipo([a, b, a])
    expect(c.grade_vazia).toBe(2)
    expect(c.meta_orfa).toBe(0)
  })
})
