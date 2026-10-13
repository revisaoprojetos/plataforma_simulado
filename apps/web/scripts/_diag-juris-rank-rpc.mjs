// Compara o cálculo DIRETO (pontosDe/dominadosDe) com a RPC rpc_juris_relatorio_json, para o ranking do juris.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const f of ['.env.local']) { try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, '') } } catch {} }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const DESAFIO = 'e5ce59bc-710f-4e45-8b09-67a70a06b62a'
const TENANT = '02195fa6-3db8-49d0-8c07-d21328a26a13'

// dias + teses (preencherTesesPorQuiz simplificado)
const { data: pasta } = await sb.from('simulado_pastas').select('desafio_jogo').eq('id', DESAFIO).maybeSingle()
const dj = pasta?.desafio_jogo || {}
const diasObj = dj.dias && typeof dj.dias === 'object' ? dj.dias : {}
const diasChaves = Object.keys(diasObj)
// teses reais por dia (quiz)
const docPorDia = {}
for (const k of diasChaves) { const did = diasObj[k]?.documento_id; if (did) docPorDia[k] = did }
const docIds = [...new Set(Object.values(docPorDia))]
const tesesMap = {}
if (docIds.length) {
  const { data: dq } = await sb.from('simulado_documento_quiz_questoes').select('documento_id, questao_id').eq('deletado', false).in('documento_id', docIds)
  const porDoc = {}
  for (const r of (dq || [])) (porDoc[r.documento_id] ??= new Set()).add(r.questao_id)
  for (const k of diasChaves) { const did = docPorDia[k]; tesesMap[k] = did && porDoc[did] ? porDoc[did].size : (Array.isArray(diasObj[k]?.teses) ? diasObj[k].teses.length : 0) }
}
console.log('tesesMap:', JSON.stringify(tesesMap))

const { data: progs } = await sb.from('simulado_jurisprudencia_progresso').select('estudante_id, dom, best').eq('desafio_id', DESAFIO)
const pontosDe = (best) => { if (!best || typeof best !== 'object') return 0; let s = 0; for (const d of diasChaves) s += Math.max(0, Number(best[d]) || 0); return s }
const dominadosDe = (dom) => diasChaves.filter((k) => { const arr = dom?.[k]; const n = tesesMap[k] || 0; return n > 0 && Array.isArray(arr) && arr.length >= n }).length
const direto = new Map((progs || []).map((p) => [p.estudante_id, { pontos: pontosDe(p.best), dominados: dominadosDe(p.dom) }]))

// RPC
const r = await sb.rpc('rpc_juris_relatorio_json', { p_tenant: TENANT, p_desafio: DESAFIO, p_dias: diasChaves, p_teses: tesesMap })
if (r.error) { console.log('RPC ERRO:', r.error.message, '→ localhost cai no FALLBACK (direto), então deveria bater com a web'); }
else {
  const rpcPorAluno = new Map((r.data?.por_aluno || []).map((a) => [a.estudante_id, { pontos: Number(a.pontos) || 0, dominados: Number(a.dominados) || 0 }]))
  console.log('RPC retornou', rpcPorAluno.size, 'alunos; direto tem', direto.size)
  // Mostra divergências (top 15 por pontos diretos)
  const top = [...direto.entries()].sort((a, b) => b[1].pontos - a[1].pontos).slice(0, 15)
  let div = 0
  for (const [id, d] of top) {
    const rp = rpcPorAluno.get(id) || { pontos: 0, dominados: 0 }
    const dif = d.pontos !== rp.pontos || d.dominados !== rp.dominados
    if (dif) div++
    console.log(`${id.slice(0, 8)}  direto{pts:${d.pontos},dom:${d.dominados}}  rpc{pts:${rp.pontos},dom:${rp.dominados}}  ${dif ? '⚠️ DIVERGE' : 'ok'}`)
  }
  console.log(`\nDivergências no top 15: ${div}`)
}
process.exit(0)
