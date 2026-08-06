import { readFileSync } from 'node:fs'
const APPLY=process.argv.includes('--apply')
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=async(p,init)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{...init,headers:{...H,...(init?.headers||{})}});const t=await r.text();return {ok:r.ok,status:r.status,j:t?JSON.parse(t):null}}
async function fetchAll(base){let out=[],from=0;for(;;){const r=await fetch(`${URL}/rest/v1/${base}`,{headers:{...H,Range:`${from}-${from+999}`}});const j=await r.json();if(!Array.isArray(j))break;out.push(...j);if(j.length<1000)break;from+=1000}return out}

// grupos-fonte vitalício (reais) e alvos
const grs=(await rest(`simulado_grupos?nome=ilike.*vital*&deletado=eq.false&select=id,nome`)).j
const fontes=grs.filter(g=>/passaporte/i.test(g.nome)&&/vital/i.test(g.nome)&&!/amostra|extensivo/i.test(g.nome))
const G_VIT=(await rest(`simulado_grupos?nome=ilike.Passaporte Vitalício&is_mestre=eq.false&deletado=eq.false&select=id`)).j?.[0]?.id
const G_PASS=(await rest(`simulado_grupos?nome=ilike.passaporte&is_mestre=eq.false&deletado=eq.false&select=id`)).j?.[0]?.id
console.log('alvo Vitalício:',G_VIT,'| alvo Passaporte:',G_PASS)
const fonteIds=fontes.map(f=>f.id).filter(id=>id!==G_VIT)

const membros=await fetchAll(`simulado_grupo_membros?grupo_id=in.(${fonteIds.join(',')})&select=estudante_id&order=estudante_id`)
const distinct=[...new Set(membros.map(m=>m.estudante_id))]
// alvo: em grupo vitalício e classificacao != vitalicio (normal/null)
const alvo=[]
for(let i=0;i<distinct.length;i+=200){const chunk=distinct.slice(i,i+200)
  const es=(await rest(`simulado_estudantes?id=in.(${chunk.join(',')})&classificacao=neq.vitalicio&select=id,classificacao`)).j
  // neq.vitalicio não pega null → busca null à parte
  for(const e of (es||[]))alvo.push(e.id)
  const esn=(await rest(`simulado_estudantes?id=in.(${chunk.join(',')})&classificacao=is.null&select=id`)).j
  for(const e of (esn||[]))alvo.push(e.id)}
const alvoU=[...new Set(alvo)]
console.log(`distintos em grupos vitalício: ${distinct.length} · alvo (normal/null → vitalicio): ${alvoU.length}`)

const jaVit=new Set((await fetchAll(`simulado_grupo_membros?grupo_id=eq.${G_VIT}&select=estudante_id`)).map(m=>m.estudante_id))
const jaPass=new Set((await fetchAll(`simulado_grupo_membros?grupo_id=eq.${G_PASS}&select=estudante_id`)).map(m=>m.estudante_id))
const insVit=alvoU.filter(id=>!jaVit.has(id)), insPass=alvoU.filter(id=>!jaPass.has(id))
console.log(`a inserir no grupo Vitalício: ${insVit.length} · no grupo Passaporte: ${insPass.length}`)

if(!APPLY){console.log('\n(DRY-RUN) nada escrito. --apply para aplicar.');process.exit(0)}
const ten=(await rest(`simulado_grupos?id=eq.${G_VIT}&select=tenant_id`)).j?.[0]?.tenant_id
let upd=0
for(let i=0;i<alvoU.length;i+=150){const c=alvoU.slice(i,i+150)
  const r=await rest(`simulado_estudantes?id=in.(${c.join(',')})`,{method:'PATCH',headers:{'content-type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({classificacao:'vitalicio'})});if(r.ok)upd+=c.length;else console.error('PATCH',r.status)}
console.log('reclassificados vitalicio:',upd)
const inserir=async(gid,ids)=>{let n=0;for(let i=0;i<ids.length;i+=200){const c=ids.slice(i,i+200);const rows=c.map(estudante_id=>({tenant_id:ten,grupo_id:gid,estudante_id}));const r=await rest(`simulado_grupo_membros`,{method:'POST',headers:{'content-type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(rows)});if(r.ok)n+=c.length;else console.error('INS',r.status,JSON.stringify(r.j).slice(0,100))}return n}
console.log('inseridos no Vitalício:',await inserir(G_VIT,insVit))
console.log('inseridos no Passaporte:',await inserir(G_PASS,insPass))
