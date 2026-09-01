// Dry-run: mede duplicados no Banco de Conteúdos por (conjunto, aula normalizada, tipo).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const i = l.indexOf('='); if (i < 0 || l.trimStart().startsWith('#')) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); env[l.slice(0, i).trim()] = v }
const svc = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const chaveAula = (a) => { const t = (a ?? '').trim(); if (!t) return ''; return /^\d+$/.test(t) ? String(Number(t)) : t.toLowerCase() }

async function fetchAll(table, sel, filter) {
  const out = []
  for (let from = 0; ; from += 1000) { let q = svc.from(table).select(sel).range(from, from + 999); q = filter(q); const { data, error } = await q; if (error) throw error; out.push(...(data ?? [])); if (!data || data.length < 1000) break }
  return out
}

const { data: t } = await svc.from('simulado_cronogramas').select('tenant_id').limit(1).maybeSingle()
const T = t.tenant_id
const conj = await fetchAll('simulado_cronograma_conjuntos', 'id, nome', (q) => q.eq('tenant_id', T).eq('deletado', false))
const nomePorConj = new Map(conj.map((c) => [c.id, c.nome]))
const aulas = await fetchAll('simulado_cronograma_conjunto_aulas', 'id, conjunto_id, tipo, aula, conteudo', (q) => q.eq('tenant_id', T))

const grupos = new Map() // conj|aulaNorm|tipo -> [aulas]
for (const a of aulas) { const k = `${a.conjunto_id}|${chaveAula(a.aula)}|${a.tipo}`; const g = grupos.get(k) ?? []; g.push(a); grupos.set(k, g) }
let dupClusters = 0, redundantes = 0
const exemplos = []
for (const [k, arr] of grupos) {
  if (arr.length > 1) {
    dupClusters++; redundantes += arr.length - 1
    if (exemplos.length < 12) {
      const conteudos = [...new Set(arr.map((a) => (a.conteudo ?? '').trim()))]
      exemplos.push(`${(nomePorConj.get(arr[0].conjunto_id) ?? '?').slice(0, 20).padEnd(20)} aula ${chaveAula(arr[0].aula).padEnd(4)} ${arr[0].tipo.padEnd(8)} ×${arr.length}  [${conteudos.map((c) => JSON.stringify(c.slice(0, 40))).join(' | ')}]`)
    }
  }
}
console.log(`aulas totais: ${aulas.length}`)
console.log(`clusters duplicados (mesmo conjunto+aula+tipo, >1 conteúdo/formato): ${dupClusters}`)
console.log(`linhas redundantes (a remover, mantendo 1 por cluster): ${redundantes}`)
console.log(`aulas após dedup: ${aulas.length - redundantes}`)
console.log('\nExemplos:')
for (const e of exemplos) console.log('  ' + e)
