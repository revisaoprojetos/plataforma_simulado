import 'server-only'
import { sqlQuery } from 'data'

/**
 * Agregações SQL (Lote E — Relatórios e Análise). Cada função devolve `null` quando o SQL direto
 * não está disponível (sem DATABASE_URL / erro) → o chamador cai no caminho PostgREST/RPC anterior.
 * Toda query filtra tenant_id explicitamente. Sem migration: usa só `sqlQuery` (pg direto).
 */

// ───────────────────────── Grupos por aluno (paginado no servidor) ─────────────────────────

export type GrupoDoAlunoSql = { id: string; nome: string; cor: string | null; em: string | null }
export type LinhaGrupoAlunoSql = { id: string; nome: string; total: number; ultimoEm: string | null; grupos: GrupoDoAlunoSql[] }
export type OrdGrupos = 'nome' | 'total' | 'recente'
export type FiltroGrupos = { q: string; grupo: string | null; ord: OrdGrupos; dir: 'asc' | 'desc' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const grupoIdValido = (v: string | null | undefined): string | null => (v && UUID_RE.test(v) ? v : null)

function orderBy(f: FiltroGrupos): string {
  const d = f.dir === 'asc' ? 'ASC' : 'DESC'
  if (f.ord === 'nome') return `lower(nome) ${d}, estudante_id`
  if (f.ord === 'total') return `total ${d}, lower(nome) ASC, estudante_id`
  // 'recente': ultimo_em nulo vale -1 no cliente antigo (menor de todos); desempate por nome asc.
  return `ultimo_em ${d} ${f.dir === 'asc' ? 'NULLS FIRST' : 'NULLS LAST'}, lower(nome) ASC, estudante_id`
}

/** Mesma agregação do RPC `rpc_grupos_por_aluno`, com filtro (nome/grupo), ordenação e LIMIT/OFFSET no banco.
 *  `limit = null` → todos (exportação). O jsonb dos grupos só é montado para as linhas devolvidas. */
export async function gruposPorAlunoSql(tenantId: string, f: FiltroGrupos, limit: number | null, offset: number): Promise<{ linhas: LinhaGrupoAlunoSql[]; total: number } | null> {
  const ob = orderBy(f)
  const rows = await sqlQuery<{ estudante_id: string; nome: string | null; total: number; ultimo_em: Date | string | null; n: string | number; grupos: any }>(
    `WITH vinc AS (
       SELECT m.estudante_id, e.nome, g.id AS gid, g.nome AS gnome, g.cor,
              coalesce(m.criado_em, g.criado_em) AS em
         FROM simulado_grupo_membros m
         JOIN simulado_grupos g ON g.id = m.grupo_id AND g.tenant_id = $1
          AND coalesce(g.deletado, false) = false AND coalesce(g.arquivado, false) = false
         JOIN simulado_estudantes e ON e.id = m.estudante_id AND e.tenant_id = $1
          AND coalesce(e.deletado, false) = false
        WHERE m.tenant_id = $1
     ),
     agg AS (
       SELECT estudante_id, max(nome) AS nome, count(*)::int AS total, max(em) AS ultimo_em
         FROM vinc
        GROUP BY estudante_id
       HAVING ($3::uuid IS NULL OR bool_or(gid = $3::uuid))
          AND ($2::text = '' OR position(lower($2::text) in lower(coalesce(max(nome), 'Estudante'))) > 0)
     ),
     pg AS (
       SELECT agg.*, count(*) OVER () AS n FROM agg ORDER BY ${ob} LIMIT $4::int OFFSET $5::int
     )
     SELECT pg.estudante_id, pg.nome, pg.total, pg.ultimo_em, pg.n,
            (SELECT jsonb_agg(jsonb_build_object('id', v.gid, 'nome', v.gnome, 'cor', v.cor, 'em', v.em)
                              ORDER BY v.em DESC NULLS LAST, v.gnome)
               FROM vinc v WHERE v.estudante_id = pg.estudante_id) AS grupos
       FROM pg ORDER BY ${ob}`,
    [tenantId, f.q.trim(), grupoIdValido(f.grupo), limit, offset],
  )
  if (rows === null) return null
  const iso = (v: Date | string | null) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v))
  return {
    total: rows.length ? Number(rows[0].n) : 0,
    linhas: rows.map((r) => ({
      id: r.estudante_id, nome: r.nome ?? 'Estudante', total: Number(r.total), ultimoEm: iso(r.ultimo_em),
      grupos: Array.isArray(r.grupos) ? r.grupos : [],
    })),
  }
}

/** Filtro/ordenação/paginação em JS sobre as linhas do RPC (fallback sem SQL direto). */
export function filtrarOrdenarPaginar(linhas: LinhaGrupoAlunoSql[], f: FiltroGrupos, limit: number | null, offset: number): { linhas: LinhaGrupoAlunoSql[]; total: number } {
  const termo = f.q.trim().toLowerCase()
  const r = linhas.filter((e) => (!termo || e.nome.toLowerCase().includes(termo)) && (!f.grupo || e.grupos.some((g) => g.id === f.grupo)))
  const dir = f.dir === 'asc' ? 1 : -1
  const val = (e: LinhaGrupoAlunoSql): string | number => (f.ord === 'nome' ? e.nome.toLowerCase() : f.ord === 'total' ? e.total : e.ultimoEm ? new Date(e.ultimoEm).getTime() : -1)
  const ord = [...r].sort((a, b) => {
    const va = val(a), vb = val(b)
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir || a.nome.localeCompare(b.nome, 'pt-BR')
    return String(va).localeCompare(String(vb), 'pt-BR') * dir
  })
  return { total: ord.length, linhas: limit == null ? ord.slice(offset) : ord.slice(offset, offset + limit) }
}

