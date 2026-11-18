import { describe, it, expect, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/fetch-all', () => ({ fetchAll: async (f: any) => (await f()).data ?? [] }))
import { decidirAjuste, textoPresente } from '../reanchor-decisao'
import { ajustarAnotacoesAoTexto } from '../reanchor-db'

const ORIG = 'Art. 5º Todos são iguais perante a lei, sem distinção de qualquer natureza, garantindo-se aos brasileiros a inviolabilidade do direito à vida e à liberdade.'
const exact = 'Todos são iguais perante a lei, sem distinção de qualquer natureza, garantindo-se aos brasileiros'
const ini = ORIG.indexOf(exact)
const a = { inicio: ini, fim: ini + exact.length, exact, prefix: ORIG.slice(ini - 8, ini), suffix: ORIG.slice(ini + exact.length, ini + exact.length + 20) }

describe('decidirAjuste', () => {
  it('espinha diferente só em espaçamento/aspas/travessão/NBSP: mantém', () => {
    const S = '01 Art. 5º   “Todos”   são iguais perante a lei,\nsem distinção de qualquer natureza, garantindo-se aos brasileiros'
    const e2 = '"Todos" são iguais perante a lei, sem distinção de qualquer natureza, garantindo-se aos brasileiros'
    expect(decidirAjuste(S, { ...a, exact: e2 }).acao).toBe('manter')
    expect(textoPresente('a–b  c', 'a-b c')).toBe(true)
  })
  it('espaçamento removido por completo (tr/td colados): mantém', () => {
    expect(decidirAjuste(ORIG.replace(/ /g, ''), a).acao).toBe('manter')
  })
  it('intacto: mantém', () => { expect(decidirAjuste(ORIG, a).acao).toBe('manter') })
  it('apagou o início: ajusta (alta confiança)', () => {
    const d = decidirAjuste(ORIG.replace('Todos são iguais perante a lei, ', ''), a)
    expect(d.acao).toBe('ajustar')
    if (d.acao === 'ajustar') expect(d.trechos.map((t) => t.exact)).toEqual(['sem distinção de qualquer natureza, garantindo-se aos brasileiros'])
  })
  it('apagou o fim: ajusta', () => {
    expect(decidirAjuste(ORIG.replace(' garantindo-se aos brasileiros', ''), a).acao).toBe('ajustar')
  })
  it('apagou o miolo: ajusta contíguo', () => {
    const d = decidirAjuste(ORIG.replace(' sem distinção de qualquer natureza,', ''), a)
    expect(d.acao).toBe('ajustar')
  })
  it('inserção no meio: divide em dois pedaços grandes', () => {
    const S = ORIG.replace('perante a lei, sem', 'perante a lei, NOVO TRECHO LONGO INSERIDO PELO ADMIN AQUI AGORA sem')
    const d = decidirAjuste(S, a)
    expect(d.acao).toBe('ajustar')
    if (d.acao === 'ajustar') { expect(d.trechos.length).toBe(2); expect(d.trechos.map((t) => t.exact).join('|')).not.toContain('NOVO') }
  })
  it('baixa confiança (quase tudo apagado, restam poucas palavras): só revisar', () => {
    const S = 'Art. 5º Todos são iguais ... outra coisa totalmente diferente aqui'
    expect(decidirAjuste(S, a).acao).toBe('revisar')
  })
  it('tudo apagado: revisar', () => {
    expect(decidirAjuste(ORIG.replace(exact, ''), a).acao).toBe('revisar')
  })
  it('contexto incoerente: revisar', () => {
    const longo = 'x'.repeat(2000)
    const S = 'Outro assunto completamente: sem distinção de qualquer natureza, garantindo-se aos brasileiros ' + longo
    expect(decidirAjuste(S, { ...a, prefix: 'ZZZZZZZZZZ', suffix: 'QQQQQQQQQQ' }).acao).toBe('revisar')
  })
})

// Supabase fake mínimo
function fake(opts: { docPasta?: any; pastas?: Record<string, any>; rows: any[]; deletadoNoUpdate?: boolean; insertErro?: boolean }) {
  const log: any = { updates: [] as any[], inserts: [] as any[] }
  const builder = (tabela: string) => {
    const st: any = { tabela, op: 'select', filtros: {} as any, payload: null }
    const b: any = {
      select: (_c?: string) => { if (st.op === 'select') st.op = 'select'; st.sel = true; return b },
      update: (p: any) => { st.op = 'update'; st.payload = p; return b },
      insert: (p: any) => { st.op = 'insert'; st.payload = p; return b },
      eq: (k: string, v: any) => { st.filtros[k] = v; return b },
      in: (k: string, v: any) => { st.filtros[k] = v; return b },
      order: () => b,
      maybeSingle: async () => {
        if (tabela === 'simulado_documentos') return { data: opts.docPasta ?? { pasta_id: null }, error: null }
        if (tabela === 'simulado_pastas') return { data: opts.pastas?.[st.filtros.id] ?? null, error: null }
        return { data: null, error: null }
      },
      then: (res: any, rej: any) => Promise.resolve((() => {
        if (st.op === 'select') return { data: tabela === 'simulado_leitura_anotacoes' ? opts.rows : [], error: null }
        if (st.op === 'update') {
          log.updates.push({ tabela, payload: st.payload, filtros: st.filtros })
          return { data: opts.deletadoNoUpdate ? [] : [{ id: st.filtros.id }], error: null }
        }
        if (st.op === 'insert') {
          log.inserts.push({ tabela, payload: st.payload })
          return opts.insertErro ? { data: null, error: { message: 'boom' } } : { data: (st.payload as any[]).map((_, i) => ({ id: 'novo' + i })), error: null }
        }
        return { data: null, error: null }
      })()).then(res, rej),
    }
    return b
  }
  return { svc: { from: builder }, log }
}
const rowBase = { id: 'g1', inicio_char: a.inicio, fim_char: a.fim, exact, prefix: a.prefix, suffix: a.suffix, cor: 'amarelo', nota: null, origem: 'propria', base_id: null, deletado: false }

describe('ajustarAnotacoesAoTexto', () => {
  it('grifo intacto (qualquer forma): nenhuma escrita', async () => {
    const { svc, log } = fake({ rows: [rowBase] })
    const r = await ajustarAnotacoesAoTexto(svc, 't', 'd', 1, ORIG.replace(/ /g, '  '))
    expect(log.updates).toEqual([]); expect(log.inserts).toEqual([])
    expect(r).toMatchObject({ ajustados: 0, sumidos: 0, falhas: 0 })
  })
  it('juris: não mexe mesmo com texto mudado', async () => {
    const { svc, log } = fake({ rows: [rowBase], docPasta: { pasta_id: 'p1' }, pastas: { p1: { folder_area: 'jurisprudencia', pai_id: null } } })
    const r = await ajustarAnotacoesAoTexto(svc, 't', 'd', 1, ORIG.replace(exact, ''))
    expect(r.pulado).toBe('juris'); expect(log.updates).toEqual([])
  })
  it('juris por pasta ancestral', async () => {
    const { svc } = fake({ rows: [rowBase], docPasta: { pasta_id: 'p2' }, pastas: { p2: { folder_area: 'leitura', pai_id: 'p1' }, p1: { folder_area: 'jurisprudencia', pai_id: null } } })
    expect((await ajustarAnotacoesAoTexto(svc, 't', 'd', 1, 'x')).pulado).toBe('juris')
  })
  it('sumiu: só revisao_necessaria, com deletado=false, sem tocar posições', async () => {
    const { svc, log } = fake({ rows: [rowBase] })
    const r = await ajustarAnotacoesAoTexto(svc, 't', 'd', 1, ORIG.replace(exact, ''))
    expect(r.sumidos).toBe(1)
    expect(log.updates).toHaveLength(1)
    expect(log.updates[0].payload).toEqual({ revisao_necessaria: true })
    expect(log.updates[0].filtros.deletado).toBe(false)
  })
  it('mudança real de alta confiança: encurta com guarda deletado=false', async () => {
    const { svc, log } = fake({ rows: [rowBase] })
    const r = await ajustarAnotacoesAoTexto(svc, 't', 'd', 1, ORIG.replace('Todos são iguais perante a lei, ', ''))
    expect(r.ajustados).toBe(1)
    expect(log.updates[0].filtros.deletado).toBe(false)
    expect(log.updates[0].payload.exact).toBe('sem distinção de qualquer natureza, garantindo-se aos brasileiros')
  })
  it('divisão: extras inseridos e original ajustado', async () => {
    const { svc, log } = fake({ rows: [rowBase] })
    const S = ORIG.replace('perante a lei, sem', 'perante a lei, NOVO TRECHO LONGO INSERIDO PELO ADMIN AQUI AGORA sem')
    const r = await ajustarAnotacoesAoTexto(svc, 't', 'd', 1, S)
    expect(r.divididos).toBe(1)
    expect(log.inserts[0].payload[0].base_id).toBeNull()
  })
  it('apagado entre leitura e escrita: não ressuscita, desfaz extras (soft)', async () => {
    const { svc, log } = fake({ rows: [rowBase], deletadoNoUpdate: true })
    const S = ORIG.replace('perante a lei, sem', 'perante a lei, NOVO TRECHO LONGO INSERIDO PELO ADMIN AQUI AGORA sem')
    const r = await ajustarAnotacoesAoTexto(svc, 't', 'd', 1, S)
    expect(r.ajustados).toBe(0)
    const rb = log.updates.find((u: any) => u.payload.deletado === true)
    expect(rb).toBeTruthy()
  })
  it('erro no insert dos extras: conta falha e NÃO encurta o original', async () => {
    const { svc, log } = fake({ rows: [rowBase], insertErro: true })
    const S = ORIG.replace('perante a lei, sem', 'perante a lei, NOVO TRECHO LONGO INSERIDO PELO ADMIN AQUI AGORA sem')
    const r = await ajustarAnotacoesAoTexto(svc, 't', 'd', 1, S)
    expect(r.falhas).toBe(1); expect(log.updates).toEqual([])
  })
})
