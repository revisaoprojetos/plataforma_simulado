import { describe, it, expect } from 'vitest'
import { REGRAS_PADRAO, normalizarRegras } from '../regras'
import { montarFluxo, caminhoDaRotina, sanitizarHoras, fmtMin } from '../fluxo-regras'

// distribui `total` horas em blocos de 30 min pelos 7 dias (a sanitização arredonda cada dia a 0,5h)
const h = (total: number) => { const d = [0, 0, 0, 0, 0, 0, 0]; let r = Math.round(total * 2); for (let k = 0; r > 0; k = (k + 1) % 7) { d[k] += 0.5; r-- } return d }
const todos = (R = REGRAS_PADRAO) => montarFluxo(R).flatMap((d) => d.nos)

describe('montarFluxo', () => {
  it('ids únicos e arestas apontam para nós do mesmo diagrama', () => {
    const ds = montarFluxo(REGRAS_PADRAO)
    const ids = ds.flatMap((d) => d.nos.map((n) => n.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const d of ds) {
      const s = new Set(d.nos.map((n) => n.id))
      for (const a of d.arestas) { expect(s.has(a.de), `${d.id}:${a.de}`).toBe(true); expect(s.has(a.para), `${d.id}:${a.para}`).toBe(true) }
    }
  })
  it('usa os valores reais das regras (cortes, tetos, limiares)', () => {
    const n = (id: string) => todos().find((x) => x.id === id)!
    expect(n('f.d0').titulo).toContain('14h30')
    expect(n('f.d1').titulo).toContain('24h30')
    expect(n('f.r1').valor).toContain('4')
    expect(n('e.pf').titulo).toContain('50%')
    expect(n('e.ac').valor).toContain('70%')
    expect(n('c.cabe').valor).toContain('600')
  })
  it('regras alteradas mudam o fluxo; restrições ativas e interruptores aparecem', () => {
    const R = normalizarRegras({ tetosPdf: [{ ateMin: 599 }, {}, {}, {}], faixas: { faixa1AteMinExclusivo: 600 }, adaptacao: { dominoAtivo: false },
      restricoes: [{ id: 'a', tipo: 'max_por_dia', tipoA: 'pf', valor: 1, ativa: true, rotulo: '1 PDFull por dia' }, { id: 'b', tipo: 'so_na_sobra', tipoA: 'lp', ativa: false }] })
    const n = (id: string) => todos(R).find((x) => x.id === id)!
    expect(n('f.d0').titulo).toContain('9h')
    expect(n('m.dom').valor).toBe('Desligado')
    expect(n('d.restr').valor).toContain('1 restrição ativa')
    expect(n('d.restr').descricao).toContain('1 PDFull por dia')
    expect(n('c.restr').valor).toContain('1 ativa')
  })
  it('marca o que é inferido e o que está em aberto', () => {
    const ns = todos()
    expect(ns.some((x) => x.tipo === 'aberto' && x.inferido)).toBe(true)
    expect(ns.find((x) => x.id === 'c.inicio')!.inferido).toBe(true)
  })
})

describe('caminhoDaRotina', () => {
  it('24h (exemplo da spec): faixa 2, teto 4, ciclo de 4 semanas', () => {
    const c = caminhoDaRotina(h(24), REGRAS_PADRAO)
    expect(c).toMatchObject({ minutosSemana: 1440, faixa: 2, teto: 4, equilibra: false, jurisReserva: true })
    expect(c.revisao).toMatchObject({ modo: 'ciclo', periodicidade: 4 })
    expect(c.caminho).toContain('f.r1'); expect(c.caminho).toContain('r.ciclo')
  })
  it('fronteiras: 14h30 teto 3 faixa 1; 15h faixa 2; 24h30 faixa 2; 25h faixa 3 teto 5 equilibrada', () => {
    expect(caminhoDaRotina(h(14.5), REGRAS_PADRAO)).toMatchObject({ faixa: 1, teto: 3 })
    expect(caminhoDaRotina(h(15), REGRAS_PADRAO)).toMatchObject({ faixa: 2, teto: 4 })
    expect(caminhoDaRotina(h(24.5), REGRAS_PADRAO)).toMatchObject({ faixa: 2, teto: 4 })
    const c25 = caminhoDaRotina(h(25), REGRAS_PADRAO)
    expect(c25).toMatchObject({ faixa: 3, teto: 5, equilibra: true })
    expect(c25.revisao).toMatchObject({ modo: 'desempenho', periodicidade: 8 })
    expect(caminhoDaRotina(h(35), REGRAS_PADRAO).teto).toBe(5)
    expect(caminhoDaRotina(h(36), REGRAS_PADRAO).teto).toBe(6)
  })
  it('todos os nós do caminho existem no fluxo; semana especial desligada', () => {
    const R = normalizarRegras({ adaptacao: { semanaEspecialAtiva: false } })
    const ids = new Set(todos(R).map((x) => x.id))
    const c = caminhoDaRotina(h(30), R)
    for (const id of c.caminho) expect(ids.has(id), id).toBe(true)
    expect(c.revisao.modo).toBe('desligada')
    expect(c.caminho).toContain('r.off')
  })
  it('sanitiza entradas inválidas e avisa rotina curta', () => {
    expect(sanitizarHoras(['x', -3, 99, 1.26])).toEqual([0, 0, 24, 1.5, 0, 0, 0])
    expect(caminhoDaRotina(h(8), REGRAS_PADRAO).avisos.join(' ')).toContain('10h')
    expect(fmtMin(1470)).toBe('24h30')
  })
})
