import { sqlQuery } from './sql'

/**
 * Camada SQL do banco de questões (pasta). A aba "Visão geral" do detalhe do banco mostra a
 * distribuição das questões por disciplina e por assunto. No caminho PostgREST isso era feito
 * agregando EM MEMÓRIA o conjunto completo de questões (1000+) dentro do render da página.
 * Aqui é UMA query agregada (GROUP BY) que devolve as contagens já prontas. Retorna `null` quando
 * o SQL direto não está disponível (sem DATABASE_URL / erro) → o chamador cai no caminho PostgREST
 * (agregação em memória sobre a lista já carregada). Toda query filtra tenant_id explicitamente.
 */

export type BancoContagemItem = { nome: string; n: number }
export type BancoContagens = {
  total: number
  porDisciplina: BancoContagemItem[]
  porAssunto: BancoContagemItem[]
}

/**
 * Contagem de questões de um banco (pasta) agrupada por disciplina e por assunto, em UMA query.
 * Espelha a agregação em memória antiga: COALESCE do nome → 'Sem disciplina'/'Sem assunto',
 * ordenado por contagem desc (desempate por nome). `total` = nº de questões vinculadas ao banco
 * no tenant (denominador dos percentuais). Devolve `null` se o SQL direto não estiver disponível.
 */
export async function bancoContagensSql(pastaId: string, tenantId: string): Promise<BancoContagens | null> {
  const rows = await sqlQuery<{ total: number | string; por_disciplina: any; por_assunto: any }>(
    `WITH base AS (
       SELECT q.disciplina_id, q.assunto_id
         FROM simulado_questao_pasta p
         JOIN simulado_questoes q ON q.id = p.questao_id AND q.tenant_id = p.tenant_id
        WHERE p.pasta_id = $1 AND p.tenant_id = $2
     ),
     d AS (
       SELECT COALESCE(di.nome, 'Sem disciplina') AS nome, count(*)::int AS n
         FROM base b
         LEFT JOIN simulado_disciplinas di ON di.id = b.disciplina_id
        GROUP BY COALESCE(di.nome, 'Sem disciplina')
     ),
     a AS (
       SELECT COALESCE(ass.nome, 'Sem assunto') AS nome, count(*)::int AS n
         FROM base b
         LEFT JOIN simulado_assuntos ass ON ass.id = b.assunto_id
        GROUP BY COALESCE(ass.nome, 'Sem assunto')
     )
     SELECT (SELECT count(*)::int FROM base) AS total,
            (SELECT COALESCE(json_agg(json_build_object('nome', nome, 'n', n) ORDER BY n DESC, nome ASC), '[]'::json) FROM d) AS por_disciplina,
            (SELECT COALESCE(json_agg(json_build_object('nome', nome, 'n', n) ORDER BY n DESC, nome ASC), '[]'::json) FROM a) AS por_assunto`,
    [pastaId, tenantId],
  )
  if (!rows || !rows.length) return null
  const r = rows[0]
  const norm = (v: any): BancoContagemItem[] =>
    (Array.isArray(v) ? v : []).map((x: any) => ({ nome: String(x.nome), n: Number(x.n) || 0 }))
  return { total: Number(r.total) || 0, porDisciplina: norm(r.por_disciplina), porAssunto: norm(r.por_assunto) }
}
