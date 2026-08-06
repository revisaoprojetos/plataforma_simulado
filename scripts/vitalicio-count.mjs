import { readFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
// grupos Passaporte-Vitalício "de verdade" (sem Amostra, sem Extensivo)
const GRUPOS=['745c1010','2811f6db','15859105','fcaac653','558e24a3'] // prefixos
// resolver ids completos
const g=await (await fetch(`${URL}/rest/v1/simulado_grupos?nome=ilike.*vital*&deletado=eq.false&select=id,nome`,{headers:H})).json()
const alvo=g.filter(x=>/passaporte.*vital|vital.*passaporte|^passaporte vital/i.test(x.nome) && !/amostra/i.test(x.nome))
console.log('Grupos considerados vitalício:'); alvo.forEach(x=>console.log('  -',x.nome))
const ids=alvo.map(x=>x.id)
// fetchAll paginado dos membros
async function fetchAll(){let out=[],from=0;for(;;){const r=await fetch(`${URL}/rest/v1/simulado_grupo_membros?grupo_id=in.(${ids.join(',')})&select=estudante_id&order=estudante_id`,{headers:{...H,Range:`${from}-${from+999}`}});const j=await r.json();out.push(...j);if(j.length<1000)break;from+=1000}return out}
const membros=await fetchAll()
const dist=[...new Set(membros.map(m=>m.estudante_id))]
console.log(`\nLinhas de membro: ${membros.length} · Estudantes DISTINTOS: ${dist.length}`)
// classificação atual desses distintos
let pass=0,normal=0,nul=0,outro=0
for(let i=0;i<dist.length;i+=200){const chunk=dist.slice(i,i+200)
  const es=await (await fetch(`${URL}/rest/v1/simulado_estudantes?id=in.(${chunk.join(',')})&select=classificacao`,{headers:H})).json()
  for(const e of es){const c=e.classificacao; if(c==='passaporte')pass++; else if(c==='normal')normal++; else if(c==null)nul++; else outro++}}
console.log(`Classif atual desses vitalícios: passaporte=${pass} · normal=${normal} · null=${nul} · outro=${outro}`)
console.log(`\n→ Transferir passaporte→vitalicio afetaria ~${pass} estudantes (os que já são passaporte).`)
