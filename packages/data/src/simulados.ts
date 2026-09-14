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
export type RelatorioRespostaAggRow = { questao_id: string; total: number | string; erros: number | string; acertos: number | string }

/**
 * Agrega as respostas objetivas do simulado POR QUESTÃO (total/erros/acertos) diretamente no banco —
 * substitui carregar dezenas de milhares de respostas e agregar em JS (o relatório de simulado popular
 * levava ~18s). Só sessões finalizadas, não-teste, do tenant. Retorna ~1 linha por questão, ou `null`
 * quando o SQL direto não está disponível → o chamador cai no PostgREST. Filtra tenant_id.
 */
export async function relatorioRespostasAggSql(tenantId: string, simuladoId: string): Promise<RelatorioRespostaAggRow[] | null> {
  return sqlQuery<RelatorioRespostaAggRow>(
    `SELECT ro.questao_id,
            count(*)::int AS total,
            count(*) FILTER (WHERE ro.correta = false)::int AS erros,
            count(*) FILTER (WHERE ro.correta = true)::int  AS acertos
       FROM simulado_respostas_objetivas ro
       JOIN simulado_sessoes_prova sp ON sp.id = ro.sessao_id
      WHERE sp.tenant_id = $1 AND sp.simulado_id = $2
        AND sp.is_teste = false AND sp.status = 'finalizada' AND sp.deletado = false
      GROUP BY ro.questao_id`,
    [tenantId, simuladoId],
  )
}

export type EstudanteLinkadoRow = {
  id: string
  nome: string | null
  email: string | null
  cpf: string | null
  telefone: string | null
  classificacao: string | null
  liberado: boolean | null
  sess_status: string | null
  sess_nota: number | string | null
}

/**
 * Estudantes matriculados num simulado + situação (melhor sessão) + nota, em UMA query com JOIN —
 * escala pelos MATRICULADOS do simulado (índice em matriculas), não pelos ~milhares de estudantes do
 * tenant (o caminho PostgREST antigo varria todos os alunos do tenant → lento). Filtra tenant_id.
 * Retorna `null` quando o SQL direto não está disponível → o chamador cai no PostgREST.
 */
export async function estudantesLinkadosSql(tenantId: string, simuladoId: string): Promise<EstudanteLinkadoRow[] | null> {
  return sqlQuery<EstudanteLinkadoRow>(
    `SELECT DISTINCT ON (e.id)
            e.id, e.nome, e.email, e.cpf, e.telefone, e.classificacao,
            m.liberado, s.status AS sess_status, s.nota AS sess_nota
       FROM simulado_matriculas m
       JOIN simulado_estudantes e
         ON e.id = m.estudante_id AND e.tenant_id = m.tenant_id AND e.deletado = false
       LEFT JOIN LATERAL (
         SELECT sp.status, sp.nota
           FROM simulado_sessoes_prova sp
          WHERE sp.simulado_id = m.simulado_id AND sp.estudante_id = m.estudante_id AND sp.deletado = false
          ORDER BY (sp.status = 'finalizada') DESC, sp.nota DESC NULLS LAST
          LIMIT 1
       ) s ON true
      WHERE m.tenant_id = $1 AND m.simulado_id = $2
      ORDER BY e.id`,
    [tenantId, simuladoId],
  )
}

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
