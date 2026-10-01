#!/usr/bin/env node
/**
 * T8 — Re-seta o Cache-Control dos arquivos ANTIGOS do Storage (os novos já sobem com 1 ano via F2/F3).
 *
 * Egress: objetos com cacheControl curto (1h padrão) são re-baixados do origin toda hora por milhares
 * de alunos. Este script varre os buckets, baixa e re-sobe cada objeto com `cacheControl: 31536000`
 * (1 ano) mantendo o mesmo conteúdo/contentType. Idempotente (pode re-rodar). Rodar 1× FORA de pico.
 *
 * Uso (em apps/web):
 *   node scripts/reset-storage-cache.mjs            # dry-run (só lista)
 *   node scripts/reset-storage-cache.mjs --apply    # aplica (baixa+re-sobe)
 *   node scripts/reset-storage-cache.mjs --apply --bucket imagens
 *
 * Requer .env.local com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }),
)
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const CACHE = '31536000' // 1 ano
const bucketArg = process.argv.find((a, i) => process.argv[i - 1] === '--bucket')
const BUCKETS = bucketArg ? [bucketArg] : ['imagens', 'pdfs']

const guessType = (nome) => {
  const e = (nome.split('.').pop() || '').toLowerCase()
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf' })[e] || 'application/octet-stream'
}

/** Lista recursiva de um bucket (Storage list é por "pasta"). */
async function listar(bucket, prefix = '') {
  const out = []
  let offset = 0
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) { console.warn(`  (list ${bucket}/${prefix}: ${error.message})`); break }
    if (!data || !data.length) break
    for (const item of data) {
      const caminho = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null && !item.metadata) out.push(...await listar(bucket, caminho)) // "pasta" → recursão
      else out.push(caminho)
    }
    if (data.length < 1000) break
    offset += 1000
  }
  return out
}

let total = 0, ok = 0, falhou = 0
for (const bucket of BUCKETS) {
  const arquivos = await listar(bucket)
  console.log(`\n[${bucket}] ${arquivos.length} objeto(s)`)
  total += arquivos.length
  if (!APPLY) { console.log('  (dry-run — use --apply para re-setar o cacheControl)'); continue }
  for (const path of arquivos) {
    try {
      const dl = await sb.storage.from(bucket).download(path)
      if (dl.error) { falhou++; console.warn(`  ✗ download ${path}: ${dl.error.message}`); continue }
      const buf = Buffer.from(await dl.data.arrayBuffer())
      const up = await sb.storage.from(bucket).upload(path, buf, { upsert: true, cacheControl: CACHE, contentType: guessType(path) })
      if (up.error) { falhou++; console.warn(`  ✗ upload ${path}: ${up.error.message}`); continue }
      ok++
      if (ok % 50 === 0) console.log(`  … ${ok} re-setados`)
    } catch (e) { falhou++; console.warn(`  ✗ ${path}: ${e.message}`) }
  }
}
console.log(`\nTotal: ${total} · re-setados: ${ok} · falhas: ${falhou}${APPLY ? '' : ' (dry-run)'}`)
process.exit(0)
