import { readFileSync, readdirSync } from 'node:fs'
const SIM = 'e17cae0a-db46-4563-b2ad-dcc16c8ec367'
const env = readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'), KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=(p)=>fetch(`${URL}/rest/v1/${p}`,{headers:H}).then(r=>r.json())

// regra EXATA da plataforma (merge.ts): Lei seca > Jurisprudência > Doutrina; senão null
const pilarDe=(...campos)=>{const t=campos.map(x=>(x??'').toString()).join(' ').toLowerCase()
  if(t.includes('lei seca')||t.includes('legisla'))return 'Lei seca'
  if(t.includes('jurisprud'))return 'Jurisprudência'
  if(t.includes('doutrina'))return 'Doutrina'
  return '(sem pilar)'}

// ── BANCO ──
const pq=await rest(`simulado_prova_questoes?simulado_id=eq.${SIM}&select=questao_id,ordem&order=ordem`)
const ids=pq.map(x=>x.questao_id)
const qs=await rest(`simulado_questoes?id=in.(${ids.join(',')})&select=id,categoria,pilar_1,pilar_2,disciplina_id`)
const discIds=[...new Set(qs.map(q=>q.disciplina_id).filter(Boolean))]
const discs=await rest(`simulado_disciplinas?id=in.(${discIds.join(',')})&select=id,nome`)
const discNome=new Map(discs.map(d=>[d.id,d.nome]))
const qById=new Map(qs.map(q=>[q.id,q]))

const cont={'Lei seca':0,'Jurisprudência':0,'Doutrina':0,'(sem pilar)':0}
const lpCats={} // categoria das questões de Língua Portuguesa
for(const p of pq){const q=qById.get(p.questao_id)||{}
  const pil=pilarDe(q.categoria,q.pilar_1,q.pilar_2)
  cont[pil]++
  const dn=(discNome.get(q.disciplina_id)||'').toLowerCase()
  if(dn.includes('portugu')){const c=q.categoria||'(vazio)';lpCats[c]=(lpCats[c]||0)+1}
}
console.log('=== BANCO (regra da plataforma sobre `categoria`) ===')
for(const k of ['Lei seca','Jurisprudência','Doutrina','(sem pilar)']) console.log(`  ${k}: ${cont[k]}`)
console.log(`  TOTAL: ${pq.length}`)
console.log('  categoria das questões de Língua Portuguesa no banco:', JSON.stringify(lpCats))

// ── CSV ──
const dir='C:/Users/joooa/Downloads'
const name=readdirSync(dir).find(f=>/pge rs.*escolha\.csv$/i.test(f))
let raw=readFileSync(`${dir}/${name}`).toString('utf8')
if(raw.includes('NÃºmero')||raw.includes('MÃºltipla'))raw=Buffer.from(raw,'latin1').toString('utf8')
function pc(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''}else if(c!=='\r')f+=c}if(f.length||row.length){row.push(f);rows.push(row)}return rows}
const rows=pc(raw), head=rows[0].map(h=>h.trim())
const iCat=head.indexOf('Categoria'), iDisc=head.indexOf('Disciplina')
const data=rows.filter(r=>/^\d+$/.test((r[0]||'').trim()))
const cCsv={'Lei seca':0,'Jurisprudência':0,'Doutrina':0,'(sem pilar)':0}
let doutSemLP=0
for(const r of data){const pil=pilarDe(r[iCat]);cCsv[pil]++
  if(pil==='Doutrina' && !(r[iDisc]||'').toLowerCase().includes('portugu')) doutSemLP++}
console.log('\n=== CSV (mesma regra) ===')
for(const k of ['Lei seca','Jurisprudência','Doutrina','(sem pilar)']) console.log(`  ${k}: ${cCsv[k]}`)
console.log(`  → Doutrina SEM Língua Portuguesa: ${doutSemLP}`)
console.log('\n=== FOTO ===\n  Lei Seca: 46 · Jurisprudência: 21 · Doutrina: 13 (total 80)')
