import 'server-only'
import { sqlQuery } from '@/lib/data/sql'

/**
 * Repositório SQL dos relatórios (Fase 1). Cada método devolve linhas cruas (ou null se o
 * SQL direto não estiver disponível → o loader cai no PostgREST). Sempre escopado por tenant.
 */

export type ResumoRow = {
  id: string
  titulo: string | null
  status: string | null
  created_at: string | Date | null
  regras: any
  participantes: string | number
  finalizadas: string | number
  em_andamento: string | number
  nota_media: string | number | null
  ultima: string | Date | null
  tipos: (string | null)[] | null
}

// Substitui os 4 fetchAllByIn de _resumos.ts (pq, sess, mats, acs) por 1 query com agregação
// no banco. Participantes = alunos DISTINTOS entre sessões (reais) ∪ matrículas ∪ acessos.
const RESUMOS_SQL = `
WITH sims AS (
  SELECT id, titulo, status, created_at, regras
  FROM simulado_simulados
  WHERE deletado = false AND tenant_id = $1
),
sess AS (
  SELECT simulado_id,
         COUNT(DISTINCT estudante_id) FILTER (WHERE status = 'finalizada')  AS finalizadas,
         COUNT(DISTINCT estudante_id) FILTER (WHERE status = 'em_andamento') AS em_andamento,
         AVG(nota)                    FILTER (WHERE status = 'finalizada' AND nota IS NOT NULL) AS nota_media,
         MAX(iniciado_em) AS ultima
  FROM simulado_sessoes_prova
  WHERE simulado_id IN (SELECT id FROM sims) AND is_teste = false AND deletado = false
  GROUP BY simulado_id
),
part AS (
  SELECT simulado_id, COUNT(DISTINCT estudante_id) AS participantes
  FROM (
    SELECT simulado_id, estudante_id FROM simulado_sessoes_prova
      WHERE simulado_id IN (SELECT id FROM sims) AND is_teste = false AND deletado = false AND estudante_id IS NOT NULL
    UNION
    SELECT simulado_id, estudante_id FROM simulado_matriculas
      WHERE simulado_id IN (SELECT id FROM sims) AND estudante_id IS NOT NULL
    UNION
    SELECT simulado_id, estudante_id FROM simulado_acessos
      WHERE simulado_id IN (SELECT id FROM sims) AND estudante_id IS NOT NULL
  ) u
  GROUP BY simulado_id
),
tipos AS (
  SELECT pq.simulado_id, array_agg(DISTINCT q.tipo) AS tipos
  FROM simulado_prova_questoes pq
  JOIN simulado_questoes q ON q.id = pq.questao_id
  WHERE pq.simulado_id IN (SELECT id FROM sims)
  GROUP BY pq.simulado_id
)
SELECT s.id, s.titulo, s.status, s.created_at, s.regras,
       COALESCE(p.participantes, 0)  AS participantes,
       COALESCE(se.finalizadas, 0)   AS finalizadas,
       COALESCE(se.em_andamento, 0)  AS em_andamento,
       se.nota_media,
       se.ultima,
       t.tipos
FROM sims s
LEFT JOIN sess  se ON se.simulado_id = s.id
LEFT JOIN part  p  ON p.simulado_id  = s.id
LEFT JOIN tipos t  ON t.simulado_id  = s.id
ORDER BY s.created_at DESC
`

/** Linhas agregadas dos resumos de simulados do tenant, ou null se o SQL direto indisponível. */
export async function resumosSimuladosRows(tenantId: string): Promise<ResumoRow[] | null> {
  return sqlQuery<ResumoRow>(RESUMOS_SQL, [tenantId])
}

// ─────────────────────────────────────────────────────────────────────────────
// Relatório por ESTUDANTE (o mais pesado: aluno × turma). Substitui a cascata de
// fetchAllByIn de estudantes/_dados.ts por 2 queries: sessões (com acertos) + disciplina.
// ─────────────────────────────────────────────────────────────────────────────

export type EstSessaoRow = {
  id: string; simulado_id: string | null; status: string | null; nota: string | number | null
  iniciado_em: string | Date | null; finalizado_em: string | Date | null; titulo: string | null
  ac: number; tt: number
}
export type EstDiscRow = { disc: string; aluno_ac: number; aluno_tt: number; turma_ac: number; turma_tt: number }
export type EstData = { found: boolean; nome?: string; sessoes?: EstSessaoRow[]; disciplinas?: EstDiscRow[] }

// Sessões (reais) do aluno + acertos/total por sessão + título do simulado.
const EST_SESSOES_SQL = `
SELECT s.id, s.simulado_id, s.status, s.nota, s.iniciado_em, s.finalizado_em, sim.titulo,
       COUNT(r.*)::int AS tt,
       COUNT(r.*) FILTER (WHERE r.correta)::int AS ac
FROM simulado_sessoes_prova s
LEFT JOIN simulado_simulados sim ON sim.id = s.simulado_id
LEFT JOIN simulado_respostas_objetivas r ON r.sessao_id = s.id
WHERE s.estudante_id = $1 AND s.is_teste = false AND s.deletado = false
GROUP BY s.id, sim.titulo
ORDER BY s.iniciado_em
`

