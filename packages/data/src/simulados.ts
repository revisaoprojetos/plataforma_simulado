import { sqlQuery } from './sql'

/**
 * Camada SQL do board de simulados (Fase 1/3, strangler). O tipo de cada simulado (objetiva /
 * discursiva / mista) é derivado das suas questões — no PostgREST isso vira um fan-out que traz
 * TODAS as prova_questoes de TODOS os simulados. Aqui é UMA query agregada (GROUP BY) que devolve
 * uma linha por simulado. Retorna `null` quando o SQL direto não está disponível (sem DATABASE_URL /
 * erro) → o chamador cai no caminho PostgREST. Toda query filtra tenant_id explicitamente.
 */

export type SimuladoTipoRow = { simulado_id: string; tem_obj: boolean; tem_dis: boolean }

/** Presença de questões objetivas/discursivas por simulado, em UMA query agregada. */
export async function simuladosTiposSql(simuladoIds: string[], tenantId: string): Promise<SimuladoTipoRow[] | null> {
  if (!simuladoIds.length) return []
  return sqlQuery<SimuladoTipoRow>(
    `SELECT pq.simulado_id,
            bool_or(q.tipo IS NOT NULL AND q.tipo <> 'discursiva') AS tem_obj,
            bool_or(q.tipo = 'discursiva')                        AS tem_dis
       FROM simulado_prova_questoes pq
       JOIN simulado_questoes q ON q.id = pq.questao_id
      WHERE pq.simulado_id = ANY($1) AND pq.tenant_id = $2
      GROUP BY pq.simulado_id`,
    [simuladoIds, tenantId],
  )
}

/**
 * Reordena a prova (`simulado_prova_questoes.ordem`) em UMA query, a partir da lista de `questao_id`
 * na nova ordem (0-based). Substitui os N updates do caminho PostgREST. Retorna o nº de linhas
 * afetadas, ou `null` quando o SQL direto não está disponível → o chamador cai no PostgREST.
 * Filtra `tenant_id` explicitamente (isolamento na aplicação).
 */
export async function reordenarProvaSql(tenantId: string, simuladoId: string, ordem: string[]): Promise<number | null> {
  if (!ordem.length) return 0
  const rows = await sqlQuery<{ id: string }>(
    `UPDATE simulado_prova_questoes p
        SET ordem = nova.ordem
       FROM (SELECT qid, (ord - 1)::int AS ordem
               FROM unnest($3::uuid[]) WITH ORDINALITY AS t(qid, ord)) AS nova
      WHERE p.tenant_id = $1 AND p.simulado_id = $2 AND p.questao_id = nova.qid
      RETURNING p.id`,
    [tenantId, simuladoId, ordem],
  )
  return rows === null ? null : rows.length
}
