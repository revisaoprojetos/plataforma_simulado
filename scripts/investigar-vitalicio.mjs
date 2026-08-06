import { readFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:H});const j=await r.json();return {ok:r.ok,j}}
const count=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:{...H,Prefer:'count=exact',Range:'0-0'}});return (r.headers.get('content-range')||'*/?').split('/')[1]}

console.log('=== grupos (contendo passaporte/vital OU recentes) ===')
let g=await rest(`simulado_grupos?or=(nome.ilike.*passaporte*,nome.ilike.*vital*)&select=id,nome,is_mestre,deletado&limit=30`)
if(!Array.isArray(g.j)){console.log(' ERRO:',JSON.stringify(g.j).slice(0,200))}
else g.j.forEach(x=>console.log(`  ${x.id.slice(0,8)} | del=${x.deletado} mestre=${x.is_mestre} | ${x.nome}`))

console.log('\n=== pastas (contendo passaporte/vital) ===')
let p=await rest(`simulado_pastas?or=(nome.ilike.*passaporte*,nome.ilike.*vital*)&select=id,nome,folder_area&limit=30`)
if(!Array.isArray(p.j))console.log(' ERRO:',JSON.stringify(p.j).slice(0,200))
else p.j.forEach(x=>console.log(`  ${x.id.slice(0,8)} | area=${x.folder_area||'-'} | ${x.nome}`))

console.log('\n=== classificacao (estudantes) ===')
for(const c of ['passaporte','normal','vitalicio']) console.log(`  ${c}: ${await count(`simulado_estudantes?classificacao=eq.${c}&select=id`)}`)
console.log(`  (null): ${await count(`simulado_estudantes?classificacao=is.null&select=id`)}`)
console.log(`  TOTAL: ${await count(`simulado_estudantes?select=id`)}`)

console.log('\n=== mapeamentos de integração ===')
let m=await rest(`simulado_integracao_mapeamentos?select=provider,fonte_ref,fonte_nome,classificacao,grupo_id,pasta_id,ativo&limit=100`)
if(!Array.isArray(m.j))console.log(' ERRO/vazio:',JSON.stringify(m.j).slice(0,200))
else if(!m.j.length)console.log('  (nenhum mapeamento)')
else m.j.forEach(x=>console.log(`  [${x.provider}] "${(x.fonte_nome||x.fonte_ref||'').slice(0,40)}" → classif=${x.classificacao||'(auto)'} grupo=${x.grupo_id?'sim':'-'} pasta=${x.pasta_id?'sim':'-'} ${x.ativo?'':'[inativo]'}`))
