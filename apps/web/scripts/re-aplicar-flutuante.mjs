// Re-aplica o corte (trim simples) nas 41 leis com legenda flutuante, com VERIFICAÇÃO de render por doc:
// corta a versão atual → sobe num TEMP → renderiza a 1ª página → se NÃO ficar em branco, comita (nova
// versão + ponteiro); se ficar em branco (caso monolítico), PULA e sinaliza. Lê os títulos do relatório.
// Uso: node scripts/re-aplicar-flutuante.mjs [--apply]   (sem --apply = dry-run: renderiza e relata, não grava)
import { readFileSync, appendFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
const SCRATCH = 'C:\\Users\\joooa\\AppData\\Local\\Temp\\claude\\c--Users-joooa-Downloads-Plataforma-Simulado\\526b571b-6115-41c1-9720-26c054780cda\\scratchpad\\'
const ROLL = SCRATCH + 'rollback-flutuante.jsonl'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const LIMIAR_BRANCO = 20000 // PNG < 20KB ≈ página em branco
function lerEnv(p) { const e = {}; for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); e[m[1]] = v } return e }
const env = lerEnv('.env.local')
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const OO = (env.ONLYOFFICE_INTERNAL_URL || env.NEXT_PUBLIC_ONLYOFFICE_URL || '').replace(/\/$/, '')
const SEG = env.ONLYOFFICE_JWT_SECRET
const APPLY = process.argv.includes('--apply')
globalThis.__PizZip = (await import('pizzip')).default
const { cortarCapaBuffer } = await import('./cortar-capa-docx.mjs')

async function signed(k) { const { data } = await svc.storage.from('pdfs').createSignedUrl(k, 1200); return data?.signedUrl }
async function png(url, key) {
  const payload = { async: false, filetype: 'docx', outputtype: 'png', key: key.replace(/[^a-z0-9_-]/gi, '').slice(0, 60), title: 't.docx', url, thumbnail: { first: true, aspect: 1, width: 1000, height: 1414 } }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (SEG) { const tk = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(SEG)); payload.token = tk; headers.Authorization = `Bearer ${tk}` }
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 40000)
  try { const r = await fetch(`${OO}/ConvertService.ashx`, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal }); const j = await r.json().catch(() => null); if (!j || j.error || !j.fileUrl) return null; const f = await fetch(j.fileUrl); return Buffer.from(await f.arrayBuffer()).length } catch { return null } finally { clearTimeout(to) }
}
async function maxNumero(id) { const { data } = await svc.from('simulado_conteudo_versoes').select('numero').eq('tenant_id', T).eq('documento_id', id).order('numero', { ascending: false }).limit(1).maybeSingle(); return data?.numero ?? 1 }

// títulos das flutuantes a partir do relatório
const txt = readFileSync(SCRATCH + 'relatorio-capas.txt', 'utf8').split(/\r?\n/)
const titulos = []; let f = false
for (const ln of txt) { if (/LEGENDA FLUTUANTE/.test(ln)) { f = true; continue } if (/^■ ERROS/.test(ln)) f = false; if (f) { const m = ln.match(/^\s*-\s*(.+)$/); if (m) titulos.push(m[1].trim()) } }
console.log(`\n=== Re-apply flutuantes (${APPLY ? 'APPLY' : 'DRY-RUN'}) — ${titulos.length} docs ===\n`)

let comit = 0, branco = 0, erro = 0
for (const titulo of titulos) {
  const { data: docs } = await svc.from('simulado_conteudo_documentos').select('id, titulo, versao_atual_id').eq('tenant_id', T).eq('categoria', 'conteudo').eq('deletado', false).eq('tipo_origem', 'docx').ilike('titulo', titulo.replace(/[%_]/g, (c) => '\\' + c)).limit(1)
  const doc = docs?.[0]
  if (!doc) { console.log(`? não achei: ${titulo.slice(0, 50)}`); erro++; continue }
  const { data: ver } = await svc.from('simulado_conteudo_versoes').select('arquivo_key, vigencia_inicio, vigencia_fim').eq('id', doc.versao_atual_id).maybeSingle()
  const { data: blob } = await svc.storage.from('pdfs').download(ver.arquivo_key)
  const r = cortarCapaBuffer(Buffer.from(await blob.arrayBuffer()))
  if (!r.out) { console.log(`· ${doc.titulo.slice(0, 48)} → nada a cortar`); continue }
  const tmp = `tmp/flut-teste/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.docx`
  await svc.storage.from('pdfs').upload(tmp, r.out, { contentType: DOCX_MIME, upsert: true })
  const tam = await png(await signed(tmp), 'v' + Date.now())
  const ok = tam != null && tam >= LIMIAR_BRANCO
  if (!ok) {
    await svc.storage.from('pdfs').remove([tmp])
    console.log(`⚑ ${doc.titulo.slice(0, 48)} → ficaria EM BRANCO (png=${tam}b) — PULO (monolítico)`); branco++
    continue
  }
  if (!APPLY) { await svc.storage.from('pdfs').remove([tmp]); console.log(`✓ ${doc.titulo.slice(0, 48)} → OK (png=${tam}b) [dry]`); comit++; continue }
  // comita: move o temp p/ a chave definitiva, cria versão, move ponteiro
  const numero = (await maxNumero(doc.id)) + 1
  const novaKey = `conteudo/${T}/${doc.id}/v${numero}-${Date.now()}.docx`
  await svc.storage.from('pdfs').upload(novaKey, r.out, { contentType: DOCX_MIME, upsert: false })
  await svc.storage.from('pdfs').remove([tmp])
  const hash = createHash('sha1').update(r.out).digest('hex')
  const ins = await svc.from('simulado_conteudo_versoes').insert({ tenant_id: T, documento_id: doc.id, numero, arquivo_key: novaKey, hash_arquivo: hash, origem: 'edicao_editor', status_conversao: 'ok', vigencia_inicio: ver.vigencia_inicio ?? null, vigencia_fim: ver.vigencia_fim ?? null, paginas: null }).select('id').single()
  if (ins.error) { console.log(`✗ ${doc.titulo.slice(0, 48)} → insert: ${ins.error.message}`); erro++; continue }
  await svc.from('simulado_conteudo_documentos').update({ versao_atual_id: ins.data.id, atualizado_em: new Date().toISOString() }).eq('tenant_id', T).eq('id', doc.id)
  appendFileSync(ROLL, JSON.stringify({ docId: doc.id, titulo: doc.titulo, oldVer: doc.versao_atual_id, newVer: ins.data.id, novaKey, ts: new Date().toISOString() }) + '\n')
  console.log(`✓ ${doc.titulo.slice(0, 48)} → COMITADO (png=${tam}b)`); comit++
}
console.log(`\n=== ${APPLY ? 'FEITO' : 'DRY'}: ${comit} ok, ${branco} pulados-em-branco, ${erro} erros ===`)
if (branco) console.log('(os pulados-em-branco são monolíticos — capa já removida; 1ª pág transitória permanece)')
process.exit(0)
