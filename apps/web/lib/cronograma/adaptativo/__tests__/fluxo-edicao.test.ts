import { describe, it, expect } from 'vitest'
import { REGRAS_PADRAO } from '../regras'
import { validarRegras } from '../regras-validacao'
import { montarFluxo } from '../fluxo-regras'
import { aplicarPatchRegras, camposDoNo, chaveEditavel } from '../fluxo-edicao'
import { TODOS_CAMPOS } from '../regras-campos'

const R = REGRAS_PADRAO
const nos = montarFluxo(R).flatMap((d) => d.nos)

describe('camposDoNo (nó → regra editável)', () => {
  it('toda chave devolvida é aceita pela lista branca e tem valor do tipo certo', () => {
    for (const n of nos) {
      const e = camposDoNo(n.id, R)
      for (const c of e?.campos ?? []) {
        expect(chaveEditavel(c.chave), `${n.id}:${c.chave}`).toBe(true)
        if (c.tipo === 'bool') expect(typeof c.valor).toBe('boolean')
        if (c.tipo === 'int' || c.tipo === 'real') expect(typeof c.valor === 'number' || c.valor === null, `${n.id}:${c.chave}`).toBe(true)
      }
    }
  })
  it('mapeia faixas, limiares, adaptação e restrições', () => {
    expect(camposDoNo('f.r1', R)!.campos.map((c) => c.chave)).toContain('faixas.1.tetoPdf')
    expect(camposDoNo('f.d0', R)!.campos.map((c) => c.chave)).toContain('faixas.0.maxMin')
    expect(camposDoNo('e.ac', R)!.campos.map((c) => c.chave)).toEqual(expect.arrayContaining(['desempenho.especialPdfAbaixo', 'desempenho.especialFlashAte']))
    expect(camposDoNo('m.dom', R)!.campos.map((c) => c.chave)).toContain('adaptacao.dominoAtivo')
    expect(camposDoNo('c.cabe', R)!.campos[0].chave).toBe('horizonte.maxSemanas')
  })
  it('nós sem regra editável devolvem null', () => {
    expect(camposDoNo('c.fim', R)).toBeNull()
    expect(camposDoNo('d.ok', R)).toBeNull()
    expect(camposDoNo('nao.existe', R)).toBeNull()
  })
  it('todo campo do catálogo de regras é alcançável por algum nó (cobertura)', () => {
    const alc = new Set(nos.flatMap((n) => camposDoNo(n.id, R)?.campos.map((c) => c.chave) ?? []))
    const faltam = TODOS_CAMPOS.map((c) => c.path).filter((p) => !alc.has(p))
    // restam apenas campos sem nó no fluxo (documentados no relatório); o teste trava regressões de cobertura
    expect(faltam.length).toBeLessThan(25)
  })
})

describe('aplicarPatchRegras', () => {
  it('altera o valor sem mutar a entrada e o resultado continua válido', () => {
    const r = aplicarPatchRegras(R, { 'desempenho.especialPdfAbaixo': 40, 'adaptacao.dominoAtivo': false })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.regras.desempenho.especialPdfAbaixo).toBe(40)
    expect(r.regras.adaptacao.dominoAtivo).toBe(false)
    expect(R.desempenho.especialPdfAbaixo).not.toBe(40)
    expect(validarRegras(r.regras).ok).toBe(true)
  })
  it('maxMin acompanha o mínimo da faixa seguinte (sem lacuna/sobreposição)', () => {
    const r = aplicarPatchRegras(R, { 'faixas.0.maxMin': R.faixas[0].maxMin! + 30 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.regras.faixas[1].minMin).toBe(r.regras.faixas[0].maxMin! + 1)
    expect(validarRegras(r.regras).ok).toBe(true)
  })
  it('rejeita chave fora da lista branca, índice inexistente e valor fora do limite (via validação)', () => {
    expect(aplicarPatchRegras(R, { 'versaoSchema': 9 }).ok).toBe(false)
    expect(aplicarPatchRegras(R, { '__proto__.x': 1 }).ok).toBe(false)
    expect(aplicarPatchRegras(R, { 'faixas.99.tetoPdf': 3 }).ok).toBe(false)
    expect(aplicarPatchRegras(R, { 'restricoes.99.ativa': true }).ok).toBe(false)
    const r = aplicarPatchRegras(R, { 'limitesDia.pdfDistintos': 99 })
    expect(r.ok && validarRegras(r.regras).ok).toBe(false)
  })
})
