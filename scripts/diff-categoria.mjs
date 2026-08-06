import { readFileSync, readdirSync } from 'node:fs'
const SIM='e17cae0a-db46-4563-b2ad-dcc16c8ec367'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=(p)=>fetch(`${URL}/rest/v1/${p}`,{headers:H}).then(r=>r.json())
const pilarDe=(c)=>{const t=(c??'').toLowerCase();if(t.includes('lei seca')||t.includes('legisla'))return 'Lei seca';if(t.includes('jurisprud'))return 'Jurisprudência';if(t.includes('doutrina'))return 'Doutrina';return '(sem)'}
const pq=await rest(`simulado_prova_questoes?simulado_id=eq.${SIM}&select=questao_id,ordem&order=ordem`)
const ids=pq.map(x=>x.questao_id)
const qs=await rest(`simulado_questoes?id=in.(${ids.join(',')})&select=id,categoria`)
const catBanco=new Map(qs.map(q=>[q.id,q.categoria||'(vazio)']))
const dir='C:/Users/joooa/Downloads'
const name=readdirSync(dir).find(f=>/pge rs.*escolha\.csv$/i.test(f))
let raw=readFileSync(`${dir}/${name}`).toString('utf8')
if(raw.includes('NÃºmero')||raw.includes('MÃºltipla'))raw=Buffer.from(raw,'latin1').toString('utf8')
function pc(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''}else if(c!=='\r')f+=c}if(f.length||row.length){row.push(f);rows.push(row)}return rows}
const rows=pc(raw),head=rows[0].map(h=>h.trim())
const iCat=head.indexOf('Categoria'),iDisc=head.indexOf('Disciplina')
const data=rows.filter(r=>/^\d+$/.test((r[0]||'').trim())).sort((a,b)=>+a[0]-+b[0])
let mm=0
console.log('Nº | Disciplina | CSV categoria → BANCO categoria  (pilar CSV → pilar BANCO)')
for(let i=0;i<pq.length;i++){const q=pq[i].questao_id, csvCat=(data[i][iCat]||'').trim(), bCat=catBanco.get(q)
  const pC=pilarDe(csvCat), pB=pilarDe(bCat)
  if(pC!==pB){mm++;console.log(`Q${data[i][0].trim().padStart(3)} | ${(data[i][iDisc]||'').slice(0,22).padEnd(22)} | "${csvCat}" → "${bCat}"   (${pC} → ${pB})`)}}
console.log(`\nTotal de questões com PILAR divergente (CSV × banco): ${mm}`)
