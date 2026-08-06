// Lista as questões do PGE/RS que MENCIONAM "sublinhad" (dependem de sublinhado) e mostra
// se têm alguma marcação (<u> ou __). Uso: node scripts/diag-sublinhado-mencao.mjs
import { readFileSync } from 'node:fs'
const SIM = 'e17cae0a-db46-4563-b2ad-dcc16c8ec367'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const rest = (p) => fetch(`${URL}/rest/v1/${p}`, { headers: H }).then((r) => r.json())
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }

;(async () => {
  const vinc = await rest(`simulado_prova_questoes?simulado_id=eq.${SIM}&select=questao_id,ordem&order=ordem`)
  const ord = new Map(vinc.map((v, i) => [v.questao_id, v.ordem ?? i + 1]))
  const qids = [...new Set(vinc.map((v) => v.questao_id))]
  let questoes = []
  for (const g of chunk(qids, 80)) questoes = questoes.concat(await rest(`simulado_questoes?id=in.(${g.join(',')})&select=id,numero,enunciado`))
  let alts = []
  for (const g of chunk(qids, 80)) alts = alts.concat(await rest(`simulado_alternativas?questao_id=in.(${g.join(',')})&select=questao_id,texto,ordem&order=ordem`))
  const altsPorQ = {}
  for (const a of alts) (altsPorQ[a.questao_id] ??= []).push(a)

  const menciona = questoes.filter((q) => /sublinh/i.test(q.enunciado || ''))
    .sort((a, b) => (ord.get(a.id) - ord.get(b.id)))
  console.log('Questões que mencionam "sublinhad":', menciona.length, '\n')
  for (const q of menciona) {
    const temU = /<u>|__[^_\n]+__/.test(q.enunciado || '')
    const altsU = (altsPorQ[q.id] || []).filter((a) => /<u>|__[^_\n]+__/.test(a.texto || '')).length
    console.log(`— ordem ${ord.get(q.id)} (nº ${q.numero}) | enunciado tem marca: ${temU} | alts c/ marca: ${altsU}/${(altsPorQ[q.id]||[]).length}`)
    console.log('   ', (q.enunciado || '').replace(/\n/g, ' ').slice(0, 160))
  }
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1) })
