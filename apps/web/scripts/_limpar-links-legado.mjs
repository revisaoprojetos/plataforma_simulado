import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const APAGAR = process.argv.includes('--apagar')
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const svc = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const TENANT = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const chaveAula = (a) => { const t = (a ?? '').trim(); return !t ? '' : (/^\d+$/.test(t) ? String(Number(t)) : t.toLowerCase()) }

async function all(table, sel, filt = (q) => q) {
  const out = []; let from = 0
  for (;;) {
    const { data, error } = await filt(svc.from(table).select(sel).eq('tenant_id', TENANT).range(from, from + 999))
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
    from += 1000
  }
  return out
}

const tipos = await all('simulado_cronograma_tipos_meta', 'slug, nome, mostra_links')
const usaLinks = new Set(tipos.filter((t) => t.mostra_links).map((t) => t.slug))
console.log('Tipos que usam links (Resolução):', [...usaLinks].join(', ') || '(nenhum!)')

const plats = await all('simulado_cronograma_plataformas', 'id, slug, nome')
const slugDe = new Map(plats.map((p) => [p.id, p.slug]))
const nomeDe = new Map(plats.map((p) => [p.id, p.nome]))
const ehQC = (id) => { const s = slugDe.get(id); return s !== 'pdf' && s !== 'video' }

const conjuntos = await all('simulado_cronograma_conjuntos', 'id, nome', (q) => q.eq('deletado', false))
const nomeConj = new Map(conjuntos.map((c) => [c.id, c.nome]))
const idsConj = new Set(conjuntos.map((c) => c.id))
const aulas = (await all('simulado_cronograma_conjunto_aulas', 'id, conjunto_id, tipo, aula')).filter((a) => idsConj.has(a.conjunto_id))
const aulaById = new Map(aulas.map((a) => [a.id, a]))
const urls = (await all('simulado_cronograma_conjunto_aula_urls', 'id, aula_id, plataforma_id, url')).filter((u) => aulaById.has(u.aula_id) && ehQC(u.plataforma_id))

const urlsPorAula = new Map()
for (const u of urls) { const l = urlsPorAula.get(u.aula_id) ?? []; l.push(u); urlsPorAula.set(u.aula_id, l) }
const grupos = new Map()
for (const a of aulas) { const k = `${a.conjunto_id}|${chaveAula(a.aula)}`; const g = grupos.get(k) ?? { conjunto_id: a.conjunto_id, aula: a.aula, rows: [] }; g.rows.push(a); grupos.set(k, g) }

const seguros = [], backup = [], conflitos = []
let aulasSeguras = 0
for (const g of grupos.values()) {
  const resRows = g.rows.filter((r) => usaLinks.has(r.tipo))
  const resSet = new Set()
  for (const r of resRows) for (const u of (urlsPorAula.get(r.id) ?? [])) resSet.add(`${u.plataforma_id}|${(u.url ?? '').trim()}`)
  for (const r of g.rows) {
    if (usaLinks.has(r.tipo)) continue
    const meus = urlsPorAula.get(r.id) ?? []
    if (!meus.length) continue
    const fora = meus.filter((u) => !resSet.has(`${u.plataforma_id}|${(u.url ?? '').trim()}`))
    if (resRows.length === 0) conflitos.push({ conjunto: nomeConj.get(g.conjunto_id), aula: g.aula, tipo: r.tipo, motivo: 'sem Resolução no grupo', links: meus.map((u) => `${nomeDe.get(u.plataforma_id)}=${u.url}`) })
    else if (fora.length) conflitos.push({ conjunto: nomeConj.get(g.conjunto_id), aula: g.aula, tipo: r.tipo, motivo: 'link diferente da Resolução', links: fora.map((u) => `${nomeDe.get(u.plataforma_id)}=${u.url}`), resTem: [...resSet].map((s) => { const [p, u] = s.split('|'); return `${nomeDe.get(p)}=${u}` }) })
    else { aulasSeguras++; for (const u of meus) { seguros.push(u.id); backup.push({ id: u.id, aula_id: u.aula_id, plataforma_id: u.plataforma_id, url: u.url, conjunto: nomeConj.get(g.conjunto_id), aula: g.aula, tipo: r.tipo }) } }
  }
}

console.log(`\nGrupos (conjunto+aula): ${grupos.size}`)
console.log(`Aulas nao-Resolucao com links duplicados (SEGURO apagar): ${aulasSeguras}  -> ${seguros.length} url(s)`)
console.log(`Conflitos (NAO apagar): ${conflitos.length}`)
for (const c of conflitos.slice(0, 40)) {
  console.log(`- ${c.conjunto} | aula ${c.aula} | ${c.tipo} -- ${c.motivo}`)
  console.log(`    tem: ${c.links.join(' | ')}`)
  if (c.resTem) console.log(`    Resolucao tem: ${c.resTem.join(' | ') || '(nada)'}`)
}
if (conflitos.length > 40) console.log(`  ... +${conflitos.length - 40} conflito(s)`)
writeFileSync('scripts/_backup-links-legado.json', JSON.stringify({ seguros: backup, conflitos }, null, 2))
console.log('\nBackup: apps/web/scripts/_backup-links-legado.json')

if (APAGAR && seguros.length) {
  let n = 0
  for (let i = 0; i < seguros.length; i += 200) {
    const { error } = await svc.from('simulado_cronograma_conjunto_aula_urls').delete().eq('tenant_id', TENANT).in('id', seguros.slice(i, i + 200))
    if (error) { console.error('ERRO:', error.message); process.exit(1) }
    n += Math.min(200, seguros.length - i)
  }
  console.log(`\nOK: apagados ${n} url(s) duplicados. Conflitos preservados.`)
} else console.log('\n(DRY-RUN - nada apagado. Rode com --apagar.)')
