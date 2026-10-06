// Diagnóstico de progresso no Desafio de Lei Seca de um aluno (relatório + explicação das métricas).
// Uso: node scripts/_diag-lais-leiseca.mjs [email]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const f of ['.env.local', '../../.env', '.env']) {
  try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, '') } } catch {}
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13' // Revisão
const EMAIL = (process.argv.find((a) => a.includes('@')) || 'laiscastilhobarreto@gmail.com').trim().toLowerCase()
const TZ = 'America/Sao_Paulo'
const diaDe = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })

// streak: corrente (dias consecutivos até hoje/ontem) e máxima (maior sequência histórica)
function streaks(diasSet) {
  const dias = [...diasSet].filter(Boolean).sort()
  if (!dias.length) return { atual: 0, max: 0, dias }
  let max = 1, cur = 1
  for (let i = 1; i < dias.length; i++) {
    const prev = new Date(dias[i - 1] + 'T00:00:00Z').getTime()
    const d = new Date(dias[i] + 'T00:00:00Z').getTime()
    cur = (d - prev === 86400000) ? cur + 1 : 1
    if (cur > max) max = cur
  }
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const ontem = new Date(Date.parse(hoje + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
  const ultimo = dias[dias.length - 1]
  let atual = 0
  if (ultimo === hoje || ultimo === ontem) { atual = 1; for (let i = dias.length - 1; i > 0; i--) { const a = new Date(dias[i - 1] + 'T00:00:00Z').getTime(); const b = new Date(dias[i] + 'T00:00:00Z').getTime(); if (b - a === 86400000) atual++; else break } }
  return { atual, max, dias }
}

const run = async () => {
  const { data: ests } = await sb.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', T).or(`email.ilike.${EMAIL},emails_secundarios.cs.{${EMAIL}}`)
  if (!ests?.length) { console.log('Aluno NÃO encontrado:', EMAIL); return }
  const est = ests[0]
  console.log(`\n== ALUNO ==\n${est.nome} <${est.email}>  id=${est.id}\n`)

  // XP de leitura (todos os eventos da aluna) → agrupa por módulo (via meta.documentoId → pasta).
  const { data: evs } = await sb.from('simulado_xp_eventos').select('xp, ref_id, meta, criado_em').eq('tenant_id', T).eq('estudante_id', est.id).eq('origem', 'leitura').limit(5000)
  const docIds = [...new Set((evs ?? []).map((e) => e.meta?.documentoId).filter(Boolean))]
  const { data: docs } = docIds.length ? await sb.from('simulado_documentos').select('id, pasta_id, titulo').in('id', docIds) : { data: [] }
  const pastaDeDoc = new Map((docs ?? []).map((d) => [d.id, d.pasta_id]))
  const pastaIds = [...new Set((docs ?? []).map((d) => d.pasta_id).filter(Boolean))]
  const { data: pastas } = pastaIds.length ? await sb.from('simulado_pastas').select('id, nome').in('id', pastaIds) : { data: [] }
  const nomePasta = new Map((pastas ?? []).map((p) => [p.id, p.nome]))

  // Agrupa por módulo
  const porModulo = new Map()
  for (const e of evs ?? []) {
    const pid = pastaDeDoc.get(e.meta?.documentoId) || 'sem-modulo'
    const m = porModulo.get(pid) ?? { xp: 0, dias: new Set(), docs: new Set() }
    m.xp += e.xp || 0
    const dia = e.meta?.dia || (e.criado_em ? diaDe(e.criado_em) : null)
    if (dia && String(e.ref_id).startsWith('quiz:')) m.dias.add(dia) // streak = dia de conclusão do quiz (ledger)
    if (e.meta?.documentoId) m.docs.add(e.meta.documentoId)
    porModulo.set(pid, m)
  }

  for (const [pid, m] of porModulo) {
    const nome = nomePasta.get(pid) || pid
    // respostas do módulo
    const { data: mdocs } = await sb.from('simulado_documentos').select('id').eq('tenant_id', T).eq('pasta_id', pid).eq('deletado', false)
    const ids = (mdocs ?? []).map((d) => d.id)
    let totResp = 0, corretas = 0, docsComResp = new Set()
    if (ids.length) {
      const { data: resp } = await sb.from('simulado_leitura_respostas').select('documento_id, correta').eq('tenant_id', T).eq('estudante_id', est.id).in('documento_id', ids)
      totResp = (resp ?? []).length
      corretas = (resp ?? []).filter((r) => r.correta).length
      docsComResp = new Set((resp ?? []).map((r) => r.documento_id))
    }
    const s = streaks(m.dias)
    console.log(`── MÓDULO: ${nome} ──`)
    console.log(`  Total de aulas no módulo: ${ids.length}`)
    console.log(`  Aulas com quiz respondido: ${docsComResp.size}`)
    console.log(`  XP (soma dos eventos leitura+quiz) = ${m.xp}   ← é o "Pontos" do Desempenho`)
    console.log(`  Questões respondidas: ${totResp}  | Acertos: ${corretas}  (${totResp ? Math.round(corretas / totResp * 100) : 0}%)`)
    console.log(`  Dias de conclusão (ledger): ${[...m.dias].sort().join(', ') || '—'}`)
    console.log(`  Sequência ATUAL: ${s.atual}   | Melhor sequência (máx histórica): ${s.max}`)
    console.log('')
  }
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
