import { describe, expect, it, vi } from 'vitest'
import { agregarMatriz, chaveNome, comTimeout, lerParamsDocs } from './metas-pasta-matriz'
import { buscarJson } from './metas-pasta-fetch'

const U = '11111111-1111-4111-8111-111111111111'
const cfg = (nome: string, o: Record<string, unknown> = {}) => ({ nome, pdflash: true, pdfight: true, pdfull: true, juris: true, legproc: true, ativa: true, manual: false, aulas: 3, ...o })

describe('agregarMatriz', () => {
  const slugs = new Set(['pdfull', 'pdfight', 'pdflash', 'legproc', 'jurisclub', 'questoes'])
  const base = {
    disciplinas: [{ id: 'd1', nome: 'Direito Administrativo', classificacao: 'essencial' }],
    pastas: [
      { id: 'p1', nome: 'Direito Administrativo', paiId: null, disciplinaId: 'd1', tipoMaterial: null },
      { id: 'p2', nome: 'PDFull', paiId: 'p1', disciplinaId: null, tipoMaterial: 'pdfull' },
      { id: 'p3', nome: 'PDFight', paiId: 'p1', disciplinaId: null, tipoMaterial: 'pdfight' },
    ],
    slugs, docsDiretos: new Map([['p2', 31], ['p3', 2]]), planos: new Map([['p1', 4]]),
  }
  it('conta documentos por tipo efetivo, casa nome sem acento e soma planos', () => {
    const [l] = agregarMatriz({ ...base, cfg: [cfg('direito administrativo', { legproc: false })] })
    expect(l.docsPorTipo).toEqual({ pdfull: 31, pdfight: 2 })
    expect(l.docsTotal).toBe(33); expect(l.planosAtivos).toBe(4); expect(l.classe).toBe('essencial'); expect(l.pastas).toHaveLength(1)
  })
  it('divergência: flag ligada sem docs (pdflash/juris) e só com pasta vinculada e ativa', () => {
    const [l] = agregarMatriz({ ...base, cfg: [cfg('Direito Administrativo', { legproc: false })] })
    expect(l.divergencias.sort()).toEqual(['juris', 'pdflash'])
    const [s] = agregarMatriz({ ...base, cfg: [cfg('Penal')] })
    expect(s.pastas).toEqual([]); expect(s.divergencias).toEqual([])
    const [off] = agregarMatriz({ ...base, cfg: [cfg('Direito Administrativo', { ativa: false })] })
    expect(off.divergencias).toEqual([])
  })
  it('subpasta que é outra disciplina não entra na contagem', () => {
    const pastas = [...base.pastas, { id: 'p4', nome: 'Penal', paiId: 'p1', disciplinaId: 'd2', tipoMaterial: null }]
    const [l] = agregarMatriz({ ...base, pastas, disciplinas: [...base.disciplinas, { id: 'd2', nome: 'Penal', classificacao: null }], docsDiretos: new Map([['p2', 1], ['p4', 99]]), cfg: [cfg('Direito Administrativo')] })
    expect(l.docsTotal).toBe(1)
  })
})

describe('helpers', () => {
  it('chaveNome', () => expect(chaveNome('  Direito  Tributário ')).toBe('direito tributario'))
  it('lerParamsDocs valida uuid e saneia', () => {
    const g = (o: Record<string, string>) => (k: string) => o[k] ?? null
    expect(lerParamsDocs(g({ pasta: 'x' }))).toBeNull()
    expect(lerParamsDocs(g({ pasta: U, page: '-3', q: ' a ', sub: '1' }))).toEqual({ pastaId: U, page: 1, q: 'a', sub: true })
    expect(lerParamsDocs(g({ pasta: U, page: '4' }))?.page).toBe(4)
  })
  it('comTimeout rejeita quando não resolve', async () => {
    vi.useFakeTimers()
    const p = comTimeout(new Promise(() => {}), 1000, 'estourou'); const ex = expect(p).rejects.toThrow('estourou')
    await vi.advanceTimersByTimeAsync(1001); await ex; vi.useRealTimers()
  })
})

describe('buscarJson', () => {
  const resp = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
  it('ok / erro HTTP / ok:false', async () => {
    expect(await buscarJson('/x', { fetchImpl: resp(200, { ok: true, v: 1 }) })).toEqual({ ok: true, data: { ok: true, v: 1 } })
    expect(await buscarJson('/x', { fetchImpl: resp(504, { ok: false, error: 'lento' }) })).toEqual({ ok: false, error: 'lento' })
    expect((await buscarJson('/x', { fetchImpl: resp(500, 'x') })).ok).toBe(false)
  })
  it('timeout resolve com erro (nunca pendura)', async () => {
    const pendurado = ((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))))) as unknown as typeof fetch
    const r = await buscarJson('/x', { fetchImpl: pendurado, timeoutMs: 20 })
    expect(r.ok).toBe(false); expect(!r.ok && r.error).toMatch(/demorou/)
  })
  it('abortado pelo chamador', async () => {
    const c = new AbortController(); c.abort()
    expect(await buscarJson('/x', { signal: c.signal })).toMatchObject({ ok: false, abortado: true })
  })
})
