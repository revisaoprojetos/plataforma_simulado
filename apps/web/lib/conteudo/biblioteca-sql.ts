import 'server-only'
import { sqlQuery } from '@/lib/data/sql'

// SQL AGREGADO da Biblioteca (Fase 1 do plano de egress). Em vez de o app PUXAR todas as linhas e contar
// no JS (egress alto), o Postgres agrega e devolve KB. `sqlQuery` cai em null se o SQL direto não estiver
// disponível OU falhar → o chamador usa o caminho PostgREST (fallback = não quebra). Tenant SEMPRE explícito.

/**
 * Contagem de documentos por pasta (GROUP BY) + ids dos docs RESTRITOS — substitui o `fetchAll` de TODOS
 * os docs da área (que só servia pra contar no JS). Devolve null se o SQL não está disponível.
 */
export async function contagensDocsAreaSql(
  tenantId: string, categoria: string,
): Promise<{ porPasta: Map<string, number>; restritos: Set<string> } | null> {
  const [cont, rest] = await Promise.all([
    sqlQuery<{ pasta_id: string | null; n: string }>(
      `SELECT pasta_id, count(*)::text AS n
         FROM simulado_conteudo_documentos
        WHERE tenant_id = $1 AND categoria = $2 AND deletado = false
        GROUP BY pasta_id`,
      [tenantId, categoria],
    ),
    sqlQuery<{ id: string }>(
      `SELECT id FROM simulado_conteudo_documentos
        WHERE tenant_id = $1 AND categoria = $2 AND deletado = false AND acesso_geral = 'restrito'`,
      [tenantId, categoria],
    ),
  ])
  if (cont === null || rest === null) return null
  const porPasta = new Map<string, number>()
  for (const r of cont) porPasta.set(r.pasta_id ?? '__root__', Number(r.n))
  return { porPasta, restritos: new Set(rest.map((r) => r.id)) }
}

/**
 * Nº de grupos/alunos DISTINTOS com acesso à pasta atual (docs desta pasta + a própria pasta), em UMA query
 * com `count(distinct …)` — substitui 2–4 `fetchAll`/`fetchAllByIn`. Devolve null se o SQL não está disponível.
 */
export async function resumoAcessoPastaSql(
  tenantId: string, docIds: string[], pastaId: string | null,
): Promise<{ nGrupos: number; nAlunos: number } | null> {
  const ids = docIds.length ? docIds : ['00000000-0000-0000-0000-000000000000']
  const rows = await sqlQuery<{ n_grupos: string; n_alunos: string }>(
    `SELECT
       (SELECT count(DISTINCT grupo_id) FROM (
          SELECT grupo_id FROM simulado_conteudo_documento_grupos
           WHERE tenant_id = $1 AND documento_id = ANY($2::uuid[])
          UNION
          SELECT grupo_id FROM simulado_pasta_grupos
           WHERE tenant_id = $1 AND $3::uuid IS NOT NULL AND pasta_id = $3
        ) g) AS n_grupos,
       (SELECT count(DISTINCT estudante_id) FROM (
          SELECT estudante_id FROM simulado_conteudo_documento_estudantes
           WHERE tenant_id = $1 AND documento_id = ANY($2::uuid[])
          UNION
          SELECT estudante_id FROM simulado_pasta_estudantes
           WHERE tenant_id = $1 AND $3::uuid IS NOT NULL AND pasta_id = $3
        ) e) AS n_alunos`,
    [tenantId, ids, pastaId],
  )
  if (rows === null) return null
  const r = rows[0]
  return { nGrupos: Number(r?.n_grupos ?? 0), nAlunos: Number(r?.n_alunos ?? 0) }
}
