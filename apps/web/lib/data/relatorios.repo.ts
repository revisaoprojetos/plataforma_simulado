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
