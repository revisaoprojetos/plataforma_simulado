import { describe, expect, it } from 'vitest'
import {
  LARGURA_CANETA, LARGURA_MARCA_TEXTO, PADRAO_PREFS, idDoSlot, limitarLarguraCaneta, sanitizarPrefs, serializarPrefs, slotDoComando, tipoDesenha,
} from './notebook-desenho'

describe('preferências de desenho (localStorage)', () => {
  it('ida e volta preserva canetas, borracha e toque', () => {
    const p = { ...PADRAO_PREFS, toque: true, borracha: { tamanho: 'grande' as const, modo: 'traco' as const }, canetas: { ...PADRAO_PREFS.canetas, c2: { cor: '#112233', largura: 7 } } }
    expect(sanitizarPrefs(serializarPrefs(p))).toEqual(p)
  })
  it('lixo/JSON corrompido/null volta ao padrão sem lançar', () => {
    for (const raw of ['{', 'null', '[]', '123', undefined, null, 5]) expect(sanitizarPrefs(raw as unknown)).toEqual(PADRAO_PREFS)
  })
  it('rejeita cor fora de #rrggbb/tinta e limita largura', () => {
    const p = sanitizarPrefs({ canetas: { c1: { cor: 'red', largura: 999 }, c2: { cor: '#12345', largura: -3 }, mt: { cor: 'tinta', largura: 2 } }, borracha: { tamanho: 'gigante', modo: 'x' }, toque: 'sim' })
    expect(p.canetas.c1).toEqual({ cor: PADRAO_PREFS.canetas.c1.cor, largura: LARGURA_CANETA.max })
    expect(p.canetas.c2.cor).toBe(PADRAO_PREFS.canetas.c2.cor)
    expect(p.canetas.c2.largura).toBe(LARGURA_CANETA.min)
    expect(p.canetas.mt).toEqual({ cor: 'tinta', largura: LARGURA_MARCA_TEXTO.min })
    expect(p.borracha).toEqual(PADRAO_PREFS.borracha)
    expect(p.toque).toBe(false)
  })
  it('limitarLarguraCaneta e mapeamento comando <-> slot', () => {
    expect(limitarLarguraCaneta('c1', 50)).toBe(LARGURA_CANETA.max)
    expect(limitarLarguraCaneta('mt', 1)).toBe(LARGURA_MARCA_TEXTO.min)
    expect(limitarLarguraCaneta('c1', NaN)).toBe(PADRAO_PREFS.canetas.c1.largura)
    expect(slotDoComando('desenho.caneta.3')).toBe('c3')
    expect(slotDoComando('desenho.marca_texto')).toBe('mt')
    expect(slotDoComando('desenho.caneta.4')).toBeNull()
    expect(slotDoComando('desenho.caneta.1.largura')).toBeNull()
    expect(idDoSlot('c2')).toBe('desenho.caneta.2')
  })
  it('regra do leitor: caneta e mouse desenham; dedo só com toque ligado', () => {
    expect(tipoDesenha('pen', false)).toBe(true)
    expect(tipoDesenha('mouse', false)).toBe(true)
    expect(tipoDesenha('touch', false)).toBe(false)
    expect(tipoDesenha('touch', true)).toBe(true)
  })
})
