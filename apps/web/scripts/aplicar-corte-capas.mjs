// APLICA o corte de capa/folhas iniciais nos .docx da Biblioteca (Revisão), criando uma v2 e movendo
// o ponteiro versao_atual_id. REVERSÍVEL (guarda rollback jsonl; versões antigas ficam imutáveis).
// Idempotente: se o doc já começa no índice/legenda (removidos=0) NÃO cria versão.
//
// Uso (de apps/web):
//   node scripts/aplicar-corte-capas.mjs --titulos "Aula 29 - PDFIGHT - Direito Tributário - Exe" ...   (amostra)
//   node scripts/aplicar-corte-capas.mjs --apply [--limit N] [--offset N] [--conc 4]                     (lote)
//   node scripts/aplicar-corte-capas.mjs --rollback                                                      (desfaz pelo jsonl)
import { readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const SCRATCH = 'C:\\Users\\joooa\\AppData\\Local\\Temp\\claude\\c--Users-joooa-Downloads-Plataforma-Simulado\\526b571b-6115-41c1-9720-26c054780cda\\scratchpad'
try { mkdirSync(SCRATCH, { recursive: true }) } catch {}
const ROLLBACK = SCRATCH + '\\rollback-capas.jsonl'
const RELATORIO = SCRATCH + '\\relatorio-capas.txt'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13'

function lerEnv(p) { const e = {}; for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); e[m[1]] = v } return e }
const env = lerEnv('.env.local')
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const MODO_TITULOS = flag('--titulos')
const MODO_APPLY = flag('--apply')
const MODO_ROLLBACK = flag('--rollback')
const LIMIT = Number(opt('--limit', '0')) || 0
const OFFSET = Number(opt('--offset', '0')) || 0
const CONC = MODO_TITULOS ? 1 : (Number(opt('--conc', '4')) || 4)

globalThis.__PizZip = (await import('pizzip')).default
const { cortarCapaBuffer } = await import('./cortar-capa-docx.mjs')

// disciplina a partir do título ("… - Direito Tributário - …") ou pasta
function disciplinaDe(titulo, pastaNome) {
  const segs = String(titulo || '').split(' - ').map((s) => s.trim())
  const d = segs.find((s) => /^(direito|processo|dir\.|legisla|lei\b)/i.test(s))
  if (d) return d.replace(/\s*\(10\.10\.26\).*/i, '').trim()
  return pastaNome || '(sem disciplina)'
}

async function carregarPastas(ids) {
  const mapa = new Map()
  const u = [...new Set(ids.filter(Boolean))]
  for (let i = 0; i < u.length; i += 80) {
    const { data } = await svc.from('simulado_pastas').select('id, nome, pai_id').in('id', u.slice(i, i + 80))
    for (const p of data ?? []) mapa.set(p.id, p)
  }
  // nome do pai (1 nível) p/ rótulo "Pai / Pasta"
  const pais = [...new Set([...mapa.values()].map((p) => p.pai_id).filter(Boolean))]
  const nomePai = new Map()
  for (let i = 0; i < pais.length; i += 80) {
    const { data } = await svc.from('simulado_pastas').select('id, nome').in('id', pais.slice(i, i + 80))
    for (const p of data ?? []) nomePai.set(p.id, p.nome)
  }
  const label = (pid) => { const p = mapa.get(pid); if (!p) return '(sem pasta)'; const pai = p.pai_id ? nomePai.get(p.pai_id) : null; return pai ? `${pai} / ${p.nome}` : p.nome }
  return { label }
}

async function versaoAtual(versaoId) {
  const { data } = await svc.from('simulado_conteudo_versoes')
    .select('id, numero, arquivo_key, hash_arquivo, vigencia_inicio, vigencia_fim').eq('tenant_id', T).eq('id', versaoId).maybeSingle()
  return data
}
async function maxNumero(documentoId) {
  const { data } = await svc.from('simulado_conteudo_versoes').select('numero').eq('tenant_id', T).eq('documento_id', documentoId).order('numero', { ascending: false }).limit(1).maybeSingle()
  return data?.numero ?? 1
}

