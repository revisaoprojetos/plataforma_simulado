import { readFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:H});return r.json()}
const count=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:{...H,Prefer:'count=exact',Range:'0-0'}});return (r.headers.get('content-range')||'*/0').split('/')[1]}

console.log('=== simulado_assinaturas: colunas + status ===')
const aS=await rest(`simulado_assinaturas?select=*&limit=2`); console.log('  cols:',Object.keys(aS[0]||{}).join(','))
for(const s of ['ativo','cancelado','expirado','reembolsado']) console.log(`  status=${s}: ${await count(`simulado_assinaturas?status=eq.${s}&select=id`)}`)
console.log('  com expira_em preenchido:', await count(`simulado_assinaturas?expira_em=not.is.null&select=id`))
const exSample=await rest(`simulado_assinaturas?expira_em=not.is.null&select=produto_ref,status,expira_em&order=expira_em.desc&limit=3`)
console.log('  amostra expira_em:',JSON.stringify(exSample))

console.log('\n=== simulado_matriculas existe? colunas + status/validade ===')
const mS=await rest(`simulado_matriculas?select=*&limit=2`)
if(Array.isArray(mS)){console.log('  cols:',Object.keys(mS[0]||{}).join(',')||'(vazia)')
  console.log('  total:', await count(`simulado_matriculas?select=id`))
  for(const s of ['ativa','expirada','cancelada']) console.log(`  status=${s}: ${await count(`simulado_matriculas?status=eq.${s}&select=id`)}`)
  console.log('  validade < hoje:', await count(`simulado_matriculas?validade=lt.2026-07-24&select=id`))
} else console.log('  ->',JSON.stringify(mS).slice(0,120))

console.log('\n=== grupos PASSAPORTE (não-vitalício) com prazo no nome + membros ===')
const grs=await rest(`simulado_grupos?nome=ilike.*passaporte*&deletado=eq.false&is_mestre=eq.false&select=id,nome`)
const pass=grs.filter(g=>!/vital/i.test(g.nome))
let tot=0
for(const g of pass){const n=+(await count(`simulado_grupo_membros?grupo_id=eq.${g.id}&select=id`));tot+=n
  if(n>0)console.log(`  ${String(n).padStart(4)}  ${g.nome}`)}
console.log(`  (grupos passaporte não-vitalício: ${pass.length}, soma de membros-linha: ${tot})`)
