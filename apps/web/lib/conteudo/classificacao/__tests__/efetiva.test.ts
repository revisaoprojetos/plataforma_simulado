import { describe, expect, it } from 'vitest'
import {
  classificacaoEfetivaDoc, tipoHerdadoDaPasta, traducaoBanco, traducaoCrua, traducaoMeta, type ArvorePastas,
} from '../efetiva'

// ORACULOS: a logica ANTIGA, copiada literalmente das copias de codigo que foram unificadas.
const TIPOS_MATERIAL = new Set(['pdfull', 'pdfight', 'pdflash', 'legproc', 'jurisclub', 'questoes'])
type Pastas = Array<{ id: string; pai_id: string | null; cronograma_tipo_material: string | null }>

/** conteudo-banco.ts (antes): tipoHerdado com memo + anti-ciclo, vocabulario -> gx -> compat. */
function oraculoBanco(pastas: Pastas, geraMeta: Set<string>, compatTipos: Map<string, string>) {
  const paiPorPasta = new Map<string, string | null>(); const tipoPorPasta = new Map<string, string | null>()
  for (const p of pastas) { paiPorPasta.set(p.id, p.pai_id); tipoPorPasta.set(p.id, p.cronograma_tipo_material) }
  const tipoCache = new Map<string, string | null>()
  return (pastaId: string): string | null => {
    const caminho: string[] = []
    let cur: string | null = pastaId
    let achado: string | null = null
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      if (tipoCache.has(cur)) { achado = tipoCache.get(cur)!; break }
      caminho.push(cur)
      const t = tipoPorPasta.get(cur)
      const tc = t ? (TIPOS_MATERIAL.has(t) ? t : geraMeta.has(t) ? `gx:${t}` : (compatTipos.get(t) ?? null)) : null
      if (tc) { achado = tc; break }
      cur = paiPorPasta.get(cur) ?? null
    }
    for (const c of caminho) tipoCache.set(c, achado)
    return achado
  }
}
/** conteudo-banco.ts (antes): destino do doc a partir do tipo herdado. */
function bucketBanco(tipo: string | null): string {
  if (tipo?.startsWith('gx:')) return tipo
  if (tipo === 'legproc') return 'legproc'
  if (tipo === 'pdfight' || tipo === 'pdflash' || tipo === 'jurisclub' || tipo === 'questoes') return 'material'
  return 'aula'
}

/** meta-extras-server.ts (antes): sem gx; vocabulario -> compat. */
function oraculoMeta(pastas: Pastas, compatTipos: Map<string, string>) {
  const pai = new Map(pastas.map((p) => [p.id, p.pai_id])); const tipo = new Map(pastas.map((p) => [p.id, p.cronograma_tipo_material]))
  const cache = new Map<string, string | null>()
  return (id: string): string | null => {
    const caminho: string[] = []
    let cur: string | null = id, achado: string | null = null
    const visto = new Set<string>()
    while (cur && !visto.has(cur)) {
      visto.add(cur)
      if (cache.has(cur)) { achado = cache.get(cur)!; break }
      caminho.push(cur)
      const t = tipo.get(cur)
      const tc = t ? (TIPOS_MATERIAL.has(t) ? t : (compatTipos.get(t) ?? null)) : null
      if (tc) { achado = tc; break }
      cur = pai.get(cur) ?? null
    }
    for (const c of caminho) cache.set(c, achado)
    return achado
  }
}

/** revisao/cronograma.ts > materiaisApoio (antes): slug cru da pasta mais proxima. */
function oraculoCru(pastas: Pastas) {
  const pai = new Map(pastas.map((p) => [p.id, p.pai_id])), tipo = new Map(pastas.map((p) => [p.id, p.cronograma_tipo_material]))
  return (id: string): string | null => { const seen = new Set<string>(); let c: string | null = id; while (c && !seen.has(c)) { seen.add(c); const t = tipo.get(c); if (t) return t; c = pai.get(c) ?? null } return null }
}

// NOVO
function arvore(pastas: Pastas): ArvorePastas {
  return { pai: new Map(pastas.map((p) => [p.id, p.pai_id])), slug: new Map(pastas.map((p) => [p.id, p.cronograma_tipo_material])) }
}
function novoBanco(pastas: Pastas, geraMeta: Set<string>, compat: Map<string, string>) {
  const a = arvore(pastas); const tr = traducaoBanco({ geraMeta, compat }); const cache = new Map<string, string | null>()
  return (pastaId: string) => classificacaoEfetivaDoc({ docClassId: null, slugPorId: new Map(), traduzir: tr, pastaSlugHerdado: tipoHerdadoDaPasta(pastaId, a, tr, cache), fallbackLegado: 'pdfull' })
}

