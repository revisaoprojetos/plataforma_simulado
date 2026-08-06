import { sqlQuery } from './sql'

/**
 * Camada SQL do detalhe de grupo (Fase 3, strangler). Substitui o fan-out do PostgREST
 * (ids + ~52 chunks p/ membros; N getUserById p/ atores) por poucas queries diretas no Postgres.
 * Cada função devolve `null` quando o SQL direto não está disponível (sem DATABASE_URL / erro) —
 * o chamador cai no caminho PostgREST. Toda query filtra tenant_id explicitamente.
 */

export type GrupoMembroRow = { id: string; nome: string | null; email: string | null; classificacao: string | null }

/** Membros do grupo com detalhes, em UMA query (JOIN grupo_membros × estudantes). */
export async function grupoMembrosSql(grupoId: string, tenantId: string): Promise<GrupoMembroRow[] | null> {
  return sqlQuery<GrupoMembroRow>(
    `SELECT e.id, e.nome, e.email, e.classificacao
       FROM simulado_grupo_membros m
       JOIN simulado_estudantes e ON e.id = m.estudante_id AND e.deletado = false
      WHERE m.grupo_id = $1 AND m.tenant_id = $2
      ORDER BY e.nome ASC`,
    [grupoId, tenantId],
  )
}

export type GrupoAtividadeRow = {
  id: string
  operacao: string
  entidade: string
  dados_anteriores: any
  dados_novos: any
  criado_em: string | Date | null
  ator_tipo: string | null
  ator_nome: string | null
  ator_email: string | null
  banco_nome: string | null
}

/** Auditoria do grupo com ATOR (auth.users) e NOME DO BANCO resolvidos, em UMA query. */
export async function grupoAtividadeSql(grupoId: string, tenantId: string): Promise<GrupoAtividadeRow[] | null> {
  return sqlQuery<GrupoAtividadeRow>(
    `SELECT l.id, l.operacao, l.entidade, l.dados_anteriores, l.dados_novos, l.criado_em, l.ator_tipo,
            u.raw_user_meta_data->>'nome' AS ator_nome,
            u.email AS ator_email,
            b.nome AS banco_nome
       FROM simulado_audit_logs l
       LEFT JOIN auth.users u ON u.id = COALESCE(l.actor_user_id, l.ator_id)
       LEFT JOIN simulado_pastas b ON b.id::text = (l.dados_novos->>'banco')
      WHERE l.tenant_id = $2 AND l.entidade_id = $1
      ORDER BY l.criado_em DESC
      LIMIT 400`,
    [grupoId, tenantId],
  )
}

export type GrupoContagemRow = { grupo_id: string; total: string | number }

/**
 * Contagem de membros de VÁRIOS grupos em UMA query (substitui o fan-out de N counts HEAD,
 * um por grupo, da lista de grupos do admin). Filtra tenant_id explicitamente. Devolve `null`
 * quando o SQL direto não está disponível — o chamador cai no caminho PostgREST (N+1).
 */
export async function grupoContagensSql(grupoIds: string[], tenantId: string): Promise<GrupoContagemRow[] | null> {
  if (!grupoIds.length) return []
  return sqlQuery<GrupoContagemRow>(
    `SELECT grupo_id, COUNT(*) AS total
       FROM simulado_grupo_membros
      WHERE grupo_id = ANY($1) AND tenant_id = $2
      GROUP BY grupo_id`,
    [grupoIds, tenantId],
  )
}

export type SubgrupoRow = { id: string; nome: string; cor: string | null; membros: string | number }

/** Subgrupos (filhos) de uma pasta com contagem de membros, em UMA query. */
export async function grupoSubgruposSql(grupoId: string, tenantId: string): Promise<SubgrupoRow[] | null> {
  return sqlQuery<SubgrupoRow>(
    `SELECT g.id, g.nome, g.cor, COUNT(m.estudante_id) AS membros
       FROM simulado_grupos g
       LEFT JOIN simulado_grupo_membros m ON m.grupo_id = g.id
      WHERE g.pai_id = $1 AND g.tenant_id = $2 AND g.deletado = false
      GROUP BY g.id, g.nome, g.cor
      ORDER BY g.nome ASC`,
    [grupoId, tenantId],
  )
}
