// SOMENTE LEITURA — quantos alunos tiveram a SEQUÊNCIA do ranking quebrada por REFAZER (que moveu o
// respondido_em). Compara, por aluno, o streak REAL (ledger XP origem='leitura', meta.dia — imutável)
// com o streak do RANKING (dias derivados de MAX(respondido_em) por aula concluída). Afetado = real > ranking.
import { readFileSync } from 'node:fs'
import pg from 'pg'
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const TZ = 'America/Sao_Paulo'
const q = (t, p) => pool.query(t, p).then((r) => r.rows)
const diaDe = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
const ontem = new Date(Date.parse(hoje + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
function streak(dset) {
  const dias = [...dset].sort(); let maior = 0, run = 0, prev = ''
  for (const d of dias) { const c = !!prev && Date.parse(d + 'T00:00:00Z') - Date.parse(prev + 'T00:00:00Z') === 86400000; run = c ? run + 1 : 1; if (run > maior) maior = run; prev = d }
  const ult = dias[dias.length - 1] ?? ''
  return { atual: (ult === hoje || ult === ontem) ? run : 0, maior, ult }
}

async function analisarModulo(modId, modNome) {
  const docs = await q(`SELECT id FROM simulado_documentos WHERE tenant_id=$1 AND pasta_id=$2 AND deletado=false AND publicado=true`, [TID, modId])
  const aulaIds = docs.map(d => d.id); if (!aulaIds.length) return null
  const aulaSet = new Set(aulaIds)
  // quiz por doc
  const quiz = await q(`SELECT documento_id, questao_id FROM simulado_documento_quiz_questoes WHERE tenant_id=$1 AND deletado=false AND documento_id = ANY($2)`, [TID, aulaIds])
  const quizPorDoc = new Map(); for (const x of quiz) { if (!quizPorDoc.has(x.documento_id)) quizPorDoc.set(x.documento_id, new Set()); quizPorDoc.get(x.documento_id).add(x.questao_id) }
  // respostas (todas) — dia do ranking = MAX(respondido_em) por aula concluída
  const resp = await q(`SELECT estudante_id, documento_id, questao_id, respondido_em FROM simulado_leitura_respostas WHERE tenant_id=$1 AND documento_id = ANY($2)`, [TID, aulaIds])
  const porAluno = new Map()
  for (const r of resp) {
    const qd = quizPorDoc.get(r.documento_id); if (!qd || !qd.has(r.questao_id)) continue
    const a = porAluno.get(r.estudante_id) ?? porAluno.set(r.estudante_id, new Map()).get(r.estudante_id)
    const cell = a.get(r.documento_id) ?? a.set(r.documento_id, { ans: new Set(), ult: null }).get(r.documento_id)
    cell.ans.add(r.questao_id); if (r.respondido_em && (!cell.ult || r.respondido_em > cell.ult)) cell.ult = r.respondido_em
  }
  // ledger: meta.dia por (aluno, doc) — dia real imutável (origem='leitura')
  const ev = await q(`SELECT estudante_id, meta->>'documentoId' doc, meta->>'dia' dia FROM simulado_xp_eventos WHERE tenant_id=$1 AND origem='leitura' AND meta->>'documentoId' = ANY($2)`, [TID, aulaIds])
  const realPorAluno = new Map()
  for (const e of ev) { if (!aulaSet.has(e.doc) || !e.dia) continue; const m = realPorAluno.get(e.estudante_id) ?? realPorAluno.set(e.estudante_id, new Set()).get(e.estudante_id); m.add(e.dia) }

  const afetados = []
  for (const [eid, amap] of porAluno) {
    const rankDias = new Set()
    for (const [docId, cell] of amap) { const qs = quizPorDoc.get(docId); const feita = qs && qs.size > 0 && [...qs].every(x => cell.ans.has(x)); if (feita && cell.ult) rankDias.add(diaDe(cell.ult)) }
    const realDias = realPorAluno.get(eid) ?? new Set()
    const sr = streak(rankDias), st = streak(realDias)
    if (st.atual > sr.atual) afetados.push({ eid, rank: sr.atual, real: st.atual, diff: st.atual - sr.atual })
  }
  afetados.sort((a, b) => b.diff - a.diff)
  return { modNome, totalAlunos: porAluno.size, afetados }
}

try {
  // todos os módulos de leitura
  const mods = await q(`SELECT id, nome FROM simulado_pastas WHERE tenant_id=$1 AND folder_area='leitura' AND is_folder=true AND deletado=false ORDER BY nome`, [TID])
  console.log('hoje(BRT):', hoje, '| módulos de leitura:', mods.length, '\n')
  let totGlobal = 0
  for (const m of mods) {
    const r = await analisarModulo(m.id, m.nome)
    if (!r || !r.totalAlunos) continue
    console.log(`=== ${r.modNome} === alunos c/ atividade: ${r.totalAlunos} | AFETADOS (real>ranking): ${r.afetados.length}`)
    for (const a of r.afetados.slice(0, 8)) {
      const nome = (await q(`SELECT nome, email FROM simulado_estudantes WHERE id=$1`, [a.eid]))[0]
      console.log(`   ${nome?.nome} (${nome?.email}) ranking=${a.rank} → real=${a.real} (+${a.diff})`)
    }
    if (r.afetados.length > 8) console.log(`   … +${r.afetados.length - 8} outros`)
    totGlobal += r.afetados.length
  }
  console.log(`\nTOTAL de alunos afetados (todos os módulos): ${totGlobal}`)
} catch (e) { console.error('ERRO:', e.message) } finally { await pool.end() }
