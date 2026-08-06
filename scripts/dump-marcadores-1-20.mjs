// Mostra TODOS os marcadores **...** (negrito) e <u>...</u> das questões 1..20 do PGE/RS,
// para decidir quais representam SUBLINHADO. Uso: node scripts/dump-marcadores-1-20.mjs
import { readFileSync } from 'node:fs'
const SIM = 'e17cae0a-db46-4563-b2ad-dcc16c8ec367'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const rest = (p) => fetch(`${URL}/rest/v1/${p}`, { headers: H }).then((r) => r.json())
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
const marcas = (s) => [...(s || '').matchAll(/\*\*([\s\S]+?)\*\*/g)].map((m) => m[1])
const us = (s) => [...(s || '').matchAll(/<u>([\s\S]+?)<\/u>/g)].map((m) => m[1])

;(async () => {
  const vinc = (await rest(`simulado_prova_questoes?simulado_id=eq.${SIM}&select=questao_id,ordem&order=ordem`)).slice(0, 20)
  const qids = vinc.map((v) => v.questao_id)
  let questoes = []; for (const g of chunk(qids, 80)) questoes = questoes.concat(await rest(`simulado_questoes?id=in.(${g.join(',')})&select=id,numero,enunciado`))
  let alts = []; for (const g of chunk(qids, 80)) alts = alts.concat(await rest(`simulado_alternativas?questao_id=in.(${g.join(',')})&select=id,questao_id,texto,ordem&order=ordem`))
  const byId = new Map(questoes.map((q) => [q.id, q]))
  const altsPorQ = {}; for (const a of alts) (altsPorQ[a.questao_id] ??= []).push(a)

  for (let i = 0; i < vinc.length; i++) {
    const q = byId.get(vinc[i].questao_id); if (!q) continue
    const mE = marcas(q.enunciado), uE = us(q.enunciado)
    const alist = altsPorQ[q.id] || []
    const mA = alist.flatMap((a) => marcas(a.texto)), uA = alist.flatMap((a) => us(a.texto))
    if (!mE.length && !mA.length && !uE.length && !uA.length) continue
    const menc = /sublinh/i.test(q.enunciado || '')
    console.log(`\n== ordem ${vinc[i].ordem} | nº ${q.numero} | menciona sublinhado: ${menc} ==`)
    if (mE.length) console.log('  enun **negrito**:', JSON.stringify(mE))
    if (uE.length) console.log('  enun <u>:', JSON.stringify(uE))
    alist.forEach((a, idx) => {
      const m = marcas(a.texto), u = us(a.texto)
      if (m.length || u.length) console.log(`  alt ${String.fromCharCode(65 + idx)}: **=${JSON.stringify(m)} <u>=${JSON.stringify(u)}  ::  ${(a.texto||'').replace(/\n/g,' ').slice(0,90)}`)
    })
  }
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1) })
