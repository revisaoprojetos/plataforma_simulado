import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/cache/relatorio-cache', () => ({ remember: async (_k: string, _t: number, f: () => unknown) => f() }))
vi.mock('@/lib/storage/json', () => ({ lerJsonStorage: async () => null, gravarJsonStorage: async () => {} }))

import { segmentarLei, CHARS_META } from '@/lib/cronograma/adaptativo/lp-catalogo'
import type { TrechoParte } from './partes'
import { validarPartes } from './partes'
import {
  CHARS_META_PARTES, partesLegProcAuto, partesLegProcModelo, partesDasMetas, parsearFaixaModelo, parsearRefArtigo,
} from './partes-das-metas'

const tr = (uid: string, tipo: string, rotulo: string | null, texto: string): TrechoParte => ({ uid, tipo, rotulo, texto })

/** Documento sintético: preâmbulo + títulos + N artigos com §/incisos de tamanhos variados (determinístico). */
function lei(nArt: number, opc: { preambulo?: boolean; sufixo?: boolean } = {}): TrechoParte[] {
  const out: TrechoParte[] = []
  let u = 0, seed = 7
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed }
  if (opc.preambulo) out.push(tr(`u${u++}`, 'paragrafo', null, 'Dispõe sobre a matéria. '.repeat(40)))
  for (let a = 1; a <= nArt; a++) {
    if (a % 17 === 1) out.push(tr(`u${u++}`, 'titulo', null, `TÍTULO ${a}`))
    out.push(tr(`u${u++}`, 'artigo', `Art. ${a}º`, `Art. ${a}º ${'Texto do artigo. '.repeat(10 + (rnd() % 400))}`))
    for (let p = 0; p < (rnd() % 4); p++) out.push(tr(`u${u++}`, 'paragrafo', `§ ${p + 1}º`, `§ ${p + 1}º ${'Paragrafo. '.repeat(5 + (rnd() % 60))}`))
    if (opc.sufixo && a === 3) out.push(tr(`u${u++}`, 'artigo', 'Art. 3º-A', `Art. 3º-A ${'Inserido. '.repeat(30)}`))
  }
  return out
}

/** Cliente Supabase falso que só serve a `trechosDaVersao` de lp-catalogo. */
function svcFalso(trechos: TrechoParte[]) {
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain,
    range: async (a: number, b: number) => ({ data: trechos.slice(a, b + 1).map((t) => ({ tipo: t.tipo, rotulo: t.rotulo, texto: t.texto })), error: null }),
  }
  return { from: () => chain } as never
}

describe('equivalência com segmentarLei (corte automático)', () => {
  it('usa a mesma calibragem do original', () => { expect(CHARS_META_PARTES).toBe(CHARS_META) })

  const casos: Array<[string, TrechoParte[]]> = [
    ['lei curta (1 meta)', lei(3)],
    ['lei média', lei(40)],
    ['lei grande com preâmbulo', lei(260, { preambulo: true })],
    ['artigo com sufixo -A', lei(30, { sufixo: true })],
    ['sem artigos', [tr('a', 'paragrafo', null, 'x'.repeat(30000)), tr('b', 'paragrafo', null, 'y'.repeat(5000))]],
    ['só preâmbulo antes do 1º artigo', [tr('p', 'paragrafo', null, 'p'.repeat(100)), tr('a1', 'artigo', 'Art. 1º', 'Art. 1º ' + 'z'.repeat(20000)), tr('a2', 'artigo', 'Art. 2º', 'Art. 2º ' + 'w'.repeat(20000))]],
  ]
  for (const [nome, trechos] of casos) {
    it(`mesmas faixas — ${nome}`, async () => {
      const original = await segmentarLei(svcFalso(trechos), { id: 'abcdef12-0000-0000-0000-000000000000', titulo: 'Lei 1/2000', disc: 'X', versaoId: 'v' })
      const faixasOriginal = original.map((i) => i.texto.split(' — ').slice(1).join(' — '))
      const mine = partesLegProcAuto(trechos)
      expect(mine.partes.map((p) => p.metaTexto)).toEqual(faixasOriginal)
      // contíguo, sem sobreposição e cobrindo o documento inteiro
      let prox = 0
      for (const p of mine.partes) { expect(p.indices[0]).toBe(prox); prox = p.indices[1] + 1 }
      expect(prox).toBe(trechos.length)
      expect(validarPartes(mine.partes.map((p) => ({ nome: p.nome, ini: p.indices[0], fim: p.indices[1] }))).ok).toBe(true)
    })
  }

  it('doc sem texto → meta única de "leitura" (sem faixa) e sem partes', async () => {
    const original = await segmentarLei(svcFalso([]), { id: 'abcdef12-0000-0000-0000-000000000000', titulo: 'Lei 2/2001', disc: 'X', versaoId: 'v' })
    expect(original).toHaveLength(1)
    const r = partesLegProcAuto([])
    expect(r.partes).toHaveLength(0)
    expect(r.avisos.map((a) => a.codigo)).toContain('sem_trechos')
  })

  it('o tamanho de cada parte respeita a cota (nunca corta um artigo ao meio)', () => {
    const r = partesLegProcAuto(lei(200))
    for (const p of r.partes.slice(0, -1)) expect(p.medida.caracteres).toBeGreaterThanOrEqual(CHARS_META * 0.6)
    for (const p of r.partes) expect(p.rotuloIni).toMatch(/^Art\./)
  })
})

