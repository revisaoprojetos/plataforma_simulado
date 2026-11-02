// READ-ONLY — classifica os documentos da Biblioteca (Revisão) pelos TRECHOS já extraídos (sem baixar
// .docx): detecta onde começa o ÍNDICE / a LEGENDA e quanto conteúdo existe ANTES (a "capa"/folhas iniciais).
// Não escreve nada. Uso: cd apps/web && node scripts/classificar-capas.mjs [--amostra N]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function lerEnv(p) { const e = {}; for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); e[m[1]] = v } return e }
const env = lerEnv('.env.local')
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13' // Revisão
const amostraN = (() => { const i = process.argv.indexOf('--amostra'); return i >= 0 ? Number(process.argv[i + 1]) || 20 : 20 })()

const RE_INDICE = /roteiro de estudos|^\s*sum[áa]rio\b|^\s*[íi]ndice\b|conte[úu]do program[áa]tico/i
const RE_LEGENDA = /legenda/i
const RE_LEGENDA_GRIFO = /legenda.*(grifo|cor|marca)|(grifo|cor).*legenda|como.*grif/i
const RE_CAPA = /novidades desta vers|direitos autorais|proibida.*reprodu|todos os direitos|pdf\s*fight|pdfight|pdfull|pdf\s*full/i

async function trechosIniciais(versaoId) {
  const { data } = await svc.from('simulado_conteudo_trechos')
    .select('ordem, tipo, texto').eq('tenant_id', T).eq('versao_id', versaoId)
    .order('ordem', { ascending: true }).range(0, 59)
  return data ?? []
}

// pagina a lista de documentos
async function todosDocs() {
  const out = []; let off = 0
  while (true) {
    const { data, error } = await svc.from('simulado_conteudo_documentos')
      .select('id, titulo, versao_atual_id, pasta_id').eq('tenant_id', T)
      .eq('categoria', 'conteudo').eq('deletado', false).eq('status', 'publicado').eq('tipo_origem', 'docx')
      .order('id', { ascending: true }).range(off, off + 999)
    if (error) { console.log('erro docs:', error.message); break }
    if (!data?.length) break
    out.push(...data); if (data.length < 1000) break; off += 1000
  }
  return out
}

const docs = await todosDocs()
console.log(`\n=== Classificação de capas — ${docs.length} docs .docx publicados (Revisão) ===\n`)

const cat = { indice: [], legenda: [], sem_marcador: [], sem_trechos: [], ja_no_inicio: [] }
let n = 0
for (const d of docs) {
  n++
  if (!d.versao_atual_id) { cat.sem_trechos.push({ ...d, nota: 'sem versão' }); continue }
  const tr = await trechosIniciais(d.versao_atual_id)
  if (!tr.length) { cat.sem_trechos.push(d); continue }
  let idxIndice = -1, idxLegenda = -1
  for (let i = 0; i < tr.length; i++) {
    const t = tr[i].texto || ''
    if (idxIndice < 0 && RE_INDICE.test(t)) idxIndice = i
    if (idxLegenda < 0 && (RE_LEGENDA_GRIFO.test(t) || (RE_LEGENDA.test(t) && i < 10))) idxLegenda = i
  }
  const temCapaMarcador = tr.slice(0, Math.max(1, idxIndice < 0 ? 12 : idxIndice)).some((x) => RE_CAPA.test(x.texto || ''))
  const primeiro = (tr[0].texto || '').slice(0, 50)
  // legproc: legenda aparece ANTES do índice (ou há legenda e nenhum índice)
  const legprocLike = idxLegenda >= 0 && (idxIndice < 0 || idxLegenda < idxIndice)
  if (legprocLike) cat.legenda.push({ ...d, corte: idxLegenda, primeiro, trechosAntes: idxLegenda })
  else if (idxIndice > 0) cat.indice.push({ ...d, corte: idxIndice, primeiro, trechosAntes: idxIndice, temCapaMarcador })
  else if (idxIndice === 0) cat.ja_no_inicio.push({ ...d, primeiro })
  else cat.sem_marcador.push({ ...d, primeiro, temCapaMarcador })
  if (n % 100 === 0) process.stdout.write(`  …${n}/${docs.length}\r`)
}

const pct = (x) => `${x} (${((x / docs.length) * 100).toFixed(0)}%)`
console.log('\n=== RESUMO ===')
console.log(`  COM CAPA → corta até o ÍNDICE ...... ${pct(cat.indice.length)}`)
console.log(`  LEGPROC  → corta até a LEGENDA ..... ${pct(cat.legenda.length)}`)
console.log(`  já começa no índice (nada a fazer).. ${pct(cat.ja_no_inicio.length)}`)
console.log(`  SEM índice/legenda detectável (PULAR) ${pct(cat.sem_marcador.length)}`)
console.log(`  sem trechos (verificar) ............ ${pct(cat.sem_trechos.length)}`)

const amostra = (arr, titulo) => {
  if (!arr.length) return
  console.log(`\n--- amostra: ${titulo} (${arr.length}) ---`)
  for (const d of arr.slice(0, amostraN)) console.log(`  antes=${String(d.trechosAntes ?? '').padStart(3)} | capaMarc=${d.temCapaMarcador ? 'S' : '-'} | 1º="${d.primeiro}" | ${d.titulo.slice(0, 44)}`)
}
amostra(cat.indice, 'COM CAPA → corta até índice')
amostra(cat.legenda, 'LEGPROC → corta até legenda')
amostra(cat.sem_marcador, 'SEM marcador (PULAR / revisar)')
console.log('\n=== FIM (nada escrito) ===')
process.exit(0)
