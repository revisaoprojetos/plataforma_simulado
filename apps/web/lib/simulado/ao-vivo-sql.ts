import 'server-only'
import { sqlQuery } from '@/lib/data/sql'

/**
 * "Fazendo agora" por simulado AGREGADO NO BANCO (1 query) — substitui o caminho que puxava TODAS as
 * sessões não-finalizadas + TODAS as respostas + TODAS as matrículas pro app e cruzava em memória
 * (dezenas de milhares de linhas no board com muitos simulados → 11-21s). Aqui o Postgres conta os
 * alunos DISTINTOS "ativos agora" e devolve ~N linhas pequenas. `sqlQuery` cai em null se o SQL direto
 * não estiver disponível OU falhar → o chamador usa o caminho PostgREST (fallback = não quebra).
 *
 * Mesma semântica da versão em memória:
 *   online(simulado) = alunos DISTINTOS, MATRICULADOS, com sessão NÃO-finalizada (válida, sem testador/
 *   deletada) e "ativa agora" = iniciada dentro da janela OU com resposta dentro da janela.
 * Tenant SEMPRE explícito nas sessões (escopo); os EXISTS herdam o escopo via sessão/simulado.
 */
export async function onlinePorSimuladoSql(
  tenantId: string, simuladoIds: string[], cutoffIso: string,
): Promise<Record<string, number> | null> {
  const ids = [...new Set((simuladoIds ?? []).filter(Boolean))]
  if (!ids.length) return {}
  const rows = await sqlQuery<{ simulado_id: string; n: number }>(
    `SELECT s.simulado_id, count(DISTINCT s.estudante_id)::int AS n
       FROM simulado_sessoes_prova s
      WHERE s.tenant_id = $1
        AND s.simulado_id = ANY($2::uuid[])
        AND s.is_teste = false AND s.deletado = false AND s.status <> 'finalizada'
        AND s.estudante_id IS NOT NULL
        AND (
          s.iniciado_em >= $3
          OR EXISTS (SELECT 1 FROM simulado_respostas_objetivas r
                      WHERE r.sessao_id = s.id AND r.respondido_em >= $3)
        )
        AND EXISTS (SELECT 1 FROM simulado_matriculas m
                     WHERE m.simulado_id = s.simulado_id AND m.estudante_id = s.estudante_id)
      GROUP BY s.simulado_id`,
    [tenantId, ids, cutoffIso],
  )
  if (rows === null) return null
  const out: Record<string, number> = {}
  for (const r of rows) if (Number(r.n) > 0) out[r.simulado_id] = Number(r.n)
  return out
}
