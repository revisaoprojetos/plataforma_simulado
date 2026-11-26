import { describe, it, expect, vi, beforeEach } from 'vitest'

// remember sem cache (executa sempre); esquecer no-op.
vi.mock('@/lib/cache/relatorio-cache', () => ({ remember: async (_k: string, _t: number, f: () => any) => f(), esquecer: async () => {} }))

import { carregarAtribuicoes } from '../atribuicoes'
import { acessoEfetivo } from '../acesso-efetivo'

type Row = Record<string, any>
// svc fake: tabelas em memória; builder encadeável com eq/in/order/range/then.
function fakeSvc(tabelas: Record<string, Row[]>, rpcIds: string[] | null) {
  const chamadas: { tabela: string; eqs: Record<string, any> }[] = []
  const from = (tabela: string) => {
    const eqs: Record<string, any> = {}; let inCol: string | null = null; let inVals: string[] = []; let from_ = 0, to = 999
    const b: any = {
      select: () => b, order: () => b,
      eq: (c: string, v: any) => { eqs[c] = v; return b },
      in: (c: string, v: string[]) => { inCol = c; inVals = v; return b },
      range: (f: number, t: number) => { from_ = f; to = t; return b },
      then: (res: any) => {
        chamadas.push({ tabela, eqs: { ...eqs, ...(inCol ? { [`in:${inCol}`]: inVals.length } : {}) } })
        let r = (tabelas[tabela] ?? []).filter((x) => Object.entries(eqs).every(([k, v]) => x[k] === v) && (!inCol || inVals.includes(x[inCol])))
        r = r.slice(from_, to + 1)
        return Promise.resolve({ data: r, error: null }).then(res)
      },
    }
    return b
  }
  const rpc = async () => (rpcIds ? { data: rpcIds, error: null } : { data: null, error: { message: 'function does not exist' } })
  return { svc: { from, rpc } as any, chamadas }
}

const T = 't1', EU = 'eu', OUTRO = 'outro'
const dados = {
  simulado_pasta_grupos: [] as Row[],
  simulado_pasta_estudantes: [
    { tenant_id: T, pasta_id: 'pA', estudante_id: OUTRO, origem: 'avulsa' },
    { tenant_id: T, pasta_id: 'pB', estudante_id: EU, origem: 'avulsa' },
    { tenant_id: T, pasta_id: 'pB', estudante_id: OUTRO, origem: 'avulsa' },
  ],
}
const ids = ['pA', 'pB', 'pC']
const aluno = { estudanteId: EU, grupos: [] as string[] }
const veredito = (m: Map<string, any[]>) => Object.fromEntries(ids.map((id) => [id, acessoEfetivo({ id, atribuicoes: m.get(id) ?? [], modo: 'propria' }, aluno).permitido]))

describe('carregarAtribuicoes — só as linhas do próprio aluno + sentinela', () => {
  beforeEach(() => vi.clearAllMocks())

  it('decide igual ao carregamento completo (legado) e nunca lê linhas de outros alunos', async () => {
    const { svc, chamadas } = fakeSvc(dados, ['pA', 'pB']) // RPC ativa
    const novo = await carregarAtribuicoes(svc, T, 'pasta', ids, EU)
    const { svc: svcOld } = fakeSvc(dados, null) // RPC ausente → legado
    const legado = await carregarAtribuicoes(svcOld, T, 'pasta', ids, EU)
    expect(veredito(novo)).toEqual(veredito(legado))
    expect(veredito(novo)).toEqual({ pA: false, pB: true, pC: true }) // pA restrita a outro; pB inclui o aluno; pC livre
    // query de estudantes do caminho novo filtra por estudante_id (não varre a tabela toda)
    const q = chamadas.filter((c) => c.tabela === 'simulado_pasta_estudantes')
    expect(q.length).toBe(1)
    expect(q[0].eqs.estudante_id).toBe(EU)
  })

  it('RPC ausente cai no legado sem lançar', async () => {
    const { svc } = fakeSvc(dados, null)
    const m = await carregarAtribuicoes(svc, T, 'pasta', ids, EU)
    expect(m.get('pA')?.length).toBe(1)
  })

  it('sem ids → vazio e nenhuma query', async () => {
    const { svc, chamadas } = fakeSvc(dados, [])
    expect((await carregarAtribuicoes(svc, T, 'pasta', [], EU)).size).toBe(0)
    expect(chamadas.length).toBe(0)
  })
})
