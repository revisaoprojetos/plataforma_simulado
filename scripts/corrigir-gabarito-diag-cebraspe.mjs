// Recupera a seção "Gabarito/atualização" no fim do diagnóstico (título + intro + lista de questões)
// a partir do V1, para os diagnósticos CEBRASPE (que o conversor havia ocultado/esvaziado).
//   DRY-RUN:  node scripts/corrigir-gabarito-diag-cebraspe.mjs
//   APLICAR:  node scripts/corrigir-gabarito-diag-cebraspe.mjs --aplicar   (--todos p/ além de CEBRASPE)
import { readFileSync, writeFileSync } from 'node:fs'
const APLICAR = process.argv.includes('--aplicar')
const SOMENTE_CEBRASPE = !process.argv.includes('--todos')
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
async function all(t, s) { const o = []; let f = 0; for (;;) { const r = await fetch(`${URL}/rest/v1/${t}?select=${encodeURIComponent(s)}`, { headers: { ...H, Range: `${f}-${f + 999}` } }); const rows = await r.json(); o.push(...rows); if (rows.length < 1000) break; f += 1000 } return o }
const patch = (t, id, b) => fetch(`${URL}/rest/v1/${t}?id=eq.${id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(b) })

const innerTxt = (blocks) => { const o = []; const w = (bs) => { for (const b of (bs || [])) { if ((b.type || b.kind) === 'texto-livre') o.push(b.attributes?.texto || ''); if (b.innerBlocks) w(b.innerBlocks) } }; w(blocks); return o }

/** Extrai { titulo, intro[], obs[] } do fim do diagnóstico V1 (após a última diag-sugestoes). */
function gabaritoDoDoc(doc) {
  const pg = (doc?.pages || []).find((p) => p.kind === 'conteudo'); const blocks = pg?.blocks || []
  let lastSug = -1; blocks.forEach((b, i) => { if (b.type === 'diag-sugestoes') lastSug = i })
  const tail = lastSug >= 0 ? blocks.slice(lastSug + 1) : []
  const intro = []; const obs = []; let titulo = ''
  for (const b of tail) {
    if (b.type === 'texto-livre') { const t = (b.attributes?.texto || '').trim(); if (t) intro.push(t); continue }
    if (b.type === 'card') {
      const txts = innerTxt(b.innerBlocks).map((s) => (s || '').trim()).filter(Boolean)
      const joined = txts.join('\n')
      if (/quest[aã]o/i.test(joined)) {
        for (const linha of joined.split('\n').map((l) => l.trim()).filter(Boolean)) obs.push(linha.replace(/^>+\s*/, ''))
      } else if (!titulo && /gabarito|desatualiz|atualiz/i.test(joined)) {
        titulo = txts[0]
      }
    }
  }
  if (!intro.length && !obs.length) return null
  return { titulo: titulo || 'GABARITO OFICIAL DESATUALIZADO', intro, obs }
}

console.log(`MODO: ${APLICAR ? 'APLICAR' : 'DRY-RUN'} | escopo: ${SOMENTE_CEBRASPE ? 'CEBRASPE' : 'TODOS'}\n`)
const v1 = await all('simulado_cadernos_designer', 'nome,config')
const gabPorNome = new Map()
for (const k of v1) { const doc = k.config?.docsV2?.diagnostico; if (!doc) continue; const g = gabaritoDoDoc(doc); if (!g) continue; const key = (k.nome || '').trim().toLowerCase(); const cur = gabPorNome.get(key); if (!cur || (g.obs.length + g.intro.length) > (cur.obs.length + cur.intro.length)) gabPorNome.set(key, g) }

const ct = await all('simulado_cadernos_teste', 'id,nome,config')
const backup = []; let n = 0
for (const c of ct) {
  if (SOMENTE_CEBRASPE && !/cebraspe/i.test(c.nome || '')) continue
  const b = c.config?.builderV3; if (!b?.itens) continue
  const g = gabPorNome.get((c.nome || '').trim().toLowerCase())
  if (!g) continue
  let mudou = false
  const itens = b.itens.map((it) => {
    if (it.modalidade !== 'diagnostico' || !it.conteudo) return it
    const partes = (it.conteudo.partesOcultas || []).filter((p) => p !== 'gabarito')
    mudou = true
    return { ...it, conteudo: { ...it.conteudo, gabaritoTitulo: g.titulo, gabaritoIntro: g.intro, gabaritoObs: g.obs, fechamento: [], partesOcultas: partes } }
  })
  if (!mudou) continue
  n++; backup.push({ id: c.id, config_antes: c.config })
  console.log(` • ${c.nome}: gabarito "${g.titulo}" — intro ${g.intro.length}, obs ${g.obs.length}`)
  if (APLICAR) { const r = await patch('simulado_cadernos_teste', c.id, { config: { ...c.config, builderV3: { ...b, itens } } }); if (!r.ok) console.error('   ERRO', await r.text()) }
}
console.log(`\n${APLICAR ? 'Corrigidos' : 'A corrigir'}: ${n}.`)
if (APLICAR) { writeFileSync('scripts/_backup-corrigir-gabarito-diag.json', JSON.stringify(backup, null, 2)); console.log('Backup: scripts/_backup-corrigir-gabarito-diag.json') }
