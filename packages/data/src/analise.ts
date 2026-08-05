import { sqlQuery } from './sql'

/**
 * Agregações SQL dos relatórios de Análise (ranking/simulado). Substituem o fan-out do PostgREST
 * (transferir dezenas de milhares de `respostas_objetivas` p/ agregar no JS) por UMA query que
 * agrega no banco e devolve só o resultado. `null` quando o SQL direto não está disponível → o
 * chamador cai no PostgREST. Toda query filtra tenant_id explicitamente.
 */

export type RankingLinhaSql = {
  estudante_id: string
  nome: string | null
  email: string | null
  classificacao: string | null
  data_nascimento: string | null
  nota: string | number | null
  iniciado_em: string | Date | null
  finalizado_em: string | Date | null
  total: string | number
  acertos: string | number
  por_disc: Record<string, number> | null
}

/**
 * Ranking agregado: 1 linha por aluno (a MELHOR sessão finalizada — maior nota), com acertos/total
 * e acertos por disciplina (para o mapa disciplina→grupo montado no app). Substitui os 3 fetch
 * pesados (sessões + respostas + estudantes) do ranking.
 */
export async function rankingAgregadoSql(simId: string, tenantId: string): Promise<RankingLinhaSql[] | null> {
  return sqlQuery<RankingLinhaSql>(
    `WITH best AS (
       SELECT DISTINCT ON (s.estudante_id) s.id, s.estudante_id, s.nota, s.iniciado_em, s.finalizado_em
         FROM simulado_sessoes_prova s
        WHERE s.simulado_id = $1 AND s.tenant_id = $2 AND s.is_teste = false AND s.deletado = false AND s.status = 'finalizada'
        ORDER BY s.estudante_id, s.nota DESC NULLS LAST, s.id
     ),
     resp AS (
       SELECT b.estudante_id, r.correta, COALESCE(d.nome, 'Sem disciplina') AS disc
         FROM simulado_respostas_objetivas r
         JOIN best b ON b.id = r.sessao_id
         LEFT JOIN simulado_questoes q ON q.id = r.questao_id
         LEFT JOIN simulado_disciplinas d ON d.id = q.disciplina_id
        WHERE r.tenant_id = $2
     ),
     tot AS (
       SELECT estudante_id, COUNT(*) AS total, COUNT(*) FILTER (WHERE correta) AS acertos
         FROM resp GROUP BY estudante_id
     ),
     disc AS (
       SELECT estudante_id, disc, COUNT(*) FILTER (WHERE correta) AS ac
         FROM resp GROUP BY estudante_id, disc
     )
     SELECT b.estudante_id, e.nome, e.email, e.classificacao, e.data_nascimento,
            b.nota, b.iniciado_em, b.finalizado_em,
            COALESCE(t.total, 0) AS total, COALESCE(t.acertos, 0) AS acertos,
            (SELECT json_object_agg(disc, ac) FROM disc WHERE disc.estudante_id = b.estudante_id) AS por_disc
       FROM best b
       JOIN simulado_estudantes e ON e.id = b.estudante_id
       LEFT JOIN tot t ON t.estudante_id = b.estudante_id`,
    [simId, tenantId],
  )
}

export type SimuladoSessaoAggSql = {
  id: string
  estudante_id: string
  status: string | null
  nota: string | number | null
  tentativa_num: number | null
  iniciado_em: string | Date | null
  finalizado_em: string | Date | null
  ac: string | number
  tt: string | number
}

/**
 * Sessões finalizadas do simulado JÁ com acertos/total agregados por sessão (ac/tt) — evita
 * transferir as respostas todas só p/ contar por sessão. As estatísticas por questão/alternativa
 * (que dependem da política de tentativa, decidida no app) são buscadas à parte pelas ids escolhidas.
 */
export async function simuladoSessoesAggSql(simId: string, tenantId: string): Promise<SimuladoSessaoAggSql[] | null> {
  return sqlQuery<SimuladoSessaoAggSql>(
    `SELECT s.id, s.estudante_id, s.status, s.nota, s.tentativa_num, s.iniciado_em, s.finalizado_em,
            COUNT(r.*) FILTER (WHERE r.correta) AS ac,
            COUNT(r.*) AS tt
       FROM simulado_sessoes_prova s
       LEFT JOIN simulado_respostas_objetivas r ON r.sessao_id = s.id
      WHERE s.simulado_id = $1 AND s.tenant_id = $2 AND s.is_teste = false AND s.deletado = false AND s.status = 'finalizada'
      GROUP BY s.id, s.estudante_id, s.status, s.nota, s.tentativa_num, s.iniciado_em, s.finalizado_em`,
    [simId, tenantId],
  )
}

export type SimuladoRespRepSql = {
  sessao_id: string
  questao_id: string
  alternativa_id: string | null
  correta: boolean | null
  snapshot_gabarito: any
  tempo_resposta_seg: number | null
}

/** Respostas apenas das sessões REPRESENTATIVAS (ids já escolhidas pela política) — em UMA query. */
export async function simuladoRespostasRepSql(sessaoIds: string[], tenantId: string): Promise<SimuladoRespRepSql[] | null> {
  if (!sessaoIds.length) return []
  return sqlQuery<SimuladoRespRepSql>(
    `SELECT sessao_id, questao_id, alternativa_id, correta, snapshot_gabarito, tempo_resposta_seg
       FROM simulado_respostas_objetivas
      WHERE tenant_id = $2 AND sessao_id = ANY($1::uuid[])`,
    [sessaoIds, tenantId],
  )
}
