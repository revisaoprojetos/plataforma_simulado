// Ajusta os grifos de PDF dos 5 docs cortados: mede páginas ANTES(oldVer)→DEPOIS(newVer) via OnlyOffice,
// e desloca grifo.pagina pela diferença (clampa em 1 se cair na região da capa). Uso: node scripts/ajustar-grifos.mjs [--apply]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
const SCRATCH = 'C:\\Users\\joooa\\AppData\\Local\\Temp\\claude\\c--Users-joooa-Downloads-Plataforma-Simulado\\526b571b-6115-41c1-9720-26c054780cda\\scratchpad'
function lerEnv(p) { const e = {}; for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); e[m[1]] = v } return e }
const env = lerEnv('.env.local')
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const OO = (env.ONLYOFFICE_INTERNAL_URL || env.NEXT_PUBLIC_ONLYOFFICE_URL || '').replace(/\/$/, '')
const SEG = env.ONLYOFFICE_JWT_SECRET
const APPLY = process.argv.includes('--apply')
const IDS = ['9cd0fa95-bb16-4f70-8f88-f2fec4949656', '9275d1f1-5f40-4ffe-a888-62b126c14346', 'cf507ac9-3122-4fdf-8706-a3b77da62c54', '817aa177-f673-4664-9086-3c52cab8d797', 'f0fac116-fb62-4568-b45a-7700460bb7a2']

async function keyDe(v) { const { data } = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('tenant_id', T).eq('id', v).maybeSingle(); return data?.arquivo_key }
async function signed(k) { const { data } = await svc.storage.from('pdfs').createSignedUrl(k, 1800); return data?.signedUrl }
async function paginas(url, key) {
  const payload = { async: false, filetype: 'docx', outputtype: 'pdf', key: key.replace(/[^a-z0-9_-]/gi, '').slice(0, 60), title: 'd.docx', url }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (SEG) { const tk = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(SEG)); payload.token = tk; headers.Authorization = `Bearer ${tk}` }
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 90000)
  try { const r = await fetch(`${OO}/ConvertService.ashx`, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal }); const j = await r.json().catch(() => null); if (!j || j.error || !j.fileUrl) return null; const f = await fetch(j.fileUrl); const s = Buffer.from(await f.arrayBuffer()).toString('latin1'); return (s.match(/\/Type\s*\/Page[^s]/g) || []).length } catch { return null } finally { clearTimeout(to) }
}

const roll = new Map()
for (const l of readFileSync(SCRATCH + '\\rollback-capas.jsonl', 'utf8').split(/\r?\n/).filter(Boolean)) { const r = JSON.parse(l); roll.set(r.docId, r) }
console.log(`\n=== Ajuste de grifos (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`)
for (const id of IDS) {
  const { data: doc } = await svc.from('simulado_conteudo_documentos').select('titulo').eq('id', id).maybeSingle()
  const r = roll.get(id)
  if (!r) { console.log(`• ${doc?.titulo?.slice(0, 40)} → sem entrada de rollback (não cortado?) — pulo`); continue }
  const [pOld, pNew] = [await paginas(await signed(await keyDe(r.oldVer)), 'o' + r.oldVer), await paginas(await signed(await keyDe(r.newVer)), 'n' + r.newVer)]
  if (pOld == null || pNew == null) { console.log(`• ${doc?.titulo?.slice(0, 40)} → erro medindo páginas (old=${pOld} new=${pNew})`); continue }
  const delta = pOld - pNew
  const { data: grifos } = await svc.from('simulado_conteudo_grifos_pdf').select('id, pagina').eq('tenant_id', T).eq('documento_id', id)
  let clamp = 0
  console.log(`• ${doc?.titulo?.slice(0, 46)}\n    páginas ${pOld}→${pNew} (Δ=-${delta}) | ${grifos.length} grifo(s)`)
  for (const g of grifos) {
    let nova = g.pagina - delta
    if (nova < 1) { nova = 1; clamp++ }
    if (APPLY) await svc.from('simulado_conteudo_grifos_pdf').update({ pagina: nova }).eq('id', g.id).eq('tenant_id', T)
  }
  console.log(`    ${APPLY ? 'aplicado' : 'simulado'}: desloca -${delta} pág${clamp ? `, ${clamp} na região da capa → pág.1` : ''}`)
}
if (!APPLY) console.log('\n(dry-run — rode com --apply para gravar)')
process.exit(0)
