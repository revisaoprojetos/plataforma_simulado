import { readFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const count=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:{...H,Prefer:'count=exact',Range:'0-0'}});return (r.headers.get('content-range')||'*/?').split('/')[1]}
console.log('=== classificacao agora ===')
for(const c of ['vitalicio','passaporte','normal']) console.log(`  ${c}: ${await count(`simulado_estudantes?classificacao=eq.${c}&select=id`)}`)
console.log(`  (null): ${await count(`simulado_estudantes?classificacao=is.null&select=id`)}`)
console.log('grupo Vitalício (3acdecb8):', await count(`simulado_grupo_membros?grupo_id=eq.3acdecb8-7c38-489c-911c-ced18f36e3ca&select=id`),'membros')
console.log('grupo Passaporte (07fdf424):', await count(`simulado_grupo_membros?grupo_id=eq.07fdf424-49ff-4f80-894f-3d05d1d26e78&select=id`),'membros')
