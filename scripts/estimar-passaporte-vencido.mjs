import { readFileSync, writeFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:H});return r.json()}
async function fetchAll(base){let out=[],from=0;for(;;){const r=await fetch(`${URL}/rest/v1/${base}`,{headers:{...H,Range:`${from}-${from+999}`}});const j=await r.json();if(!Array.isArray(j))break;out.push(...j);if(j.length<1000)break;from+=1000}return out}
const HOJE=Date.UTC(2026,6,24) // 2026-07-24
const MES={janeiro:0,fevereiro:1,marco:2,'março':2,abril:3,maio:4,junho:5,julho:6,agosto:7,setembro:8,outubro:9,novembro:10,dezembro:11}
// estima expiração pelo nome da turma. Regra: data-turma + duração ("+X meses/anos"; "N anos"; default 12 meses).
function expiraEm(nome){const s=nome.toLowerCase()
  const mm=s.match(/(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:de\s*)?(20\d\d)/)
  if(!mm) return null // sem data → não dá pra estimar (ex.: grupo "Passaporte" agregador)
  const base=Date.UTC(+mm[2], MES[mm[1]]??0, 1)
  let meses=12 // default
  const md=s.match(/(\d+)\s*(m[eê]s|meses|ano|anos)/); if(md){meses=+md[1]*(/ano/.test(md[2])?12:1)}
  const d=new Date(base); d.setUTCMonth(d.getUTCMonth()+meses); return d.getTime()
}
const grs=(await rest(`simulado_grupos?nome=ilike.*passaporte*&deletado=eq.false&is_mestre=eq.false&select=id,nome`)).filter(g=>!/vital|amostra/i.test(g.nome))
const expiradas=[],validas=[],semData=[]
for(const g of grs){const e=expiraEm(g.nome)
  if(e===null){semData.push(g)} else if(e<HOJE){expiradas.push({...g,exp:new Date(e).toISOString().slice(0,7)})} else validas.push({...g,exp:new Date(e).toISOString().slice(0,7)})}

const memb=async(ids)=> new Set((await fetchAll(`simulado_grupo_membros?grupo_id=in.(${ids.join(',')})&select=estudante_id`)).map(m=>m.estudante_id))
const inExp = expiradas.length? await memb(expiradas.map(g=>g.id)) : new Set()
const inVal = validas.length? await memb(validas.map(g=>g.id)) : new Set()

// vitalícios (nunca expiram)
const vitG=(await rest(`simulado_grupos?nome=ilike.*vital*&deletado=eq.false&select=id,nome`)).filter(g=>/passaporte/i.test(g.nome)&&!/amostra|extensivo/i.test(g.nome))
const inVit = await memb(vitG.map(g=>g.id))

console.log('=== TURMAS PASSAPORTE por status (estimado pelo nome, hoje=2026-07-24) ===')
console.log('-- VENCIDAS --'); for(const g of expiradas.sort((a,b)=>a.exp<b.exp?-1:1)) console.log(`   exp ${g.exp} | ${g.nome}`)
console.log('-- VÁLIDAS --');  for(const g of validas.sort((a,b)=>a.exp<b.exp?-1:1)) console.log(`   exp ${g.exp} | ${g.nome}`)
console.log('-- SEM DATA (não estimável) --'); for(const g of semData) console.log(`   ${g.nome}`)

// candidatos a "passaporte vencido": em turma vencida, SEM turma válida e SEM vitalício
const candidatos=[...inExp].filter(id=>!inVal.has(id)&&!inVit.has(id))
// desses, quantos hoje estão classificados passaporte?
let passaporteVencido=0
const chunk=(a,n)=>a.reduce((o,_,i)=>i%n?o:[...o,a.slice(i,i+n)],[])
for(const c of chunk(candidatos,200)){const es=await rest(`simulado_estudantes?id=in.(${c.join(',')})&classificacao=eq.passaporte&select=id`);passaporteVencido+=(es||[]).length}
console.log('\n=== ESTIMATIVA ===')
console.log(`  membros em turmas VENCIDAS: ${inExp.size} · em turmas VÁLIDAS: ${inVal.size} · vitalícios: ${inVit.size}`)
console.log(`  candidatos a "passaporte vencido" (só em turma vencida, sem válida, sem vitalício): ${candidatos.length}`)
console.log(`  ...destes, classificados 'passaporte' hoje: ${passaporteVencido}`)
