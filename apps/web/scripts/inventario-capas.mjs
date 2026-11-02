// READ-ONLY — inventário para a remoção de capas/folhas iniciais da Biblioteca.
// Mede: documentos publicados por tenant/área, exposição de GRIFOS DE PDF (risco: página absoluta,
// sem reconciliação) e anotações de texto (baixo risco). NÃO escreve nada.
// Uso: cd apps/web && node scripts/inventario-capas.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function lerEnv(path) {
  const env = {}
  for (const l of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    env[m[1]] = v
  }
  return env
}
const env = lerEnv('.env.local')
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const DOC = 'simulado_conteudo_documentos'
const GP = 'simulado_conteudo_grifos_pdf'
const AN = 'simulado_conteudo_anotacoes'
const PASTA = 'simulado_pastas'

async function contar(tabela, filtros = {}) {
  let q = svc.from(tabela).select('*', { count: 'exact', head: true })
  for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v)
  const { count, error } = await q
  return error ? `ERRO(${error.message})` : (count ?? 0)
}

// Pagina uma coluna inteira (range) p/ agregar no cliente.
async function colunaToda(tabela, cols, filtros = {}) {
  const out = []; let off = 0
  while (true) {
    let q = svc.from(tabela).select(cols).order('id', { ascending: true }).range(off, off + 999)
    for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v)
    const { data, error } = await q
    if (error) { console.log(`  ! ${tabela} erro: ${error.message}`); break }
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
    off += 1000
  }
  return out
}

const { data: tenants } = await svc.from('simulado_tenants').select('id, dominio, nome').order('nome')
console.log('\n=== TENANTS ===')
for (const t of tenants ?? []) console.log(`  ${t.nome}  [${t.dominio}]  ${t.id}`)

for (const t of tenants ?? []) {
  const tid = t.id
  const pub = await contar(DOC, { tenant_id: tid, categoria: 'conteudo', deletado: false, status: 'publicado' })
  if (pub === 0 || String(pub).startsWith('ERRO')) { continue }
  console.log(`\n=== ${t.nome}  [${t.dominio}] ===`)
  console.log(`  documentos publicados (categoria=conteudo): ${pub}`)

  // por tipo de origem
  const docs = await colunaToda(DOC, 'id, titulo, tipo_origem, pasta_id', { tenant_id: tid, categoria: 'conteudo', deletado: false, status: 'publicado' })
  const porTipo = {}
  for (const d of docs) porTipo[d.tipo_origem] = (porTipo[d.tipo_origem] || 0) + 1
  console.log(`  por tipo_origem: ${Object.entries(porTipo).map(([k, v]) => `${k}=${v}`).join('  ')}`)

  // por área da pasta (legproc x resto)
  const pastaIds = [...new Set(docs.map((d) => d.pasta_id).filter(Boolean))]
  const areaDe = new Map()
  for (let i = 0; i < pastaIds.length; i += 80) {
    const { data } = await svc.from(PASTA).select('id, folder_area').in('id', pastaIds.slice(i, i + 80))
    for (const p of data ?? []) areaDe.set(p.id, p.folder_area)
  }
  const porArea = {}
  for (const d of docs) { const a = areaDe.get(d.pasta_id) || '(sem pasta/área)'; porArea[a] = (porArea[a] || 0) + 1 }
  console.log(`  por folder_area: ${Object.entries(porArea).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ')}`)

  // GRIFOS DE PDF (o risco)
  const gTotal = await contar(GP, { tenant_id: tid })
  console.log(`  grifos de PDF (total): ${gTotal}`)
  if (typeof gTotal === 'number' && gTotal > 0) {
    const gs = await colunaToda(GP, 'id, documento_id, pagina', { tenant_id: tid })
    const porDoc = new Map()
    for (const g of gs) porDoc.set(g.documento_id, (porDoc.get(g.documento_id) || 0) + 1)
    console.log(`  grifos de PDF: ${gs.length} em ${porDoc.size} documento(s) distinto(s)`)
    const top = [...porDoc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    const titByDoc = new Map(docs.map((d) => [d.id, d.titulo]))
    // alguns docs com grifo podem estar fora do filtro (arquivados/deletados); busca título avulso
    const faltam = top.map(([id]) => id).filter((id) => !titByDoc.has(id))
    for (let i = 0; i < faltam.length; i += 80) {
      const { data } = await svc.from(DOC).select('id, titulo').in('id', faltam.slice(i, i + 80))
      for (const d of data ?? []) titByDoc.set(d.id, (d.titulo || '') + ' (fora do filtro)')
    }
    console.log('  TOP documentos por nº de grifos de PDF:')
    for (const [id, n] of top) console.log(`    ${String(n).padStart(4)}  ${titByDoc.get(id) || '(?)'}  [${id}]`)
  }

  // anotações de texto (baixo risco — reconciliam por uid+texto)
  const anTotal = await contar(AN, { tenant_id: tid })
  console.log(`  anotações de TEXTO (total, baixo risco): ${anTotal}`)
}
console.log('\n=== FIM (nada foi escrito) ===')
process.exit(0)
