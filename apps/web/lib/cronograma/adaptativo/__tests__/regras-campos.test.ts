import { describe, it, expect } from 'vitest'
import { REGRAS_PADRAO, deltaDoPadrao, normalizarRegras } from '../regras'
import { validarRegras } from '../regras-validacao'
import { TODOS_CAMPOS, lerCaminho, gravarCaminho, textoParaValor, diffRegras, fichaDoTipo, fichaDoTipoGx, regrasDoDelta } from '../regras-campos'
import { SLUGS_META } from '../tipos-meta'

describe('regras-campos', () => {
  it('todo campo descrito existe nas regras padrão', () => {
    for (const c of TODOS_CAMPOS) expect(lerCaminho(REGRAS_PADRAO, c.path), c.path).not.toBeUndefined()
  })
  it('todo campo de valor simples das regras tem descrição (exceto ateMin nulo e versaoSchema)', () => {
    const paths = new Set(TODOS_CAMPOS.map((c) => c.path))
    for (const k of ['horizonte.maxSemanas', 'constantes.blocoMin', 'revisao.giroExternas', 'rodizio.atrasoLimiar', 'prioridades.outros']) expect(paths.has(k)).toBe(true)
  })
  it('gravarCaminho não muta e respeita arrays', () => {
    const n = gravarCaminho(REGRAS_PADRAO, 'faixas.1.tetoPdf', 9)
    expect(n.faixas[1].tetoPdf).toBe(9)
    expect(REGRAS_PADRAO.faixas[1].tetoPdf).toBe(4)
  })
  it('textoParaValor: número, lista e inválido', () => {
    const num = TODOS_CAMPOS.find((c) => c.path === 'limitesDia.questoes')!
    const lst = TODOS_CAMPOS.find((c) => c.path === 'juris.diasPreferidos')!
    expect(textoParaValor(num, '3')).toBe(3)
    expect(textoParaValor(num, '')).toBeNaN()
    expect(textoParaValor(lst, '4, 5')).toEqual([4, 5])
  })
  it('valor fora do limite é reprovado pelo zod com mensagem', () => {
    const v = validarRegras(gravarCaminho(REGRAS_PADRAO, 'limitesDia.questoes', 99))
    expect(v.ok).toBe(false)
  })
  it('diffRegras: vazio no padrão, lista só o que mudou e concorda com deltaDoPadrao', () => {
    expect(diffRegras(REGRAS_PADRAO, REGRAS_PADRAO)).toEqual([])
    const alt = gravarCaminho(REGRAS_PADRAO, 'limitesDia.questoes', 3)
    const d = diffRegras(REGRAS_PADRAO, alt)
    expect(d).toEqual([{ path: 'limitesDia.questoes', rotulo: 'Questões por dia', de: '2', para: '3' }])
    expect(deltaDoPadrao(alt)).toEqual({ limitesDia: { questoes: 3 } })
    expect(diffRegras(REGRAS_PADRAO, regrasDoDelta(deltaDoPadrao(alt)))).toEqual(d)
  })
  it('fichaDoTipo gera texto para todos os tipos e reflete a regra', () => {
    for (const s of SLUGS_META) { const f = fichaDoTipo(s, REGRAS_PADRAO); expect(f.teto.length).toBeGreaterThan(0); expect(f.editavel).toContain(`prioridades.porTipo.${s}`) }
    const alt = normalizarRegras({ limitesDia: { questoes: 4 } })
    expect(fichaDoTipo('qu', alt).teto.join(' ')).toContain('4 questões por dia')
  })
  it('diff de tiposGx tem rótulo pt-BR legível e vê slug novo (chave só de um lado)', () => {
    const d = diffRegras(REGRAS_PADRAO, { tiposGx: { comentarios: { maxPorDia: 2, dias: [0, 2] } } }, { comentarios: 'Comentários' })
    const por = Object.fromEntries(d.map((x) => [x.path, x]))
    expect(por['tiposGx.comentarios.maxPorDia'].rotulo).toBe('Tipo "Comentários": máximo por dia')
    expect(por['tiposGx.comentarios.maxPorDia'].de).toBe('não definido')
    expect(por['tiposGx.comentarios.maxPorDia'].para).toBe('2')
    expect(d.some((x) => x.path === 'tiposGx')).toBe(false)
    expect(diffRegras({ tiposGx: {} }, REGRAS_PADRAO)).toEqual([])
  })
  it('fichaDoTipoGx descreve as regras do tipo e o padrão sem regra', () => {
    const padrao = fichaDoTipoGx('comentarios', REGRAS_PADRAO, 'Comentários')
    expect(padrao.teto.join(' ')).toContain('Sem limite por dia')
    expect(padrao.editavel).toContain('tiposGx.comentarios.*')
    const alt = normalizarRegras({ tiposGx: { comentarios: { maxPorDia: 1, maxPorSemana: 3, dias: [0, 4], aPartirDaSemana: 2 } } })
    const f = fichaDoTipoGx('comentarios', alt, 'Comentários')
    const txt = [...f.teto, ...f.avanca, ...f.recua].join(' ')
    expect(txt).toContain('No máximo 1 meta(s) por dia'); expect(txt).toContain('3 meta(s) por semana'); expect(txt).toContain('segunda, sexta'); expect(txt).toContain('semana 2')
    expect(f.restricoes?.join(' ')).toContain('gerar/regenerar')
  })
})
