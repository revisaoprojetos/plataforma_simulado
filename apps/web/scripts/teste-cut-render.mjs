// TESTE (não altera versionamento) — corta docs por título, sobe num caminho TEMP (tmp/teste-corte/),
// renderiza a 1ª página via OnlyOffice e salva PNG p/ conferência. Uso: node scripts/teste-cut-render.mjs "titulo" ...
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
const SCRATCH = 'C:\\Users\\joooa\\AppData\\Local\\Temp\\claude\\c--Users-joooa-Downloads-Plataforma-Simulado\\526b571b-6115-41c1-9720-26c054780cda\\scratchpad'
const PNGDIR = SCRATCH + '\\png-teste'; try { mkdirSync(PNGDIR, { recursive: true }) } catch {}
function lerEnv(p) { const e = {}; for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); e[m[1]] = v } return e }
const env = lerEnv('.env.local')
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const OO = (env.ONLYOFFICE_INTERNAL_URL || env.NEXT_PUBLIC_ONLYOFFICE_URL || '').replace(/\/$/, '')
const SEG = env.ONLYOFFICE_JWT_SECRET
globalThis.__PizZip = (await import('pizzip')).default
const { cortarCapaBuffer } = await import('./cortar-capa-docx.mjs')
async function png(url, key) {
  const payload = { async: false, filetype: 'docx', outputtype: 'png', key: key.replace(/[^a-z0-9_-]/gi, '').slice(0, 60), title: 'thumb.docx', url, thumbnail: { first: true, aspect: 1, width: 1000, height: 1414 } }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (SEG) { const tk = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(SEG)); payload.token = tk; headers.Authorization = `Bearer ${tk}` }
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 30000)
  try { const r = await fetch(`${OO}/ConvertService.ashx`, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal }); const j = await r.json().catch(() => null); if (!j || j.error || !j.fileUrl) return { erro: JSON.stringify(j?.error ?? j) }; const f = await fetch(j.fileUrl); return { buf: Buffer.from(await f.arrayBuffer()) } } catch (e) { return { erro: e?.message || String(e) } } finally { clearTimeout(to) }
}
let i = 0
for (const termo of process.argv.slice(2)) {
  i++
  const { data: docs } = await svc.from('simulado_conteudo_documentos').select('id,titulo,versao_atual_id').eq('tenant_id', T).ilike('titulo', `%${termo}%`).limit(1)
  if (!docs?.[0]) { console.log(`• "${termo}" não achei`); continue }
  const { data: ver } = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('id', docs[0].versao_atual_id).maybeSingle()
  const { data: blob } = await svc.storage.from('pdfs').download(ver.arquivo_key)
  const r = cortarCapaBuffer(Buffer.from(await blob.arrayBuffer()))
  if (!r.out) { console.log(`• ${docs[0].titulo.slice(0, 40)} → PULAR (${r.motivo})`); continue }
  const key = `tmp/teste-corte/${Date.now()}-${i}.docx`
  const up = await svc.storage.from('pdfs').upload(key, r.out, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: true })
  if (up.error) { console.log(`• ${docs[0].titulo.slice(0, 40)} → upload erro: ${up.error.message}`); continue }
  const { data: su } = await svc.storage.from('pdfs').createSignedUrl(key, 1200)
  const png1 = await png(su.signedUrl, 't' + i + Date.now())
  const slug = String(i).padStart(2, '0') + '_' + termo.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 24)
  if (png1.buf) { writeFileSync(`${PNGDIR}\\${slug}.png`, png1.buf); console.log(`• ${docs[0].titulo.slice(0, 44)} → [${r.motivo}] -${r.removidos} | PNG ok (${png1.buf.length}b)`) }
  else console.log(`• ${docs[0].titulo.slice(0, 44)} → [${r.motivo}] -${r.removidos} | PNG ERRO: ${png1.erro}`)
  await svc.storage.from('pdfs').remove([key]) // limpa o temp
}
console.log('PNGs em:', PNGDIR)
process.exit(0)
