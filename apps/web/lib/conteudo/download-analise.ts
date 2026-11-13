import 'server-only'
import { sqlQuery } from '@/lib/data/sql'

/**
 * ANÁLISE DE DOWNLOADS (admin). Tudo é SQL agregado no banco (egress mínimo, paginação no servidor), tenant SEMPRE explícito.
 * Fonte: `simulado_download_log` (migração 20261112010000). Sem a tabela → `{ migrado: false }`.
 *  - visão 'conteudo': geral por documento · 'meta': por meta do cronograma (com disciplina/aula quando há definição) · 'aluno': por aluno.
 *  - detalhe: o INDIVIDUAL de um conteúdo/meta/aluno (quem baixou, quantas vezes, quando) + eventos recentes.
 */

export type VisaoDownloads = 'conteudo' | 'meta' | 'aluno'
export interface FiltroDownloads {
  visao: VisaoDownloads
  dias?: number            // janela (0 = tudo)
  origem?: string          // '' = todas
  resultado?: '' | 'baixado' | 'bloqueado'
  busca?: string
  ordenar?: string
  dir?: 'asc' | 'desc'
  pagina?: number
  porPagina?: number
}
export interface LinhaDownloads {
  chave: string                      // documento_id | meta_id | estudante_id
  titulo: string | null
  detalhe: string | null             // meta: "Disciplina · aula N" · aluno: e-mail
  baixados: number; bloqueados: number; alunos: number; conteudos: number
  primeiro: string | null; ultimo: string | null
}
export interface ResumoDownloads { baixados: number; bloqueados: number; alunos: number; conteudos: number; metas: number }
export interface EventoDownload { id: string; quando: string; aluno: string | null; email: string | null; titulo: string | null; origem: string; metaId: string | null; resultado: string; motivo: string | null }
export interface AlunoNoConteudo { estudanteId: string; nome: string | null; email: string | null; baixados: number; bloqueados: number; primeiro: string | null; ultimo: string | null }

