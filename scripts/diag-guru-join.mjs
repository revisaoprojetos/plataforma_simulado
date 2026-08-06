import { readFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:H});return r.json()}
async function fetchAll(base){let out=[],from=0;for(;;){const r=await fetch(`${URL}/rest/v1/${base}`,{headers:{...H,Range:`${from}-${from+999}`}});const j=await r.json();if(!Array.isArray(j))break;out.push(...j);if(j.length<1000)break;from+=1000}return out}
const ehVit=(n)=>{const s=(n||'').toLowerCase();return /vital[ií]cio/.test(s)&&/passaporte|\bpasse\b/.test(s)&&!/amostra/.test(s)}
const ehPass=(n)=>{const s=(n||'').toLowerCase();return /passaporte|\bpasse\b/.test(s)&&!/amostra/.test(s)}

console.log('=== amostra simulado_assinaturas ==='); 
const aS=await rest(`simulado_assinaturas?select=provider,produto_ref,status&limit=5`)
console.log(JSON.stringify(aS,null,0).slice(0,400))
console.log('\n=== amostra mapeamentos (provider,fonte_ref,fonte_nome) ===')
const mS=await rest(`simulado_integracao_mapeamentos?select=provider,fonte_ref,fonte_nome&limit=5`)
console.log(JSON.stringify(mS,null,0).slice(0,500))

const maps=await rest(`simulado_integracao_mapeamentos?select=provider,fonte_ref,fonte_nome,classificacao&limit=2000`)
const mapByRef=new Map(maps.map(m=>[`${m.provider}|${m.fonte_ref}`,m]))
const assin=await fetchAll(`simulado_assinaturas?status=eq.ativo&select=estudante_id,provider,produto_ref`)
let comMap=0,semMap=0,vit=0,pass=0
const estVit=new Set(),estPass=new Set()
for(const a of assin){const m=mapByRef.get(`${a.provider}|${a.produto_ref}`)
  if(m)comMap++; else {semMap++;continue}
  const nome=m.fonte_nome, c=ehVit(nome)||m.classificacao==='vitalicio'?'vit':(ehPass(nome)||m.classificacao==='passaporte')?'pass':'normal'
  if(c==='vit'){vit++;estVit.add(a.estudante_id)} else if(c==='pass'){pass++;estPass.add(a.estudante_id)}}
console.log(`\n=== JOIN assinaturas ativas (${assin.length}) × mapeamentos ===`)
console.log(`  com mapeamento: ${comMap} · SEM mapeamento: ${semMap}`)
console.log(`  assinaturas→vitalicio: ${vit} · →passaporte: ${pass}`)
console.log(`  estudantes distintos com Guru ativo VITALÍCIO: ${estVit.size} · PASSAPORTE: ${estPass.size}`)
