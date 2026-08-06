import { readFileSync, readdirSync } from 'node:fs'
const dir = 'C:/Users/joooa/Downloads'
const name = readdirSync(dir).find((f) => /pge rs.*escolha\.csv$/i.test(f))
let raw = readFileSync(`${dir}/${name}`).toString('utf8')
if (raw.includes('NÃºmero') || raw.includes('MÃºltipla')) raw = Buffer.from(raw, 'latin1').toString('utf8')
function parseCSV(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''}else if(c!=='\r')f+=c}if(f.length||row.length){row.push(f);rows.push(row)}return rows}
const rows = parseCSV(raw)
const head = rows[0].map((h)=>h.trim())
const iP1 = head.indexOf('Pilar 1'), iP2 = head.indexOf('Pilar 2')
console.log('col Pilar 1 =', iP1, '· Pilar 2 =', iP2)
const data = rows.filter((r)=>/^\d+$/.test((r[0]||'').trim()))
let comP1=0, comP2=0, comAmbos=0, multi=[]
for (const r of data){
  const p1=(r[iP1]||'').trim(), p2=(r[iP2]||'').trim()
  if(p1)comP1++; if(p2)comP2++; if(p1&&p2)comAmbos++
  // conta "pilares" separados por vírgula/;/ / e/ dentro de cada célula
  const pilares=[p1,p2].filter(Boolean).flatMap(x=>x.split(/[,;/]| e /i).map(s=>s.trim()).filter(Boolean))
  if(pilares.length>=2) multi.push(`Q${r[0].trim()} (${pilares.length}): [${p1}] [${p2}]`)
}
console.log(`\nQuestões com Pilar 1 preenchido: ${comP1}`)
console.log(`Questões com Pilar 2 preenchido: ${comP2}`)
console.log(`Questões com AMBOS (2 pilares): ${comAmbos}`)
console.log(`\nQuestões com 2+ pilares (contando listas):`)
if(!multi.length) console.log('  (nenhuma)')
multi.forEach((x)=>console.log('  -',x))
// mostra as poucas que têm QUALQUER pilar, pra inspeção
console.log('\nTodas com algum pilar:')
let any=0
for (const r of data){const p1=(r[iP1]||'').trim(),p2=(r[iP2]||'').trim();if(p1||p2){any++;console.log(`  Q${r[0].trim()}: P1="${p1}" | P2="${p2}"`)}}
if(!any)console.log('  (nenhuma questão tem Pilar 1 ou Pilar 2 preenchido)')