describe('faixas do modelo 2.8', () => {
  it('interpreta os formatos do catálogo', () => {
    const f = (t: string) => parsearFaixaModelo(t)
    expect(f('Art. 1º ao art. 6º, XXIII')![0]).toMatchObject({ de: { artigo: '1º' }, ate: { artigo: '6º', detalhe: 'XXIII' } })
    expect(f('Art. 6º, XXIV ao art. 7º')![0]).toMatchObject({ de: { artigo: '6º', detalhe: 'XXIV' }, ate: { artigo: '7º' } })
    expect(f('Art. 40 até o final')![0]).toMatchObject({ de: { artigo: '40' }, ate: 'final' })
    expect(f('Preâmbulo ao art. 5º, IV')![0]).toMatchObject({ de: 'preambulo', ate: { artigo: '5º', detalhe: 'IV' } })
    expect(f('Art. 12')![0]).toMatchObject({ de: { artigo: '12' }, ate: { artigo: '12' } })
    expect(f('Art. 3º; art. 7º ao art. 9º')).toHaveLength(2)
    expect(f('Art. 1º ao art.5º')![0].ate).toMatchObject({ artigo: '5º' })
    expect(f('Art. 2.000 ao art. 2.010')![0]).toMatchObject({ de: { artigo: '2.000' } })
    expect(f('Art. 6º, § 2 ao art. 8º')![0]).toMatchObject({ de: { artigo: '6º', detalhe: '§ 2' } })
    expect(f('Leitura completa')![0]).toMatchObject({ de: 'doc' })
    expect(f('blablabla')).toBeNull()
    expect(parsearRefArtigo('Art. 7º-A')!.rotuloNorm).toBe('art 7-a')
  })

  const trechos = lei(30)
  it('ancora por rótulo de artigo e cobre contíguo', () => {
    const r = partesLegProcModelo(trechos, ['Art. 1º ao art. 10', 'Art. 11 ao art. 20', 'Art. 21 até o final'])
    expect(r.partes.map((p) => p.nome)).toEqual(['Art. 1º ao art. 10', 'Art. 11 ao art. 20', 'Art. 21 até o final'])
    expect(r.partes[0].rotuloIni).toBe('Art. 1º')
    expect(r.partes[0].rotuloFim).toBe('Art. 10º')
    expect(r.partes[2].indices[1]).toBe(trechos.length - 1)
    expect(r.partes[1].indices[0]).toBe(r.partes[0].indices[1] + 1)
    expect(r.avisos).toHaveLength(0)
  })

  it('corte dentro de artigo: artigo fica com a anterior + aviso; meta totalmente dentro do artigo é fundida', () => {
    const r = partesLegProcModelo(trechos, ['Art. 1º ao art. 6º, XXIII', 'Art. 6º, XXIV ao art. 7º', 'Art. 8º ao art. 8º, IV', 'Art. 8º, V ao art. 8º, IX'])
    expect(r.partes).toHaveLength(3)
    expect(r.partes[1].rotuloIni).toBe('Art. 7º')
    const cod = r.avisos.map((a) => a.codigo)
    expect(cod).toContain('corte_dentro_de_artigo')
    expect(cod).toContain('meta_fundida')
    expect(validarPartes(r.partes.map((p) => ({ nome: p.nome, ini: p.indices[0], fim: p.indices[1] }))).ok).toBe(true)
  })

  it('artigo inexistente, várias faixas, leitura completa e artigos sem meta', () => {
    const a = partesLegProcModelo(trechos, ['Art. 900 ao art. 910'])
    expect(a.partes).toHaveLength(0); expect(a.avisos[0].codigo).toBe('artigo_nao_encontrado')
    const b = partesLegProcModelo(trechos, ['Art. 3º; art. 7º ao art. 9º'])
    expect(b.partes.map((p) => p.nome)).toEqual(['Art. 3º (1/2)', 'art. 7º ao art. 9º (2/2)'])
    expect(b.partes).toHaveLength(2)
    expect(b.avisos.map((x) => x.codigo)).toEqual(expect.arrayContaining(['meta_com_varias_faixas', 'artigos_sem_meta']))
    const c = partesLegProcModelo(trechos, ['Leitura completa'])
    expect(c.partes[0].indices).toEqual([0, trechos.length - 1])
  })

  it('artigo com sufixo (3º-A) é distinto do 3º', () => {
    const t = lei(10, { sufixo: true })
    const r = partesLegProcModelo(t, ['Art. 1º ao art. 3º', 'Art. 3º-A ao art. 5º'])
    expect(r.partes).toHaveLength(2)
    expect(r.partes[1].rotuloIni).toBe('Art. 3º-A')
    expect(r.partes[0].rotuloFim).toBe('Art. 3º')
  })
})

describe('despacho por tipo', () => {
  const trechos = lei(5)
  it('PDFlash e PDFight não têm divisão nas metas', () => {
    for (const tipo of ['pdflash', 'pdfight'] as const) {
      const r = partesDasMetas({ tipo, trechos })
      expect(r.partes).toHaveLength(0); expect(r.fonte).toBe('nenhuma'); expect(r.avisos[0].codigo).toBe('sem_divisao_nas_metas')
    }
  })
  it('LegProc: modelo null → automático; [] → fora do modelo; lista → modelo', () => {
    expect(partesDasMetas({ tipo: 'legproc', trechos, textosModelo: null }).fonte).toBe('legproc_auto')
    expect(partesDasMetas({ tipo: 'legproc', trechos }).fonte).toBe('legproc_auto')
    const fora = partesDasMetas({ tipo: 'legproc', trechos, textosModelo: [] })
    expect(fora.partes).toHaveLength(0); expect(fora.avisos[0].codigo).toBe('legproc_fora_do_modelo')
    expect(partesDasMetas({ tipo: 'legproc', trechos, textosModelo: ['Art. 1º ao art. 5º'] }).fonte).toBe('legproc_modelo')
  })
})
