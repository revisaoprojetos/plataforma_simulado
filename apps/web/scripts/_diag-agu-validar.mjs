// SOMENTE LEITURA — valida que o diagnóstico vai popular com os dados reais do Victor.
// Espelha a lógica do merge: respostas da sessão → questões do banco (6c03f660) → pilar(categoria)/disciplina.
import { readFileSync } from 'node:fs'
import pg from 'pg'
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const BANCO = '6c03f660-a886-46c3-9c20-d377a73080ab'
const SESS = '61357e76-82dc-4507-a8d3-e3fb5a0cb81f' // Victor 89/100
const q = (t, p) => pool.query(t, p).then((r) => r.rows)
const pilarDe = (cat) => { const t = (cat ?? '').toLowerCase(); if (/portugu|l[ií]ngua/.test(t)) return 'lingua_portuguesa'; if (/lei seca|legisla/.test(t)) return 'lei_seca'; if (/jurisprud/.test(t)) return 'jurisprudencia'; if (/doutrina/.test(t)) return 'doutrina'; return '(outro)' }
try {
  // questões do banco + categoria/disciplina
  const qs = await q(
    `SELECT qp.questao_id, q.categoria, d.nome disc
       FROM simulado_questao_pasta qp JOIN simulado_questoes q ON q.id=qp.questao_id
       LEFT JOIN simulado_disciplinas d ON d.id=q.disciplina_id
      WHERE qp.pasta_id=$1 AND qp.tenant_id=$2`, [BANCO, TID])
  const info = new Map(qs.map((r) => [r.questao_id, { pilar: pilarDe(r.categoria), disc: r.disc ?? 'Sem disciplina' }]))
  // respostas da sessão do Victor
  const resp = await q(`SELECT questao_id, correta FROM simulado_respostas_objetivas WHERE sessao_id=$1`, [SESS])
  const pilar = {}, disc = {}; let semBanco = 0, totAc = 0
  for (const r of resp) {
    const i = info.get(r.questao_id); if (!i) { semBanco++; continue }
    if (r.correta) totAc++
    pilar[i.pilar] = pilar[i.pilar] || { ac: 0, tt: 0 }; pilar[i.pilar].tt++; if (r.correta) pilar[i.pilar].ac++
    disc[i.disc] = disc[i.disc] || { ac: 0, tt: 0 }; disc[i.disc].tt++; if (r.correta) disc[i.disc].ac++
  }
  console.log(`respostas: ${resp.length} | casam com banco: ${resp.length - semBanco} | fora do banco: ${semBanco} | acertos(no banco): ${totAc}`)
  console.log('\nPOR PILAR (o que vai no card dos 3 pilares):')
  for (const [k, v] of Object.entries(pilar)) console.log(`  ${k}: ${v.ac}/${v.tt} = ${Math.round(v.ac / v.tt * 100)}%`)
  console.log('\nPOR DISCIPLINA:')
  for (const [k, v] of Object.entries(disc).sort((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${k}: ${v.ac}/${v.tt} = ${Math.round(v.ac / v.tt * 100)}%`)
} catch (e) { console.error('ERRO:', e.message) } finally { await pool.end() }
