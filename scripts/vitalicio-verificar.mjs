import { readFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const count=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:{...H,Prefer:'count=exact',Range:'0-0'}});return (r.headers.get('content-range')||'*/?').split('/')[1]}
console.log('=== classificacao agora ===')
for(const c of ['vitalicio','passaporte','normal']) console.log(`  ${c}: ${await count(`simulado_estudantes?classificacao=eq.${c}&select=id`)}`)
console.log(`  (null): ${await count(`simulado_estudantes?classificacao=is.null&select=id`)}`)
console.log('\n=== grupo "Passaporte Vitalício" (3acdecb8) membros ===', await count(`simulado_grupo_membros?grupo_id=eq.3acdecb8-7c38-489c-911c-ced18f36e3ca&select=id`))
console.log('=== grupo "Passaporte" (comum) ainda intacto? ===')
const gp=await (await fetch(`${URL}/rest/v1/simulado_grupos?nome=ilike.passaporte&is_mestre=eq.false&deletado=eq.false&select=id,nome`,{headers:H})).json()
for(const g of gp) console.log(`  ${g.nome}: ${await count(`simulado_grupo_membros?grupo_id=eq.${g.id}&select=id`)} membros`)
// amostra: um vitalício continua no grupo Passaporte?
const amostra=await (await fetch(`${URL}/rest/v1/simulado_grupo_membros?grupo_id=eq.3acdecb8-7c38-489c-911c-ced18f36e3ca&select=estudante_id&limit=1`,{headers:H})).json()
if(amostra[0]){const eid=amostra[0].estudante_id
  const emGP=await count(`simulado_grupo_membros?estudante_id=eq.${eid}&select=id`)
  console.log(`\n  (amostra) vitalício ${eid.slice(0,8)} está em ${emGP} grupos no total (não foi removido de nenhum)`)}
