// SOMENTE LEITURA — exporta o LOG de conclusões da Lei Seca por aluno (comprovação p/ o suporte:
// "data e hora de cada aula concluída" + a SEQUÊNCIA que o aluno estava naquele dia), sem depender do dev.
// Regra idêntica à do ranking/webhooks: aula-completa = leitura + TODAS as questões do quiz respondidas;
// o "dia da aula" = último respondido_em do quiz (BRT); sequência por MÓDULO (dias consecutivos).
// Uso:
//   node scripts/_leiseca-log-conclusoes.mjs                 → gera 2 CSVs (detalhe + resumo)
//   node scripts/_leiseca-log-conclusoes.mjs --aluno=<email> → filtra um aluno (para contestações)
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const TZ = 'America/Sao_Paulo'
const ALUNO = (process.argv.find((a) => a.startsWith('--aluno=')) || '').split('=')[1]?.trim().toLowerCase() || null
const diaDe = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: TZ }) : '')
const csv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

// Aulas da leitura + quiz por doc.
const { rows: docs } = await pool.query(
  `SELECT d.id, d.titulo, d.ordem, d.pasta_id, p.nome AS modulo
     FROM simulado_documentos d JOIN simulado_pastas p ON p.id = d.pasta_id
    WHERE d.tenant_id = $1 AND p.folder_area = 'leitura' AND d.deletado = false`, [TID])
const docIds = docs.map((d) => d.id)
const docById = new Map(docs.map((d) => [d.id, d]))
if (!docIds.length) { console.log('Sem aulas de leitura.'); await pool.end(); process.exit(0) }

const { rows: quiz } = await pool.query(
  `SELECT documento_id, questao_id FROM simulado_documento_quiz_questoes
    WHERE tenant_id = $1 AND deletado = false AND documento_id = ANY($2)`, [TID, docIds])
const quizPorDoc = new Map()
for (const q of quiz) (quizPorDoc.get(q.documento_id) ?? quizPorDoc.set(q.documento_id, new Set()).get(q.documento_id)).add(q.questao_id)

const { rows: resp } = await pool.query(
  `SELECT r.estudante_id, r.documento_id, r.questao_id, r.respondido_em
     FROM simulado_leitura_respostas r JOIN simulado_documento_quiz_questoes q
       ON q.documento_id = r.documento_id AND q.questao_id = r.questao_id AND q.tenant_id = $1 AND q.deletado = false
    WHERE r.documento_id = ANY($2) AND r.respondido_em IS NOT NULL`, [TID, docIds])

const { rows: prog } = await pool.query(
  `SELECT estudante_id, documento_id, MAX(concluido_em) AS concluido_em
     FROM simulado_leitura_progresso WHERE documento_id = ANY($1) AND concluido_em IS NOT NULL
    GROUP BY estudante_id, documento_id`, [docIds])

// Índices por aluno.
const alunos = new Set()
// (aluno,doc) → { answered:Set, ultima:iso }
const cel = new Map()
const key = (a, d) => `${a}|${d}`
for (const r of resp) {
  alunos.add(r.estudante_id)
  const k = key(r.estudante_id, r.documento_id)
  const c = cel.get(k) ?? { answered: new Set(), ultima: null }
  c.answered.add(r.questao_id); if (!c.ultima || r.respondido_em > c.ultima) c.ultima = r.respondido_em
  cel.set(k, c)
}
const leituraDe = new Map() // (aluno,doc) → concluido_em
for (const p of prog) { alunos.add(p.estudante_id); leituraDe.set(key(p.estudante_id, p.documento_id), p.concluido_em) }

const idArr = [...alunos]
const { rows: ests } = idArr.length
  ? await pool.query(`SELECT id, nome, email FROM simulado_estudantes WHERE tenant_id = $1 AND id = ANY($2)`, [TID, idArr])
  : { rows: [] }
const estById = new Map(ests.map((e) => [e.id, e]))