// processa UM doc; devolve {status, motivo, removidos, disciplina, pasta, titulo, docId}
async function processar(doc, pastaLabel) {
  const pasta = pastaLabel(doc.pasta_id)
  const disciplina = disciplinaDe(doc.titulo, pasta)
  const base = { docId: doc.id, titulo: doc.titulo, pasta, disciplina }
  if (!doc.versao_atual_id) return { ...base, status: 'erro', motivo: 'sem versão' }
  const ver = await versaoAtual(doc.versao_atual_id)
  if (!ver?.arquivo_key) return { ...base, status: 'erro', motivo: 'sem arquivo_key' }
  const { data: blob, error: dlErr } = await svc.storage.from('pdfs').download(ver.arquivo_key)
  if (dlErr || !blob) return { ...base, status: 'erro', motivo: 'download: ' + (dlErr?.message || 'vazio') }
  const buf = Buffer.from(await blob.arrayBuffer())
  let r
  try { r = cortarCapaBuffer(buf) } catch (e) { return { ...base, status: 'erro', motivo: 'corte: ' + (e?.message || e) } }
  if (!r.motivo) return { ...base, status: 'pulado', motivo: 'sem âncora' }
  if (r.removidos === 0) return { ...base, status: 'ja_ok', motivo: r.motivo }
  // upload v2
  const numero = (await maxNumero(doc.id)) + 1
  const novaKey = `conteudo/${T}/${doc.id}/v${numero}-${Date.now()}.docx`
  const hash = createHash('sha1').update(r.out).digest('hex')
  const up = await svc.storage.from('pdfs').upload(novaKey, r.out, { contentType: DOCX_MIME, upsert: false })
  if (up.error) return { ...base, status: 'erro', motivo: 'upload: ' + up.error.message }
  const ins = await svc.from('simulado_conteudo_versoes').insert({
    tenant_id: T, documento_id: doc.id, numero, arquivo_key: novaKey, hash_arquivo: hash,
    origem: 'edicao_editor', status_conversao: 'ok', vigencia_inicio: ver.vigencia_inicio ?? null, vigencia_fim: ver.vigencia_fim ?? null, paginas: null,
  }).select('id').single()
  if (ins.error) return { ...base, status: 'erro', motivo: 'insert versão: ' + ins.error.message }
  const novaVer = ins.data.id
  const upd = await svc.from('simulado_conteudo_documentos').update({ versao_atual_id: novaVer, atualizado_em: new Date().toISOString() }).eq('tenant_id', T).eq('id', doc.id)
  if (upd.error) return { ...base, status: 'erro', motivo: 'update ponteiro: ' + upd.error.message }
  appendFileSync(ROLLBACK, JSON.stringify({ docId: doc.id, titulo: doc.titulo, oldVer: ver.id, newVer: novaVer, novaKey, ts: new Date().toISOString() }) + '\n')
  return { ...base, status: 'cortado', motivo: r.motivo, removidos: r.removidos, flutuante: !!r.legendaFlutuante, primeiro: (r.primeiroMantidoTexto || '').slice(0, 60) }
}

async function alvos() {
  if (MODO_TITULOS) {
    const termos = []; let capt = false
    for (const a of args) { if (a === '--titulos') { capt = true; continue } if (capt && a.startsWith('--')) capt = false; if (capt) termos.push(a) }
    const out = []
    for (const termo of termos) {
      const { data } = await svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id, versao_atual_id')
        .eq('tenant_id', T).eq('categoria', 'conteudo').eq('deletado', false).eq('status', 'publicado').eq('tipo_origem', 'docx').ilike('titulo', `%${termo}%`).limit(1)
      if (data?.[0]) out.push(data[0])
    }
    return out
  }
  const out = []; let off = 0
  while (true) {
    const { data } = await svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id, versao_atual_id')
      .eq('tenant_id', T).eq('categoria', 'conteudo').eq('deletado', false).eq('status', 'publicado').eq('tipo_origem', 'docx')
      .order('id', { ascending: true }).range(off, off + 999)
    if (!data?.length) break; out.push(...data); if (data.length < 1000) break; off += 1000
  }
  const fatia = out.slice(OFFSET, LIMIT ? OFFSET + LIMIT : undefined)
  return fatia
}

async function pool(itens, fn, conc) { let i = 0; const w = Array.from({ length: conc }, async () => { while (i < itens.length) { const idx = i++; await fn(itens[idx], idx) } }); await Promise.all(w) }