// ───────────────────────── Agregado por estudante (lista de relatórios) ─────────────────────────

export type AgregadoEstudanteSql = { simulados: number; notaMedia: number | null; ultima: string | null }

/** GROUP BY das sessões finalizadas reais do tenant (substitui o fetchAll de todas as sessões). */
export async function agregadosEstudantesSql(tenantId: string, ids?: string[]): Promise<Record<string, AgregadoEstudanteSql> | null> {
  const rows = await sqlQuery<{ estudante_id: string; n: number; media: number | string | null; ult: Date | string | null }>(
    `SELECT estudante_id, count(*)::int AS n, avg(nota)::float8 AS media, max(iniciado_em) AS ult
       FROM simulado_sessoes_prova
      WHERE tenant_id = $1 AND is_teste = false AND deletado = false AND status = 'finalizada'
        AND estudante_id IS NOT NULL AND ($2::uuid[] IS NULL OR estudante_id = ANY($2::uuid[]))
      GROUP BY estudante_id`,
    [tenantId, ids ?? null],
  )
  if (rows === null) return null
  const out: Record<string, AgregadoEstudanteSql> = {}
  for (const r of rows) out[r.estudante_id] = { simulados: Number(r.n), notaMedia: r.media != null ? Number(r.media) : null, ultima: r.ult == null ? null : r.ult instanceof Date ? r.ult.toISOString() : String(r.ult) }
  return out
}

// ───────────────────────── Resumo por disciplina ─────────────────────────

export type ResumoDisciplinaSql = { id: string; nome: string; questoes: number; assuntos: number }

/** nº de questões e de assuntos distintos por disciplina, em 1 GROUP BY (substitui o fetchAll de ~7,8 mil questões). */
export async function resumosDisciplinasSql(tenantId: string): Promise<ResumoDisciplinaSql[] | null> {
  const rows = await sqlQuery<{ id: string; nome: string | null; questoes: number; assuntos: number }>(
    `SELECT d.id, d.nome, count(q.id)::int AS questoes, count(DISTINCT q.assunto_id)::int AS assuntos
       FROM simulado_disciplinas d
       LEFT JOIN simulado_questoes q ON q.disciplina_id = d.id AND q.tenant_id = $1 AND q.deletado = false
      WHERE d.tenant_id = $1
      GROUP BY d.id, d.nome
      ORDER BY d.nome`,
    [tenantId],
  )
  if (rows === null) return null
  return rows.map((d) => ({ id: d.id, nome: d.nome ?? 'Disciplina', questoes: Number(d.questoes), assuntos: Number(d.assuntos) }))
}

// ───────────────────────── Correção discursiva: cards por simulado ─────────────────────────

export type CorrecaoCardSql = { id: string; titulo: string; status: string; regras: any; pend: number; corr: number }

/** Simulados OFICIAIS com questão discursiva do tenant + pendentes/corrigidas — 1 query (JOIN/GROUP BY). */
export async function correcaoCardsSql(tenantId: string): Promise<CorrecaoCardSql[] | null> {
  const rows = await sqlQuery<{ id: string; titulo: string | null; status: string | null; regras: any; pend: number; corr: number }>(
    `WITH sims AS (
       SELECT DISTINCT s.id, s.titulo, s.status, s.regras
         FROM simulado_questoes q
         JOIN simulado_prova_questoes pq ON pq.questao_id = q.id
         JOIN simulado_simulados s ON s.id = pq.simulado_id
        WHERE q.tenant_id = $1 AND q.tipo = 'discursiva'
          AND s.owner_estudante_id IS NULL AND coalesce(s.deletado, false) = false
     )
     SELECT sims.id, sims.titulo, sims.status, sims.regras,
            count(d.id) FILTER (WHERE d.status IS DISTINCT FROM 'corrigida')::int AS pend,
            count(d.id) FILTER (WHERE d.status = 'corrigida')::int AS corr
       FROM sims
       LEFT JOIN simulado_sessoes_prova sp ON sp.simulado_id = sims.id
        AND coalesce(sp.is_teste, false) = false AND coalesce(sp.deletado, false) = false
       LEFT JOIN simulado_respostas_discursivas d ON d.sessao_id = sp.id AND d.tenant_id = $1
      GROUP BY sims.id, sims.titulo, sims.status, sims.regras`,
    [tenantId],
  )
  if (rows === null) return null
  return rows.map((r) => ({ id: r.id, titulo: (r.titulo ?? '') as string, status: (r.status ?? '') as string, regras: r.regras, pend: Number(r.pend), corr: Number(r.corr) }))
}
