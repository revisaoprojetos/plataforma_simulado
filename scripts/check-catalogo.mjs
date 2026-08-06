import { readFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:H});return r.json()}
const pastas=await rest(`simulado_pastas?is_folder=eq.true&folder_area=eq.simulado&deletado=eq.false&select=id,nome`)
console.log('pastas de simulado (folder_area=simulado):', Array.isArray(pastas)?pastas.length:pastas)
if(Array.isArray(pastas)) pastas.slice(0,15).forEach(p=>console.log('  -',p.nome))
const sims=await rest(`simulado_simulados?deletado=eq.false&select=id,pasta_id`)
if(Array.isArray(sims)){const comPasta=sims.filter(s=>s.pasta_id).length
  console.log(`\nsimulados: ${sims.length} · com pasta_id: ${comPasta} · sem pasta: ${sims.length-comPasta}`)}
