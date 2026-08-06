import { readFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:H});return r.json()}
const count=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:{...H,Prefer:'count=exact',Range:'0-0'}});return (r.headers.get('content-range')||'*/?').split('/')[1]}

console.log('=== GRUPOS "vital" (destino real dos vitalícios) — membros ===')
const grp=await rest(`simulado_grupos?nome=ilike.*vital*&deletado=eq.false&select=id,nome`)
const gids=[]
for(const g of grp){gids.push(g.id); const n=await count(`simulado_grupo_membros?grupo_id=eq.${g.id}&select=id`); console.log(`  ${g.id.slice(0,8)} | ${g.nome} → ${n} membros`)}

console.log('\n=== estudantes DISTINTOS nesses grupos ===')
const membros=await rest(`simulado_grupo_membros?grupo_id=in.(${gids.join(',')})&select=estudante_id&limit=10000`)
const dist=[...new Set(membros.map(m=>m.estudante_id))]
console.log(`  distintos: ${dist.size}`)
// quantos deles hoje são 'passaporte' vs outros
let pass=0,outro=0
for(let i=0;i<dist.length;i+=200){const chunk=dist.slice(i,i+200)
  const es=await rest(`simulado_estudantes?id=in.(${chunk.join(',')})&select=id,classificacao`)
  for(const e of es){ if(e.classificacao==='passaporte')pass++; else outro++ }}
console.log(`  desses, classif atual: passaporte=${pass} · outro/null=${outro}`)

console.log('\n=== mapeamentos Guru "vital" (nome completo) ===')
const maps=await rest(`simulado_integracao_mapeamentos?fonte_nome=ilike.*vital*&select=fonte_nome,classificacao,ativo`)
maps.forEach(m=>console.log(`  "${m.fonte_nome}" → ${m.classificacao||'(auto)'} ${m.ativo?'':'[inativo]'}`))
