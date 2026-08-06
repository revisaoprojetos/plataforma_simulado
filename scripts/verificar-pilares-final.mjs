import { readFileSync } from 'node:fs'
const SIM='e17cae0a-db46-4563-b2ad-dcc16c8ec367'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=(p)=>fetch(`${URL}/rest/v1/${p}`,{headers:H}).then(r=>r.json())
// regra NOVA da plataforma (merge.ts): LP (por categoria/disciplina) > Lei seca > Juris > Doutrina
const pilarDe=(cat,disc)=>{const t=`${cat??''} ${disc??''}`.toLowerCase()
  if(/portugu|l[ií]ngua/.test(t))return 'Língua Portuguesa'
  if(t.includes('lei seca')||t.includes('legisla'))return 'Lei seca'
  if(t.includes('jurisprud'))return 'Jurisprudência'
  if(t.includes('doutrina'))return 'Doutrina'
  return '(sem pilar)'}
const pq=await rest(`simulado_prova_questoes?simulado_id=eq.${SIM}&select=questao_id&order=ordem`)
const ids=pq.map(x=>x.questao_id)
const qs=await rest(`simulado_questoes?id=in.(${ids.join(',')})&select=id,categoria,disciplina_id`)
const discIds=[...new Set(qs.map(q=>q.disciplina_id).filter(Boolean))]
const discs=await rest(`simulado_disciplinas?id=in.(${discIds.join(',')})&select=id,nome`)
const dn=new Map(discs.map(d=>[d.id,d.nome]))
const colCat={}, pilar={}
for(const q of qs){const c=q.categoria||'(vazio)'; colCat[c]=(colCat[c]||0)+1
  const p=pilarDe(q.categoria,dn.get(q.disciplina_id)); pilar[p]=(pilar[p]||0)+1}
console.log('■ Coluna `categoria` no banco (contagem crua):')
for(const [k,v] of Object.entries(colCat).sort((a,b)=>b[1]-a[1])) console.log(`   ${k}: ${v}`)
console.log('\n■ Pilar calculado pela plataforma (regra nova):')
for(const k of ['Língua Portuguesa','Lei seca','Jurisprudência','Doutrina','(sem pilar)']) if(pilar[k]) console.log(`   ${k}: ${pilar[k]}`)
console.log('\n■ Esperado (você): Língua Portuguesa 20 · Lei Seca 46 · Jurisprudência 21 · Doutrina 13')
