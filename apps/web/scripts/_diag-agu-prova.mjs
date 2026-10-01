// SOMENTE LEITURA — prova do "Concurso Simulado AGU" + sessão do Victor + match com bancos AGU.
import { readFileSync } from 'node:fs'
import pg from 'pg'
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const SIM = '79813cd6-8d17-4671-b482-d70292678848'  // Concurso Simulado AGU
const PASTA = '38a3566d-89ae-405c-b7f2-c9007cbc0098' // pasta "AGU"
const q = (t, p) => pool.query(t, p).then((r) => r.rows)
try {
  // prova_questoes do simulado + se as questões têm disciplina/pilar
  const pq = await q(`SELECT count(*)::int n FROM simulado_prova_questoes WHERE simulado_id = $1 AND tenant_id = $2`, [SIM, TID])
  console.log('prova_questoes do Concurso Simulado AGU:', pq[0]?.n)
  const comDados = await q(
    `SELECT count(*)::int total,
            count(q.disciplina_id)::int com_disc,
            count(*) FILTER (WHERE q.pilar_1 IS NOT NULL OR q.pilar_2 IS NOT NULL OR q.categoria IS NOT NULL)::int com_pilar
       FROM simulado_prova_questoes pq JOIN simulado_questoes q ON q.id = pq.questao_id
      WHERE pq.simulado_id = $1 AND pq.tenant_id = $2`, [SIM, TID])
  console.log('  questões c/ disciplina:', comDados[0]?.com_disc, '| c/ pilar(categoria/pilar_1/2):', comDados[0]?.com_pilar, '| total:', comDados[0]?.total)
  // amostra de categorias/pilares
  const amostra = await q(
    `SELECT q.categoria, q.pilar_1, q.pilar_2, d.nome disc
       FROM simulado_prova_questoes pq JOIN simulado_questoes q ON q.id = pq.questao_id
       LEFT JOIN simulado_disciplinas d ON d.id = q.disciplina_id
      WHERE pq.simulado_id = $1 AND pq.tenant_id = $2 LIMIT 6`, [SIM, TID])
  console.log('  amostra:', JSON.stringify(amostra))

  // sessão do Victor
  const vic = await q(
    `SELECT e.id eid, e.nome, s.id sid, s.status, s.nota
       FROM simulado_estudantes e
       LEFT JOIN simulado_sessoes_prova s ON s.estudante_id = e.id AND s.simulado_id = $2
      WHERE e.tenant_id = $1 AND e.nome ILIKE '%victor almeida oliveira%'`, [TID, SIM])
  console.log('Victor:', JSON.stringify(vic))

  // As questões da prova deste simulado também estão vinculadas a algum BANCO (simulado_questao_pasta)?
  const bancos = await q(
    `SELECT qp.pasta_id, p.nome, count(*)::int n
       FROM simulado_prova_questoes pq
       JOIN simulado_questao_pasta qp ON qp.questao_id = pq.questao_id AND qp.tenant_id = pq.tenant_id
       LEFT JOIN simulado_pastas p ON p.id = qp.pasta_id
      WHERE pq.simulado_id = $1 AND pq.tenant_id = $2
      GROUP BY qp.pasta_id, p.nome ORDER BY n DESC`, [SIM, TID])
  console.log('BANCOS que contêm as questões desta prova:')
  for (const b of bancos) console.log(`  ${b.pasta_id} | ${b.nome} | ${b.n} questões`)
} catch (e) { console.error('ERRO:', e.message) } finally { await pool.end() }