// ───────── ROLLBACK ─────────
if (MODO_ROLLBACK) {
  const linhas = readFileSync(ROLLBACK, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  console.log(`Rollback de ${linhas.length} docs (reaponta versao_atual_id p/ a anterior)…`)
  let ok = 0
  for (const r of linhas) {
    const u = await svc.from('simulado_conteudo_documentos').update({ versao_atual_id: r.oldVer, atualizado_em: new Date().toISOString() }).eq('tenant_id', T).eq('id', r.docId)
    if (!u.error) ok++; else console.log('  ! ', r.titulo, u.error.message)
  }
  console.log(`Rollback concluído: ${ok}/${linhas.length}.`)
  process.exit(0)
}

if (!MODO_TITULOS && !MODO_APPLY) { console.log('Nada a fazer. Use --titulos "..." (amostra) ou --apply (lote).'); process.exit(0) }

const lista = await alvos()
const { label } = await carregarPastas(lista.map((d) => d.pasta_id))
console.log(`\n=== APLICAR corte de capas — ${lista.length} docs (conc=${CONC}${LIMIT ? `, limit=${LIMIT}` : ''}${OFFSET ? `, offset=${OFFSET}` : ''}) ===\n`)

const res = []
const marca = { cortado: '✓', ja_ok: '·', pulado: '·', erro: '✗' }
await pool(lista, async (doc) => {
  const r = await processar(doc, label)
  res.push(r)
  const n = String(res.length).padStart(3)
  if (r.status === 'cortado') console.log(`${n} ${marca[r.status]} [${r.motivo}${r.flutuante ? '⚑' : ''}] -${r.removidos} blocos | ${r.disciplina} | ${r.titulo.slice(0, 50)}`)
  else if (r.status === 'ja_ok') console.log(`${n} ${marca[r.status]} já-sem-capa (${r.motivo}) | ${r.titulo.slice(0, 50)}`)
  else if (r.status === 'pulado') console.log(`${n} ${marca[r.status]} PULADO (sem âncora) | ${r.titulo.slice(0, 50)}`)
  else console.log(`${n} ${marca[r.status]} ERRO: ${r.motivo} | ${r.titulo.slice(0, 50)}`)
}, CONC)

// ───────── RELATÓRIO organizado por pasta → disciplina ─────────
const cont = { cortado: 0, ja_ok: 0, pulado: 0, erro: 0 }
for (const r of res) cont[r.status]++
const porPasta = new Map()
for (const r of res) {
  if (!porPasta.has(r.pasta)) porPasta.set(r.pasta, new Map())
  const disc = porPasta.get(r.pasta)
  if (!disc.has(r.disciplina)) disc.set(r.disciplina, [])
  disc.get(r.disciplina).push(r)
}
let rel = `RELATÓRIO — corte de capas (Revisão)  ${new Date().toISOString()}\n`
rel += `Total processado: ${res.length}  |  cortados: ${cont.cortado}  já-sem-capa: ${cont.ja_ok}  pulados: ${cont.pulado}  erros: ${cont.erro}\n`
for (const [pasta, discs] of [...porPasta.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const totalPasta = [...discs.values()].reduce((a, v) => a + v.length, 0)
  rel += `\n■ PASTA: ${pasta}  (${totalPasta} docs)\n`
  for (const [disc, arr] of [...discs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const c = arr.filter((x) => x.status === 'cortado').length
    rel += `  ▸ ${disc}  — ${c} cortado(s) de ${arr.length}\n`
    for (const x of arr.sort((a, b) => a.titulo.localeCompare(b.titulo))) {
      const tag = x.status === 'cortado' ? `cortado [${x.motivo}] -${x.removidos}` : x.status === 'ja_ok' ? `já-sem-capa` : x.status === 'pulado' ? `PULADO` : `ERRO(${x.motivo})`
      rel += `      - ${x.titulo}  → ${tag}\n`
    }
  }
}
const flut = res.filter((r) => r.flutuante)
if (flut.length) {
  rel += `\n■ LEGENDA FLUTUANTE (${flut.length}) — capa removida, mas 1ª página transitória (refinar depois):\n`
  for (const x of flut.sort((a, b) => a.titulo.localeCompare(b.titulo))) rel += `   - ${x.titulo}\n`
}
const erros = res.filter((r) => r.status === 'erro')
if (erros.length) { rel += `\n■ ERROS (${erros.length}):\n`; for (const x of erros) rel += `   - ${x.titulo} → ${x.motivo}\n` }
writeFileSync(RELATORIO, rel, 'utf8')
console.log(`\n=== RESUMO === cortados=${cont.cortado}  já-sem-capa=${cont.ja_ok}  pulados=${cont.pulado}  erros=${cont.erro}  (legenda flutuante=${flut.length})`)
console.log(`Relatório salvo: ${RELATORIO}`)
console.log(`Rollback (se precisar): node scripts/aplicar-corte-capas.mjs --rollback  [${ROLLBACK}]`)
process.exit(0)