// Acerto por disciplina: do ALUNO e da TURMA (todos, sessões reais) nas MESMAS questões que o aluno respondeu.
const EST_DISC_SQL = `
WITH sess AS (
  SELECT id FROM simulado_sessoes_prova WHERE estudante_id = $1 AND is_teste = false AND deletado = false
),
qids AS (
  SELECT DISTINCT r.questao_id FROM simulado_respostas_objetivas r JOIN sess ON sess.id = r.sessao_id
),
aluno AS (
  SELECT COALESCE(d.nome, 'Sem disciplina') AS disc, COUNT(*)::int AS tt, COUNT(*) FILTER (WHERE r.correta)::int AS ac
  FROM simulado_respostas_objetivas r
  JOIN sess ON sess.id = r.sessao_id
  LEFT JOIN simulado_questoes q ON q.id = r.questao_id
  LEFT JOIN simulado_disciplinas d ON d.id = q.disciplina_id
  GROUP BY 1
),
turma AS (
  SELECT COALESCE(d.nome, 'Sem disciplina') AS disc, COUNT(*)::int AS tt, COUNT(*) FILTER (WHERE r.correta)::int AS ac
  FROM simulado_respostas_objetivas r
  JOIN simulado_sessoes_prova s ON s.id = r.sessao_id AND s.is_teste = false AND s.deletado = false
  LEFT JOIN simulado_questoes q ON q.id = r.questao_id
  LEFT JOIN simulado_disciplinas d ON d.id = q.disciplina_id
  WHERE r.questao_id IN (SELECT questao_id FROM qids)
  GROUP BY 1
)
SELECT a.disc, a.ac AS aluno_ac, a.tt AS aluno_tt, COALESCE(t.ac, 0) AS turma_ac, COALESCE(t.tt, 0) AS turma_tt
FROM aluno a LEFT JOIN turma t ON a.disc = t.disc
`

/**
 * Dados do relatório de um estudante via SQL direto.
 * Retorna `null` se o SQL indisponível/erro (→ loader usa PostgREST); `{found:false}` se o
 * aluno não existe; `{found:true, ...}` com sessões + disciplinas.
 */
export async function relatorioEstudanteSql(estId: string, tenantId: string): Promise<EstData | null> {
  const alvo = await sqlQuery<{ nome: string }>(
    'SELECT nome FROM simulado_estudantes WHERE id = $1 AND tenant_id = $2',
    [estId, tenantId],
  )
  if (alvo === null) return null // SQL indisponível → fallback
  if (!alvo.length) return { found: false }
  const [sessoes, disciplinas] = await Promise.all([
    sqlQuery<EstSessaoRow>(EST_SESSOES_SQL, [estId]),
    sqlQuery<EstDiscRow>(EST_DISC_SQL, [estId]),
  ])
  if (sessoes === null || disciplinas === null) return null // erro no meio → fallback
  return { found: true, nome: alvo[0].nome, sessoes, disciplinas }
}

// ─────────────────────────────────────────────────────────────────────────────
// Relatório GRÁFICO (visão geral da plataforma).
// ─────────────────────────────────────────────────────────────────────────────

export type GraficoCounts = { est: number; q: number; sims: number }
export type GraficoSessRow = { status: string | null; nota: string | number | null; iniciado_em: string | Date | null; ac: number; tt: number }
export type GraficoDiscRow = { disc: string; ac: number; tt: number }
export type GraficoData = { counts: GraficoCounts; sessoes: GraficoSessRow[]; disciplinas: GraficoDiscRow[] }

const GRAFICO_COUNTS_SQL = `
SELECT
  (SELECT count(*) FROM simulado_estudantes WHERE tenant_id = $1)::int AS est,
  (SELECT count(*) FROM simulado_questoes WHERE tenant_id = $1 AND deletado = false)::int AS q,
  (SELECT count(*) FROM simulado_simulados WHERE tenant_id = $1 AND deletado = false)::int AS sims
`
const GRAFICO_SESS_SQL = `
SELECT s.status, s.nota, s.iniciado_em,
       COUNT(r.*)::int AS tt, COUNT(r.*) FILTER (WHERE r.correta)::int AS ac
FROM simulado_sessoes_prova s
LEFT JOIN simulado_respostas_objetivas r ON r.sessao_id = s.id
WHERE s.simulado_id IN (SELECT id FROM simulado_simulados WHERE tenant_id = $1 AND deletado = false)
  AND s.is_teste = false AND s.deletado = false
GROUP BY s.id
`
const GRAFICO_DISC_SQL = `
SELECT COALESCE(d.nome, 'Sem disciplina') AS disc, COUNT(*)::int AS tt, COUNT(*) FILTER (WHERE r.correta)::int AS ac
FROM simulado_respostas_objetivas r
JOIN simulado_sessoes_prova s ON s.id = r.sessao_id AND s.is_teste = false AND s.deletado = false
  AND s.simulado_id IN (SELECT id FROM simulado_simulados WHERE tenant_id = $1 AND deletado = false)
LEFT JOIN simulado_questoes q ON q.id = r.questao_id
LEFT JOIN simulado_disciplinas d ON d.id = q.disciplina_id
GROUP BY 1
`

