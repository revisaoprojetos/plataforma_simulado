// Testa o algoritmo de sincronizarAlternativas contra uma questão real:
// pega as alternativas atuais, usa como "novas" e roda a reconciliação.
// Esperado: continua com o MESMO nº (atualiza no lugar, não multiplica).
// Uso: node scripts/testar-reconcile-alt.mjs <questao_id>
import { readFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const Q = process.argv[2]
if (!Q) { console.error('uso: node scripts/testar-reconcile-alt.mjs <questao_id>'); process.exit(1) }

const rest = (p, init) => fetch(`${URL}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })

async function count() {
  const r = await rest(`simulado_alternativas?questao_id=eq.${Q}&select=id`, { headers: { Prefer: 'count=exact', Range: '0-0' } })
  return (r.headers.get('content-range') || '*/?').split('/')[1]
}

// "novas" = snapshot atual das alternativas (mesmo texto/correta) — simula um save sem mudanças.
const atuais = await (await rest(`simulado_alternativas?questao_id=eq.${Q}&select=texto,correta,ordem&order=ordem`)).json()
const novas = atuais.map((a, i) => ({ texto: a.texto, correta: a.correta, ordem: i }))
console.log('antes:', await count(), '· novas:', novas.length)

// ── mesmo algoritmo do server (sincronizarAlternativas) ──
const tenant = (await (await rest(`simulado_questoes?id=eq.${Q}&select=tenant_id`)).json())[0].tenant_id
const existentes = await (await rest(`simulado_alternativas?questao_id=eq.${Q}&tenant_id=eq.${tenant}&select=id,ordem&order=id`)).json()
const porOrdem = new Map()
for (const e of existentes) { const arr = porOrdem.get(e.ordem) ?? []; arr.push(e.id); porOrdem.set(e.ordem, arr) }
const remover = []
let primeiraMantida = null
for (let i = 0; i < novas.length; i++) {
  const alt = novas[i]
  const daOrdem = porOrdem.get(i) ?? []
  if (daOrdem.length) {
    const keep = daOrdem[0]
    primeiraMantida = primeiraMantida ?? keep
    await rest(`simulado_alternativas?id=eq.${keep}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ texto: alt.texto, correta: alt.correta, ordem: i }) })
    for (const extra of daOrdem.slice(1)) {
      await rest(`simulado_respostas_objetivas?alternativa_id=eq.${extra}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ alternativa_id: keep }) })
      remover.push(extra)
    }
    porOrdem.delete(i)
  } else {
    const ins = await (await rest(`simulado_alternativas`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ tenant_id: tenant, questao_id: Q, texto: alt.texto, correta: alt.correta, ordem: i }) })).json()
    if (ins[0]?.id) primeiraMantida = primeiraMantida ?? ins[0].id
  }
}
for (const ids of porOrdem.values()) for (const s of ids) {
  if (primeiraMantida) await rest(`simulado_respostas_objetivas?alternativa_id=eq.${s}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ alternativa_id: primeiraMantida }) })
  remover.push(s)
}
if (remover.length) await rest(`simulado_alternativas?id=in.(${remover.join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })

console.log('depois:', await count(), '· removidas:', remover.length)
// roda de novo (idempotência): deve manter o mesmo nº
