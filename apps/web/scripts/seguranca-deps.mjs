// Varredura de DEPENDÊNCIAS (pnpm audit + pnpm outdated) — dev/CI. Uso: node scripts/seguranca-deps.mjs [--dry] [--json] [--falhar]
// Envia atualizações/CVEs para POST /api/seguranca/ingest (CRON_SECRET) salvo com --dry. Também regenera o deps-manifest.json.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { imprimirResumo, enviar, argv } from './_seguranca-enviar.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const opts = argv()

function pnpm(args) {
  const r = spawnSync('pnpm', args, { cwd: RAIZ, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 })
  const out = (r.stdout || '').trim()
  try { return JSON.parse(out) } catch { /* pnpm pode imprimir texto antes do JSON */ }
  const i = out.indexOf('{')
  if (i >= 0) { try { return JSON.parse(out.slice(i)) } catch { /* ignora */ } }
  return null
}

const SEV = { critical: 'critico', high: 'alto', moderate: 'medio', medium: 'medio', low: 'baixo', info: 'baixo' }
const PESO = { critico: 4, alto: 3, medio: 2, baixo: 1 }
const num = (v) => String(v ?? '').replace(/^[^\d]*/, '').split(/[.\-+]/).slice(0, 3).map((x) => parseInt(x, 10) || 0)
function salto(a, b) { const [x, y] = [num(a), num(b)]; return y[0] !== x[0] ? 'major' : y[1] !== x[1] ? 'minor' : 'patch' }

/** @type {Map<string, any>} */
const mapa = new Map()
const get = (pacote) => { if (!mapa.has(pacote)) mapa.set(pacote, { pacote, versao_atual: null, versao_alvo: null, tipo: 'patch', cve_ids: [], severidade: 'baixo' }); return mapa.get(pacote) }

// 1) Vulnerabilidades
const audit = pnpm(['audit', '--json'])
if (!audit) console.log('[aviso] pnpm audit sem JSON (sem rede/registry?) — CVEs ignorados.')
const advs = audit?.advisories ? (Array.isArray(audit.advisories) ? audit.advisories : Object.values(audit.advisories)) : []
for (const a of advs) {
  const nome = a.module_name ?? a.name
  if (!nome) continue
  const u = get(nome)
  const sev = SEV[String(a.severity).toLowerCase()] ?? 'alto'
  if (PESO[sev] > PESO[u.severidade]) u.severidade = sev
  for (const id of [...(a.cves ?? []), a.github_advisory_id].filter(Boolean)) if (!u.cve_ids.includes(id)) u.cve_ids.push(id)
  u.versao_atual ??= a.findings?.[0]?.version ?? null
  const patched = String(a.patched_versions ?? '').match(/(\d+\.\d+\.\d+[^\s|,]*)/)?.[1]
  if (patched && !u.versao_alvo) u.versao_alvo = patched
}

// 2) Desatualizados
const outdated = pnpm(['outdated', '--format', 'json'])
if (outdated && typeof outdated === 'object') {
  for (const [nome, info] of Object.entries(outdated)) {
    if (!info?.latest || !info?.current) continue
    const u = get(nome)
    u.versao_atual = info.current
    u.versao_alvo = info.latest
    u.tipo = salto(info.current, info.latest)
  }
}
for (const u of mapa.values()) if (u.versao_atual && u.versao_alvo) u.tipo = salto(u.versao_atual, u.versao_alvo)

const atualizacoes = [...mapa.values()].filter((u) => u.versao_alvo || u.cve_ids.length)
const achadosVista = atualizacoes.filter((u) => u.cve_ids.length).map((u) => ({
  severidade: u.severidade, titulo: `${u.pacote}@${u.versao_atual ?? '?'} com vulnerabilidade (${u.cve_ids.slice(0, 3).join(', ')})`, arquivo: 'package.json',
}))
if (opts.json) console.log(JSON.stringify(atualizacoes, null, 2))
const por = imprimirResumo('Dependências (CVEs)', achadosVista)
const cont = { patch: 0, minor: 0, major: 0 }
for (const u of atualizacoes) cont[u.tipo]++
console.log(`Atualizações disponíveis: ${atualizacoes.length} (patch ${cont.patch} | minor ${cont.minor} | major ${cont.major})`)

if (!opts.dry) spawnSync('node', [path.join(RAIZ, 'scripts', 'seguranca-manifest.mjs')], { stdio: 'inherit', shell: true })

await enviar({ prefixos: ['dep:audit:'], achados: [], atualizacoes, cobreAtualizacoes: !!outdated }, opts)
if (opts.falhar && (por.critico || por.alto)) process.exit(1)
