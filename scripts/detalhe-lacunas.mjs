import { readFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const j = async (p) => (await fetch(`${URL}/rest/v1/${p}`, { headers: H }).then(r => r.json()))

// (título do simulado, estudante_id) das sessões apontadas pela varredura
const CASOS = [
  { sim: '20/07/2026 - Direito Administrativo', est: '689e6f7a-814b-47f0-8ef2-e4eea05968e5' },
  { sim: '20/07/2026 - Direito Tributário', est: 'f493a8a7-8ffb-422a-b620-37622becfc42' },
  { sim: '20/07/2026 - Direito Tributário', est: 'c67b32de-811c-4135-96e6-36821080e35d' },
  { sim: '23/07/2026 - Direito Ambiental', est: '48dcba11-147b-4782-af64-220203e3e0df' },
  { sim: '25/07/2026 - Direito Previdenciário Público', est: '07b029b3-85b9-4a08-b7f3-5d935a8883c9' },
]

for (const c of CASOS) {
  const sim = (await j(`simulado_simulados?titulo=eq.${encodeURIComponent(c.sim)}&deletado=eq.false&select=id`))[0]
  const est = (await j(`simulado_estudantes?id=eq.${c.est}&select=email,nome`))[0] ?? {}
  const sessArr = await j(`simulado_sessoes_prova?simulado_id=eq.${sim.id}&estudante_id=eq.${c.est}&status=eq.finalizada&deletado=eq.false&select=id,nota,iniciado_em,finalizado_em&order=finalizado_em.desc`)
  const s = sessArr[0]
  const pq = await j(`simulado_prova_questoes?simulado_id=eq.${sim.id}&select=questao_id,ordem&order=ordem`)
  const ordemDe = new Map(pq.map(r => [r.questao_id, r.ordem]))
  const resp = await j(`simulado_respostas_objetivas?sessao_id=eq.${s.id}&select=questao_id,respondido_em,correta`)
  const ords = new Set(resp.map(r => ordemDe.get(r.questao_id)))
  const maxOrd = Math.max(...ords)
  const gaps = []; for (let o = 0; o < maxOrd; o++) if (!ords.has(o)) gaps.push(o + 1)
  const ev = await j(`simulado_sessao_eventos?sessao_id=eq.${s.id}&select=tipo&order=criado_em`)
  const evCont = Array.isArray(ev) ? ev.reduce((m, e) => (m[e.tipo] = (m[e.tipo] || 0) + 1, m), {}) : { erro: true }
  const comTs = resp.filter(r => r.respondido_em).length
  console.log(`\n### ${c.sim}`)
  console.log(`   aluno: ${est.email ?? '(sem email)'} — ${est.nome ?? ''}`)
  console.log(`   sessão ${s.id} | nota ${s.nota} | respondeu ${ords.size}/${pq.length} | LACUNAS: ${gaps.join(', ')}`)
  console.log(`   respostas com carimbo de tempo: ${comTs}/${resp.length}`)
  console.log(`   eventos "respondeu" na sessão: ${evCont.respondeu ?? 0} (se > respostas salvas ⇒ marcou e NÃO salvou = perda)`)
  console.log(`   iniciou ${s.iniciado_em} → finalizou ${s.finalizado_em}`)
}
