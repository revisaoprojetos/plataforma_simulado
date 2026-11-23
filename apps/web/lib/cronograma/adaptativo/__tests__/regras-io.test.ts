import { describe, it, expect } from 'vitest'
import { REGRAS_PADRAO, normalizarRegras, hashRegras } from '../regras'
import { exportarRegras, importarRegras, mesclarParcial, LIMITE_BYTES_IMPORTACAO } from '../regras-io'

const custom = normalizarRegras({ legproc: { metasDiaMax: 5, metasDiaBase: 2 }, limitesDia: { pdfDistintos: 1 } })

describe('regras-io', () => {
  it('round-trip exportar -> importar = mesmas regras', () => {
    const arq = exportarRegras(custom, { exportadoEm: '2026-11-23T10:00:00.000Z' })
    expect(arq.formato).toBe('adaptativo-regras')
    expect(arq.exportadoEm).toBe('2026-11-23T10:00:00.000Z')
    const r = importarRegras(JSON.stringify(arq), REGRAS_PADRAO)
    expect(r.ok).toBe(true)
    expect(hashRegras(r.regras)).toBe(hashRegras(custom))
    expect(r.avisos).toEqual([])
    expect(r.diff.map((d) => d.path)).toEqual(expect.arrayContaining(['legproc.metasDiaMax', 'limitesDia.pdfDistintos']))
  })
  it('diff contra vigentes iguais é vazio', () => {
    const r = importarRegras(exportarRegras(custom, { exportadoEm: 'x' }), custom)
    expect(r.ok && r.diff.length).toBe(0)
  })
  it('faixas custom e overrides sobrevivem ao round-trip', () => {
    const f = REGRAS_PADRAO.faixas.map((x, i) => (i === 0 ? { ...x, nome: 'Minha faixa', tetoPdf: 1 } : x))
    const base = normalizarRegras({ faixas: f })
    const r = importarRegras(JSON.stringify(exportarRegras(base, { exportadoEm: 'x' })), REGRAS_PADRAO)
    expect(r.ok).toBe(true)
    expect(r.regras!.faixas[0].nome).toBe('Minha faixa')
    expect(r.regras!.faixas[0].tetoPdf).toBe(1)
    expect(r.diff.some((d) => d.path.startsWith('faixas.0'))).toBe(true)
  })
  it('rejeita lixo, formato errado, __proto__ e arquivo grande', () => {
    expect(importarRegras('{nao e json', REGRAS_PADRAO).ok).toBe(false)
    expect(importarRegras('', REGRAS_PADRAO).ok).toBe(false)
    expect(importarRegras('[1,2]', REGRAS_PADRAO).ok).toBe(false)
    expect(importarRegras({ formato: 'outro', versaoFormato: 1, regras: {} }, REGRAS_PADRAO).erros[0]).toMatch(/Formato desconhecido/)
    expect(importarRegras({ formato: 'adaptativo-regras', versaoFormato: 99, regras: {} }, REGRAS_PADRAO).ok).toBe(false)
    const p = importarRegras('{"formato":"adaptativo-regras","versaoFormato":1,"regras":{"__proto__":{"x":1}}}', REGRAS_PADRAO)
    expect(p.ok).toBe(false); expect(p.erros[0]).toMatch(/__proto__/)
    expect(({} as Record<string, unknown>).x).toBeUndefined()
    expect(importarRegras('x'.repeat(LIMITE_BYTES_IMPORTACAO + 1), REGRAS_PADRAO).erros[0]).toMatch(/grande demais/)
    expect(importarRegras({ formato: 'adaptativo-regras', versaoFormato: 1, regras: { limitesDia: { pdfDistintos: 99 } } }, REGRAS_PADRAO).ok).toBe(false)
  })
  it('hash divergente gera aviso; sem regras usa delta', () => {
    const arq = { ...exportarRegras(custom, { exportadoEm: 'x' }), hash: 'deadbeef' }
    expect(importarRegras(arq, REGRAS_PADRAO).avisos.join(' ')).toMatch(/hash/)
    const so = importarRegras({ formato: 'adaptativo-regras', versaoFormato: 1, delta: { legproc: { metasDiaMax: 6 } } }, REGRAS_PADRAO)
    expect(so.ok).toBe(true); expect(so.regras!.legproc.metasDiaMax).toBe(6)
  })
  it('mesclarParcial funde objetos e ignora chaves perigosas', () => {
    const m = mesclarParcial({ a: { b: 1, c: 2 } }, JSON.parse('{"a":{"b":9},"__proto__":{"z":1}}')) as Record<string, any>
    expect(m.a).toEqual({ b: 9, c: 2 })
    expect(m.z).toBeUndefined()
  })
})
