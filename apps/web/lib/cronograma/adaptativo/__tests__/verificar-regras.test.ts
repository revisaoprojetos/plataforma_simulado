import { describe, it, expect } from 'vitest'
import { REGRAS_PADRAO, type RegrasMotor } from '../regras'
import { diferencasFolhas, verificarCoberturaFaixas, verificarDiferencasPadrao, verificarRegrasMotor } from '../verificar-regras'

const clone = (): RegrasMotor => JSON.parse(JSON.stringify(REGRAS_PADRAO)) as RegrasMotor

describe('verificar-regras', () => {
  it('padrão 2.0: faixas cobrem tudo e nada difere do padrão', () => {
    expect(verificarCoberturaFaixas(REGRAS_PADRAO)).toEqual([])
    expect(verificarDiferencasPadrao(REGRAS_PADRAO)).toEqual([])
    expect(verificarRegrasMotor(REGRAS_PADRAO).filter((i) => i.severidade !== 'info')).toEqual([])
  })
  it('detecta lacuna entre faixas e faixa final fechada', () => {
    const R = clone()
    R.faixas[1].minMin = R.faixas[1].minMin + 60
    const r = verificarCoberturaFaixas(R)
    expect(r.some((i) => i.severidade === 'erro' && /sem cobertura/i.test(i.titulo) && i.noId === 'f.d0')).toBe(true)
    const R2 = clone()
    R2.faixas[R2.faixas.length - 1].maxMin = 3000
    expect(verificarCoberturaFaixas(R2).some((i) => i.noId === `f.r${R2.faixas.length - 1}`)).toBe(true)
  })
  it('detecta sobreposição e 1ª faixa que não começa em zero', () => {
    const R = clone()
    R.faixas[1].minMin = R.faixas[0].maxMin as number
    expect(verificarCoberturaFaixas(R).some((i) => /sobrepostas/i.test(i.titulo))).toBe(true)
    const R2 = clone(); R2.faixas[0].minMin = 30
    expect(verificarCoberturaFaixas(R2).some((i) => i.id === 'fx:ini')).toBe(true)
  })
  it('lista seções diferentes do padrão como info', () => {
    const R = clone(); R.limitesDia.questoes = R.limitesDia.questoes + 1
    const r = verificarDiferencasPadrao(R)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ severidade: 'info', noId: 'd.lim' })
    expect(r[0].descricao).toContain('limitesDia.questoes')
  })
  it('diferencasFolhas compara arrays e objetos', () => {
    expect(diferencasFolhas({ a: [1, 2], b: { c: 1 } }, { a: [1, 3], b: { c: 1 } })).toEqual(['a.1'])
  })
})
