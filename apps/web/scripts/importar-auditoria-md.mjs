// Importa docs/AUDITORIA-PROBLEMAS.md (seção 1 + tabelas 3.1–3.6) para a Auditoria de Problemas de UM tenant.
// Idempotente: dedupe por área + assunto normalizado (no arquivo e no banco). Rodar de novo não duplica.
//
// Uso (em apps/web):
//   node scripts/importar-auditoria-md.mjs --tenant <uuid>             # --dry (padrão): só mostra o que faria
//   node scripts/importar-auditoria-md.mjs --tenant <uuid> --gravar    # escreve no banco (precisa da migração 20261124000000)
//   opcional: --arquivo <caminho.md>
// A seção 2 (migrações) NÃO é importada: o item 4 da seção 1 já a cobre.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const aqui = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const arg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }
const gravar = args.includes('--gravar')
const tenant = arg('tenant')
const arquivo = resolve(arg('arquivo') ?? resolve(aqui, '../../../docs/AUDITORIA-PROBLEMAS.md'))
if (!tenant || !/^[0-9a-f-]{36}$/i.test(tenant)) { console.error('Informe --tenant <uuid>.'); process.exit(1) }

// ── leitura do .md ──
const limpa = (s) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
const norm = (s) => limpa(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Linhas de dados de uma tabela markdown logo após `titulo` (até a próxima seção). */
function tabela(md, titulo) {
  const i = md.indexOf(titulo)
  if (i < 0) return []
  const resto = md.slice(i + titulo.length)
  const fim = resto.search(/\n#{2,3} /)
  const bloco = (fim >= 0 ? resto.slice(0, fim) : resto).split('\n').filter((l) => l.trim().startsWith('|'))
  return bloco.slice(2).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())) // pula cabeçalho + separador
}

const dataIso = (s) => { const m = s?.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null }
const DATA_DOC = '2026-11-17' // "Última conferência" do documento (data de registro dos itens da seção 1)

// Área dos itens da seção 1 (a tabela não traz coluna de área).
const AREA_SECAO1 = { 4: 'migracoes', 6: 'curseduca', 7: 'simulados', 8: 'curseduca', 9: 'infra', 11: 'infra', 12: 'curseduca', 13: 'biblioteca', 14: 'infra', 15: 'liberacao', 16: 'cronograma', 17: 'cronograma' }
const SECOES = [['### 3.1', 'cronograma'], ['### 3.2', 'liberacao'], ['### 3.3', 'biblioteca'], ['### 3.4', 'simulados'], ['### 3.5', 'curseduca'], ['### 3.6', 'infra']]

function prioridadeDe(texto, status) {
  if (status === 'resolvido') return 'media'
  if (/cr[ií]tic|bug cr/i.test(texto)) return 'critica'
  return 'media'
}

const md = readFileSync(arquivo, 'utf8')
const itens = []

// Seção 1 — # | Assunto | Razão | Ação | Prazo | Quem resolve  (todos em aberto)
for (const c of tabela(md, '## 1. O que ainda está em aberto (prioridade)')) {
  if (c.length < 6) continue
  const n = Number(c[0])
  const prazo = dataIso(c[4])
  itens.push({
    area: AREA_SECAO1[n] ?? 'infra', assunto: limpa(c[1]), razao: limpa(c[2]), acao: limpa(c[3]), status: 'aberto',
    prazo, prazo_texto: prazo ? null : limpa(c[4]), data_registro: DATA_DOC, versao: null, relator: null, responsavel: limpa(c[5]) || null, secao1: true,
  })
}

// Seções 3.x — Status | Data / Versão | Assunto | Razão | Ação | Prazo | [Quem relatou]
for (const [titulo, area] of SECOES) {
  for (const c of tabela(md, titulo)) {
    if (c.length < 6) continue
    const resolvido = c[0].includes('✅')
    const status = resolvido ? 'resolvido' : 'aberto'
    const [dv, ...vr] = c[1].split('·')
    const versao = vr.join('·').trim()
    const prazo = dataIso(c[5])
    const assunto = limpa(c[2])
    itens.push({
      area, assunto, razao: limpa(c[3]), acao: limpa(c[4]), status,
      prioridade: prioridadeDe(`${c[2]} ${c[3]}`, status),
      prazo, prazo_texto: prazo ? null : limpa(c[5]),
      data_registro: dataIso(dv) ?? DATA_DOC, versao: versao && !/^sem versão$/i.test(versao) ? versao : null,
      relator: c[6] ? limpa(c[6]) : null, responsavel: null, secao1: false, remetidoSecao1: /se[çc][ãa]o 1/i.test(c[4]),
    })
  }
}

