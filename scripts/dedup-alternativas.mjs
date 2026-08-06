// De-dup de alternativas duplicadas de UMA questão: mantém 1 por (ordem+texto), apaga o resto.
// Uso: node scripts/dedup-alternativas.mjs <questao_id>
import { readFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const Q = process.argv[2]
if (!Q) { console.error('uso: node scripts/dedup-alternativas.mjs <questao_id>'); process.exit(1) }

const r = await fetch(`${URL}/rest/v1/simulado_alternativas?questao_id=eq.${Q}&select=id,ordem,texto,correta&order=id`, { headers: H })
const alts = await r.json()
const keepDe = new Map() // chave (ordem|texto) -> id que fica
const repoint = []        // { dupId, keepId }
for (const a of alts) {
  const chave = `${a.ordem}|${a.texto}`
  if (keepDe.has(chave)) repoint.push({ dupId: a.id, keepId: keepDe.get(chave) })
  else keepDe.set(chave, a.id)
}
console.log(`total: ${alts.length} · manter: ${keepDe.size} · apagar: ${repoint.length}`)

// 1) Re-aponta respostas dos duplicados para a alternativa que fica (idêntica → lossless).
for (const { dupId, keepId } of repoint) {
  const p = await fetch(`${URL}/rest/v1/simulado_respostas_objetivas?alternativa_id=eq.${dupId}`, {
    method: 'PATCH', headers: { ...H, 'content-type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ alternativa_id: keepId }),
  })
  if (!p.ok) console.error('  re-aponta falhou p/', dupId.slice(0, 8), p.status, (await p.text()).slice(0, 100))
}

// 2) Agora apaga os duplicados (já sem referências).
const apagar = repoint.map((x) => x.dupId)
for (let i = 0; i < apagar.length; i += 100) {
  const chunk = apagar.slice(i, i + 100)
  const d = await fetch(`${URL}/rest/v1/simulado_alternativas?id=in.(${chunk.join(',')})`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } })
  if (!d.ok) console.error('  delete falhou:', d.status, (await d.text()).slice(0, 120))
}
const r2 = await fetch(`${URL}/rest/v1/simulado_alternativas?questao_id=eq.${Q}&select=id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } })
console.log('restaram:', (r2.headers.get('content-range') || '*/?').split('/')[1])
