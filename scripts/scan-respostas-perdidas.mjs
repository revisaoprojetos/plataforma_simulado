import { readFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const j = async (p) => (await fetch(`${URL}/rest/v1/${p}`, { headers: H }).then(r => r.json()))
const allBy = async (col, ids, base) => { let out = []; for (let i = 0; i < ids.length; i += 60) { const chunk = ids.slice(i, i + 60); let from = 0; for (;;) { const r = await fetch(`${URL}/rest/v1/${base}&${col}=in.(${chunk.join(',')})`, { headers: { ...H, Range: `${from}-${from + 999}` } }); const d = await r.json(); if (!Array.isArray(d)) break; out = out.concat(d); if (d.length < 1000) break; from += 1000 } } return out }

// Simulados a escanear: lote "6em7" (datas 2026 - Direito ...) + qualquer com "Constitucional".
const sims = await j(`simulado_simulados?deletado=eq.false&or=(titulo.ilike.*2026 - Direito*,titulo.ilike.*Constitucional*)&select=id,titulo&order=titulo`)
console.log(`escaneando ${sims.length} simulado(s)\n`)
const ests = await j(`simulado_estudantes?select=id,email`)
const emailDe = new Map(ests.map(e => [e.id, e.email]))

let totalSuspeitas = 0
for (const sim of sims) {
  const pq = await j(`simulado_prova_questoes?simulado_id=eq.${sim.id}&select=questao_id,ordem&order=ordem`)
  const ordemDe = new Map(pq.map(r => [r.questao_id, r.ordem]))
  const totalQ = pq.length
  if (!totalQ) continue
  const sess = await j(`simulado_sessoes_prova?simulado_id=eq.${sim.id}&is_teste=eq.false&status=eq.finalizada&deletado=eq.false&select=id,estudante_id,nota`)
  if (!sess.length) continue
  const sessIds = sess.map(s => s.id)
  const resp = await allBy('sessao_id', sessIds, `simulado_respostas_objetivas?select=sessao_id,questao_id`)
  const porSess = new Map()
  for (const r of resp) { const set = porSess.get(r.sessao_id) ?? new Set(); set.add(ordemDe.get(r.questao_id)); porSess.set(r.sessao_id, set) }
  const suspeitas = []
  for (const s of sess) {
    const ords = porSess.get(s.id) ?? new Set()
    if (!ords.size) continue // não respondeu nada → outro caso (não é "perda no meio")
    const maxOrd = Math.max(...ords)
    const gaps = []
    for (let o = 0; o < maxOrd; o++) if (!ords.has(o)) gaps.push(o + 1) // 1-indexed p/ exibir
    if (gaps.length) suspeitas.push({ email: emailDe.get(s.estudante_id) ?? s.estudante_id, respondidas: ords.size, total: totalQ, nota: s.nota, gaps })
  }
  if (suspeitas.length) {
    console.log(`### ${sim.titulo} — ${suspeitas.length} sessão(ões) com LACUNA (resposta perdida no meio):`)
    for (const x of suspeitas.sort((a, b) => b.gaps.length - a.gaps.length)) console.log(`   ${x.email} | resp ${x.respondidas}/${x.total} | nota ${x.nota} | lacunas nas questões: ${x.gaps.join(', ')}`)
    console.log('')
    totalSuspeitas += suspeitas.length
  }
}
console.log(`=== TOTAL: ${totalSuspeitas} sessão(ões) suspeitas de perda de resposta ===`)
