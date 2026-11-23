import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { REGRAS_PADRAO, normalizarRegras } from '../regras'
import { METADADOS_MAPA, TIPOS_PARAMETRO, GRUPOS_MAPA, montarMapa } from '../mapa-motor'
import { SLUGS_META } from '../tipos-meta'

const RAIZ = path.resolve(__dirname, '../../../..') // apps/web

/** Caminhos folha normalizados de RegrasMotor (arrays de objetos → '.*'; porTipo → '*'; restricoes → 'restricoes'). */
function folhas(v: unknown, p: string, out: Set<string>) {
  if (p === 'versaoSchema') return
  if (p === 'restricoes') { out.add(p); return }
  if (p === 'prioridades.porTipo') { out.add('prioridades.porTipo.*'); return }
  if (Array.isArray(v)) {
    if (v.some((x) => x && typeof x === 'object')) v.forEach((x) => folhas(x, p + '.*', out))
    else out.add(p)
    return
  }
  if (v && typeof v === 'object') {
    const ks = Object.keys(v as object)
    if (!ks.length) { out.add(p); return }
    for (const k of ks) folhas((v as Record<string, unknown>)[k], p ? `${p}.${k}` : k, out)
    return
  }
  out.add(p)
}

describe('mapa do motor: cobertura de metadados', () => {
  const esperadas = new Set<string>()
  folhas(REGRAS_PADRAO, '', esperadas)

  it('todo campo folha de RegrasMotor tem entrada de metadados', () => {
    const faltando = [...esperadas].filter((p) => !METADADOS_MAPA[p])
    expect(faltando, `Campos sem metadados no mapa: ${faltando.join(', ')}`).toEqual([])
  })
  it('não há metadados órfãos (sem campo correspondente)', () => {
    const orfas = Object.keys(METADADOS_MAPA).filter((p) => !esperadas.has(p))
    expect(orfas).toEqual([])
  })
  it('cada entrada tem descrição, impacto, tipo, grupo, href e testes válidos', () => {
    for (const [k, m] of Object.entries(METADADOS_MAPA)) {
      expect(m.descricao.trim().length, k).toBeGreaterThan(10)
      expect(m.impacto.trim().length, k).toBeGreaterThan(5)
      expect(TIPOS_PARAMETRO, k).toContain(m.tipo)
      expect(GRUPOS_MAPA, k).toContain(m.grupo)
      expect(m.href.startsWith('/admin/cronogramas/adaptativo/'), k).toBe(true)
      expect(m.testes.length, k).toBeGreaterThan(0)
      if (m.camada != null) expect(m.camada >= 1 && m.camada <= 8, k).toBe(true)
      for (const t of m.testes) expect(existsSync(path.join(RAIZ, t)), `${k}: teste ${t}`).toBe(true)
    }
  })
  it('todo campo tem ao menos um ondeAplicado (exceto os só de dados)', () => {
    for (const [k, m] of Object.entries(METADADOS_MAPA)) {
      if (m.soDados) { expect(m.ondeAplicado.length, k).toBe(0); continue }
      expect(m.ondeAplicado.length, k).toBeGreaterThan(0)
    }
  })
  it('arquivo e função citados em ondeAplicado existem', () => {
    const cache = new Map<string, string>()
    for (const [k, m] of Object.entries(METADADOS_MAPA)) {
      for (const o of m.ondeAplicado) {
        const abs = path.join(RAIZ, o.arquivo)
        expect(existsSync(abs), `${k}: arquivo ${o.arquivo}`).toBe(true)
        if (!cache.has(abs)) cache.set(abs, readFileSync(abs, 'latin1'))
        expect(cache.get(abs)!.includes(o.funcao), `${k}: função ${o.funcao} em ${o.arquivo}`).toBe(true)
      }
    }
  })
})

describe('montarMapa', () => {
  it('com as regras padrão nenhuma linha difere do padrão', () => {
    const m = montarMapa(REGRAS_PADRAO)
    expect(m.length).toBeGreaterThan(80)
    expect(m.filter((e) => e.diferePadrao).map((e) => e.path)).toEqual([])
    expect(new Set(m.map((e) => e.path)).size).toBe(m.length) // caminhos únicos
    expect(m.filter((e) => e.path.startsWith('prioridades.porTipo.')).length).toBe(SLUGS_META.length)
    expect(m.filter((e) => e.path.startsWith('faixas.0.')).length).toBe(13)
  })
  it('constante alterada aparece como vigente e difere', () => {
    const r = normalizarRegras({ constantes: { blocoMin: 60 }, limitesDia: { questoes: 4 } })
    const m = montarMapa(r)
    const e = m.find((x) => x.path === 'constantes.blocoMin')!
    expect(e.valorPadrao).toBe('30'); expect(e.valorVigente).toBe('60'); expect(e.diferePadrao).toBe(true)
    expect(m.find((x) => x.path === 'limitesDia.questoes')!.diferePadrao).toBe(true)
    expect(m.filter((x) => x.diferePadrao).map((x) => x.path).sort()).toEqual(['constantes.blocoMin', 'limitesDia.questoes'])
  })
  it('faixas customizadas (3 faixas) são expandidas e comparadas por posição', () => {
    const r = normalizarRegras({ faixas: [
      { id: 'a', nome: 'Leve', maxMin: 600, tetoPdf: 2 },
      { id: 'b', nome: 'Média', maxMin: 1500, tetoPdf: 4, overrides: { limitesDia: { questoes: 3 } } },
      { id: 'c', nome: 'Pesada', maxMin: null, tetoPdf: 7 },
    ] })
    const m = montarMapa(r)
    expect(m.filter((x) => x.path.startsWith('faixas.')).length).toBe(3 * 13)
    const teto0 = m.find((x) => x.path === 'faixas.0.tetoPdf')!
    expect(teto0.valorVigente).toBe('2'); expect(teto0.valorPadrao).toBe('3'); expect(teto0.diferePadrao).toBe(true)
    expect(m.find((x) => x.path === 'faixas.1.overrides')!.valorVigente).toContain('limitesDia.questoes = 3')
    expect(m.find((x) => x.path === 'faixas.2.maxMin')!.valorVigente).toBe('sem limite')
    expect(m.find((x) => x.path === 'faixas.1.tetoPdf')!.diferePadrao).toBe(false)
  })
  it('restrições viram uma linha cada, com estado', () => {
    const r = normalizarRegras({ restricoes: [{ id: 'x1', tipo: 'max_por_dia', tipoA: 'pf', valor: 1, ativa: false, rotulo: 'Um PDFull por dia' }] })
    const m = montarMapa(r).filter((x) => x.path.startsWith('restricoes'))
    expect(m).toHaveLength(1)
    expect(m[0].valorVigente.startsWith('desligada')).toBe(true); expect(m[0].diferePadrao).toBe(true); expect(m[0].nome).toBe('Um PDFull por dia')
  })
})