// Fixture: heranca multi-nivel, override no meio, personalizado com/sem geraMeta, sem tipo, jurisclub, pasta sem disciplina, ciclo
const FIX: Pastas = [
  { id: 'disc', pai_id: null, cronograma_tipo_material: null },
  { id: 'aulas', pai_id: 'disc', cronograma_tipo_material: 'pdfull' },
  { id: 'aulas-1', pai_id: 'aulas', cronograma_tipo_material: null },
  { id: 'aulas-1-1', pai_id: 'aulas-1', cronograma_tipo_material: null },
  { id: 'flash', pai_id: 'disc', cronograma_tipo_material: 'pdflash' },
  { id: 'flash-x', pai_id: 'flash', cronograma_tipo_material: 'legproc' },
  { id: 'flash-x-y', pai_id: 'flash-x', cronograma_tipo_material: null },
  { id: 'lei', pai_id: 'disc', cronograma_tipo_material: 'legproc' },
  { id: 'cust-gx', pai_id: 'disc', cronograma_tipo_material: 'meu-gx' },
  { id: 'cust-gx-sub', pai_id: 'cust-gx', cronograma_tipo_material: null },
  { id: 'cust-apoio', pai_id: 'disc', cronograma_tipo_material: 'meu-apoio' },
  { id: 'cust-orfao', pai_id: 'disc', cronograma_tipo_material: 'sem-papel' },
  { id: 'cust-orfao-sub', pai_id: 'cust-orfao', cronograma_tipo_material: null },
  { id: 'juris', pai_id: 'disc', cronograma_tipo_material: 'jurisclub' },
  { id: 'q', pai_id: 'disc', cronograma_tipo_material: 'questoes' },
  { id: 'notipo', pai_id: 'disc', cronograma_tipo_material: null },
  { id: 'notipo-sub', pai_id: 'notipo', cronograma_tipo_material: null },
  { id: 'raiz-sem-disc', pai_id: null, cronograma_tipo_material: null },
  { id: 'vazio', pai_id: null, cronograma_tipo_material: '' },
  { id: 'cic-a', pai_id: 'cic-b', cronograma_tipo_material: null },
  { id: 'cic-b', pai_id: 'cic-a', cronograma_tipo_material: null },
  { id: 'pai-fantasma', pai_id: 'nao-existe', cronograma_tipo_material: null },
]
const GERA = new Set(['meu-gx']); const COMPAT = new Map([['meu-apoio', 'pdfight']])

