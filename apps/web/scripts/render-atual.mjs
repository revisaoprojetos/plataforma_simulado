// READ-ONLY — renderiza a 1ª página da versão ATUAL de docs (por título) p/ conferência. Não grava nada.
// Uso: node scripts/render-atual.mjs "titulo" ...
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
const DIR = 'C:/Users/joooa/AppData/Local/Temp/claude/c--Users-joooa-Downloads-Plataforma-Simulado/526b571b-6115-41c1-9720-26c054780cda/scratchpad/png-atual'
try { mkdirSync(DIR, { recursive: true }) } catch {}
function lerEnv(p) { const e = {}; for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); e[m[1]] = v } return e }
const env = lerEnv('.env.local')
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const OO = (env.ONLYOFFICE_INTERNAL_URL || env.NEXT_PUBLIC_ONLYOFFICE_URL || '').replace(/\/$/, '')
const SEG = env.ONLYOFFICE_JWT_SECRET
async function png(url, key) {
  const payload = { async: false, filetype: 'docx', outputtype: 'png', key: key.replace(/[^a-z0-9_-]/gi, '').slice(0, 60), title: 't.docx', url, thumbnail: { first: true, aspect: 1, width: 1000, height: 1414 } }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (SEG) { const tk = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(SEG)); payload.token = tk; headers.Authorization = `Bearer ${tk}` }
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 40000)
  try { const r = await fetch(`${OO}/ConvertService.ashx`, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal }); const j = await r.json().catch(() => null); if (!j || j.error || !j.fileUrl) return null; const f = await fetch(j.fileUrl); return Buffer.from(await f.arrayBuffer()) } catch { return null } finally { clearTimeout(to) } }
let i = 0
for (const termo of process.argv.slice(2)) {
  i++
  const { data: docs } = await svc.from('simulado_conteudo_documentos').select('id,titulo,versao_atual_id').eq('tenant_id', T).ilike('titulo', '%' + termo.replace(/[%_]/g, (c) => '\\' + c) + '%').limit(1)
  if (!docs?.[0]) { console.log(`? ${termo}`); continue }
  const { data: ver } = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('id', docs[0].versao_atual_id).maybeSingle()
  const { data: su } = await svc.storage.from('pdfs').createSignedUrl(ver.arquivo_key, 1200)
  const b = await png(su.signedUrl, 'v' + Date.now() + i)
  const slug = String(i).padStart(2, '0') + '_' + termo.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 26)
  if (b) { writeFileSync(`${DIR}/${slug}.png`, b); console.log(`${slug} → ${b.length}b`) } else console.log(`${slug} → FALHA`)
}
console.log('em', DIR)
process.exit(0)
