// Backfill das aulas LegProc no Banco de Conteúdos a partir das metas legproc dos cronogramas.
// O backfill original casava por disciplina_id (que 99% das metas legproc não têm) → pulou o legproc.
// Aqui casamos por NOME da disciplina. Dedup por (disciplina, aula normalizada). Backup + reversível.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

let env = {}
for (const f of ['.env.local', '../../.env']) {
  try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, '') } } catch {}
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const APPLY = process.argv.includes('--apply')

const fetchAll = async (tab, sel, f) => { let out = [], from = 0; for (;;) { let q = sb.from(tab).select(sel).eq('tenant_id', T).range(from, from + 999); if (f) q = f(q); const { data, error } = await q; if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break; from += 1000 } return out }
const chave = (a) => { const t = String(a ?? '').trim(); if (!t) return ''; return /^\d+$/.test(t) ? String(Number(t)) : t.toLowerCase() }
const nd = (s) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const conj = await fetchAll('simulado_cronograma_conjuntos', 'id, nome, disciplina, disciplina_id, deletado', (q) => q.eq('deletado', false))
const aulas = await fetchAll('simulado_cronograma_conjunto_aulas', 'conjunto_id, tipo, aula, ordem')
const totalAulas = {}, legAulas = {}, maxOrdem = {}
for (const a of aulas) { totalAulas[a.conjunto_id] = (totalAulas[a.conjunto_id] || 0) + 1; maxOrdem[a.conjunto_id] = Math.max(maxOrdem[a.conjunto_id] || 0, a.ordem || 0); if (a.tipo === 'legproc') (legAulas[a.conjunto_id] = legAulas[a.conjunto_id] || new Set()).add(chave(a.aula)) }
const principal = new Map()
for (const c of conj) { const k = nd(c.disciplina); if (!k) continue; const cur = principal.get(k); if (!cur || (totalAulas[c.id] || 0) > (totalAulas[cur.id] || 0)) principal.set(k, c) }

const metas = await fetchAll('simulado_cronograma_metas', 'tipo, disciplina, aula, conteudo', (q) => q.eq('tipo', 'legproc'))
const porDisc = new Map()
for (const m of metas) { const kn = nd(m.disciplina); if (!kn) continue; const k = chave(m.aula); if (!k) continue; let mp = porDisc.get(kn); if (!mp) porDisc.set(kn, (mp = new Map())); if (!mp.has(k) || (!mp.get(k).conteudo && m.conteudo)) mp.set(k, { aula: String(m.aula ?? '').trim(), conteudo: m.conteudo ?? null }) }

const rows = []
for (const [kn, mp] of porDisc) {
  const c = principal.get(kn); if (!c) continue
  const ja = legAulas[c.id] || new Set()
  let ord = (maxOrdem[c.id] || 0)
  for (const [k, v] of mp) { if (ja.has(k)) continue; ord += 1; rows.push({ tenant_id: T, conjunto_id: c.id, tipo: 'legproc', aula: v.aula, conteudo: v.conteudo, ordem: ord }) }
}
console.log(`Disciplinas legproc: ${porDisc.size} | aulas legproc a inserir: ${rows.length}`)
const preCount = aulas.filter((a) => a.tipo === 'legproc').length
console.log(`legproc aulas ANTES: ${preCount}`)

if (!APPLY) { console.log('DRY-RUN (sem --apply). Nada gravado.'); process.exit(0) }

// Backup antes de gravar (plano + ids que já existiam).
const backup = { timestamp: new Date().toISOString(), tenant: T, preCount, planoRows: rows.map(({ tenant_id, ...r }) => r) }
writeFileSync('scripts/_backup-legproc-backfill.json', JSON.stringify(backup, null, 2))

const inseridos = []
for (let i = 0; i < rows.length; i += 200) {
  const { data, error } = await sb.from('simulado_cronograma_conjunto_aulas').insert(rows.slice(i, i + 200)).select('id')
  if (error) { console.error('ERRO insert:', error.message); process.exit(1) }
  inseridos.push(...(data || []).map((x) => x.id))
}
backup.inseridosIds = inseridos
writeFileSync('scripts/_backup-legproc-backfill.json', JSON.stringify(backup, null, 2))

const posAulas = await fetchAll('simulado_cronograma_conjunto_aulas', 'tipo', (q) => q.eq('tipo', 'legproc'))
console.log(`Inseridos: ${inseridos.length} | legproc aulas DEPOIS: ${posAulas.length}`)
console.log('Backup: apps/web/scripts/_backup-legproc-backfill.json (reverter = delete pelos inseridosIds)')
