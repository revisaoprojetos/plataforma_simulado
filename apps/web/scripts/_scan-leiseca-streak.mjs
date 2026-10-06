// Escaneia o Desafio de Lei Seca: quantos alunos têm a SEQUÊNCIA subcontada porque o quiz foi
// concluído após a meia-noite (meta.dia do quiz = dia seguinte ao da leitura). Compara a sequência
// pelo dia do QUIZ (atual) vs pelo dia em que a AULA foi feita (menor dia entre leitura e quiz).
// Uso: node scripts/_scan-leiseca-streak.mjs [--modulo <pastaId>]   (sem --modulo = todos os módulos de leitura)
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const f of ['.env.local', '../../.env', '.env']) { try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, '') } } catch {} }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13', TZ = 'America/Sao_Paulo'
const diaDe = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
const maxRun = (set) => { const d = [...set].filter(Boolean).sort(); let mx = d.length ? 1 : 0, c = 1; for (let i = 1; i < d.length; i++) { c = (Date.parse(d[i] + 'T00:00:00Z') - Date.parse(d[i - 1] + 'T00:00:00Z') === 864e5) ? c + 1 : 1; if (c > mx) mx = c } return mx }

const arg = process.argv.indexOf('--modulo')
const moduloArg = arg >= 0 ? process.argv[arg + 1] : null

const run = async () => {
  // módulos de leitura (pastas is_folder folder_area='leitura')
  const { data: pastas } = await sb.from('simulado_pastas').select('id, nome').eq('tenant_id', T).eq('is_folder', true).eq('folder_area', 'leitura')
  const modulos = moduloArg ? (pastas ?? []).filter((p) => p.id === moduloArg) : (pastas ?? [])
  let totAlunos = 0, totPrejud = 0, totMidnight = 0
  for (const mod of modulos) {
    const { data: docs } = await sb.from('simulado_documentos').select('id').eq('tenant_id', T).eq('pasta_id', mod.id).eq('deletado', false)
    const docIds = (docs ?? []).map((d) => d.id)
    if (!docIds.length) continue
    // puxa TODOS os eventos de leitura do módulo (paginado)
    const porAluno = new Map() // id -> { quizDay: Map<doc,dia>, leituraDay: Map<doc,dia> }
    let from = 0
    for (;;) {
      const { data: ev, error } = await sb.from('simulado_xp_eventos').select('estudante_id, ref_id, meta, criado_em').eq('tenant_id', T).eq('origem', 'leitura').filter('meta->>documentoId', 'in', `(${docIds.join(',')})`).order('id').range(from, from + 999)
      if (error) { console.error(mod.nome, error.message); break }
      for (const e of ev ?? []) {
        const doc = e.meta?.documentoId; if (!doc) continue
        const a = porAluno.get(e.estudante_id) ?? { quiz: new Map(), leitura: new Map() }
        if (String(e.ref_id).startsWith('quiz:')) { const d = e.meta?.dia || diaDe(e.criado_em); const prev = a.quiz.get(doc); if (!prev || d < prev) a.quiz.set(doc, d) }
        else { const d = diaDe(e.criado_em); const prev = a.leitura.get(doc); if (!prev || d < prev) a.leitura.set(doc, d) }
        porAluno.set(e.estudante_id, a)
      }
      if (!ev || ev.length < 1000) break
      from += 1000
    }
    let prejud = [], midnight = 0
    for (const [id, a] of porAluno) {
      const quizDias = new Set([...a.quiz.values()])
      // "dia da aula" = menor dia entre leitura e quiz do mesmo doc
      const aulaDias = new Set()
      const docsTodos = new Set([...a.quiz.keys(), ...a.leitura.keys()])
      let temMidnight = false
      for (const doc of docsTodos) {
        const q = a.quiz.get(doc), l = a.leitura.get(doc)
        const dia = [q, l].filter(Boolean).sort()[0]
        if (dia) aulaDias.add(dia)
        if (q && l && q > l) temMidnight = true // quiz num dia depois da leitura (virada)
      }
      if (temMidnight) midnight++
      const mQuiz = maxRun(quizDias), mAula = maxRun(aulaDias)
      if (mAula > mQuiz) prejud.push({ id, mQuiz, mAula, delta: mAula - mQuiz })
    }
    totAlunos += porAluno.size; totPrejud += prejud.length; totMidnight += midnight
    console.log(`\n── ${mod.nome} ── alunos=${porAluno.size} | com virada de meia-noite=${midnight} | PREJUDICADOS (streak subcontado)=${prejud.length}`)
    prejud.sort((a, b) => b.delta - a.delta).slice(0, 10).forEach((p) => console.log(`   ${p.id}  streak ${p.mQuiz} → ${p.mAula}  (+${p.delta})`))
  }
  console.log(`\n== TOTAL ==  alunos=${totAlunos} | com virada=${totMidnight} | prejudicados=${totPrejud}`)
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
