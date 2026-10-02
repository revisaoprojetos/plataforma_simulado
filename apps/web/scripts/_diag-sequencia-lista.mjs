// SOMENTE LEITURA — lista alunos do Desafio cujo streak muda conforme a REGRA. Para cada um:
// respostas (antigo) × conclusão-quiz (fix atual) × engajamento (ler OU quiz). Separa REFAZER
// (quiz>respostas: bug da data) de QUIZ-ATRASADO (engaj>quiz: leu no dia, quizou depois).
import { readFileSync } from 'node:fs'
import pg from 'pg'
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const MOD = 'c6e147ae-f69a-467e-b09b-0cd8576fb3dd'
const TZ = 'America/Sao_Paulo'
const q = (t, p) => pool.query(t, p).then((r) => r.rows)
const diaDe = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
const ontem = new Date(Date.parse(hoje + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
function streak(dset) { const d = [...dset].sort(); let run = 0, p = ''; for (const x of d) { const c = !!p && Date.parse(x + 'T00:00:00Z') - Date.parse(p + 'T00:00:00Z') === 86400000; run = c ? run + 1 : 1; p = x } const u = d[d.length - 1] ?? ''; return (u === hoje || u === ontem) ? run : 0 }
try {
  const docs = (await q(`SELECT id FROM simulado_documentos WHERE tenant_id=$1 AND pasta_id=$2 AND deletado=false AND publicado=true`, [TID, MOD])).map(r => r.id)
  const quiz = await q(`SELECT documento_id, questao_id FROM simulado_documento_quiz_questoes WHERE tenant_id=$1 AND deletado=false AND documento_id=ANY($2)`, [TID, docs])
  const qpd = new Map(); for (const x of quiz) { if (!qpd.has(x.documento_id)) qpd.set(x.documento_id, new Set()); qpd.get(x.documento_id).add(x.questao_id) }
  const resp = await q(`SELECT estudante_id, documento_id, questao_id, respondido_em FROM simulado_leitura_respostas WHERE tenant_id=$1 AND documento_id=ANY($2)`, [TID, docs])
  const alu = new Map()
  for (const r of resp) { const s = qpd.get(r.documento_id); if (!s || !s.has(r.questao_id)) continue; const a = alu.get(r.estudante_id) ?? alu.set(r.estudante_id, new Map()).get(r.estudante_id); const c = a.get(r.documento_id) ?? a.set(r.documento_id, { ans: new Set(), ult: null }).get(r.documento_id); c.ans.add(r.questao_id); if (r.respondido_em && (!c.ult || r.respondido_em > c.ult)) c.ult = r.respondido_em }
  const evQuiz = await q(`SELECT estudante_id, array_agg(DISTINCT meta->>'dia') d FROM simulado_xp_eventos WHERE tenant_id=$1 AND origem='leitura' AND ref_id LIKE 'quiz:%' AND meta->>'documentoId'=ANY($2::text[]) AND meta->>'dia' IS NOT NULL GROUP BY estudante_id`, [TID, docs])
  const evAll = await q(`SELECT estudante_id, array_agg(DISTINCT meta->>'dia') d FROM simulado_xp_eventos WHERE tenant_id=$1 AND origem='leitura' AND meta->>'documentoId'=ANY($2::text[]) AND meta->>'dia' IS NOT NULL GROUP BY estudante_id`, [TID, docs])
  const quizDe = new Map(evQuiz.map(r => [r.estudante_id, new Set((r.d ?? []).filter(Boolean))]))
  const allDe = new Map(evAll.map(r => [r.estudante_id, new Set((r.d ?? []).filter(Boolean))]))
  const refazer = [], atrasado = []
  for (const [eid, amap] of alu) {
    const rd = new Set(); for (const [doc, c] of amap) { const s = qpd.get(doc); if (s && s.size && [...s].every(x => c.ans.has(x)) && c.ult) rd.add(diaDe(c.ult)) }
    const sResp = streak(rd), sQuiz = streak(quizDe.get(eid) ?? rd), sAll = streak(allDe.get(eid) ?? rd)
    if (sQuiz > sResp) refazer.push({ eid, resp: sResp, quiz: sQuiz, all: sAll })
    else if (sAll > sQuiz) atrasado.push({ eid, resp: sResp, quiz: sQuiz, all: sAll })
  }
  const nome = async (eid) => { const e = (await q(`SELECT nome,email FROM simulado_estudantes WHERE id=$1`, [eid]))[0]; return `${e?.nome} (${e?.email})` }
  refazer.sort((a, b) => b.quiz - a.quiz); atrasado.sort((a, b) => (b.all - b.quiz) - (a.all - a.quiz))
  console.log(`\n### REFAZER (bug da data; JÁ corrigidos pelo fix) — ${refazer.length}`)
  for (const a of refazer) console.log(`  ${await nome(a.eid)} | respostas=${a.resp} → quiz=${a.quiz} (engaj=${a.all})`)
  console.log(`\n### QUIZ-ATRASADO (leu no dia, quizou depois; só mudam se a regra for ENGAJAMENTO) — ${atrasado.length}`)
  for (const a of atrasado) console.log(`  ${await nome(a.eid)} | quiz=${a.quiz} → engaj=${a.all}`)
} catch (e) { console.error('ERRO:', e.message) } finally { await pool.end() }
