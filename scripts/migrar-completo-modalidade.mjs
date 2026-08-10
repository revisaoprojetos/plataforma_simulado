// Move itens de "caderno completo" (modelo agu_completo / com_gabarito) da modalidade caderno_questoes
// para a nova modalidade caderno_completo, nos cadernos-teste.
//   DRY-RUN:  node scripts/migrar-completo-modalidade.mjs
//   APLICAR:  node scripts/migrar-completo-modalidade.mjs --aplicar
import { readFileSync, writeFileSync } from 'node:fs'
const APLICAR = process.argv.includes('--aplicar')
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
async function all(t, s) { const o = []; let f = 0; for (;;) { const r = await fetch(`${URL}/rest/v1/${t}?select=${encodeURIComponent(s)}`, { headers: { ...H, Range: `${f}-${f + 999}` } }); const rows = await r.json(); o.push(...rows); if (rows.length < 1000) break; f += 1000 } return o }
const patch = (t, id, b) => fetch(`${URL}/rest/v1/${t}?id=eq.${id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(b) })
const COMPLETOS = new Set(['agu_completo', 'com_gabarito'])
console.log(`MODO: ${APLICAR ? 'APLICAR' : 'DRY-RUN'}\n`)
const ct = await all('simulado_cadernos_teste', 'id,nome,config')
const backup = []; let nCad = 0, nItens = 0
for (const c of ct) {
  const b = c.config?.builderV3; if (!b?.itens) continue
  let mudou = false
  const itens = b.itens.map((it) => {
    if (it.modalidade === 'caderno_questoes' && COMPLETOS.has(it.modelo)) { mudou = true; nItens++; return { ...it, modalidade: 'caderno_completo' } }
    return it
  })
  if (!mudou) continue
  nCad++; backup.push({ id: c.id, config_antes: c.config })
  console.log(` • ${c.nome}: ${itens.filter((i) => i.modalidade === 'caderno_completo').length} item(ns) → caderno_completo`)
  if (APLICAR) { const r = await patch('simulado_cadernos_teste', c.id, { config: { ...c.config, builderV3: { ...b, itens } } }); if (!r.ok) console.error('   ERRO', await r.text()) }
}
console.log(`\n${APLICAR ? 'Corrigidos' : 'A corrigir'}: ${nCad} cadernos (${nItens} itens).`)
if (APLICAR) { writeFileSync('scripts/_backup-migrar-completo-modalidade.json', JSON.stringify(backup, null, 2)); console.log('Backup: scripts/_backup-migrar-completo-modalidade.json') }
