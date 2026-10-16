import pg from 'pg'; import { readFileSync, writeFileSync } from 'fs'
const env=readFileSync('.env.local','utf8'); const url=(env.match(/^DATABASE_URL=(.*)$/m)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const c=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:false}}); await c.connect()
const DES='e5ce59bc-710f-4e45-8b09-67a70a06b62a'
const EST='a0474293-cc67-4009-b1e6-c0a7c460548f' // joao@gmail.com (nomeado pelo usuário)
const b=await c.query(`select estudante_id,dom,best,recorde from simulado_jurisprudencia_progresso where desafio_id=$1 and estudante_id=$2`,[DES,EST])
writeFileSync('scripts/_backup-reset-joao.json', JSON.stringify({desafio:DES, rows:b.rows}))
const u=await c.query(`update simulado_jurisprudencia_progresso set dom='{}'::jsonb,best='{}'::jsonb,recorde=0,atualizado_em=now() where desafio_id=$1 and estudante_id=$2`,[DES,EST])
console.log('joao@gmail.com arcade resetado:', u.rowCount, '| backup antes:', JSON.stringify(b.rows[0]?.best))
const v=await c.query(`select best,recorde from simulado_jurisprudencia_progresso where desafio_id=$1 and estudante_id=$2`,[DES,EST])
console.log('agora:', JSON.stringify(v.rows[0]))
await c.end()
