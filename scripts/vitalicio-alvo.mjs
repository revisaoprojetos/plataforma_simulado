import { readFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:H});const j=await r.json();return Array.isArray(j)?j:[]}
const count=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:{...H,Prefer:'count=exact',Range:'0-0'}});return +((r.headers.get('content-range')||'*/0').split('/')[1])}

console.log('=== TODOS os grupos "*vital*" — id, membros, is_mestre, pastas vinculadas ===')
const grs=await rest(`simulado_grupos?nome=ilike.*vital*&deletado=eq.false&select=id,nome,is_mestre`)
for(const g of grs){
  const n=await count(`simulado_grupo_membros?grupo_id=eq.${g.id}&select=id`)
  const links=await rest(`simulado_pasta_grupos?grupo_id=eq.${g.id}&select=pasta_id`)
  const tag=/amostra/i.test(g.nome)?'[AMOSTRA]':/extensivo/i.test(g.nome)?'[EXTENSIVO]':g.nome.trim().toLowerCase()==='passaporte vitalício'?'[ALVO?]':'[FONTE]'
  console.log(`  ${g.id} | membros=${String(n).padStart(4)} | mestre=${g.is_mestre} | pastas=${links.length} ${tag} ${g.nome}`)
}
