import { readFileSync, writeFileSync } from 'node:fs'
const env=readFileSync('apps/web/.env.local','utf8')
const get=(k)=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim()
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'),KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`}
const rest=async(p)=>{const r=await fetch(`${URL}/rest/v1/${p}`,{headers:H});const j=await r.json();return Array.isArray(j)?j:[]}
// grupos-FONTE (Passaporte Vitalício reais, sem amostra/extensivo/vazios-alvo)
const FONTES={
 '745c1010-a782-4d5b-b7cd-06edec483b2c':'Mais que Vitalício 2025',
 '2811f6db-3451-4536-bcd4-a49a22d3cc41':'Vitalício 2024',
 '15859105-0500-4446-b459-019be6337b51':'Vitalício Recorrência Pagar-me',
 'fcaac653-846e-4508-a4e1-c75d2e92ff15':'Assinatura Mais que Vitalício 2025',
 '558e24a3-53eb-4f56-875c-bce4af0ba223':'Vitalício Pagar-me',
}
const ids=Object.keys(FONTES)
async function fetchAll(base){let out=[],from=0;for(;;){const r=await fetch(`${URL}/rest/v1/${base}`,{headers:{...H,Range:`${from}-${from+999}`}});const j=await r.json();if(!Array.isArray(j))break;out.push(...j);if(j.length<1000)break;from+=1000}return out}
const membros=await fetchAll(`simulado_grupo_membros?grupo_id=in.(${ids.join(',')})&select=estudante_id,grupo_id&order=estudante_id`)
const gruposDe=new Map()
for(const m of membros){const s=gruposDe.get(m.estudante_id)??new Set();s.add(FONTES[m.grupo_id]);gruposDe.set(m.estudante_id,s)}
const dist=[...gruposDe.keys()]
// estudantes
const est=new Map()
for(let i=0;i<dist.length;i+=150){const chunk=dist.slice(i,i+150)
  const es=await rest(`simulado_estudantes?id=in.(${chunk.join(',')})&select=id,nome,email,cpf,classificacao`)
  for(const e of es)est.set(e.id,e)}
const q=(s)=>`"${(s??'').toString().replace(/"/g,'""')}"`
let csv='nome,email,cpf,classificacao_atual,grupos_vitalicio,sera_transferido\n'
let pass=0,normal=0,outro=0
for(const id of dist){const e=est.get(id)||{};const c=e.classificacao??''
  const transf=c==='passaporte'?'SIM':'nao'
  if(c==='passaporte')pass++;else if(c==='normal')normal++;else outro++
  csv+=[q(e.nome),q(e.email),q(e.cpf),q(c||'(null)'),q([...(gruposDe.get(id)||[])].join(' | ')),transf].join(',')+'\n'}
const out=`C:/Users/joooa/Downloads/vitalicio-candidatos.csv`
writeFileSync(out,'﻿'+csv,'utf8')
console.log('Distintos:',dist.length,'| passaporte(→transfere):',pass,'| normal(fica):',normal,'| outro:',outro)
console.log('CSV salvo em:',out)
