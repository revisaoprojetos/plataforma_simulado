import { sqlQuery } from './sql'

/**
 * Engajamento do Desafio de Lei Seca × ASSINATURA (pagamento recorrente Guru). Cruza, no banco, a base
 * de assinaturas ativas com a atividade na Leitura (todas as pastas folder_area='leitura' do tenant).
 * Tudo agregado/paginado no SQL (regra "área nova nasce otimizada"). `null` → SQL indisponível
 * (o chamador degrada). Toda query filtra tenant_id.
 */

export type EngajamentoKpisSql = {
  recorrente_total: string | number
  desafio_ativos: string | number
  recorrente_ativo: string | number
  recorrente_sem_atividade: string | number
  ativo_sem_recorrente: string | number
  base_total: string | number
}

/** KPIs (contagens) do cruzamento assinatura × atividade. 1 linha. */
export async function engajamentoAssinaturaKpisSql(tenantId: string): Promise<EngajamentoKpisSql | null> {
  const rows = await sqlQuery<EngajamentoKpisSql>(
    `WITH ldocs AS (
       SELECT d.id FROM simulado_documentos d JOIN simulado_pastas p ON p.id = d.pasta_id
        WHERE d.tenant_id = $1 AND p.folder_area = 'leitura'
     ),
     recorr AS (
       SELECT DISTINCT a.estudante_id FROM simulado_assinaturas a
         JOIN simulado_estudantes e ON e.id = a.estudante_id AND e.deletado = false
        WHERE a.tenant_id = $1 AND a.status = 'ativo'
     ),
     ativ AS (
       SELECT DISTINCT estudante_id FROM (
         SELECT estudante_id FROM simulado_leitura_progresso WHERE documento_id IN (SELECT id FROM ldocs) AND concluido_em IS NOT NULL
         UNION
         SELECT estudante_id FROM simulado_leitura_respostas WHERE documento_id IN (SELECT id FROM ldocs) AND respondido_em IS NOT NULL
       ) u
       WHERE EXISTS (SELECT 1 FROM simulado_estudantes e WHERE e.id = u.estudante_id AND e.deletado = false)
     )
     SELECT
       (SELECT count(*) FROM recorr) AS recorrente_total,
       (SELECT count(*) FROM ativ)   AS desafio_ativos,
       (SELECT count(*) FROM recorr r WHERE     EXISTS (SELECT 1 FROM ativ a WHERE a.estudante_id = r.estudante_id)) AS recorrente_ativo,
       (SELECT count(*) FROM recorr r WHERE NOT EXISTS (SELECT 1 FROM ativ a WHERE a.estudante_id = r.estudante_id)) AS recorrente_sem_atividade,
       (SELECT count(*) FROM ativ  a WHERE NOT EXISTS (SELECT 1 FROM recorr r WHERE r.estudante_id = a.estudante_id)) AS ativo_sem_recorrente,
       (SELECT count(*) FROM simulado_estudantes e WHERE e.tenant_id = $1 AND e.deletado = false) AS base_total`,
    [tenantId],
  )
  return rows && rows.length ? rows[0] : null
}

export type EngajamentoLinhaSql = {
  id: string
  nome: string | null
  email: string | null
  classificacao: string | null
  recorrente: boolean
  fez: boolean
  aulas: string | number
  ultima_atividade: string | Date | null
  total_rows: string | number
}

// Ordenação por coluna — whitelist (evita SQL injection; a coluna NUNCA vem crua do usuário).
const SORT_COLS: Record<string, string> = {
  nome: 'e.nome', recorrente: 'recorrente', fez: 'fez', aulas: 'aulas', ultima: 'a.ult',
}

/**
 * Lista paginada de alunos com: pagamento recorrente (sim/não), fez o Desafio (sim/não), nº de aulas
 * com leitura concluída e última atividade. Filtros + ORDENAÇÃO + paginação no banco. `total_rows`
 * (window) = total com filtro. pag: 'recorrente'|'nao'|''. eng: 'fez'|'naofez'|''. busca: nome/email.
 */
export async function engajamentoAssinaturaListaSql(
  tenantId: string, pag: string, eng: string, busca: string, limit: number, offset: number,
  sortCol = 'ultima', sortDir: 'asc' | 'desc' = 'desc',
): Promise<EngajamentoLinhaSql[] | null> {
  const col = SORT_COLS[sortCol] ?? 'a.ult'
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC'
  const orderBy = `ORDER BY ${col} ${dir} NULLS LAST, e.nome ASC`
  return sqlQuery<EngajamentoLinhaSql>(
    `WITH ldocs AS (
       SELECT d.id FROM simulado_documentos d JOIN simulado_pastas p ON p.id = d.pasta_id
        WHERE d.tenant_id = $1 AND p.folder_area = 'leitura'
     ),
     recorr AS (
       SELECT DISTINCT estudante_id FROM simulado_assinaturas WHERE tenant_id = $1 AND status = 'ativo'
     ),
     ativ AS (
       SELECT estudante_id,
              MAX(dia) AS ult,
              COUNT(DISTINCT CASE WHEN src = 'prog' THEN doc END) AS aulas
       FROM (
         SELECT estudante_id, documento_id AS doc, concluido_em AS dia, 'prog' AS src
           FROM simulado_leitura_progresso WHERE documento_id IN (SELECT id FROM ldocs) AND concluido_em IS NOT NULL
         UNION ALL
         SELECT estudante_id, NULL AS doc, respondido_em AS dia, 'resp' AS src
           FROM simulado_leitura_respostas WHERE documento_id IN (SELECT id FROM ldocs) AND respondido_em IS NOT NULL
       ) u GROUP BY estudante_id
     )
     SELECT e.id, e.nome, e.email, e.classificacao,
            (r.estudante_id IS NOT NULL) AS recorrente,
            (a.estudante_id IS NOT NULL) AS fez,
            COALESCE(a.aulas, 0) AS aulas,
            a.ult AS ultima_atividade,
            COUNT(*) OVER() AS total_rows
       FROM simulado_estudantes e
       LEFT JOIN recorr r ON r.estudante_id = e.id
       LEFT JOIN ativ   a ON a.estudante_id = e.id
      WHERE e.tenant_id = $1 AND e.deletado = false
        AND ($2 = '' OR ($2 = 'recorrente' AND r.estudante_id IS NOT NULL) OR ($2 = 'nao' AND r.estudante_id IS NULL))
        AND ($3 = '' OR ($3 = 'fez' AND a.estudante_id IS NOT NULL) OR ($3 = 'naofez' AND a.estudante_id IS NULL))
        AND ($4 = '' OR e.nome ILIKE '%' || $4 || '%' OR e.email ILIKE '%' || $4 || '%')
      ${orderBy}
      LIMIT $5 OFFSET $6`,
    [tenantId, pag, eng, busca, limit, offset],
  )
}

