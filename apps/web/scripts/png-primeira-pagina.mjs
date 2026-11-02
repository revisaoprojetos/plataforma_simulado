// READ-ONLY — gera PNG da 1ª página (OnlyOffice) do ANTES(oldVer) e DEPOIS(newVer) de cada entrada do
// rollback-capas.jsonl, p/ conferência visual. Salva em <scratch>\png\. Uso: node scripts/png-primeira-pagina.mjs [N]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
const SCRATCH = 'C:\\Users\\joooa\\AppData\\Local\\Temp\\claude\\c--Users-joooa-Downloads-Plataforma-Simulado\\526b571b-6115-41c1-9720-26c054780cda\\scratchpad'
const PNGDIR = SCRATCH + '\\png'; try { mkdirSync(PNGDIR, { recursive: true }) } catch {}
function lerEnv(p) { const e = {}; for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); e[m[1]] = v } return e }
const env = lerEnv('.env.local')
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const OO = (env.ONLYOFFICE_INTERNAL_URL || env.NEXT_PUBLIC_ONLYOFFICE_URL || '').replace(/\/$/, '')
const SEG = env.ONLYOFFICE_JWT_SECRET
async function keyDe(v) { const { data } = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('tenant_id', T).eq('id', v).maybeSingle(); return data?.arquivo_key }
async function signed(k) { const { data } = await svc.storage.from('pdfs').createSignedUrl(k, 3600); return data?.signedUrl }
async function png(url, key) {
  const payload = { async: false, filetype: 'docx', outputtype: 'png', key: key.replace(/[^a-z0-9_-]/gi, '').slice(0, 60), title: 'thumb.docx', url, thumbnail: { first: true, aspect: 1, width: 1000, height: 1414 } }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (SEG) { const tk = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(SEG)); payload.token = tk; headers.Authorization = `Bearer ${tk}` }
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 30000)
  try {
    const resp = await fetch(`${OO}/ConvertService.ashx`, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal })
    const j = await resp.json().catch(() => null)
    if (!j || j.error || !j.fileUrl) return null
    const f = await fetch(j.fileUrl); if (!f.ok) return null
    return Buffer.from(await f.arrayBuffer())
  } catch { return null } finally { clearTimeout(to) }
}
const N = Number(process.argv[2]) || 99
const linhas = readFileSync(SCRATCH + '\\rollback-capas.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)).slice(-N)
let i = 0
for (const r of linhas) {
  i++
  const slug = String(i).padStart(2, '0') + '_' + (r.titulo || '').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 30)
  const [uOld, uNew] = [await signed(await keyDe(r.oldVer)), await signed(await keyDe(r.newVer))]
  const a = await png(uOld, 'a' + r.oldVer), b = await png(uNew, 'b' + r.newVer)
  if (a) writeFileSync(`${PNGDIR}\\${slug}_ANTES.png`, a)
  if (b) writeFileSync(`${PNGDIR}\\${slug}_DEPOIS.png`, b)
  console.log(`${slug}  antes=${a ? a.length + 'b' : 'FALHA'}  depois=${b ? b.length + 'b' : 'FALHA'}`)
}
console.log('PNGs em:', PNGDIR)
process.exit(0)
