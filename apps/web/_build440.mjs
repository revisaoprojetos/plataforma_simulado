import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
const env=Object.fromEntries(fs.readFileSync('./.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const svc=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const MOD='c6e147ae-f69a-467e-b09b-0cd8576fb3dd',TENANT='02195fa6-3db8-49d0-8c07-d21328a26a13',TZ='America/Sao_Paulo',GAM=true
const hoje=new Date().toLocaleDateString('en-CA',{timeZone:TZ}),ontem=new Date(Date.parse(hoje+'T00:00:00Z')-86400000).toISOString().slice(0,10)
const {data:pst}=await svc.from('simulado_pastas').select('pontuacao').eq('id',MOD).maybeSingle()
const r=(pst?.pontuacao&&typeof pst.pontuacao==='object')?pst.pontuacao:{}
const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d
const nmk=(raw,fb)=>Array.isArray(raw)?raw.filter(m=>m&&Number.isFinite(m.dias)&&Number.isFinite(m.bonus)).map(m=>({dias:Math.max(1,Math.round(m.dias)),bonus:Math.round(m.bonus)})):fb
const MARCOS=[{dias:14,bonus:15},{dias:21,bonus:35},{dias:30,bonus:50}]
const P={pontos_aula:num(r.pontos_aula,5),pontos_quiz:num(r.pontos_quiz,5),pontos_acerto:num(r.pontos_acerto,0),combo_ativo:!!r.combo_ativo,combo_bonus:num(r.combo_bonus,0),sequencia_modo:(r.sequencia_modo==='auto'||r.sequencia_modo==='custom')?r.sequencia_modo:'auto',bonus_semana:num(r.bonus_semana,10),semana_dias:Math.max(1,Math.round(num(r.semana_dias,7))),marcos_sequencia:nmk(r.marcos_sequencia,MARCOS),conclusao_modo:(r.conclusao_modo==='auto'||r.conclusao_modo==='custom')?r.conclusao_modo:'custom',conclusao_cada:Math.max(1,Math.round(num(r.conclusao_cada,7))),conclusao_bonus:num(r.conclusao_bonus,0),marcos_conclusao:nmk(r.marcos_conclusao,[])}
const somaM=(d,ms)=>(ms??[]).reduce((s,m)=>s+(d>=m.dias?m.bonus:0),0),ciclo=(d,c,p)=>{const x=Math.max(1,c);return d<x?0:Math.floor(d/x)*(p??0)}
const bSeq=d=>P.sequencia_modo==='custom'?somaM(d,P.marcos_sequencia):ciclo(d,P.semana_dias,P.bonus_semana)
const bConc=d=>P.conclusao_modo==='auto'?ciclo(d,P.conclusao_cada,P.conclusao_bonus):somaM(d,P.marcos_conclusao)
const pontuar=(a,ac,ag)=>!GAM?a:ac*(P.pontos_aula+P.pontos_quiz)+a*P.pontos_acerto+(P.combo_ativo?ag*P.combo_bonus:0)
function seqMaior(diasIt,ov){const set=new Set(diasIt);for(const[d,c]of Object.entries(ov??{})){if(c)set.add(d);else set.delete(d)}const dias=[...set].sort();let maior=0,run=0,prev='';for(const d of dias){const con=!!prev&&Date.parse(d+'T00:00:00Z')-Date.parse(prev+'T00:00:00Z')===86400000;run=con?run+1:1;if(run>maior)maior=run;prev=d}const u=dias[dias.length-1]??'';return{maior,atual:(u===hoje||u===ontem)?run:0}}
const {data:docs}=await svc.from('simulado_documentos').select('id').eq('tenant_id',TENANT).eq('deletado',false).eq('publicado',true).eq('pasta_id',MOD)
const aulaIds=(docs||[]).map(d=>d.id)
const rpc=await svc.rpc('rpc_leitura_ranking_json',{p_tenant:TENANT,p_docs:aulaIds,p_tz:TZ})
if(rpc.error){console.error('RPC ERRO',rpc.error.message);process.exit(1)}
const ledger=new Map()
for(let i=0;i<aulaIds.length;i+=40){const ch=aulaIds.slice(i,i+40);let from=0;for(;;){const{data}=await svc.from('simulado_xp_eventos').select('estudante_id, meta').eq('tenant_id',TENANT).eq('origem','leitura').like('ref_id','quiz:%').filter('meta->>documentoId','in',`(${ch.join(',')})`).range(from,from+999);if(!data?.length)break;for(const e of data){const d=e.meta?.dia;if(!d)continue;(ledger.get(e.estudante_id)??ledger.set(e.estudante_id,new Set()).get(e.estudante_id)).add(d)}if(data.length<1000)break;from+=1000}}
const ov=new Map();try{const{data}=await svc.from('simulado_leitura_sequencia_ajuste').select('estudante_id, overrides').eq('tenant_id',TENANT).eq('modulo_id',MOD);for(const a of(data||[]))if(a.overrides)ov.set(a.estudante_id,a.overrides)}catch{}
const alvo=[]
for(const l of (rpc.data||[])){const a=l.acertos??0,ac=l.aulas_concluidas??0,ag=l.aulas_gabaritadas??0;if(!(a>0||ac>0))continue;const s=seqMaior(ledger.get(l.estudante_id)??(l.dias??[]),ov.get(l.estudante_id));const score=pontuar(a,ac,ag)+(GAM?bSeq(s.maior)+bConc(s.maior):0);if(score===440)alvo.push({id:l.estudante_id,acertos:a,aulas:ac,gab:ag,streak:s.maior,score})}
const ids=alvo.map(x=>x.id)
// dados
const dados=new Map();for(let i=0;i<ids.length;i+=300){const{data}=await svc.from('simulado_estudantes').select('id, nome, email, cpf, telefone, data_nascimento, matricula_externa, classificacao').in('id',ids.slice(i,i+300));for(const e of(data||[]))dados.set(e.id,e)}
// grupos -> passaporte?
const gm=new Map();for(let i=0;i<ids.length;i+=200){const{data}=await svc.from('simulado_grupo_membros').select('estudante_id, grupo_id').in('estudante_id',ids.slice(i,i+200));for(const m of(data||[])){(gm.get(m.estudante_id)??gm.set(m.estudante_id,new Set()).get(m.estudante_id)).add(m.grupo_id)}}
const allG=[...new Set([].concat(...[...gm.values()].map(s=>[...s])))]
const gnome=new Map();for(let i=0;i<allG.length;i+=300){const{data}=await svc.from('simulado_grupos').select('id, nome').in('id',allG.slice(i,i+300));for(const g of(data||[]))gnome.set(g.id,g.nome||'')}
const isPass=id=>[...(gm.get(id)||[])].some(g=>/passaporte/i.test(gnome.get(g)||''))
const reg=alvo.map(x=>{const d=dados.get(x.id)||{};const pass=isPass(x.id);const grupos=[...(gm.get(x.id)||[])].map(g=>gnome.get(g)).filter(Boolean);return{nome:d.nome||'—',email:d.email||'',cpf:d.cpf||'',telefone:d.telefone||'',nasc:d.data_nascimento||'',matricula:d.matricula_externa||'',aulas:x.aulas,acertos:x.acertos,gab:x.gab,streak:x.streak,score:x.score,tipo:pass?'Passaporte':'Normal',grupos}}).sort((a,b)=>(a.nome).localeCompare(b.nome,'pt-BR'))
const nPass=reg.filter(r=>r.tipo==='Passaporte').length,nNorm=reg.length-nPass
fs.writeFileSync('_reg440.json',JSON.stringify({reg,nPass,nNorm,total:reg.length,geradoEm:new Date().toISOString()}))
console.log('total',reg.length,'| passaporte',nPass,'| normais',nNorm)
