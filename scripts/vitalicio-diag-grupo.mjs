import { readFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:H});return r.json()}
const count=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:{...H,Prefer:'count=exact',Range:'0-0'}});return (r.headers.get('content-range')||'*/?').split('/')[1]}

console.log('=== TODAS as colunas dos grupos "Passaporte Vitalício" ===')
const gs=await rest(`simulado_grupos?nome=ilike.Passaporte Vitalício&select=*`)
for(const g of gs){console.log('---')
  for(const [k,v] of Object.entries(g)) if(v!==null && k!=='tenant_id') console.log(`  ${k}: ${v}`)
  console.log(`  → membros AGORA: ${await count(`simulado_grupo_membros?grupo_id=eq.${g.id}&select=id`)}`)
}
console.log('\n=== quem é filho do MESTRE 3735a5eb? (procurando coluna de parentesco) ===')
// tenta descobrir a coluna de vínculo pasta↔grupo
const amostra=(await rest(`simulado_grupos?select=*&limit=1`))[0]||{}
const cand=Object.keys(amostra).filter(k=>/pai|mestre|pasta|parent|folder/i.test(k))
console.log('  colunas candidatas a parentesco:', cand.join(', ')||'(nenhuma óbvia)')
for(const col of cand){
  const filhos=await rest(`simulado_grupos?${col}=eq.3735a5eb-286c-417b-97f4-d619c036cf88&select=id,nome,is_mestre`)
  if(Array.isArray(filhos)&&filhos.length){console.log(`  via ${col}: ${filhos.map(f=>f.id.slice(0,8)+' '+f.nome).join(' | ')}`)}
}
