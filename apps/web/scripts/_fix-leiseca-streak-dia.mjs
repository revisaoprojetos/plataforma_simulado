// Backfill: corrige o `meta.dia` dos eventos de QUIZ da leitura que caíram no dia seguinte (virada de
// meia-noite). Regra: para cada (aluno, doc), se existe evento de LEITURA com dia menor que o do quiz,
// o quiz passa a contar no DIA DA LEITURA (dia em que a aula foi feita). Corrige a sequência subcontada.
// Dry-run por padrão; use --apply para gravar. Backup em scripts/_backup-leiseca-streak-dia.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const f of ['.env.local', '../../.env', '.env']) { try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, '') } } catch {} }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const APPLY = process.argv.includes('--apply')

const run = async () => {
  // 1) puxa TODOS os eventos de leitura do tenant (paginado): leitura (ref=doc) + quiz (ref=quiz:doc)
  const leituraDia = new Map() // `${est}|${doc}` -> menor dia da leitura
  const quizEv = []            // { id, est, doc, dia, meta }
  let from = 0
  for (;;) {
    const { data, error } = await sb.from('simulado_xp_eventos').select('id, estudante_id, ref_id, meta').eq('tenant_id', T).eq('origem', 'leitura').order('id').range(from, from + 999)
    if (error) { console.error(error.message); process.exit(1) }
    for (const e of data ?? []) {
      const ref = String(e.ref_id)
      const doc = e.meta?.documentoId || (ref.startsWith('quiz:') ? ref.slice(5) : ref.startsWith('combo:') ? ref.slice(6) : ref)
      const dia = e.meta?.dia
      if (ref.startsWith('quiz:')) { if (dia) quizEv.push({ id: e.id, est: e.estudante_id, doc, dia, meta: e.meta }) }
      else if (!ref.startsWith('combo:') && !ref.startsWith('desafio:')) { // evento de LEITURA (ref = docId)
        const k = `${e.estudante_id}|${doc}`
        if (dia && (!leituraDia.has(k) || dia < leituraDia.get(k))) leituraDia.set(k, dia)
      }
    }
    if (!data || data.length < 1000) break
    from += 1000
  }

  // 2) quais quizzes precisam mover para o dia da leitura (dia_leitura < dia_quiz)
  const updates = []
  for (const q of quizEv) {
    const dl = leituraDia.get(`${q.est}|${q.doc}`)
    if (dl && dl < q.dia) updates.push({ id: q.id, est: q.est, doc: q.doc, de: q.dia, para: dl, meta: { ...(q.meta ?? {}), dia: dl } })
  }
  console.log(`Eventos de quiz: ${quizEv.length} | a corrigir (dia_quiz > dia_leitura): ${updates.length}`)
  const alunos = new Set(updates.map((u) => u.est))
  console.log(`Alunos afetados: ${alunos.size}`)
  updates.slice(0, 8).forEach((u) => console.log(`  ${u.est.slice(0, 8)} doc ${u.doc.slice(0, 8)}  ${u.de} → ${u.para}`))

  if (!APPLY) { console.log('\n[DRY-RUN] nada gravado. Rode com --apply para aplicar.'); return }

  writeFileSync('scripts/_backup-leiseca-streak-dia.json', JSON.stringify(updates.map((u) => ({ id: u.id, de: u.de, para: u.para })), null, 2))
  let ok = 0
  for (const u of updates) {
    const { error } = await sb.from('simulado_xp_eventos').update({ meta: u.meta }).eq('id', u.id).eq('tenant_id', T)
    if (error) { console.error('erro id', u.id, error.message); continue }
    ok++
  }
  console.log(`\nAplicado: ${ok}/${updates.length} eventos corrigidos. Backup em scripts/_backup-leiseca-streak-dia.json`)
  console.log('Obs.: o ranking é cacheado ~5min (Redis) — atualiza sozinho após o TTL.')
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
