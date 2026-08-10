// Ajusta a posição/título da CAPA de cada item dos cadernos-teste migrados para bater com o V1
// (derivado do espaçador + bloco de título da capa do doc V1). Pula os cadernos "CEBRASPE".
//   DRY-RUN:  node scripts/ajustar-titulos-capa-v1.mjs
//   APLICAR:  node scripts/ajustar-titulos-capa-v1.mjs --aplicar
import { readFileSync, writeFileSync } from 'node:fs'

const APLICAR = process.argv.includes('--aplicar')
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const A4_H = 1123

async function fetchAll(t, s) {
  const out = []; let f = 0; const st = 1000
  for (;;) { const r = await fetch(`${URL}/rest/v1/${t}?select=${encodeURIComponent(s)}`, { headers: { ...H, Range: `${f}-${f + st - 1}` } }); if (!r.ok) throw new Error(`${t}: ${r.status} ${await r.text()}`); const rows = await r.json(); out.push(...rows); if (rows.length < st) break; f += st } return out
}
const patch = (t, id, body) => fetch(`${URL}/rest/v1/${t}?id=eq.${id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body) })

const MODELO_PARA_KEY = { agu_perguntas: 'caderno_perguntas', agu_completo: 'caderno_completo', agu_folha: 'gabarito_objetivo', agu_discursivo: 'gabarito_discursivo', base_4: 'diagnostico', padrao: 'diagnostico', agu_diagnostico: 'diagnostico' }

/** Todos os texto-livre da capa (inclui aninhados em colunas). */
function textosDaCapa(capaPage) {
  const out = []
  const walk = (blocks) => { for (const b of (blocks || [])) { if ((b.type || b.kind) === 'texto-livre') out.push(b.attributes || {}); if (b.innerBlocks) walk(b.innerBlocks) } }
  walk(capaPage?.blocks)
  return out
}
/** Deriva { titulo, cor, tamanho, alinhamento, posV } da capa do doc V1. */
function capaDoDocV1(doc) {
  const capa = (doc?.pages || []).find((p) => p.kind === 'capa')
  if (!capa) return null
  const esp = (capa.blocks || []).find((b) => (b.type || b.kind) === 'espacador')
  const espH = Number(esp?.attributes?.altura ?? esp?.attributes?.h ?? 0) || 0
  const txts = textosDaCapa(capa)
  // título = maior texto-livre com conteúdo
  const titulo = txts.filter((a) => (a.texto || '').trim()).sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0))[0]
  const size = Number(titulo?.size) || 44
  // centro do título ≈ espaçador + metade da altura estimada do título
  const posV = Math.max(8, Math.min(92, Math.round(((espH + size * 1.3) / A4_H) * 100)))
  return {
    titulo: (titulo?.texto || '').trim(), cor: titulo?.color || '#ffffff', tamanho: size,
    fonte: titulo?.fonte || 'montserrat', negrito: titulo?.bold !== false, italico: !!titulo?.italico, sublinhado: !!titulo?.sublinhado,
    alinhamento: (titulo?.align === 'left' || titulo?.align === 'right') ? titulo.align : 'center', posV, posH: 50,
  }
}

console.log(`URL: ${URL}\nMODO: ${APLICAR ? 'APLICAR' : 'DRY-RUN'}\n`)

let cadernos
try { cadernos = await fetchAll('simulado_cadernos_designer', 'id,tenant_id,nome,config') } catch { cadernos = [] }
const v1PorChave = new Map()
for (const k of cadernos) { const b = k.config?.bancoId; if (b) v1PorChave.set(`${k.tenant_id}|${b}|${(k.nome || '').trim().toLowerCase()}`, k) }
const cadTeste = await fetchAll('simulado_cadernos_teste', 'id,tenant_id,nome,config')

const backup = []
let ajustados = 0, itensAj = 0, pulados = 0
for (const t of cadTeste) {
  const b = t.config?.builderV3
  if (!b || !Array.isArray(b.itens)) continue
  const banco = b.bancoId || t.config?.bancoId
  const v1 = v1PorChave.get(`${t.tenant_id}|${banco}|${(t.nome || '').trim().toLowerCase()}`)
  if (!v1) continue
  if (/cebraspe/i.test(t.nome || '')) { pulados++; continue } // exceto CEBRASPE
  const docs = v1.config?.docsV2 || {}
  let mudou = false
  const itens = b.itens.map((it) => {
    const key = MODELO_PARA_KEY[it.modelo]
    const doc = key ? docs[key] : null
    const cap = doc ? capaDoDocV1(doc) : null
    if (!cap || !cap.titulo) return it
    mudou = true; itensAj++
    return { ...it, capa: cap }
  })
  if (!mudou) continue
  backup.push({ id: t.id, config_antes: t.config })
  ajustados++
  if (APLICAR) { const r = await patch('simulado_cadernos_teste', t.id, { config: { ...t.config, builderV3: { ...b, itens } } }); if (!r.ok) console.error(`  ERRO ${t.nome}: ${r.status} ${await r.text()}`) }
  console.log(`  • ${t.nome}: ${itens.filter((i) => i.capa?.titulo).length} capas ajustadas (posV: ${itens.map((i) => i.capa?.posV).filter(Boolean).join('/')})`)
}

console.log(`\n${APLICAR ? 'Ajustados' : 'A ajustar'}: ${ajustados} cadernos (${itensAj} itens). Pulados (CEBRASPE): ${pulados}.`)
if (APLICAR) { writeFileSync('scripts/_backup-ajuste-titulos-capa.json', JSON.stringify(backup, null, 2)); console.log('Backup: scripts/_backup-ajuste-titulos-capa.json') }
else console.log('DRY-RUN: nada gravado.')