describe('classificacaoEfetivaDoc - EQUIVALENCIA com o codigo antigo (classificacao_id NULL)', () => {
  it('Adaptativo (conteudo-banco): tipo herdado + destino do doc, todas as pastas', () => {
    const ant = oraculoBanco(FIX, GERA, COMPAT); const nov = novoBanco(FIX, GERA, COMPAT)
    for (const p of FIX) {
      const a = ant(p.id)
      const n = nov(p.id)
      expect(n.tipo, p.id).toBe(a ?? 'pdfull')
      expect(bucketBanco(n.tipo), p.id).toBe(bucketBanco(a))
    }
  })
  it('Adaptativo: sem geraMeta e sem compat (slug personalizado vira sem tipo)', () => {
    const ant = oraculoBanco(FIX, new Set(), new Map()); const nov = novoBanco(FIX, new Set(), new Map())
    for (const p of FIX) expect(nov(p.id).tipo, p.id).toBe(ant(p.id) ?? 'pdfull')
  })
  it('Conteudo por meta (meta-extras): sem gx, null permanece null', () => {
    const ant = oraculoMeta(FIX, COMPAT); const a = arvore(FIX); const tr = traducaoMeta({ compat: COMPAT }); const cache = new Map<string, string | null>()
    for (const p of FIX) {
      const n = classificacaoEfetivaDoc({ docClassId: null, slugPorId: new Map(), traduzir: tr, pastaSlugHerdado: tipoHerdadoDaPasta(p.id, a, tr, cache) }).tipo
      expect(n, p.id).toBe(ant(p.id))
    }
  })
  it('Materiais de apoio (revisao/cronograma): slug cru', () => {
    const ant = oraculoCru(FIX); const a = arvore(FIX); const cache = new Map<string, string | null>()
    for (const p of FIX) {
      const n = classificacaoEfetivaDoc({ docClassId: null, slugPorId: null, traduzir: traducaoCrua, pastaSlugHerdado: tipoHerdadoDaPasta(p.id, a, traducaoCrua, cache) }).tipo
      expect(n, p.id).toBe(ant(p.id))
    }
  })
  it('arvores aleatorias (seed fixa), com ciclos e pais ausentes: os 3 modos batem com os oraculos', () => {
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const slugs = [null, null, null, '', 'pdfull', 'pdfight', 'pdflash', 'legproc', 'jurisclub', 'questoes', 'meu-gx', 'meu-apoio', 'orfao']
    for (let r = 0; r < 200; r++) {
      const n = 3 + Math.floor(rnd() * 25)
      const pastas: Pastas = Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        pai_id: rnd() < 0.15 ? null : rnd() < 0.05 ? 'fantasma' : `p${Math.floor(rnd() * n)}`,
        cronograma_tipo_material: slugs[Math.floor(rnd() * slugs.length)] as string | null,
      }))
      const ab = oraculoBanco(pastas, GERA, COMPAT), am = oraculoMeta(pastas, COMPAT), ac = oraculoCru(pastas)
      const a = arvore(pastas)
      const trB = traducaoBanco({ geraMeta: GERA, compat: COMPAT }), trM = traducaoMeta({ compat: COMPAT })
      const cB = new Map<string, string | null>(), cM = new Map<string, string | null>(), cC = new Map<string, string | null>()
      for (const p of pastas) {
        expect(tipoHerdadoDaPasta(p.id, a, trB, cB), `banco ${r}/${p.id}`).toBe(ab(p.id))
        expect(tipoHerdadoDaPasta(p.id, a, trM, cM), `meta ${r}/${p.id}`).toBe(am(p.id))
        expect(tipoHerdadoDaPasta(p.id, a, traducaoCrua, cC), `cru ${r}/${p.id}`).toBe(ac(p.id))
      }
    }
  })
})

describe('classificacaoEfetivaDoc - classificacao do DOCUMENTO vence a pasta', () => {
  const slugPorId = new Map([['c-flash', 'pdflash'], ['c-gx', 'meu-gx'], ['c-apoio', 'meu-apoio'], ['c-orfa', 'sem-papel']])
  const tr = traducaoBanco({ geraMeta: GERA, compat: COMPAT })
  it('doc pdflash numa pasta legproc -> pdflash (origem documento)', () => {
    expect(classificacaoEfetivaDoc({ docClassId: 'c-flash', slugPorId, traduzir: tr, pastaSlugHerdado: 'legproc', fallbackLegado: 'pdfull' })).toEqual({ tipo: 'pdflash', origem: 'documento' })
  })
  it('doc personalizado geraMeta -> gx:slug; com papel -> compat', () => {
    expect(classificacaoEfetivaDoc({ docClassId: 'c-gx', slugPorId, traduzir: tr, pastaSlugHerdado: 'pdfull' }).tipo).toBe('gx:meu-gx')
    expect(classificacaoEfetivaDoc({ docClassId: 'c-apoio', slugPorId, traduzir: tr, pastaSlugHerdado: 'pdfull' }).tipo).toBe('pdfight')
  })
  it('classificacao nao traduzivel ou fora do catalogo -> ignora e usa a pasta (como antes)', () => {
    expect(classificacaoEfetivaDoc({ docClassId: 'c-orfa', slugPorId, traduzir: tr, pastaSlugHerdado: 'legproc' })).toEqual({ tipo: 'legproc', origem: 'pasta' })
    expect(classificacaoEfetivaDoc({ docClassId: 'zzz', slugPorId, traduzir: tr, pastaSlugHerdado: 'legproc' }).origem).toBe('pasta')
  })
  it('sem nada: fallback legado ou null', () => {
    expect(classificacaoEfetivaDoc({ traduzir: tr, pastaSlugHerdado: null, fallbackLegado: 'pdfull' })).toEqual({ tipo: 'pdfull', origem: 'legado' })
    expect(classificacaoEfetivaDoc({ traduzir: tr, pastaSlugHerdado: null })).toEqual({ tipo: null, origem: 'nenhuma' })
  })
})
