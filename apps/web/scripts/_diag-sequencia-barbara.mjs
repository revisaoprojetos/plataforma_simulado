// SOMENTE LEITURA — reproduz o cálculo de sequência do ranking p/ a Bárbara no módulo Constituição Federal.
// Mostra: aulas feitas (todas as questões do quiz respondidas), o dia de cada uma, e o streak resultante
// vs. os dias de QUALQUER atividade (resposta) — p/ entender 4 (ranking) × 11 (progresso).
import { readFileSync } from 'node:fs'
import pg from 'pg'
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const TZ = 'America/Sao_Paulo'
const q = (t, p) => pool.query(t, p).then((r) => r.rows)
const diaDe = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })

try {
  const e = (await q(`SELECT id, nome FROM simulado_estudantes WHERE tenant_id=$1 AND lower(email)='barbaragalvaob@outlook.com'`, [TID]))[0]
  console.log('Bárbara:', e?.id, '|', e?.nome)
  const EID = e.id
  const pastas = await q(`SELECT id, nome FROM simulado_pastas WHERE tenant_id=$1 AND folder_area='leitura' AND nome ILIKE '%constitui%'`, [TID])
  console.log('Módulos:', JSON.stringify(pastas.map(p => p.id + ' ' + p.nome)))
  const MOD = pastas[0].id

  // aulas publicadas do módulo
  const docs = await q(`SELECT id FROM simulado_documentos WHERE tenant_id=$1 AND pasta_id=$2 AND deletado=false AND publicado=true`, [TID, MOD])
  const aulaIds = docs.map(d => d.id)
  console.log('aulas publicadas:', aulaIds.length)

  // quiz por doc
  const quiz = await q(`SELECT documento_id, questao_id FROM simulado_documento_quiz_questoes WHERE tenant_id=$1 AND deletado=false AND documento_id = ANY($2)`, [TID, aulaIds])
  const quizPorDoc = new Map()
  for (const x of quiz) { if (!quizPorDoc.has(x.documento_id)) quizPorDoc.set(x.documento_id, new Set()); quizPorDoc.get(x.documento_id).add(x.questao_id) }

  // respostas da Bárbara
  const resp = await q(`SELECT documento_id, questao_id, correta, respondido_em FROM simulado_leitura_respostas WHERE tenant_id=$1 AND estudante_id=$2 AND documento_id = ANY($3)`, [TID, EID, aulaIds])
  console.log('respostas dela no módulo:', resp.length)

  const porDoc = new Map()
  const diasQualquer = new Set()
  for (const r of resp) {
    const qd = quizPorDoc.get(r.documento_id); if (!qd || !qd.has(r.questao_id)) continue
    if (r.respondido_em) diasQualquer.add(diaDe(r.respondido_em))
    const cell = porDoc.get(r.documento_id) ?? porDoc.set(r.documento_id, { answered: new Set(), correct: new Set(), ultima: null }).get(r.documento_id)
    cell.answered.add(r.questao_id); if (r.correta) cell.correct.add(r.questao_id)
    if (r.respondido_em && (!cell.ultima || r.respondido_em > cell.ultima)) cell.ultima = r.respondido_em
  }

  const diasFeitas = new Set()
  const linhas = []
  for (const [docId, cell] of porDoc) {
    const qs = quizPorDoc.get(docId)
    const feita = qs.size > 0 && [...qs].every((qid) => cell.answered.has(qid))
    const dia = cell.ultima ? diaDe(cell.ultima) : '-'
    if (feita && cell.ultima) diasFeitas.add(dia)
    linhas.push({ docId, qTotal: qs.size, respondidas: cell.answered.size, feita, dia })
  }
  linhas.sort((a, b) => (a.dia).localeCompare(b.dia))
  console.log('\n=== AULAS (quiz respondido) ===')
  for (const l of linhas) console.log(`  ${l.dia} | respondidas ${l.respondidas}/${l.qTotal} | feita=${l.feita ? 'SIM' : 'NÃO'} | doc ${l.docId.slice(0,8)}`)

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const streak = (dset) => {
    const dias = [...dset].sort(); let maior=0, run=0, prev=''
    for (const d of dias){ const consec = !!prev && Date.parse(d+'T00:00:00Z')-Date.parse(prev+'T00:00:00Z')===86400000; run=consec?run+1:1; if(run>maior)maior=run; prev=d }
    const ultimo=dias[dias.length-1]??''; const ontem=new Date(Date.parse(hoje+'T00:00:00Z')-86400000).toISOString().slice(0,10)
    return { atual:(ultimo===hoje||ultimo===ontem)?run:0, maior, ultimo }
  }
  const sFeitas = streak(diasFeitas), sQualquer = streak(diasQualquer)
  console.log('\nhoje:', hoje)
  console.log('DIAS c/ AULA FEITA (ranking):', [...diasFeitas].sort().join(', '))
  console.log('  → streak ranking: atual=%d maior=%d ultimo=%s', sFeitas.atual, sFeitas.maior, sFeitas.ultimo)
  console.log('DIAS c/ QUALQUER resposta:', [...diasQualquer].sort().join(', '))
  console.log('  → streak qualquer: atual=%d maior=%d ultimo=%s', sQualquer.atual, sQualquer.maior, sQualquer.ultimo)

  // overrides manuais do suporte
  const aj = await q(`SELECT overrides FROM simulado_leitura_sequencia_ajuste WHERE tenant_id=$1 AND modulo_id=$2 AND estudante_id=$3`, [TID, MOD, EID])
  console.log('\noverrides manuais:', aj[0]?.overrides ? JSON.stringify(aj[0].overrides) : '(nenhum)')
} catch (err) { console.error('ERRO:', err.message) } finally { await pool.end() }
