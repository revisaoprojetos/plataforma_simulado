import { readFileSync } from 'node:fs'
// lê o CSV que já geramos e quebra as divergências por fonte/direção
const raw=readFileSync('C:/Users/joooa/Downloads/reverificacao-classificacao.csv','utf8').replace(/^﻿/,'')
const linhas=raw.split('\n').slice(1).filter(Boolean)
// colunas: nome,email,classif_atual,por_grupo,por_guru,computado,fonte,divergente
function parse(l){const out=[];let f='',q=false;for(let i=0;i<l.length;i++){const c=l[i];if(q){if(c==='"'){if(l[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){out.push(f);f=''}else f+=c}out.push(f);return out}
const RANK={vitalicio:3,passaporte:2,normal:1}
let div=0
const buckets={} // ex: "normal→vitalicio [guru]" 
for(const l of linhas){const c=parse(l);const atual=(c[2]||'').replace('(null)','normal'),comp=c[5],fonte=c[6],d=c[7]==='SIM'
  if(!d)continue; div++
  const dir=(RANK[comp]||1)>(RANK[atual]||1)?'SOBE':'DESCE'
  const key=`${atual}→${comp} [${fonte}]`; buckets[key]=(buckets[key]||0)+1
}
console.log('Total divergências:',div,'\n')
console.log('Por transição e fonte (guru=assinatura ativa · grupo=membership · guru+grupo=ambos):')
for(const [k,v] of Object.entries(buckets).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
// resumo acionável: subir p/ vitalicio com guru vs só grupo
let vitGuru=0,vitSoGrupo=0,passGuru=0,passSoGrupo=0
for(const [k,v] of Object.entries(buckets)){
  if(/→vitalicio/.test(k)){ if(/guru/.test(k))vitGuru+=v; else vitSoGrupo+=v }
  if(/→passaporte/.test(k)){ if(/guru/.test(k))passGuru+=v; else passSoGrupo+=v }
}
console.log('\n== Acionável ==')
console.log(`  → VITALÍCIO com Guru ativo (alta confiança): ${vitGuru}`)
console.log(`  → VITALÍCIO só por grupo (membership, pode ser antigo): ${vitSoGrupo}`)
console.log(`  → PASSAPORTE com Guru ativo: ${passGuru}`)
console.log(`  → PASSAPORTE só por grupo: ${passSoGrupo}`)
