import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '') }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const D = 'e5ce59bc-710f-4e45-8b09-67a70a06b62a'
// Acha quem tem soma de best != múltiplo de 3000 (ou > 3000 com dom<=1) — os "fora do padrão".
const { data: progs } = await sb.from('simulado_jurisprudencia_progresso').select('estudante_id, dom, best, recorde').eq('desafio_id', D)
const soma = (b) => Object.values(b || {}).reduce((a, x) => a + (Number(x) || 0), 0)
const foras = (progs || []).map((p) => ({ ...p, pts: soma(p.best) })).filter((p) => p.pts > 0 && p.pts % 1000 !== 0).sort((a, b) => b.pts - a.pts)
console.log('Alunos com pontos NÃO múltiplos de 1000 (fora do padrão):', foras.length)
for (const p of foras.slice(0, 12)) {
  const est = await sb.from('simulado_estudantes').select('nome').eq('id', p.estudante_id).maybeSingle()
  const dom = Object.fromEntries(Object.entries(p.dom || {}).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]))
  console.log(`\n${est.data?.nome || p.estudante_id}  pts=${p.pts} recorde=${p.recorde}`)
  console.log('  best:', JSON.stringify(p.best))
  console.log('  dom :', JSON.stringify(dom))
}
process.exit(0)
