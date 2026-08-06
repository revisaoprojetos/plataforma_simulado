import { readFileSync, readdirSync } from 'node:fs'
const SIM='e17cae0a-db46-4563-b2ad-dcc16c8ec367'
const APPLY = process.argv.includes('--apply')
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=(p,init)=>fetch(`${URL}/rest/v1/${p}`,{...init,headers:{...H,...(init?.headers||{})}})
const pq=await (await rest(`simulado_prova_questoes?simulado_id=eq.${SIM}&select=questao_id,ordem&order=ordem`)).json()
const ids=pq.map(x=>x.questao_id)
const qs=await (await rest(`simulado_questoes?id=in.(${ids.join(',')})&select=id,categoria`)).json()
const catBanco=new Map(qs.map(q=>[q.id,q.categoria??'']))
const dir='C:/Users/joooa/Downloads'
const name=readdirSync(dir).find(f=>/pge rs.*escolha\.csv$/i.test(f))
let raw=readFileSync(`${dir}/${name}`).toString('utf8')
if(raw.includes('NÃºmero')||raw.includes('MÃºltipla'))raw=Buffer.from(raw,'latin1').toString('utf8')
function pc(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''}else if(c!=='\r')f+=c}if(f.length||row.length){row.push(f);rows.push(row)}return rows}
const rows=pc(raw),head=rows[0].map(h=>h.trim()),iCat=head.indexOf('Categoria'),iDisc=head.indexOf('Disciplina')
const data=rows.filter(r=>/^\d+$/.test((r[0]||'').trim())).sort((a,b)=>+a[0]-+b[0])
let mud=0
const cont={}
for(let i=0;i<pq.length;i++){const qid=pq[i].questao_id
  const disc=(data[i][iDisc]||'').trim(), csvCat=(data[i][iCat]||'').trim(), bCat=(catBanco.get(qid)||'').trim()
  const alvo = /portugu/i.test(disc) ? 'Língua Portuguesa' : csvCat   // Q1-20 (Português) → pilar próprio
  cont[alvo]=(cont[alvo]||0)+1
  if(alvo && alvo!==bCat){mud++
    console.log(`Q${(data[i][0].trim()).padStart(3)}: "${bCat}" → "${alvo}"`)
    if(APPLY){const r=await rest(`simulado_questoes?id=eq.${qid}`,{method:'PATCH',headers:{'content-type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({categoria:alvo})})
      if(!r.ok)console.error('  FALHOU',r.status,(await r.text()).slice(0,120))}}}
console.log(`\n${APPLY?'APLICADAS':'(dry-run) mudariam'}: ${mud} questões`)
console.log('Distribuição alvo da coluna categoria:', JSON.stringify(cont))
