// Migração V1 → V2 (cadernos/PDF + HUD). Idempotente, com backup.
//   DRY-RUN:  node scripts/migrar-v1-para-v2.mjs
//   APLICAR:  node scripts/migrar-v1-para-v2.mjs --aplicar
//
// Parte A (HUD): copia hudCores/hudPorPagina do caderno V1 vinculado a cada banco
//   para simulado_pastas.hud (só se o banco ainda não tem HUD V2).
// Parte B (Cadernos/PDF): para cada caderno V1 com PDF (material/material_enunciado)
//   vinculado a um banco, cria um caderno-teste V2 carregando os PDFs + nome + banco
//   (pula se já existe caderno-teste de mesmo nome naquele banco).
import { readFileSync, writeFileSync } from 'node:fs'

const APLICAR = process.argv.includes('--aplicar')
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }

async function fetchAll(table, select) {
  const out = []; let from = 0; const step = 1000
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`, { headers: { ...H, Range: `${from}-${from + step - 1}` } })
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`)
    const rows = await r.json(); out.push(...rows)
    if (rows.length < step) break; from += step
  }
  return out
}
const patch = (table, id, body) => fetch(`${URL}/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body) })
const insert = (table, body) => fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) })

const has = (o) => o && typeof o === 'object' && Object.keys(o).length > 0
const temHud = (cfg) => has(cfg?.hudCores) || has(cfg?.hudPorPagina)

console.log(`URL: ${URL}\nMODO: ${APLICAR ? 'APLICAR (grava)' : 'DRY-RUN (não grava)'}\n`)

let cadernos
try { cadernos = await fetchAll('simulado_cadernos_designer', 'id,tenant_id,nome,pasta_id,cor,icone,capa_url,config') }
catch { cadernos = await fetchAll('simulado_cadernos_designer', 'id,tenant_id,nome,config') }
let pastas
try { pastas = await fetchAll('simulado_pastas', 'id,tenant_id,nome,caderno_id,is_folder,hud') }
catch { pastas = await fetchAll('simulado_pastas', 'id,tenant_id,nome,caderno_id,is_folder') }
const cadTeste = await fetchAll('simulado_cadernos_teste', 'id,tenant_id,nome,config')

const pastaById = new Map(pastas.map((p) => [p.id, p]))
const cadById = new Map(cadernos.map((k) => [k.id, k]))
const bancos = pastas.filter((p) => !p.is_folder)

// ---------- PARTE A: HUD → pasta.hud ----------
// Escolhe, por banco, o caderno V1 que fornece o HUD (config.bancoId == banco, mais recente; senão pasta.caderno_id).
const hudDoBanco = new Map() // bancoId -> caderno
const cadComHudDoBanco = cadernos.filter((k) => temHud(k.config) && k.config?.bancoId)
for (const k of cadComHudDoBanco) hudDoBanco.set(k.config.bancoId, k) // último do array prevalece
for (const p of bancos) {
  if (hudDoBanco.has(p.id)) continue
  if (p.caderno_id) { const k = cadById.get(p.caderno_id); if (k && temHud(k.config)) hudDoBanco.set(p.id, k) }
}

const planoHud = []
for (const [bid, k] of hudDoBanco) {
  const p = pastaById.get(bid)
  if (!p) continue
  const jaTem = has(p.hud?.hudCores) || has(p.hud?.hudPorPagina)
  if (jaTem) continue
  planoHud.push({ bancoId: bid, banco: p.nome, cadernoOrigem: k.nome, hud: { hudCores: k.config.hudCores ?? {}, hudPorPagina: k.config.hudPorPagina ?? {} } })
}

// ---------- PARTE B: Cadernos/PDF → caderno-teste ----------
const cadTestePorBancoNome = new Set()
for (const t of cadTeste) {
  const b = t.config?.builderV3?.bancoId || t.config?.bancoId
  if (b) cadTestePorBancoNome.add(`${t.tenant_id}|${b}|${(t.nome || '').trim().toLowerCase()}`)
}
const planoCad = []
for (const k of cadernos) {
  const cfg = k.config || {}
  const bid = cfg.bancoId
  const temPdf = cfg.material?.pdfUrl || cfg.material_enunciado?.pdfUrl
  if (!bid || !temPdf) continue
  const chave = `${k.tenant_id}|${bid}|${(k.nome || '').trim().toLowerCase()}`
  if (cadTestePorBancoNome.has(chave)) continue // já existe (ou já foi enfileirado) caderno-teste equivalente
  cadTestePorBancoNome.add(chave) // dedupe também dentro desta execução
  planoCad.push({
    tenant_id: k.tenant_id, banco: pastaById.get(bid)?.nome ?? bid, nome: k.nome,
    novoConfig: {
      bancoId: bid,
      builderV3: { v: 3, bancoId: bid, itens: [], ativo: '' },
      ...(cfg.material ? { material: cfg.material } : {}),
      ...(cfg.material_enunciado ? { material_enunciado: cfg.material_enunciado } : {}),
    },
    cor: k.cor ?? null, icone: k.icone ?? null, capa_url: k.capa_url ?? null,
  })
}

console.log('===== PARTE A — HUD → pasta.hud =====')
console.log(`Bancos a receber HUD: ${planoHud.length}`)
for (const x of planoHud) console.log(`  • [${x.banco}] ← caderno "${x.cadernoOrigem}"  (cores=${Object.keys(x.hud.hudCores).length}, porPagina=${Object.keys(x.hud.hudPorPagina).length})`)

console.log('\n===== PARTE B — Cadernos/PDF → caderno-teste =====')
console.log(`Cadernos-teste a criar: ${planoCad.length}`)
for (const x of planoCad) console.log(`  • "${x.nome}"  → banco [${x.banco}]  (material=${!!x.novoConfig.material}, enunciado=${!!x.novoConfig.material_enunciado})`)

if (!APLICAR) { console.log('\nDRY-RUN: nada gravado. Rode com --aplicar para executar.'); process.exit(0) }

// ---------- BACKUP ----------
writeFileSync('scripts/_backup-migracao-v1v2.json', JSON.stringify({
  quando: new Date().toISOString(),
  hud_pastas_antes: planoHud.map((x) => ({ id: x.bancoId, hud_antes: pastaById.get(x.bancoId)?.hud ?? null })),
}, null, 2))

// ---------- APLICAR A ----------
let okA = 0
for (const x of planoHud) {
  const r = await patch('simulado_pastas', x.bancoId, { hud: x.hud })
  if (r.ok) okA++; else console.error(`  ERRO HUD ${x.banco}: ${r.status} ${await r.text()}`)
}
// ---------- APLICAR B ----------
const criados = []
for (const x of planoCad) {
  const r = await insert('simulado_cadernos_teste', { tenant_id: x.tenant_id, nome: x.nome, config: x.novoConfig, cor: x.cor, icone: x.icone, capa_url: x.capa_url })
  if (r.ok) { const rows = await r.json(); criados.push(rows[0]?.id); }
  else console.error(`  ERRO cadTeste "${x.nome}": ${r.status} ${await r.text()}`)
}
writeFileSync('scripts/_backup-migracao-v1v2-criados.json', JSON.stringify({ cadernos_teste_criados: criados }, null, 2))

console.log(`\nCONCLUÍDO. HUD gravados: ${okA}/${planoHud.length}. Cadernos-teste criados: ${criados.length}/${planoCad.length}.`)
console.log('Backups: scripts/_backup-migracao-v1v2.json (HUD antes) e _backup-migracao-v1v2-criados.json (ids criados).')