export async function relatorioGraficoSql(tenantId: string): Promise<GraficoData | null> {
  const counts = await sqlQuery<GraficoCounts>(GRAFICO_COUNTS_SQL, [tenantId])
  if (counts === null) return null
  const [sessoes, disciplinas] = await Promise.all([
    sqlQuery<GraficoSessRow>(GRAFICO_SESS_SQL, [tenantId]),
    sqlQuery<GraficoDiscRow>(GRAFICO_DISC_SQL, [tenantId]),
  ])
  if (sessoes === null || disciplinas === null) return null
  return { counts: counts[0] ?? { est: 0, q: 0, sims: 0 }, sessoes, disciplinas }
}

// ─────────────────────────────────────────────────────────────────────────────
// Relatório por DISCIPLINA (KPIs, por simulado, por assunto, evolução por mês).
// ─────────────────────────────────────────────────────────────────────────────

export type DiscTotals = { tt: number; ac: number; est: number; totalq: number }
export type DiscSimRow = { simulado_id: string; titulo: string | null; tt: number; ac: number }
export type DiscAssRow = { assunto_id: string | null; assunto_nome: string | null; tt: number; ac: number }
export type DiscMesRow = { y: number; m0: number; tt: number; ac: number }
export type DiscData = { found: boolean; nome?: string; totals?: DiscTotals; porSim?: DiscSimRow[]; porAssunto?: DiscAssRow[]; porMes?: DiscMesRow[] }

// CTE base compartilhada: questões da disciplina + respostas em sessões reais (não-teste/não-del).
const D_BASE = `
WITH q AS (SELECT id, assunto_id FROM simulado_questoes WHERE disciplina_id = $1 AND deletado = false),
base AS (
  SELECT r.correta, s.simulado_id, s.estudante_id, s.iniciado_em, q.assunto_id
  FROM simulado_respostas_objetivas r
  JOIN q ON q.id = r.questao_id
  JOIN simulado_sessoes_prova s ON s.id = r.sessao_id AND s.is_teste = false AND s.deletado = false
)`
const D_TOTALS_SQL = `${D_BASE}
SELECT COUNT(*)::int AS tt, COUNT(*) FILTER (WHERE correta)::int AS ac,
       COUNT(DISTINCT estudante_id)::int AS est, (SELECT COUNT(*) FROM q)::int AS totalq
FROM base`
const D_PORSIM_SQL = `${D_BASE}
SELECT b.simulado_id, sim.titulo, COUNT(*)::int AS tt, COUNT(*) FILTER (WHERE b.correta)::int AS ac
FROM base b JOIN simulado_simulados sim ON sim.id = b.simulado_id
GROUP BY 1, 2`
const D_PORASSUNTO_SQL = `${D_BASE}
SELECT b.assunto_id, a.nome AS assunto_nome, COUNT(*)::int AS tt, COUNT(*) FILTER (WHERE b.correta)::int AS ac
FROM base b LEFT JOIN simulado_assuntos a ON a.id = b.assunto_id
GROUP BY 1, 2`
// Mês em UTC (casa com new Date().getMonth() num servidor UTC). m0 = 0..11 (igual getMonth()).
const D_PORMES_SQL = `${D_BASE}
SELECT EXTRACT(YEAR FROM b.iniciado_em AT TIME ZONE 'UTC')::int AS y,
       (EXTRACT(MONTH FROM b.iniciado_em AT TIME ZONE 'UTC')::int - 1) AS m0,
       COUNT(*)::int AS tt, COUNT(*) FILTER (WHERE b.correta)::int AS ac
FROM base b WHERE b.iniciado_em IS NOT NULL
GROUP BY 1, 2`

export async function relatorioDisciplinaSql(discId: string, tenantId: string): Promise<DiscData | null> {
  const alvo = await sqlQuery<{ nome: string }>('SELECT nome FROM simulado_disciplinas WHERE id = $1 AND tenant_id = $2', [discId, tenantId])
  if (alvo === null) return null
  if (!alvo.length) return { found: false }
  const [tot, sim, ass, mes] = await Promise.all([
    sqlQuery<DiscTotals>(D_TOTALS_SQL, [discId]),
    sqlQuery<DiscSimRow>(D_PORSIM_SQL, [discId]),
    sqlQuery<DiscAssRow>(D_PORASSUNTO_SQL, [discId]),
    sqlQuery<DiscMesRow>(D_PORMES_SQL, [discId]),
  ])
  if (tot === null || sim === null || ass === null || mes === null) return null
  return { found: true, nome: alvo[0].nome, totals: tot[0] ?? { tt: 0, ac: 0, est: 0, totalq: 0 }, porSim: sim, porAssunto: ass, porMes: mes }
}
