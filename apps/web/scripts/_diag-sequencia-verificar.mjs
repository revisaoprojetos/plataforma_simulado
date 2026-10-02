// SOMENTE LEITURA — verifica se o fix (streak por dia imutável do ledger) cobre TODOS os casos.
// Por aluno do módulo: streak ANTIGO (MAX respondido_em) × NOVO (ledger p/ quem tem evento, senão
// respostas) × check-in GLOBAL (simulado_gamificacao_estudante.streak_atual). Sinaliza quem CONTINUA
// quebrado (sem cobertura do ledger + sinais de refazimento: 2+ aulas no mesmo dia-resposta).
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
  const dias = [...dset].sort(); let run = 0, prev = ''
  for (const d of dias) { const c = !!prev && Date.parse(d + 'T00:00:00Z') - Date.parse(prev + 'T00:00:00Z') === 86400000; run = c ? run + 1 : 1; prev = d }
  const ult = dias[dias.length - 1] ?? ''
  return (ult === hoje || ult === ontem) ? run : 0
}

async function verificarModulo(modId, modNome) {
  const docs = await q(`SELECT id FROM simulado_documentos WHERE tenant_id=$1 AND pasta_id=$2 AND deletado=false AND publicado=true`, [TID, modId])
  const aulaIds = docs.map(d => d.id); if (!aulaIds.length) return
  const quiz = await q(`SELECT documento_id, questao_id FROM simulado_documento_quiz_questoes WHERE tenant_id=$1 AND deletado=false AND documento_id = ANY($2)`, [TID, aulaIds])
  const quizPorDoc = new Map(); for (const x of quiz) { if (!quizPorDoc.has(x.documento_id)) quizPorDoc.set(x.documento_id, new Set()); quizPorDoc.get(x.documento_id).add(x.questao_id) }
  const resp = await q(`SELECT estudante_id, documento_id, questao_id, respondido_em FROM simulado_leitura_respostas WHERE tenant_id=$1 AND documento_id = ANY($2)`, [TID, aulaIds])
  const porAluno = new Map()
  for (const r of resp) {
    const qd = quizPorDoc.get(r.documento_id); if (!qd || !qd.has(r.questao_id)) continue
    const a = porAluno.get(r.estudante_id) ?? porAluno.set(r.estudante_id, new Map()).get(r.estudante_id)
    const cell = a.get(r.documento_id) ?? a.set(r.documento_id, { ans: new Set(), ult: null }).get(r.documento_id)
    cell.ans.add(r.questao_id); if (r.respondido_em && (!cell.ult || r.respondido_em > cell.ult)) cell.ult = r.respondido_em
  }
  // ledger (fix): dia imutável por aluno
  const led = await q(`SELECT estudante_id, array_agg(DISTINCT meta->>'dia') dias FROM simulado_xp_eventos WHERE tenant_id=$1 AND origem='leitura' AND ref_id LIKE 'quiz:%' AND meta->>'documentoId' = ANY($2::text[]) AND meta->>'dia' IS NOT NULL GROUP BY estudante_id`, [TID, aulaIds])
  const ledPorAluno = new Map(led.map(r => [r.estudante_id, new Set((r.dias ?? []).filter(Boolean))]))
  // global check-in
  const ids = [...porAluno.keys()]
  const gl = ids.length ? await q(`SELECT estudante_id, streak_atual FROM simulado_gamificacao_estudante WHERE tenant_id=$1 AND estudante_id = ANY($2)`, [TID, ids]) : []
  const globalDe = new Map(gl.map(r => [r.estudante_id, Number(r.streak_atual ?? 0)]))

  let corrigidos = 0; const aindaQuebrados = []; const semLedgerOk = []
  for (const [eid, amap] of porAluno) {
    const rankDias = new Set(); const porDiaResp = {}
    for (const [docId, cell] of amap) { const qs = quizPorDoc.get(docId); const feita = qs && qs.size > 0 && [...qs].every(x => cell.ans.has(x)); if (feita && cell.ult) { const d = diaDe(cell.ult); rankDias.add(d); porDiaResp[d] = (porDiaResp[d] || 0) + 1 } }
    const old = streak(rankDias)
    const temLedger = ledPorAluno.has(eid)
    const novo = streak(temLedger ? ledPorAluno.get(eid) : rankDias)
    const colisao = Object.values(porDiaResp).some(n => n >= 2) // 2+ aulas no mesmo dia-resposta = sinal de refazimento
    if (novo > old) corrigidos++
    // AINDA quebrado = sem cobertura do ledger E com sinal de refazimento (colisão) E streak novo baixo vs global
    if (!temLedger && colisao) aindaQuebrados.push({ eid, old, novo, global: globalDe.get(eid) ?? 0 })
    else if (!temLedger && (globalDe.get(eid) ?? 0) > novo + 1) semLedgerOk.push({ eid, novo, global: globalDe.get(eid) ?? 0 })
  }
  console.log(`=== ${modNome} === alunos: ${porAluno.size} | corrigidos p/ ledger: ${corrigidos} | com cobertura ledger: ${ledPorAluno.size}`)
  console.log(`  AINDA QUEBRADOS (sem ledger + refazimento): ${aindaQuebrados.length}`)
  for (const a of aindaQuebrados) { const e = (await q(`SELECT nome,email FROM simulado_estudantes WHERE id=$1`, [a.eid]))[0]; console.log(`    ${e?.nome} (${e?.email}) antigo=${a.novo} global=${a.global}`) }
  if (semLedgerOk.length) {
    console.log(`  Sem ledger mas global>streak (checar — pode ser multi-módulo): ${semLedgerOk.length}`)
    for (const a of semLedgerOk.slice(0, 10)) { const e = (await q(`SELECT nome,email FROM simulado_estudantes WHERE id=$1`, [a.eid]))[0]; console.log(`    ${e?.nome} (${e?.email}) streak=${a.novo} global=${a.global}`) }
  }
}

try {
  console.log('hoje(BRT):', hoje, '\n')
  const mods = await q(`SELECT id, nome FROM simulado_pastas WHERE tenant_id=$1 AND folder_area='leitura' AND is_folder=true AND deletado=false ORDER BY nome`, [TID])
  for (const m of mods) await verificarModulo(m.id, m.nome)
} catch (e) { console.error('ERRO:', e.message) } finally { await pool.end() }
