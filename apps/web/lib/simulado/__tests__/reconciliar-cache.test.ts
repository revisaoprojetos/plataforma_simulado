import { describe, it, expect, vi } from 'vitest'

vi.mock('../matricular-banco', () => ({ matricularEmSimuladosDoBanco: vi.fn(async () => 0) }))

import { reconciliarGruposBancos } from '../reconciliar-grupos-bancos'

function fakeSvc(counts: Record<string, number>) {
  const dados: Record<string, any[]> = {
    simulado_pasta_grupos: [
      { tenant_id: 't', pasta_id: 'p1', grupo_id: 'g1' },
      { tenant_id: 't', pasta_id: 'p2', grupo_id: 'g1' },
    ],
    simulado_grupo_membros: [{ estudante_id: 'a' }, { estudante_id: 'b' }],
    simulado_pasta_estudantes: [{ estudante_id: 'a' }],
  }
  return {
    from(t: string) {
      counts[t] = (counts[t] ?? 0) + 1
      const q: any = { select: () => q, eq: () => q, order: () => q, insert: async () => ({ error: null }),
        range: async () => ({ data: dados[t] ?? [], error: null }), then: undefined }
      return q
    },
  }
}

describe('reconciliarGruposBancos cache por rodada', () => {
  it('lê membros do grupo 1x mesmo com 2 bancos e a pasta 1x cada', async () => {
    const counts: Record<string, number> = {}
    const r = await reconciliarGruposBancos(fakeSvc(counts))
    expect(counts.simulado_grupo_membros).toBe(1)
    expect(counts.simulado_pasta_estudantes).toBeGreaterThanOrEqual(2) // 1 leitura por pasta + inserts
    expect(r.pastaInseridos).toBe(2) // 'b' faltando em cada pasta
  })
})
