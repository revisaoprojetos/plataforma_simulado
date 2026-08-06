import { readFileSync, writeFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:H});return r.json()}
async function fetchAll(base){let out=[],from=0;for(;;){const r=await fetch(`${URL}/rest/v1/${base}`,{headers:{...H,Range:`${from}-${from+999}`}});const j=await r.json();if(!Array.isArray(j)){if(from===0)console.error('  [erro]',JSON.stringify(j).slice(0,120));break}out.push(...j);if(j.length<1000)break;from+=1000;process.stderr.write('.')}return out}

// regras (espelham lib/integracoes/normalizar-mapa.ts)
const ehVit=(n)=>{const s=(n||'').toLowerCase();return /vital[ií]cio/.test(s)&&/passaporte|\bpasse\b/.test(s)&&!/amostra|gr[aá]tis|gratuit|trial|degusta|\bfree\b/.test(s)}
const ehPass=(n)=>{const s=(n||'').toLowerCase();return /passaporte|\bpasse\b/.test(s)&&!/amostra|gr[aá]tis|gratuit|trial|degusta|\bfree\b/.test(s)}
const RANK={vitalicio:3,passaporte:2,normal:1}
const nomeClasse=(nome,mapClass)=>{ if(ehVit(nome)||mapClass==='vitalicio')return 'vitalicio'; if(ehPass(nome)||mapClass==='passaporte')return 'passaporte'; return 'normal'}
const maxC=(a,b)=> (RANK[b]||0)>(RANK[a]||1)?b:a

console.error('carregando grupos, mapeamentos, estudantes, membros, assinaturas...')
const grupos=await rest(`simulado_grupos?select=id,nome&deletado=eq.false`)
const grpNome=new Map(grupos.map(g=>[g.id,g.nome]))
const maps=await rest(`simulado_integracao_mapeamentos?select=provider,fonte_ref,fonte_nome,classificacao&limit=2000`)
const mapByRef=new Map((Array.isArray(maps)?maps:[]).map(m=>[`${m.provider}|${m.fonte_ref}`,m]))

const estud=await fetchAll(`simulado_estudantes?select=id,nome,email,classificacao&deletado=eq.false&order=id`)
const est=new Map(estud.map(e=>[e.id,e]))
console.error(`\nestudantes: ${estud.length}`)

// grupos → classe por membro
const membros=await fetchAll(`simulado_grupo_membros?select=estudante_id,grupo_id&order=estudante_id`)
console.error(`\nmembros de grupo: ${membros.length}`)
const grupoClasse=new Map()
for(const m of membros){const nome=grpNome.get(m.grupo_id);if(!nome)continue;const c=nomeClasse(nome,null);if(c==='normal')continue
  grupoClasse.set(m.estudante_id, maxC(grupoClasse.get(m.estudante_id)||'normal', c))}

// assinaturas Guru ATIVAS → classe
let assin=[]; try{assin=await fetchAll(`simulado_assinaturas?status=eq.ativo&select=estudante_id,provider,produto_ref`)}catch{}
console.error(`\nassinaturas ativas: ${assin.length}`)
const guruClasse=new Map()
for(const a of assin){const m=mapByRef.get(`${a.provider}|${a.produto_ref}`);const nome=m?.fonte_nome;const c=nomeClasse(nome, m?.classificacao)
  if(c==='normal')continue; guruClasse.set(a.estudante_id, maxC(guruClasse.get(a.estudante_id)||'normal', c))}

// computa final
const q=(s)=>`"${(s??'').toString().replace(/"/g,'""')}"`
let csv='nome,email,classif_atual,por_grupo,por_guru,computado,fonte,divergente\n'
const distAtual={normal:0,passaporte:0,vitalicio:0,'(null)':0}
const distComp={normal:0,passaporte:0,vitalicio:0}
let diverg=0; const amostras={sobe:[],desce:[]}
for(const e of estud){
  const g=grupoClasse.get(e.id)||'normal', gu=guruClasse.get(e.id)||'normal'
  const comp=maxC(g,gu)
  const atual=e.classificacao||'(null)'
  distAtual[atual]=(distAtual[atual]||0)+1
  distComp[comp]++
  const fonte=[gu!=='normal'?'guru':'',g!=='normal'?'grupo':''].filter(Boolean).join('+')||'-'
  const atualNorm=e.classificacao||'normal'
  const div=atualNorm!==comp
  if(div){diverg++; const rec=`${e.nome} (${atualNorm}→${comp})`; if((RANK[comp]||1)>(RANK[atualNorm]||1)){if(amostras.sobe.length<8)amostras.sobe.push(rec)}else if(amostras.desce.length<8)amostras.desce.push(rec)}
  csv+=[q(e.nome),q(e.email),q(atual),q(g),q(gu),q(comp),q(fonte),div?'SIM':'nao'].join(',')+'\n'
}
writeFileSync('C:/Users/joooa/Downloads/reverificacao-classificacao.csv','﻿'+csv,'utf8')

console.log('\n===== DISTRIBUIÇÃO ATUAL (gravada) =====')
for(const k of ['vitalicio','passaporte','normal','(null)'])console.log(`  ${k}: ${distAtual[k]||0}`)
console.log('===== DISTRIBUIÇÃO COMPUTADA (Guru+grupos, regras novas) =====')
for(const k of ['vitalicio','passaporte','normal'])console.log(`  ${k}: ${distComp[k]||0}`)
console.log(`\n===== DIVERGÊNCIAS (gravado ≠ computado): ${diverg} =====`)
console.log('  exemplos que SOBEM (deveriam ter classif maior):'); amostras.sobe.forEach(x=>console.log('    +',x))
console.log('  exemplos que DESCEM (gravado maior que evidência):'); amostras.desce.forEach(x=>console.log('    -',x))
console.log('\nCSV completo: C:/Users/joooa/Downloads/reverificacao-classificacao.csv')
