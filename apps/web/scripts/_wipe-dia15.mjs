import pg from 'pg'; import { readFileSync, writeFileSync } from 'fs'
const env=readFileSync('.env.local','utf8'); const url=(env.match(/^DATABASE_URL=(.*)$/m)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const c=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:false}}); await c.connect()
const DES='e5ce59bc-710f-4e45-8b09-67a70a06b62a'
// backup das linhas com dia 15
const b=await c.query(`select estudante_id, dom, best, recorde from simulado_jurisprudencia_progresso where desafio_id=$1 and (dom ? '15' or best ? '15')`,[DES])
writeFileSync('scripts/_backup-wipe-dia15.json', JSON.stringify({desafio:DES, rows:b.rows}))
console.log('backup:', b.rows.length, 'linhas com dia 15')
let n=0
for(const r of b.rows){
  const dom={...(r.dom||{})}; delete dom['15']
  const best={...(r.best||{})}; delete best['15']
  const recorde=Math.max(0, ...Object.values(best).map(v=>Number(v)||0))
  await c.query(`update simulado_jurisprudencia_progresso set dom=$1::jsonb, best=$2::jsonb, recorde=$3, atualizado_em=now() where desafio_id=$4 and estudante_id=$5`,[JSON.stringify(dom),JSON.stringify(best),recorde,DES,r.estudante_id])
  n++
}
console.log('dia 15 removido de', n, 'contas')
const v=await c.query(`select count(*)::int n from simulado_jurisprudencia_progresso where desafio_id=$1 and (dom ? '15' or best ? '15')`,[DES])
console.log('restantes com dia 15:', v.rows[0].n)
await c.end()
