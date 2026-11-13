import { describe, expect, it } from 'vitest'
import { combinarDataHoraBrt, montarTagAtualizacao, prefixarTag, separarDataHoraBrt } from './atualizacoes-tipos'

const ISO = '2026-11-10T17:30:00.000Z' // 14:30 BRT

describe('data + hora BRT <-> ISO', () => {
  it('combina data e hora em BRT', () => {
    expect(combinarDataHoraBrt('2026-11-10', '14:30')).toBe(ISO)
    expect(combinarDataHoraBrt('2026-11-10', '')).toBe('2026-11-10T03:00:00.000Z')
    expect(combinarDataHoraBrt('2026-11-10', null)).toBe('2026-11-10T03:00:00.000Z')
  })
  it('rejeita data/hora inválidas', () => {
    expect(combinarDataHoraBrt('2026-02-31', '10:00')).toBeNull()
    expect(combinarDataHoraBrt('10/11/2026', '')).toBeNull()
    expect(combinarDataHoraBrt('2026-11-10', '25:00')).toBeNull()
    expect(combinarDataHoraBrt('', '10:00')).toBeNull()
  })
  it('separa ISO em data e hora BRT (00:00 vira vazio) e faz round-trip', () => {
    expect(separarDataHoraBrt(ISO)).toEqual({ data: '2026-11-10', hora: '14:30' })
    expect(separarDataHoraBrt('2026-11-10T03:00:00.000Z')).toEqual({ data: '2026-11-10', hora: '' })
    const s = separarDataHoraBrt(ISO)
    expect(combinarDataHoraBrt(s.data, s.hora)).toBe(ISO)
  })
  it('23h BRT não vira o dia seguinte', () => {
    expect(separarDataHoraBrt('2026-11-11T02:30:00.000Z')).toEqual({ data: '2026-11-10', hora: '23:30' })
  })
})

describe('montarTagAtualizacao', () => {
  const base = { ocorridaEm: ISO, rotulo: 'v2.1' }
  it('tudo ligado', () => {
    expect(montarTagAtualizacao({ ...base })).toEqual({ data: '10/11/2026', hora: '14:30', tag: '10/11/2026 14:30', rotulo: 'v2.1' })
  })
  it('só data', () => {
    expect(montarTagAtualizacao({ ...base, exibirHora: false }).tag).toBe('10/11/2026')
  })
  it('só hora', () => {
    expect(montarTagAtualizacao({ ...base, exibirData: false }).tag).toBe('14:30')
  })
  it('rótulo oculto', () => {
    expect(montarTagAtualizacao({ ...base, exibirRotulo: false }).rotulo).toBeNull()
  })
  it('tudo oculto', () => {
    expect(montarTagAtualizacao({ ...base, exibirData: false, exibirHora: false, exibirRotulo: false })).toEqual({ data: null, hora: null, tag: null, rotulo: null })
  })
  it('00:00 nunca exibe a hora', () => {
    expect(montarTagAtualizacao({ ocorridaEm: '2026-11-10T03:00:00.000Z' }).tag).toBe('10/11/2026')
  })
  it('sem data ou rótulo vazio', () => {
    expect(montarTagAtualizacao({ ocorridaEm: null, rotulo: '  ' })).toEqual({ data: null, hora: null, tag: null, rotulo: null })
  })
  it('prefixarTag', () => {
    expect(prefixarTag('10/11/2026', 'atualização disso e daquilo')).toBe('10/11/2026: atualização disso e daquilo')
    expect(prefixarTag(null, 'texto')).toBe('texto')
    expect(prefixarTag('10/11/2026', '')).toBe('10/11/2026')
  })
})