const ORDENAR: Record<VisaoDownloads, Record<string, string>> = {
  conteudo: { titulo: 'titulo', baixados: 'baixados', bloqueados: 'bloqueados', alunos: 'alunos', ultimo: 'ultimo' },
  meta: { titulo: 'titulo', baixados: 'baixados', bloqueados: 'bloqueados', alunos: 'alunos', ultimo: 'ultimo' },
  aluno: { titulo: 'titulo', baixados: 'baixados', bloqueados: 'bloqueados', conteudos: 'conteudos', ultimo: 'ultimo' },
}
const ORIGENS = new Set(['cronograma', 'biblioteca', 'produto', 'midia', 'outro'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** WHERE comum (l = download_log, e = estudantes). Devolve o SQL e os parâmetros já numerados. */
function filtroBase(tenantId: string, f: Pick<FiltroDownloads, 'dias' | 'origem' | 'resultado' | 'busca'>) {
  const params: unknown[] = [tenantId]
  const w = ['l.tenant_id = $1']
  const dias = Math.max(0, Math.min(3650, Math.trunc(f.dias ?? 30)))
  if (dias > 0) { params.push(dias); w.push(`l.criado_em >= now() - ($${params.length}::int * interval '1 day')`) }
  if (f.origem && ORIGENS.has(f.origem)) { params.push(f.origem); w.push(`l.origem = $${params.length}`) }
  if (f.resultado === 'baixado' || f.resultado === 'bloqueado') { params.push(f.resultado); w.push(`l.resultado = $${params.length}`) }
  const b = (f.busca ?? '').trim().slice(0, 80)
  if (b) { params.push(`%${b.replace(/[%_\\]/g, ' ')}%`); const n = params.length; w.push(`(l.titulo ILIKE $${n} OR l.meta_id ILIKE $${n} OR e.nome ILIKE $${n} OR e.email ILIKE $${n})`) }
  return { where: w.join(' AND '), params }
}

const REF_AULA = `CASE WHEN l.meta_id ~ '^(pf|pp|fl|qu):[0-9]{1,6}' THEN split_part(l.meta_id, ':', 2)::int
                       WHEN l.meta_id ~ '^(rf|rq):[0-9]+:[0-9]{1,6}$' THEN split_part(l.meta_id, ':', 3)::int END`

export async function resumoDownloads(tenantId: string, f: Pick<FiltroDownloads, 'dias' | 'origem' | 'resultado' | 'busca'>): Promise<{ migrado: boolean; resumo: ResumoDownloads }> {
  const { where, params } = filtroBase(tenantId, f)
  const rows = await sqlQuery<{ baixados: string; bloqueados: string; alunos: string; conteudos: string; metas: string }>(
    `SELECT count(*) FILTER (WHERE l.resultado = 'baixado')::text AS baixados,
            count(*) FILTER (WHERE l.resultado = 'bloqueado')::text AS bloqueados,
            count(DISTINCT l.estudante_id)::text AS alunos,
            count(DISTINCT l.documento_id)::text AS conteudos,
            count(DISTINCT l.meta_id)::text AS metas
       FROM simulado_download_log l LEFT JOIN simulado_estudantes e ON e.id = l.estudante_id
      WHERE ${where}`, params)
  if (rows === null) return { migrado: false, resumo: { baixados: 0, bloqueados: 0, alunos: 0, conteudos: 0, metas: 0 } }
  const r = rows[0]
  return { migrado: true, resumo: { baixados: Number(r?.baixados ?? 0), bloqueados: Number(r?.bloqueados ?? 0), alunos: Number(r?.alunos ?? 0), conteudos: Number(r?.conteudos ?? 0), metas: Number(r?.metas ?? 0) } }
}

export async function listarDownloads(tenantId: string, f: FiltroDownloads): Promise<{ migrado: boolean; itens: LinhaDownloads[]; total: number }> {
  const { where, params } = filtroBase(tenantId, f)
  const por = Math.min(100, Math.max(5, f.porPagina ?? 25)), pag = Math.max(1, f.pagina ?? 1)
  const col = ORDENAR[f.visao][f.ordenar ?? ''] ?? 'ultimo'
  const dir = (f.dir ?? 'desc') === 'asc' ? 'ASC' : 'DESC'
  params.push(por, (pag - 1) * por)
  const lim = `LIMIT $${params.length - 1} OFFSET $${params.length}`
  const conta = `count(*) FILTER (WHERE l.resultado = 'baixado')::int AS baixados, count(*) FILTER (WHERE l.resultado = 'bloqueado')::int AS bloqueados, min(l.criado_em) AS primeiro, max(l.criado_em) AS ultimo`
  const from = `FROM simulado_download_log l LEFT JOIN simulado_estudantes e ON e.id = l.estudante_id`
  let sql: string
  if (f.visao === 'conteudo') {
    sql = `SELECT coalesce(l.documento_id::text, '—') AS chave, max(l.titulo) AS titulo, NULL::text AS detalhe, ${conta},
                  count(DISTINCT l.estudante_id)::int AS alunos, 0 AS conteudos, count(*) OVER ()::int AS total
             ${from} WHERE ${where} GROUP BY l.documento_id ORDER BY ${col} ${dir} NULLS LAST, chave ${lim}`
  } else if (f.visao === 'meta') {
    sql = `SELECT l.meta_id AS chave, coalesce(max(d.titulo), max(l.titulo)) AS titulo,
                  nullif(concat_ws(' · ', max(d.disciplina), CASE WHEN max(d.numero) IS NOT NULL THEN 'aula ' || max(d.numero) END), '') AS detalhe, ${conta},
                  count(DISTINCT l.estudante_id)::int AS alunos, 0 AS conteudos, count(*) OVER ()::int AS total
             FROM (SELECT l.*, ${REF_AULA} AS ref_aula FROM simulado_download_log l) l
             LEFT JOIN simulado_estudantes e ON e.id = l.estudante_id
             LEFT JOIN simulado_cronograma_adaptativo_meta_def d ON d.tenant_id = l.tenant_id AND d.tipo = 'aula' AND d.ref_pos = l.ref_aula
            WHERE ${where} AND l.meta_id IS NOT NULL GROUP BY l.meta_id ORDER BY ${col} ${dir} NULLS LAST, chave ${lim}`
  } else {
    sql = `SELECT l.estudante_id::text AS chave, max(e.nome) AS titulo, max(e.email) AS detalhe, ${conta},
                  0 AS alunos, count(DISTINCT l.documento_id)::int AS conteudos, count(*) OVER ()::int AS total
             ${from} WHERE ${where} GROUP BY l.estudante_id ORDER BY ${col} ${dir} NULLS LAST, chave ${lim}`
  }
  let rows = await sqlQuery<Record<string, unknown>>(sql, params)
  // visão por meta depende da tabela de definições (opcional): sem ela, repete sem o JOIN
  if (rows === null && f.visao === 'meta') {
    const sem = sql.replace(/LEFT JOIN simulado_cronograma_adaptativo_meta_def d ON [^\n]*\n/, '').replace('coalesce(max(d.titulo), max(l.titulo))', 'max(l.titulo)').replace(/nullif\(concat_ws[^\n]*\) AS detalhe/, 'NULL::text AS detalhe')
    rows = await sqlQuery<Record<string, unknown>>(sem, params)
  }
  if (rows === null) return { migrado: false, itens: [], total: 0 }
  const itens = rows.map((r) => ({
    chave: String(r.chave), titulo: (r.titulo as string) ?? null, detalhe: (r.detalhe as string) ?? null,
    baixados: Number(r.baixados ?? 0), bloqueados: Number(r.bloqueados ?? 0), alunos: Number(r.alunos ?? 0), conteudos: Number(r.conteudos ?? 0),
    primeiro: r.primeiro ? new Date(r.primeiro as string).toISOString() : null, ultimo: r.ultimo ? new Date(r.ultimo as string).toISOString() : null,
  }))
  return { migrado: true, itens, total: Number(rows[0]?.total ?? 0) }
}

/** INDIVIDUAL: quem baixou um conteúdo/meta (ou o que um aluno baixou) + os eventos mais recentes. */
export async function detalheDownloads(tenantId: string, visao: VisaoDownloads, chave: string, f: Pick<FiltroDownloads, 'dias' | 'origem' | 'resultado'>): Promise<{ alunos: AlunoNoConteudo[]; eventos: EventoDownload[] }> {
  const { where, params } = filtroBase(tenantId, f)
  let alvo: string
  if (visao === 'conteudo') { if (chave === '—') alvo = 'l.documento_id IS NULL'; else if (UUID.test(chave)) { params.push(chave); alvo = `l.documento_id = $${params.length}` } else return { alunos: [], eventos: [] } }
  else if (visao === 'meta') { params.push(chave.slice(0, 120)); alvo = `l.meta_id = $${params.length}` }
  else if (UUID.test(chave)) { params.push(chave); alvo = `l.estudante_id = $${params.length}` }
  else return { alunos: [], eventos: [] }
  const base = `FROM simulado_download_log l LEFT JOIN simulado_estudantes e ON e.id = l.estudante_id WHERE ${where} AND ${alvo}`
  const [al, ev] = await Promise.all([
    sqlQuery<Record<string, unknown>>(
      `SELECT l.estudante_id::text AS id, max(e.nome) AS nome, max(e.email) AS email,
              count(*) FILTER (WHERE l.resultado = 'baixado')::int AS baixados, count(*) FILTER (WHERE l.resultado = 'bloqueado')::int AS bloqueados,
              min(l.criado_em) AS primeiro, max(l.criado_em) AS ultimo
         ${base} GROUP BY l.estudante_id ORDER BY ultimo DESC LIMIT 100`, params),
    sqlQuery<Record<string, unknown>>(
      `SELECT l.id::text AS id, l.criado_em AS quando, e.nome, e.email, l.titulo, l.origem, l.meta_id, l.resultado, l.motivo
         ${base} ORDER BY l.criado_em DESC LIMIT 60`, params),
  ])
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null)
  return {
    alunos: (al ?? []).map((r) => ({ estudanteId: String(r.id), nome: (r.nome as string) ?? null, email: (r.email as string) ?? null, baixados: Number(r.baixados), bloqueados: Number(r.bloqueados), primeiro: iso(r.primeiro), ultimo: iso(r.ultimo) })),
    eventos: (ev ?? []).map((r) => ({ id: String(r.id), quando: iso(r.quando) as string, aluno: (r.nome as string) ?? null, email: (r.email as string) ?? null, titulo: (r.titulo as string) ?? null, origem: String(r.origem), metaId: (r.meta_id as string) ?? null, resultado: String(r.resultado), motivo: (r.motivo as string) ?? null })),
  }
}
