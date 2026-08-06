import { readFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:H});return r.json()}

console.log('=== 13 simulados: titulo → banco_base_id ===')
const sims=await rest(`simulado_simulados?deletado=eq.false&select=id,titulo,regras,pasta_id`)
const bancoIds=new Set()
for(const s of sims){const b=s.regras?.banco_base_id||null; if(b)bancoIds.add(b); console.log(`  ${b?b.slice(0,8):'(sem banco)'} | ${s.titulo}`)}

console.log('\n=== bancos referenciados (simulado_pastas) ===')
if(bancoIds.size){const bs=await rest(`simulado_pastas?id=in.(${[...bancoIds].join(',')})&select=id,nome,pai_id,is_folder,folder_area`)
  for(const b of bs)console.log(`  ${b.id.slice(0,8)} | folder=${b.is_folder} area=${b.folder_area} pai=${b.pai_id?b.pai_id.slice(0,8):'-'} | ${b.nome}`)}

console.log('\n=== TODAS as pastas do Banco de Simulado (área banco): folder + hierarquia ===')
const todas=await rest(`simulado_pastas?deletado=eq.false&select=id,nome,pai_id,is_folder,folder_area&order=nome`)
const bancoArea=todas.filter(p=>p.folder_area==='banco'||p.folder_area==null)
console.log('  total área banco/legado:',bancoArea.length)
bancoArea.slice(0,40).forEach(p=>console.log(`  ${p.id.slice(0,8)} | folder=${p.is_folder} pai=${p.pai_id?p.pai_id.slice(0,8):'-'} area=${p.folder_area} | ${p.nome}`))

console.log('\n=== existe tabela de grupos de banco? ===')
for(const t of ['simulado_banco_grupos','simulado_pasta_grupos']){
  const r=await fetch(`${URL}/rest/v1/${t}?select=*&limit=2`,{headers:H});const j=await r.json()
  console.log(`  ${t}:`, r.ok?('cols='+Object.keys(j[0]||{}).join(',')+' | linhas amostra='+j.length):JSON.stringify(j).slice(0,80))}
