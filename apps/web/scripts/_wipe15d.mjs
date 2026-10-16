import pg from 'pg'; import { readFileSync, writeFileSync } from 'fs'
const env=readFileSync('.env.local','utf8'); const url=(env.match(/^DATABASE_URL=(.*)$/m)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const c=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:false}}); await c.connect()
const DES='e5ce59bc-710f-4e45-8b09-67a70a06b62a'
const b=await c.query(`select p.estudante_id, e.email, p.dom, p.best from simulado_jurisprudencia_progresso p left join simulado_estudantes e on e.id=p.estudante_id where p.desafio_id=$1 and (p.dom ? '15' or p.best ? '15')`,[DES])
console.log('contas com dia 15 agora:', b.rows.length)
for(const r of b.rows) console.log('  '+(r.email||r.estudante_id)+' | best[15]='+r.best?.['15'])
if(b.rows.length){
  writeFileSync('scripts/_backup-wipe-dia15d.json', JSON.stringify({desafio:DES, rows:b.rows}))
  for(const r of b.rows){
    const dom={...(r.dom||{})}; delete dom['15']
    const best={...(r.best||{})}; delete best['15']
    const recorde=Math.max(0, ...Object.values(best).map(v=>Number(v)||0))
    await c.query(`update simulado_jurisprudencia_progresso set dom=$1::jsonb,best=$2::jsonb,recorde=$3,atualizado_em=now() where desafio_id=$4 and estudante_id=$5`,[JSON.stringify(dom),JSON.stringify(best),recorde,DES,r.estudante_id])
  }
  const v=await c.query(`select count(*)::int n from simulado_jurisprudencia_progresso where desafio_id=$1 and (dom ? '15' or best ? '15')`,[DES])
  console.log('apagado. restantes:', v.rows[0].n)
} else console.log('nada pra apagar (já estava limpo)')
await c.end()