// Monta detalhe + resumo.
const detalhe = [['estudante', 'email', 'modulo', 'ordem', 'aula', 'leitura_em', 'quiz_completo', 'quiz_em', 'sequencia_no_dia']]
const resumo = [['estudante', 'email', 'modulo', 'aulas_completas', 'sequencia_atual', 'ultima_atividade']]
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
const ontem = new Date(Date.parse(hoje + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)

for (const aid of idArr) {
  const est = estById.get(aid)
  if (!est) continue
  if (ALUNO && (est.email ?? '').toLowerCase() !== ALUNO) continue
  // agrupa docs do aluno por módulo
  const porMod = new Map()
  for (const d of docs) {
    const k = key(aid, d.id)
    const c = cel.get(k); const lei = leituraDe.get(k)
    if (!c && !lei) continue
    const qs = quizPorDoc.get(d.id) ?? new Set()
    const quizCompleto = qs.size > 0 && [...qs].every((qid) => c?.answered.has(qid))
    const quizEm = c?.ultima ?? null
    const bloco = porMod.get(d.pasta_id) ?? { modulo: d.modulo, aulas: [] }
    bloco.aulas.push({ docId: d.id, temQuiz: qs.size > 0, ordem: d.ordem, titulo: d.titulo, leituraEm: lei ?? null, quizCompleto, quizEm })
    porMod.set(d.pasta_id, bloco)
  }
  for (const [, bloco] of porMod) {
    // sequência por módulo: dias com aula-completa (quiz), pelo dia do quizEm
    const dias = new Set()
    for (const a of bloco.aulas) if (a.quizCompleto && a.quizEm) dias.add(diaDe(a.quizEm))
    const ord = [...dias].sort()
    const runByDay = new Map()
    let run = 0, prev = ''
    for (const dd of ord) { run = prev && Date.parse(dd + 'T00:00:00Z') - Date.parse(prev + 'T00:00:00Z') === 86_400_000 ? run + 1 : 1; prev = dd; runByDay.set(dd, run) }
    const ultimo = ord[ord.length - 1] ?? ''
    const streakAtual = ultimo === hoje || ultimo === ontem ? (runByDay.get(ultimo) ?? 0) : 0
    const completas = bloco.aulas.filter((a) => a.leituraEm && (a.temQuiz ? a.quizCompleto : true)).length
    // pg devolve timestamptz como Date → ordenar por getTime() (não .sort() lexical, que erra a ordem).
    const datas = bloco.aulas.flatMap((a) => [a.leituraEm, a.quizEm]).filter(Boolean).map((d) => new Date(d).getTime()).sort((x, y) => x - y)
    const ultimaAtiv = datas.length ? new Date(datas[datas.length - 1]) : null
    resumo.push([est.nome, est.email, bloco.modulo, completas, streakAtual, fmt(ultimaAtiv)])
    bloco.aulas.sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9))
    for (const a of bloco.aulas) {
      const seq = a.quizCompleto && a.quizEm ? (runByDay.get(diaDe(a.quizEm)) ?? '') : ''
      detalhe.push([est.nome, est.email, bloco.modulo, a.ordem ?? '', a.titulo, fmt(a.leituraEm), a.quizCompleto ? 'sim' : 'não', fmt(a.quizEm), seq])
    }
  }
}

const stamp = new Date().toISOString().slice(0, 10)
const fDet = `scripts/_leiseca-conclusoes-detalhe-${stamp}.csv`
const fRes = `scripts/_leiseca-conclusoes-resumo-${stamp}.csv`
writeFileSync(fDet, detalhe.map((r) => r.map(csv).join(',')).join('\n'), 'utf8')
writeFileSync(fRes, resumo.map((r) => r.map(csv).join(',')).join('\n'), 'utf8')
console.log(`Alunos com atividade: ${idArr.length}`)
console.log(`Detalhe (por aula): ${fDet}  (${detalhe.length - 1} linhas)`)
console.log(`Resumo (por módulo): ${fRes}  (${resumo.length - 1} linhas)`)
await pool.end()
