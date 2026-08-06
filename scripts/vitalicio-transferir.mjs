import { readFileSync } from 'node:fs'
const APPLY=process.argv.includes('--apply')
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=async(p,init)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{...init,headers:{...H,...(init?.headers||{})}});const t=await r.text();return {ok:r.ok,status:r.status,j:t?JSON.parse(t):null}}
async function fetchAll(base){let out=[],from=0;for(;;){const r=await fetch(`${URL}/rest/v1/${base}`,{headers:{...H,Range:`${from}-${from+999}`}});const j=await r.json();if(!Array.isArray(j))break;out.push(...j);if(j.length<1000)break;from+=1000}return out}

// alvo: grupo "Passaporte Vitalício" NÃO-mestre
const alvoQ=(await rest(`simulado_grupos?nome=ilike.Passaporte Vitalício&is_mestre=eq.false&deletado=eq.false&select=id`)).j
const TARGET=alvoQ?.[0]?.id
console.log('grupo ALVO (Passaporte Vitalício, não-mestre):', TARGET)

// grupos-fonte (passaporte + vitalício, sem amostra/extensivo, exceto o próprio alvo)
const grs=(await rest(`simulado_grupos?nome=ilike.*vital*&deletado=eq.false&select=id,nome`)).j
const fontes=grs.filter(g=>/passaporte/i.test(g.nome)&&/vital/i.test(g.nome)&&!/amostra|extensivo/i.test(g.nome)&&g.id!==TARGET)
console.log('grupos-fonte:',fontes.map(f=>f.nome).join(' | '))
const fonteIds=fontes.map(f=>f.id)

const membros=await fetchAll(`simulado_grupo_membros?grupo_id=in.(${fonteIds.join(',')})&select=estudante_id&order=estudante_id`)
const distinct=[...new Set(membros.map(m=>m.estudante_id))]
// só os passaporte
const passaporteIds=[]
for(let i=0;i<distinct.length;i+=200){const chunk=distinct.slice(i,i+200)
  const es=(await rest(`simulado_estudantes?id=in.(${chunk.join(',')})&classificacao=eq.passaporte&select=id`)).j
  for(const e of (es||[]))passaporteIds.push(e.id)}
console.log(`distintos nos grupos-fonte: ${distinct.length} · passaporte (→transfere): ${passaporteIds.length}`)

// já membros do alvo
const jaAlvo=new Set((await fetchAll(`simulado_grupo_membros?grupo_id=eq.${TARGET}&select=estudante_id`)).map(m=>m.estudante_id))
const inserir=passaporteIds.filter(id=>!jaAlvo.has(id))
console.log(`a inserir no grupo alvo: ${inserir.length} (já membros: ${passaporteIds.length-inserir.length})`)

if(!APPLY){console.log('\n(DRY-RUN) nada foi escrito. Rode com --apply para aplicar.');process.exit(0)}

// 1) classificacao passaporte→vitalicio (chunks)
let upd=0
for(let i=0;i<passaporteIds.length;i+=150){const chunk=passaporteIds.slice(i,i+150)
  const r=await rest(`simulado_estudantes?id=in.(${chunk.join(',')})`,{method:'PATCH',headers:{'content-type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({classificacao:'vitalicio'})})
  if(r.ok)upd+=chunk.length; else console.error('  PATCH falhou',r.status,JSON.stringify(r.j).slice(0,120))}
console.log(`classificacao atualizada p/ vitalicio: ${upd}`)

// 2) inserir no grupo alvo (chunks)
const ten=(await rest(`simulado_grupos?id=eq.${TARGET}&select=tenant_id`)).j?.[0]?.tenant_id
let ins=0
for(let i=0;i<inserir.length;i+=200){const chunk=inserir.slice(i,i+200)
  const rows=chunk.map(estudante_id=>({tenant_id:ten,grupo_id:TARGET,estudante_id}))
  const r=await rest(`simulado_grupo_membros`,{method:'POST',headers:{'content-type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(rows)})
  if(r.ok)ins+=chunk.length; else console.error('  INSERT falhou',r.status,JSON.stringify(r.j).slice(0,120))}
console.log(`inseridos no grupo Passaporte Vitalício: ${ins}`)
