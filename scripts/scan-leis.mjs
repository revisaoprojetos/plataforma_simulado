import { readFileSync, readdirSync } from 'node:fs'
const dir = 'C:/Users/joooa/Downloads'
const name = readdirSync(dir).find((f) => /pge rs.*escolha\.csv$/i.test(f))
let raw = readFileSync(`${dir}/${name}`).toString('utf8')
if (raw.includes('NÃºmero') || raw.includes('MÃºltipla')) raw = Buffer.from(raw, 'latin1').toString('utf8')
function parseCSV(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''}else if(c!=='\r')f+=c}if(f.length||row.length){row.push(f);rows.push(row)}return rows}
const rows = parseCSV(raw)
const head = rows[0].map((h)=>h.trim())
const leiCols = ['Lei A','Lei B','Lei C','Lei D','Lei E'].map((h)=>head.indexOf(h))
const data = rows.filter((r)=>/^\d+$/.test((r[0]||'').trim()))
const dist=[]
for (const r of data){
  const set=new Set()
  for (const ci of leiCols){
    const v=(r[ci]||'').trim()
    if(!v) continue
    v.split(';').map(s=>s.trim()).filter(Boolean).forEach(l=>set.add(l))
  }
  dist.push({n:Number(r[0].trim()), disc:(r[head.indexOf('Disciplina')]||'').trim(), leis:[...set]})
}
const c2=dist.filter(d=>d.leis.length===2), c3=dist.filter(d=>d.leis.length>=3)
console.log(`Questões com exatamente 2 leis distintas: ${c2.length}`)
c2.forEach(d=>console.log(`  Q${d.n} [${d.disc}]: ${d.leis.join(' | ')}`))
console.log(`\nQuestões com 3+ leis distintas: ${c3.length}`)
c3.forEach(d=>console.log(`  Q${d.n} [${d.disc}]: ${d.leis.join(' | ')}`))
