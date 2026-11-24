import { describe, it, expect } from 'vitest'
import type { CampoSchema } from './adaptador'
import { errosDoRascunho, valorDoTexto, valoresAlterados, validarCampo } from './campos'

const int: CampoSchema = { chave: 'a', rotulo: 'A', tipo: 'int', valor: 3, min: 1, max: 6 }
const lista: CampoSchema = { chave: 'l', rotulo: 'L', tipo: 'lista', valor: [0, 2], min: 0, max: 6 }
const opc: CampoSchema = { chave: 'o', rotulo: 'O', tipo: 'opcao', valor: 'x', opcoes: [{ valor: 'x', rotulo: 'X' }, { valor: 'y', rotulo: 'Y' }] }

describe('campos do painel de fluxo', () => {
  it('converte texto em valor tipado', () => {
    expect(valorDoTexto(int, '4')).toBe(4)
    expect(valorDoTexto(int, '')).toBeNaN()
    expect(valorDoTexto(lista, '0, 2;4')).toEqual([0, 2, 4])
  })
  it('valida limites, inteiros, listas e opções', () => {
    expect(validarCampo(int, 4)).toBeNull()
    expect(validarCampo(int, 0)).toMatch(/Mínimo/)
    expect(validarCampo(int, 7)).toMatch(/Máximo/)
    expect(validarCampo(int, 2.5)).toMatch(/inteiro/)
    expect(validarCampo(int, Number.NaN)).toMatch(/número/)
    expect(validarCampo(lista, [0, 9])).toMatch(/Máximo/)
    expect(validarCampo(lista, [])).toMatch(/ao menos/)
    expect(validarCampo(opc, 'z')).toMatch(/opção/)
    expect(validarCampo({ chave: 't', rotulo: 'T', tipo: 'texto', valor: '', min: 1, max: 5 }, '')).toMatch(/obrigatório/)
  })
  it('detecta só o que mudou e agrega erros por chave', () => {
    expect(valoresAlterados([int, lista], { a: 3, l: [0, 3] })).toEqual({ l: [0, 3] })
    expect(errosDoRascunho([int], { a: 99 }).a).toMatch(/Máximo/)
    expect(errosDoRascunho([int], {})).toEqual({})
  })
})
