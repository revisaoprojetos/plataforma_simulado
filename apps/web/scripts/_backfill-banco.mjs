// Backfill do Banco de Conteúdos a partir das metas dos cronogramas.
// Dry-run por padrão; grava só com `--go`. Throwaway (scripts/ é gitignored).
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const GO = process.argv.includes('--go')
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('='); if (i < 0 || line.trimStart().startsWith('#')) continue
  let v = line.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  env[line.slice(0, i).trim()] = v
}
const svc = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
const chaveLink = (disc, aula) => `${norm(disc)}|${(aula ?? '').trim().toLowerCase()}`
const EXCLUIR_TIPO = new Set(['simulado']) // aponta prova específica; não é conteúdo reutilizável
const PSEUDO = 'Atividade'

async function fetchAll(table, sel, filter) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = svc.from(table).select(sel).range(from, from + 999)
    q = filter(q)
    const { data, error } = await q
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

async function main() {
  const { data: cronBase } = await svc.from('simulado_cronogramas').select('tenant_id').limit(1).maybeSingle()
  const tenant = cronBase?.tenant_id
  console.log('tenant', tenant)

  const crons = await fetchAll('simulado_cronogramas', 'id, nome, status', (q) => q.eq('tenant_id', tenant).eq('deletado', false))
  const cronIds = new Set(crons.map((c) => c.id))
  console.log(`cronogramas não-deletados: ${crons.length} (liberados: ${crons.filter((c) => c.status === 'liberado').length})`)

  const metas = await fetchAll('simulado_cronograma_metas', 'cronograma_id, disciplina, disciplina_id, aula, tipo, conteudo', (q) => q.eq('tenant_id', tenant))
  const usadas = metas.filter((m) => cronIds.has(m.cronograma_id) && !EXCLUIR_TIPO.has(m.tipo))
  console.log(`metas totais: ${metas.length} · consideradas (sem 'simulado', de cronograma vivo): ${usadas.length}`)

  // Links por (disciplina, aula)
  const [links, aulaLinks, plats] = await Promise.all([
    fetchAll('simulado_cronograma_links', 'id, disciplina, aula, tema, disciplina_id', (q) => q.eq('tenant_id', tenant)),
    fetchAll('simulado_cronograma_aula_links', 'link_id, plataforma_id, url', (q) => q.eq('tenant_id', tenant)),
    fetchAll('simulado_cronograma_plataformas', 'id, nome, slug', (q) => q.eq('tenant_id', tenant)),
  ])
  const urlsPorLink = new Map()
  for (const u of aulaLinks) { const l = urlsPorLink.get(u.link_id) ?? []; l.push({ plataforma_id: u.plataforma_id, url: u.url }); urlsPorLink.set(u.link_id, l) }
  const linkPorChave = new Map()
  for (const l of links) linkPorChave.set(chaveLink(l.disciplina, l.aula), { tema: l.tema, urls: urlsPorLink.get(l.id) ?? [] })

  // Agrupa por disciplina; aula-entry = (aula|tipo|conteudo)
  const grupos = new Map() // discKey -> { nome, disciplina_id, aulas: Map(aulaEntryKey -> {aula,tipo,conteudo}) }
  for (const m of usadas) {
    if (norm(m.disciplina) === norm(PSEUDO)) continue // pseudo-disciplina "Atividade" fica de fora
    const dk = m.disciplina_id || norm(m.disciplina)
    let g = grupos.get(dk)
    if (!g) { g = { nome: m.disciplina, disciplina_id: m.disciplina_id ?? null, nomes: new Map(), aulas: new Map() }; grupos.set(dk, g) }
    g.nomes.set(m.disciplina, (g.nomes.get(m.disciplina) ?? 0) + 1)
    const ak = `${(m.aula ?? '').trim()}|${m.tipo}|${(m.conteudo ?? '').trim()}`
    if (!g.aulas.has(ak)) g.aulas.set(ak, { aula: (m.aula ?? '').trim() || null, tipo: m.tipo, conteudo: (m.conteudo ?? '').trim() || null })
  }
  // nome de exibição = mais frequente
  for (const g of grupos.values()) g.nome = [...g.nomes.entries()].sort((a, b) => b[1] - a[1])[0][0]

  const ordenadas = [...grupos.values()].sort((a, b) => b.aulas.size - a.aulas.size)
  let totalAulas = 0, totalUrls = 0
  console.log(`\n=== ${ordenadas.length} bancos (disciplinas) ===`)
  for (const g of ordenadas) {
    let comLink = 0
    for (const a of g.aulas.values()) { if (a.aula && linkPorChave.has(chaveLink(g.nome, a.aula))) comLink++ }
    totalAulas += g.aulas.size; totalUrls += comLink
    console.log(`  ${g.nome.padEnd(46)} ${String(g.aulas.size).padStart(4)} aulas · ${comLink} c/ link`)
  }
  console.log(`\nTOTAL: ${ordenadas.length} conjuntos · ${totalAulas} aulas · ~${totalUrls} aulas com link`)

  if (!GO) { console.log('\n(DRY-RUN — nada gravado. Rode com --go para criar.)'); return }

  // ── Grava ──
  console.log('\n=== GRAVANDO ===')
  const backup = { tenant, conjuntoIds: [], criadoEm: new Date().toISOString() }
  for (const g of ordenadas) {
    // idempotente: pula se já existe conjunto com esse nome+disciplina_id (não-deletado)
    let q = svc.from('simulado_cronograma_conjuntos').select('id').eq('tenant_id', tenant).eq('nome', g.nome).eq('deletado', false).limit(1)
    q = g.disciplina_id ? q.eq('disciplina_id', g.disciplina_id) : q.is('disciplina_id', null)
    const { data: existe } = await q.maybeSingle()
    if (existe) { console.log(`  = ${g.nome} (já existe, pulado)`); continue }

    const { data: conj, error: eC } = await svc.from('simulado_cronograma_conjuntos').insert({ tenant_id: tenant, disciplina: g.nome, disciplina_id: g.disciplina_id, nome: g.nome, descricao: 'Gerado a partir dos cronogramas do catálogo' }).select('id').single()
    if (eC) { console.log(`  ✗ ${g.nome}: ${eC.message}`); process.exitCode = 1; continue }
    backup.conjuntoIds.push(conj.id)

    // ordena aulas: por nº de aula (num) e depois tipo
    const aulas = [...g.aulas.values()].sort((a, b) => (Number(a.aula) || 0) - (Number(b.aula) || 0) || a.tipo.localeCompare(b.tipo))
    let ordem = 0
    for (const a of aulas) {
      const { data: na, error: eA } = await svc.from('simulado_cronograma_conjunto_aulas').insert({ tenant_id: tenant, conjunto_id: conj.id, tipo: a.tipo, aula: a.aula, conteudo: a.conteudo, duracao: null, ordem: ordem++ }).select('id').single()
      if (eA || !na) continue
      if (a.aula) {
        const lk = linkPorChave.get(chaveLink(g.nome, a.aula))
        if (lk) {
          if (lk.tema) await svc.from('simulado_cronograma_conjunto_aulas').update({ tema: lk.tema }).eq('id', na.id)
          if (lk.urls.length) { await svc.from('simulado_cronograma_conjunto_aula_urls').insert(lk.urls.map((u) => ({ tenant_id: tenant, aula_id: na.id, plataforma_id: u.plataforma_id, url: u.url }))); }
        }
      }
    }
    console.log(`  ✓ ${g.nome} (${aulas.length} aulas)`)
  }
  writeFileSync('scripts/_backup-backfill-banco.json', JSON.stringify(backup, null, 2))
  console.log(`\nGRAVADO. ${backup.conjuntoIds.length} conjuntos. Backup em scripts/_backup-backfill-banco.json (rollback = deletar esses ids).`)
}

main().then(() => console.log(process.exitCode ? 'FALHOU' : 'OK')).catch((e) => { console.error(e); process.exitCode = 1 })
