#!/usr/bin/env node
/**
 * Guardrail de EGRESS — impede que padrões que estouram o egress do Supabase voltem no código novo.
 *
 * Verifica (em apps/web e apps/worker):
 *   1. `.select('*')`               → projeção obrigatória (ler só as colunas usadas).
 *   2. `setInterval` em .tsx/.ts do cliente sem pausa por `document.hidden`/`visibilitychange`.
 *   3. `setInterval(... , N)` no worker com N < 60000 (cron muito frequente).
 *   4. `.range(` com teto gigante (ex.: `.range(0, 9999)`) → usar fetchAll/paginação real.
 *
 * Uso:
 *   node scripts/check-egress-guardrails.mjs            # relatório (não falha)
 *   node scripts/check-egress-guardrails.mjs --strict   # falha (exit 1) se houver violação
 *   node scripts/check-egress-guardrails.mjs --ratchet   # falha só se PIORAR vs baseline
 *
 * O baseline vive em scripts/.egress-baseline.json — atualize com --save quando reduzir dívida.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(__dirname, '..')            // apps/web
const WORKER = path.resolve(__dirname, '../../worker') // apps/worker
const BASELINE = path.join(__dirname, '.egress-baseline.json')

const args = new Set(process.argv.slice(2))
const STRICT = args.has('--strict')
const RATCHET = args.has('--ratchet')
const SAVE = args.has('--save')

/** Varre recursivamente por arquivos .ts/.tsx (ignora node_modules, .next, dist, scripts, testes). */
function walk(dir, out = []) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (/node_modules|\.next|dist|build|coverage|\.git|scripts|__tests__|\.turbo/.test(e.name)) continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name)) {
      out.push(full)
    }
  }
  return out
}

const files = [...walk(WEB), ...walk(WORKER)]
const rel = (f) => path.relative(path.resolve(WEB, '..', '..'), f).replace(/\\/g, '/')

const viol = { selectStar: [], pollingSemPausa: [], cronRapido: [], rangeGigante: [] }

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const lines = src.split('\n')

  // 1) .select('*')  ou  .select(`*`)  ou  .select("*")
  lines.forEach((ln, i) => {
    if (/\.select\(\s*['"`]\*['"`]\s*\)/.test(ln)) viol.selectStar.push(`${rel(f)}:${i + 1}`)
  })

  // 4) .range(0, 9999) e afins (teto >= 5000)
  lines.forEach((ln, i) => {
    const m = ln.match(/\.range\(\s*\d+\s*,\s*(\d{4,})\s*\)/)
    if (m && Number(m[1]) >= 5000) viol.rangeGigante.push(`${rel(f)}:${i + 1}`)
  })

  // 2) setInterval em arquivo cliente (.tsx) que faz POLLING DE REDE (fetch/supabase/invoke) sem pausa
  //    por visibilidade. (Timers locais de relógio/animação/tour não contam — não geram egress.)
  if (/\.tsx$/.test(f) && /setInterval\s*\(/.test(src)) {
    const fazRede = /\bfetch\s*\(|supabase|\.functions\.invoke|\/api\//.test(src)
    const temPausa = /document\.hidden|visibilitychange|visibilityState/.test(src)
    if (fazRede && !temPausa) {
      // Opt-out por linha: `// egress-ok` na própria linha ou na de cima marca um setInterval LOCAL
      // (relógio/countdown, não rede) como aceitável — evita falso positivo.
      lines.forEach((ln, i) => {
        if (!/setInterval\s*\(/.test(ln)) return
        if (/egress-ok/.test(ln) || (i > 0 && /egress-ok/.test(lines[i - 1]))) return
        viol.pollingSemPausa.push(`${rel(f)}:${i + 1}`)
      })
    }
  }

  // 3) setInterval no worker com intervalo < 60000
  if (/apps[\\/]worker/.test(f)) {
    lines.forEach((ln, i) => {
      const m = ln.match(/setInterval\([^,]*,\s*([\d_]+)\s*\)/)
      if (m) { const ms = Number(m[1].replace(/_/g, '')); if (ms > 0 && ms < 60000) viol.cronRapido.push(`${rel(f)}:${i + 1} (${ms}ms)`) }
    })
  }
}

const counts = Object.fromEntries(Object.entries(viol).map(([k, v]) => [k, v.length]))
const rotulos = {
  selectStar: "select('*') — use projeção de colunas",
  pollingSemPausa: 'setInterval no cliente sem pausa em document.hidden',
  cronRapido: 'cron do worker com intervalo < 60s',
  rangeGigante: '.range(...) com teto gigante — use fetchAll/paginação',
}

console.log('\n=== Guardrail de EGRESS ===')
for (const k of Object.keys(viol)) {
  console.log(`\n[${counts[k]}] ${rotulos[k]}`)
  for (const v of viol[k].slice(0, 50)) console.log(`   - ${v}`)
  if (viol[k].length > 50) console.log(`   … +${viol[k].length - 50}`)
}
console.log('\nResumo:', JSON.stringify(counts))

if (SAVE) {
  fs.writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n')
  console.log(`\nBaseline salvo em ${path.relative(WEB, BASELINE)}`)
  process.exit(0)
}

const total = Object.values(counts).reduce((a, b) => a + b, 0)

if (RATCHET) {
  let base = {}
  try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) } catch { console.log('\n(sem baseline — rode com --save para criar)') }
  const piorou = Object.keys(counts).filter((k) => counts[k] > (base[k] ?? Infinity))
  if (piorou.length) {
    console.error('\n❌ EGRESS GUARDRAIL: aumentou a dívida em: ' + piorou.map((k) => `${k} (${base[k] ?? 0}→${counts[k]})`).join(', '))
    process.exit(1)
  }
  console.log('\n✅ Sem regressão vs baseline.')
  process.exit(0)
}

if (STRICT && total > 0) { console.error(`\n❌ ${total} violação(ões) de egress.`); process.exit(1) }
console.log(total > 0 ? `\n⚠️  ${total} ponto(s) para revisar (informativo).` : '\n✅ Sem violações.')
process.exit(0)