// Dedupe no arquivo: área + assunto; e itens ⏳ das seções 3.x que a seção 1 já cobre (ação "seção 1" ou assuntos muito parecidos).
const jac = (a, b) => { const A = new Set(norm(a).split(' ')), B = new Set(norm(b).split(' ')); const i = [...A].filter((x) => B.has(x)).length; return i / (A.size + B.size - i || 1) }
const s1 = itens.filter((i) => i.secao1)
const vistos = new Set()
const finais = []
let pulados = 0
for (const it of itens) {
  const chave = `${it.area}|${norm(it.assunto)}`
  const dupSecao1 = !it.secao1 && it.status === 'aberto' && (it.remetidoSecao1 || s1.some((x) => jac(x.assunto, it.assunto) >= 0.4 || jac(x.razao ?? '', it.razao ?? '') >= 0.5))
  if (vistos.has(chave) || dupSecao1) { pulados++; continue }
  vistos.add(chave)
  finais.push({ prioridade: 'media', ...it })
}

// Prioridade padrão dos pendentes: prazo vencido/curto sobe para "alta".
for (const it of finais) if (it.status === 'aberto' && it.prazo && it.prazo <= '2026-11-20' && it.prioridade === 'media') it.prioridade = 'alta'

console.log(`Arquivo: ${arquivo}`)
console.log(`Tenant : ${tenant}  |  modo: ${gravar ? 'GRAVAR' : 'DRY (nada será escrito)'}`)
console.log(`Itens lidos: ${itens.length} | repetidos/cobertos pela seção 1 (pulados): ${pulados} | candidatos: ${finais.length}`)

let sb = null
if (gravar) {
  const env = {}
  for (const f of [resolve(aqui, '../.env.local'), resolve(aqui, '../../../.env')]) {
    try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, '') } } catch { /* sem arquivo */ }
  }
  sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

// Dedupe contra o banco (área + assunto normalizado, inclusive os já excluídos logicamente — não ressuscita o que o admin apagou).
let existentes = new Set()
if (sb) {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('auditoria_problemas').select('id, area, assunto').eq('tenant_id', tenant).order('id', { ascending: true }).range(from, from + 999)
    if (error) { console.error('Falha ao ler o banco (a migração 20261124000000 foi aplicada?):', error.message); process.exit(1) }
    for (const r of data ?? []) existentes.add(`${r.area}|${norm(r.assunto)}`)
    if (!data || data.length < 1000) break
  }
}

let criados = 0, ja = 0
for (const it of finais) {
  const chave = `${it.area}|${norm(it.assunto)}`
  if (existentes.has(chave)) { ja++; continue }
  const marca = it.status === 'resolvido' ? '[ok]' : '[..]'
  console.log(`${gravar ? '+' : '·'} ${marca} ${it.area.padEnd(10)} ${it.data_registro} ${it.assunto.slice(0, 70)}`)
  if (!sb) { criados++; continue }
  const { secao1, remetidoSecao1, ...campos } = it
  const { data, error } = await sb.from('auditoria_problemas').insert({
    ...campos, tenant_id: tenant, origem: 'importacao_md',
    resolvido_em: it.status === 'resolvido' && it.prazo ? `${it.prazo}T12:00:00-03:00` : null,
  }).select('id').single()
  if (error) { console.error('  erro:', error.message); continue }
  await sb.from('auditoria_problemas_historico').insert({ tenant_id: tenant, problema_id: data.id, acao: 'importado', depois: { origem: 'importacao_md', assunto: it.assunto, status: it.status } })
  criados++
}
console.log(`\n${gravar ? 'Criados' : 'Seriam criados'}: ${criados} | já existiam: ${ja}`)
if (!gravar) console.log('Para gravar de verdade, rode novamente com --gravar.')
