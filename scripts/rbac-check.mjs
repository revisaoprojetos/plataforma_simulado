import { readFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local','utf8')
const get = k => (env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: 'Bearer '+KEY }
const r = await fetch(URL+'/rest/v1/simulado_permissions?select=id,resource,action', { headers: H })
console.log('HTTP', r.status)
const d = await r.json()
if(!Array.isArray(d)){ console.log('BODY', JSON.stringify(d).slice(0,300)); process.exit(0) }
console.log('total rows:', d.length)
const g = {}
for(const p of d){ const k=p.resource+':'+p.action; g[k]=(g[k]||0)+1 }
const dups = Object.entries(g).filter(([,n])=>n>1)
console.log('distinct keys:', Object.keys(g).length, '| keys duplicated:', dups.length)
console.log('sample:', dups.slice(0,4))
