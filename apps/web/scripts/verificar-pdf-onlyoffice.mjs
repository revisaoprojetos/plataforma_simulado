// READ-ONLY (só converte; não grava no banco) — confirma que a v2 cortada converte em PDF pelo OnlyOffice
// e conta páginas ANTES(oldVer) → DEPOIS(newVer). Lê o rollback-capas.jsonl p/ saber os pares de versão.
// Uso: cd apps/web && node scripts/verificar-pdf-onlyoffice.mjs [quantos]
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

async function keyDe(versaoId) { const { data } = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('tenant_id', T).eq('id', versaoId).maybeSingle(); return data?.arquivo_key }
async function signed(arquivoKey) { const { data } = await svc.storage.from('pdfs').createSignedUrl(arquivoKey, 3600); return data?.signedUrl }

async function converter(url, key) {
  const payload = { async: false, filetype: 'docx', outputtype: 'pdf', key: key.replace(/[^a-z0-9_-]/gi, '').slice(0, 60), title: 'doc.docx', url }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (SEG) { const tk = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(SEG)); payload.token = tk; headers.Authorization = `Bearer ${tk}` }
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 90000)
  try {
    const resp = await fetch(`${OO}/ConvertService.ashx`, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal })
    if (!resp.ok) return { erro: 'http ' + resp.status }
    const j = await resp.json().catch(() => null)
    if (!j || j.error || !j.fileUrl) return { erro: 'oo ' + JSON.stringify(j?.error ?? j) }
    const f = await fetch(j.fileUrl); if (!f.ok) return { erro: 'fetch pdf ' + f.status }
    const buf = Buffer.from(await f.arrayBuffer())
    const s = buf.toString('latin1'); const paginas = (s.match(/\/Type\s*\/Page[^s]/g) || []).length
    return { paginas, bytes: buf.length }
  } catch (e) { return { erro: e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e)) } } finally { clearTimeout(to) }
}

const quantos = Number(process.argv[2]) || 99
const linhas = readFileSync(SCRATCH + '\\rollback-capas.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)).slice(-quantos)
console.log(`\n=== Verificação OnlyOffice (${linhas.length} docs) — OO=${OO ? 'ok' : 'FALTANDO'} JWT=${SEG ? 'sim' : 'não'} ===\n`)
for (const r of linhas) {
  const [koNew, koOld] = [await keyDe(r.newVer), await keyDe(r.oldVer)]
  const [uNew, uOld] = [await signed(koNew), await signed(koOld)]
  const antes = await converter(uOld, 'old' + r.oldVer)
  const depois = await converter(uNew, 'new' + r.newVer)
  const fmtP = (x) => x.erro ? `ERRO(${x.erro})` : `${x.paginas}p`
  const delta = (!antes.erro && !depois.erro) ? `  Δ=-${antes.paginas - depois.paginas}pg` : ''
  console.log(`• ${r.titulo.slice(0, 52)}\n    antes ${fmtP(antes)} → depois ${fmtP(depois)}${delta}`)
}
process.exit(0)
