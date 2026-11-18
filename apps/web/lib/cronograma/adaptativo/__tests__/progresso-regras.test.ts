import { describe, it, expect } from 'vitest'
import { planejarProgresso, emParaCliente, dataValidaNaoFutura, LIMITE_NOVAS_CONCLUSOES, type MetaAtual } from '../progresso-regras'

const HOJE = '2026-11-18'
const at = (o: Partial<MetaAtual> = {}): MetaAtual => ({ estado: null, tempo_seg: 0, parcial_v: null, parcial_em: null, modo: null, concluido_em: null, ...o })

describe('planejarProgresso', () => {
  it('preserva concluido_em antigo e não regrava linha inalterada (sem recarimbo)', () => {
    const r = planejarProgresso({ hoje: HOJE, prog: { a: { s: 'done' } }, atual: { a: at({ estado: 'done', concluido_em: '2026-10-01' }) } })
    expect(r.gravar).toEqual([])
    expect(r.eventos).toEqual([])
  })
  it('done legado sem data: não carimba hoje; aceita só `em` válido', () => {
    expect(planejarProgresso({ hoje: HOJE, prog: { a: { s: 'done' } }, atual: { a: at({ estado: 'done' }) } }).gravar).toEqual([])
    const r = planejarProgresso({ hoje: HOJE, prog: { a: { s: 'done', em: '2026-10-05' } }, atual: { a: at({ estado: 'done' }) } })
    expect(r.gravar[0].concluido_em).toBe('2026-10-05')
  })
  it('conclusão nova usa a data enviada, nunca no futuro; sem data = hoje', () => {
    const r = planejarProgresso({ hoje: HOJE, prog: { a: { s: 'done', em: '2026-11-17' }, b: { s: 'done', em: '2030-01-01' }, c: { s: 'done' } }, atual: {}, tocadas: ['a', 'b', 'c'] })
    expect(r.gravar.map((l) => l.concluido_em)).toEqual(['2026-11-17', HOJE, HOJE])
    expect(r.eventos).toHaveLength(3)
  })
  it('com tocadas: ignora conclusão nova de id não tocado', () => {
    const r = planejarProgresso({ hoje: HOJE, prog: { a: { s: 'done' }, b: { s: 'done' } }, atual: {}, tocadas: ['a'] })
    expect(r.gravar.map((l) => l.meta_id)).toEqual(['a'])
    expect(r.ignoradas).toEqual(['b'])
  })
  it('sem tocadas: até o limite aceita; acima recusa TODAS as novas', () => {
    const mk = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['m' + i, { s: 'done' as const }]))
    const ok = planejarProgresso({ hoje: HOJE, prog: mk(LIMITE_NOVAS_CONCLUSOES), atual: {} })
    expect(ok.gravar).toHaveLength(LIMITE_NOVAS_CONCLUSOES)
    expect(ok.loteRecusado).toBe(false)
    const ruim = planejarProgresso({ hoje: HOJE, prog: mk(LIMITE_NOVAS_CONCLUSOES + 1), atual: {} })
    expect(ruim.gravar).toEqual([])
    expect(ruim.loteRecusado).toBe(true)
    expect(ruim.ignoradas).toHaveLength(LIMITE_NOVAS_CONCLUSOES + 1)
  })
  it('lote recusado não afeta o que já estava done nem outras alterações', () => {
    const prog: Record<string, { s?: 'done' }> = Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['n' + i, { s: 'done' as const }]))
    prog.velho = { s: 'done' }
    const r = planejarProgresso({ hoje: HOJE, prog, atual: { velho: at({ estado: 'done', concluido_em: '2026-09-01' }) } })
    expect(r.gravar).toEqual([])
  })
  it('ausência do id nunca desfaz done; {} desfaz (limpar + evento)', () => {
    const atual = { a: at({ estado: 'done', concluido_em: '2026-10-01' }) }
    expect(planejarProgresso({ hoje: HOJE, prog: {}, atual }).limpar).toEqual([])
    const r = planejarProgresso({ hoje: HOJE, prog: { a: {} }, atual })
    expect(r.limpar).toEqual(['a'])
    expect(r.eventos).toEqual([{ metaId: 'a', de: 'done', para: null }])
  })
  it('com tocadas: desmarcar done de id não tocado é ignorado (anti-lote)', () => {
    const atual = { a: at({ estado: 'done', concluido_em: '2026-10-01' }) }
    expect(planejarProgresso({ hoje: HOJE, prog: { a: {} }, atual, tocadas: [] }).limpar).toEqual([])
    const t = planejarProgresso({ hoje: HOJE, prog: { a: { t: 30 } }, atual, tocadas: [] }) // mantém done + data; só o tempo
    expect(t.gravar[0]).toMatchObject({ estado: 'done', concluido_em: '2026-10-01' })
    expect(t.eventos).toEqual([])
    expect(planejarProgresso({ hoje: HOJE, prog: { a: {} }, atual, tocadas: ['a'] }).limpar).toEqual(['a'])
  })
  it('só regrava o que mudou (tempo) e mantém concluido_em', () => {
    const r = planejarProgresso({ hoje: HOJE, prog: { a: { s: 'done', t: 60 }, b: { s: 'missed' } }, atual: { a: at({ estado: 'done', concluido_em: '2026-10-01T00:00:00Z', tempo_seg: 30 }), b: at({ estado: 'missed' }) } })
    expect(r.gravar).toHaveLength(1)
    expect(r.gravar[0]).toMatchObject({ meta_id: 'a', tempo_seg: 60, concluido_em: '2026-10-01' })
  })
})

describe('emParaCliente / dataValidaNaoFutura', () => {
  it('emite em sempre que done; legado usa atualizado_em', () => {
    expect(emParaCliente({ estado: 'done', concluido_em: '2026-10-01' })).toBe('2026-10-01')
    expect(emParaCliente({ estado: 'done', concluido_em: null, atualizado_em: '2026-10-02T07:40:06Z' })).toBe('2026-10-02')
    expect(emParaCliente({ estado: 'missed', concluido_em: '2026-10-01' })).toBeNull()
  })
  it('data futura vira hoje; inválida vira null', () => {
    expect(dataValidaNaoFutura('2027-01-01', HOJE)).toBe(HOJE)
    expect(dataValidaNaoFutura('xx', HOJE)).toBeNull()
  })
})
