// Migração COMPLETA V1 → V2: cadernos com seus ESTILOS (docsV2 por modalidade → builderV3.itens
// com docEdit = doc do V1, renderizado igual pelo PreviaBlocos), carregando também os PDFs.
//   DRY-RUN:  node scripts/migrar-cadernos-completo-v1-v2.mjs
//   APLICAR:  node scripts/migrar-cadernos-completo-v1-v2.mjs --aplicar
// Idempotente: apaga os cadernos-teste criados pela migração anterior (backup de ids) e recria completos.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const APLICAR = process.argv.includes('--aplicar')
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }

async function fetchAll(table, select) {
  const out = []; let from = 0; const step = 1000
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`, { headers: { ...H, Range: `${from}-${from + step - 1}` } })
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`)
    const rows = await r.json(); out.push(...rows); if (rows.length < step) break; from += step
  }
  return out
}
const del = (table, id) => fetch(`${URL}/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } })
const insert = (table, body) => fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) })

// V1 modalidade → V2 (modalidade, modeloId doc-backed)
const MAP = {
  caderno_perguntas: { modalidade: 'caderno_questoes', modelo: 'agu_perguntas' },
  caderno_completo: { modalidade: 'caderno_questoes', modelo: 'agu_completo' },
  gabarito_discursivo: { modalidade: 'caderno_questoes', modelo: 'agu_discursivo' },
  gabarito_objetivo: { modalidade: 'folha_respostas', modelo: 'agu_folha' },
  diagnostico: { modalidade: 'diagnostico', modelo: 'agu_diagnostico' },
}
const ORDEM = ['caderno_perguntas', 'caderno_completo', 'gabarito_objetivo', 'gabarito_discursivo', 'diagnostico']

const AJUSTES_BASE = {
  titulo: 'Simulado', corPrimaria: '#6d28d9', corSecundaria: '#f59e0b',
  mostrarCabecalho: true, mostrarDadosAluno: true, mostrarComentarios: false, mostrarGabarito: false,
  numAlternativas: 5, colunas: 2, compacto: false, capaUrl: '', folhaUrl: '', cabecalhoUrl: '', rodapeUrl: '',
  coresPilar: { lei_seca: '#c9a227', jurisprudencia: '#3b5bdb', doutrina: '#e8850c', lingua_portuguesa: '#1a7a4a' },
  coresDisc: {}, coresParte: {}, alinhamentoParte: {}, coresTextoParte: {}, estiloParte: {}, fonteParte: {}, tamanhoParte: {},
}
const novoId = () => Math.random().toString(36).slice(2, 10)
const urlDaPagina = (doc, kind) => {
  const pg = (doc?.pages || []).find((p) => p.kind === kind)
  const pf = (pg?.blocks || []).find((b) => (b.kind || b.type) === 'plano-fundo')
  return pf?.attributes?.url || ''
}

console.log(`URL: ${URL}\nMODO: ${APLICAR ? 'APLICAR (grava)' : 'DRY-RUN (não grava)'}\n`)

let cadernos
try { cadernos = await fetchAll('simulado_cadernos_designer', 'id,tenant_id,nome,cor,icone,capa_url,config') }
catch { cadernos = await fetchAll('simulado_cadernos_designer', 'id,tenant_id,nome,config') }
let pastas
try { pastas = await fetchAll('simulado_pastas', 'id,tenant_id,nome,is_folder') } catch { pastas = [] }
const pastaById = new Map(pastas.map((p) => [p.id, p]))
const cadTeste = await fetchAll('simulado_cadernos_teste', 'id,tenant_id,nome,config')

// ids criados pela migração anterior (PDF-only) → apagar p/ recriar completo
let idsAntigos = []
if (existsSync('scripts/_backup-migracao-v1v2-criados.json')) {
  try { idsAntigos = JSON.parse(readFileSync('scripts/_backup-migracao-v1v2-criados.json', 'utf8')).cadernos_teste_criados || [] } catch {}
}
const idsAntigosSet = new Set(idsAntigos.filter(Boolean))

// caderno-teste que devem PERMANECER (não criados pela migração) → dedupe por (banco|nome)
const existentes = new Set()
for (const t of cadTeste) {
  if (idsAntigosSet.has(t.id)) continue
  const b = t.config?.builderV3?.bancoId || t.config?.bancoId
  if (b) existentes.add(`${t.tenant_id}|${b}|${(t.nome || '').trim().toLowerCase()}`)
}

const plano = []
for (const k of cadernos) {
  const cfg = k.config || {}
  const bid = cfg.bancoId
  const docs = cfg.docsV2 || {}
  const modKeys = ORDEM.filter((key) => MAP[key] && docs[key] && Array.isArray(docs[key].pages) && docs[key].pages.length > 0)
  if (!bid || modKeys.length === 0) continue
  const chave = `${k.tenant_id}|${bid}|${(k.nome || '').trim().toLowerCase()}`
  if (existentes.has(chave)) continue
  existentes.add(chave)

  const itens = modKeys.map((key) => {
    const doc = docs[key]
    const capaUrl = urlDaPagina(doc, 'capa')
    const folhaUrl = urlDaPagina(doc, 'conteudo')
    return {
      id: novoId(), modalidade: MAP[key].modalidade, modelo: MAP[key].modelo,
      ajustes: { ...AJUSTES_BASE, titulo: k.nome, capaUrl, folhaUrl },
      docEdit: doc,
    }
  })
  plano.push({
    tenant_id: k.tenant_id, nome: k.nome, banco: pastaById.get(bid)?.nome ?? bid,
    modalidades: modKeys,
    config: {
      bancoId: bid,
      builderV3: { v: 3, bancoId: bid, itens, ativo: itens[0].id },
      ...(cfg.material ? { material: cfg.material } : {}),
      ...(cfg.material_enunciado ? { material_enunciado: cfg.material_enunciado } : {}),
    },
    cor: k.cor ?? null, icone: k.icone ?? null, capa_url: k.capa_url ?? null,
  })
}

console.log(`Cadernos-teste PDF-only a APAGAR (migração anterior): ${idsAntigosSet.size}`)
console.log(`Cadernos-teste COMPLETOS a CRIAR: ${plano.length}\n`)
for (const x of plano) console.log(`  • "${x.nome}" → [${x.banco}]  itens: ${x.modalidades.join(', ')}`)

if (!APLICAR) { console.log('\nDRY-RUN: nada gravado. Rode com --aplicar.'); process.exit(0) }

// Apaga os PDF-only anteriores
let apagados = 0
for (const id of idsAntigosSet) { const r = await del('simulado_cadernos_teste', id); if (r.ok) apagados++; else console.error(`  ERRO del ${id}: ${r.status} ${await r.text()}`) }
// Cria os completos
const criados = []
for (const x of plano) {
  const r = await insert('simulado_cadernos_teste', { tenant_id: x.tenant_id, nome: x.nome, config: x.config, cor: x.cor, icone: x.icone, capa_url: x.capa_url })
  if (r.ok) { const rows = await r.json(); criados.push(rows[0]?.id) } else console.error(`  ERRO criar "${x.nome}": ${r.status} ${await r.text()}`)
}
writeFileSync('scripts/_backup-migracao-cadernos-completo-criados.json', JSON.stringify({ cadernos_teste_criados: criados }, null, 2))
console.log(`\nCONCLUÍDO. Apagados: ${apagados}. Criados (completos): ${criados.length}/${plano.length}.`)
