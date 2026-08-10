// Corrige nos diagnósticos V2: (1) notaTotal "{acertos}/{total}" → "{total}" (render já mostra acertos/notaTotal);
// (2) título da capa vazio → extrai do V1 (foco CEBRASPE, mas trata qualquer capa.titulo vazio).
//   DRY-RUN:  node scripts/corrigir-nota-capa-diag.mjs
//   APLICAR:  node scripts/corrigir-nota-capa-diag.mjs --aplicar
import { readFileSync, writeFileSync } from 'node:fs'
const APLICAR = process.argv.includes('--aplicar')
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const A4_H = 1123
async function all(t, s) { const o = []; let f = 0; for (;;) { const r = await fetch(`${URL}/rest/v1/${t}?select=${encodeURIComponent(s)}`, { headers: { ...H, Range: `${f}-${f + 999}` } }); const rows = await r.json(); o.push(...rows); if (rows.length < 1000) break; f += 1000 } return o }
const patch = (t, id, b) => fetch(`${URL}/rest/v1/${t}?id=eq.${id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(b) })
const CAPA = { titulo: '', cor: '#ffffff', tamanho: 44, fonte: 'montserrat', negrito: true, italico: false, sublinhado: false, alinhamento: 'center', posV: 68, posH: 50 }
function capaDoDoc(doc) {
  const capa = (doc?.pages || []).find((p) => p.kind === 'capa'); if (!capa) return null
  const esp = (capa.blocks || []).find((b) => (b.type || b.kind) === 'espacador'); const espH = Number(esp?.attributes?.altura ?? 0) || 0
  const txts = []; const walk = (bs) => { for (const b of (bs || [])) { if ((b.type || b.kind) === 'texto-livre') txts.push(b.attributes || {}); if (b.innerBlocks) walk(b.innerBlocks) } }; walk(capa.blocks)
  const tit = txts.filter((a) => (a.texto || '').trim()).sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0))[0]; if (!tit) return null
  const size = Number(tit.size) || 44
  return { titulo: (tit.texto || '').trim(), cor: tit.color || '#ffffff', tamanho: size, fonte: tit.fonte || 'montserrat', negrito: tit.bold !== false, italico: !!tit.italico, sublinhado: !!tit.sublinhado, alinhamento: (tit.align === 'left' || tit.align === 'right') ? tit.align : 'center', posV: Math.max(8, Math.min(92, Math.round(((espH + size * 1.3) / A4_H) * 100))), posH: 50 }
}

console.log(`MODO: ${APLICAR ? 'APLICAR' : 'DRY-RUN'}\n`)
const v1 = await all('simulado_cadernos_designer', 'nome,config')
const diagV1PorNome = new Map()
for (const k of v1) { const doc = k.config?.docsV2?.diagnostico; const pg = (doc?.pages || []).find((p) => p.kind === 'capa'); if (!pg) continue; const key = (k.nome || '').trim().toLowerCase(); if (!diagV1PorNome.has(key)) diagV1PorNome.set(key, doc) }

const ct = await all('simulado_cadernos_teste', 'id,nome,config')
const backup = []; let nNota = 0, nCapa = 0, nCad = 0
for (const c of ct) {
  const b = c.config?.builderV3; if (!b?.itens) continue
  let mudou = false
  const itens = b.itens.map((it) => {
    if (it.modalidade !== 'diagnostico' || !it.conteudo) return it
    let it2 = it
    // (1) notaTotal
    const nt = it.conteudo.notaTotal
    if (nt && /\{[^}]+\}\s*\/\s*\{[^}]+\}/.test(nt)) {
      const novo = nt.replace(/\{[^}]+\}\s*\/\s*(\{[^}]+\})/, '$1')
      it2 = { ...it2, conteudo: { ...it2.conteudo, notaTotal: novo } }; mudou = true; nNota++
    }
    // (2) capa título vazio → do V1
    if (!it2.capa?.titulo) {
      const doc = diagV1PorNome.get((c.nome || '').trim().toLowerCase())
      const cap = doc ? capaDoDoc(doc) : null
      if (cap?.titulo) { it2 = { ...it2, capa: { ...CAPA, ...(it2.capa || {}), ...cap } }; mudou = true; nCapa++ }
    }
    return it2
  })
  if (!mudou) continue
  nCad++
  backup.push({ id: c.id, config_antes: c.config })
  console.log(` • ${c.nome}`)
  if (APLICAR) { const r = await patch('simulado_cadernos_teste', c.id, { config: { ...c.config, builderV3: { ...b, itens } } }); if (!r.ok) console.error('   ERRO', await r.text()) }
}
console.log(`\n${APLICAR ? 'Corrigidos' : 'A corrigir'}: ${nCad} cadernos | notaTotal: ${nNota} | capa título: ${nCapa}.`)
if (APLICAR) { writeFileSync('scripts/_backup-corrigir-nota-capa-diag.json', JSON.stringify(backup, null, 2)); console.log('Backup: scripts/_backup-corrigir-nota-capa-diag.json') }