export type EngajamentoAlunoInfoSql = {
  id: string; nome: string | null; email: string | null; classificacao: string | null; recorrente: boolean
  avatar: string | null; avatar_cor: string | null
}
export type EngajamentoAulaFeitaSql = {
  modulo_id: string; modulo_nome: string | null; doc_id: string; titulo: string | null; ordem: number | null
  leitura_em: string | Date | null; pct: number | null; qtot: number | null; qans: number | null; qcorr: number | null
  quiz_completo: boolean; gabaritada: boolean; quiz_ult: string | Date | null
}

/** Info do aluno + suas aulas do Desafio (só as que ele tocou), com datas e acertos — organizado por módulo/ordem. */
export async function engajamentoAlunoDetalheSql(
  tenantId: string, estudanteId: string,
): Promise<{ info: EngajamentoAlunoInfoSql | null; aulas: EngajamentoAulaFeitaSql[] } | null> {
  const info = await sqlQuery<EngajamentoAlunoInfoSql>(
    `SELECT e.id, e.nome, e.email, e.classificacao, e.avatar, e.perfil_avatar_cor AS avatar_cor,
            EXISTS (SELECT 1 FROM simulado_assinaturas a WHERE a.tenant_id = $1 AND a.estudante_id = e.id AND a.status = 'ativo') AS recorrente
       FROM simulado_estudantes e WHERE e.id = $2 AND e.tenant_id = $1`,
    [tenantId, estudanteId],
  )
  if (info == null) return null
  const aulas = await sqlQuery<EngajamentoAulaFeitaSql>(
    `WITH ldocs AS (
       SELECT d.id, d.titulo, d.ordem, d.pasta_id, p.nome AS pasta_nome
         FROM simulado_documentos d JOIN simulado_pastas p ON p.id = d.pasta_id
        WHERE d.tenant_id = $1 AND p.folder_area = 'leitura'
     ),
     qtot AS (SELECT documento_id, COUNT(*) AS qtot FROM simulado_documento_quiz_questoes
               WHERE tenant_id = $1 AND deletado = false AND documento_id IN (SELECT id FROM ldocs) GROUP BY documento_id),
     prog AS (SELECT documento_id, MAX(concluido_em) AS concluido_em, MAX(pct) AS pct
                FROM simulado_leitura_progresso
               WHERE estudante_id = $2 AND documento_id IN (SELECT id FROM ldocs) GROUP BY documento_id),
     -- Respostas contadas SÓ para questões que estão no quiz vigente (JOIN) — igual ao ranking; evita
     -- que perguntas removidas do quiz inflem "respondidas"/"acertos". qcorr = distintas com ≥1 acerto.
     qans AS (SELECT r.documento_id,
                     COUNT(DISTINCT r.questao_id) AS qans,
                     COUNT(DISTINCT CASE WHEN r.correta THEN r.questao_id END) AS qcorr,
                     MAX(r.respondido_em) AS ult
                FROM simulado_leitura_respostas r
                JOIN simulado_documento_quiz_questoes q
                  ON q.documento_id = r.documento_id AND q.questao_id = r.questao_id
                 AND q.tenant_id = $1 AND q.deletado = false
               WHERE r.estudante_id = $2 AND r.documento_id IN (SELECT id FROM ldocs) GROUP BY r.documento_id)
     SELECT l.pasta_id AS modulo_id, l.pasta_nome AS modulo_nome, l.id AS doc_id, l.titulo, l.ordem,
            pr.concluido_em AS leitura_em, pr.pct,
            qt.qtot, COALESCE(qa.qans, 0) AS qans, COALESCE(qa.qcorr, 0) AS qcorr,
            (qa.qans IS NOT NULL AND qt.qtot IS NOT NULL AND qt.qtot > 0 AND qa.qans >= qt.qtot) AS quiz_completo,
            (qa.qcorr IS NOT NULL AND qt.qtot IS NOT NULL AND qt.qtot > 0 AND qa.qcorr >= qt.qtot) AS gabaritada,
            qa.ult AS quiz_ult
       FROM ldocs l
       LEFT JOIN prog pr ON pr.documento_id = l.id
       LEFT JOIN qtot qt ON qt.documento_id = l.id
       LEFT JOIN qans qa ON qa.documento_id = l.id
      WHERE pr.documento_id IS NOT NULL OR qa.documento_id IS NOT NULL
      ORDER BY l.pasta_nome ASC, l.ordem ASC NULLS LAST`,
    [tenantId, estudanteId],
  )
  return { info: info[0] ?? null, aulas: aulas ?? [] }
}
