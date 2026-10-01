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

export type ComparativoTurmaSqlRow = {
  participantes: number | string
  nota_media: number | string | null
  total_q: number | string
  tot_ac: number | string
  notas: number[] | string
  por_disc: { nome: string; ac: number; tt: number }[] | string
}

/**
 * Comparativo da TURMA de um simulado em UMA query agregada (melhor sessão por aluno + acerto por
 * disciplina + notas p/ percentil), em vez de carregar TODAS as respostas (ex.: Concurso Simulado AGU
 * = 51k respostas levavam ~18s via PostgREST → ~0,25s aqui). `foraIds` = questões anuladas por etiqueta
 * funcional (excluídas da comparação). Retorna 1 linha, ou `null` sem DATABASE_URL → cai no PostgREST.
 */
export async function comparativoTurmaSql(tenantId: string, simuladoId: string, foraIds: string[]): Promise<ComparativoTurmaSqlRow | null> {
  const rows = await sqlQuery<ComparativoTurmaSqlRow>(
    `WITH best AS (
       SELECT DISTINCT ON (estudante_id) id, nota
         FROM simulado_sessoes_prova
        WHERE tenant_id = $1 AND simulado_id = $2 AND is_teste = false AND deletado = false AND status = 'finalizada'
        ORDER BY estudante_id, nota DESC NULLS LAST, id
     ),
     validas AS (
       SELECT pq.questao_id, d.nome AS disciplina
         FROM simulado_prova_questoes pq
         JOIN simulado_questoes q ON q.id = pq.questao_id
         LEFT JOIN simulado_disciplinas d ON d.id = q.disciplina_id
        WHERE pq.simulado_id = $2 AND pq.anulada = false
          AND ($3::uuid[] IS NULL OR pq.questao_id <> ALL($3::uuid[]))
     ),
     resp AS (
       SELECT r.correta, COALESCE(v.disciplina, 'Sem disciplina') AS disciplina
         FROM best b
         JOIN simulado_respostas_objetivas r ON r.sessao_id = b.id
         JOIN validas v ON v.questao_id = r.questao_id
     ),
     pd AS (SELECT disciplina, count(*) tt, count(*) FILTER (WHERE correta) ac FROM resp GROUP BY disciplina)
     SELECT (SELECT count(*) FROM best) AS participantes,
            (SELECT round(avg(nota)::numeric, 1) FROM best WHERE nota IS NOT NULL) AS nota_media,
            (SELECT count(*) FROM validas) AS total_q,
            (SELECT count(*) FILTER (WHERE correta) FROM resp) AS tot_ac,
            (SELECT COALESCE(json_agg(nota), '[]'::json) FROM best WHERE nota IS NOT NULL) AS notas,
            (SELECT COALESCE(json_agg(json_build_object('nome', disciplina, 'ac', ac, 'tt', tt)), '[]'::json) FROM pd) AS por_disc`,
    [tenantId, simuladoId, foraIds.length ? foraIds : null],
  )
  return rows && rows.length ? rows[0] : null
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
