/**
 * fix-c2d.mjs — Final C2 fix pass
 * 1. For each 'use server' actions file: re-insert a complete import type from its tipos sibling
 *    RIGHT AFTER the 'use server' line (always safe, avoids multi-line import issues).
 * 2. For consumer files: update multi-line import blocks that reference types now in tipos files.
 */
import fs from 'fs'
import path from 'path'

const WEB = path.resolve('apps/web')

function tiposFile(absPath) {
  const dir = path.dirname(absPath)
  const base = path.basename(absPath, path.extname(absPath))
  return base.endsWith('-tipos') ? absPath : path.join(dir, base + '-tipos.ts')
}

function tiposExports(tiposAbs) {
  if (!fs.existsSync(tiposAbs)) return []
  const src = fs.readFileSync(tiposAbs, 'utf8')
  return [...src.matchAll(/^export\s+(?:type\s+|interface\s+)(\w+)/gm)].map(m => m[1])
}

/** Parse all import blocks (single and multi-line) and return their info */
function parseImports(src) {
  const results = []
  // Match `import ... from 'path'` including multiline with { }
  const re = /import(?:\s+type)?\s*(?:\{[^}]*\}|\w+)(?:\s*,\s*(?:\{[^}]*\}|\w+))?\s*from\s*['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(src)) !== null) {
    results.push({ start: m.index, end: m.index + m[0].length, path: m[1], text: m[0] })
  }
  return results
}

// ── Step 1: Fix actions files ─────────────────────────────────────────────────
const actionsFiles = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { walk(full); continue }
    if ((entry.name === 'actions.ts' || entry.name === 'actions.tsx' ||
         (entry.name.endsWith('-actions.ts') && !entry.name.endsWith('-tipos.ts')))) {
      actionsFiles.push(full)
    }
  }
}
walk(path.join(WEB, 'app'))

let step1 = 0
for (const abs of actionsFiles) {
  const tiposAbs = tiposFile(abs)
  const names = tiposExports(tiposAbs)
  if (!names.length) continue

  let src = fs.readFileSync(abs, 'utf8')
  if (!src.startsWith("'use server'") && !src.startsWith('"use server"')) continue

  const tiposBase = path.basename(tiposAbs, '.ts')

  // Remove any existing import type line from this tipos file
  src = src.replace(new RegExp(`import type \\{[^}]+\\} from '(\\.\\/)?${tiposBase}'\n?`, 'g'), '')

  // Insert right after 'use server' declaration
  const useServerEnd = src.indexOf('\n') + 1
  const newImport = `import type { ${names.join(', ')} } from './${tiposBase}'\n`
  src = src.slice(0, useServerEnd) + newImport + src.slice(useServerEnd)

  fs.writeFileSync(abs, src, 'utf8')
  step1++
}
console.log(`Step 1: Updated ${step1} actions files.`)

// ── Step 2: Fix consumer files ────────────────────────────────────────────────
// Build map: actions abs path → type names
const typesMap = new Map()
for (const abs of actionsFiles) {
  const tiposAbs = tiposFile(abs)
  const names = tiposExports(tiposAbs)
  if (names.length) typesMap.set(abs, names)
}

// All ts/tsx files
const allFiles = []
function walkAll(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { walkAll(full); continue }
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) allFiles.push(full)
  }
}
for (const d of ['app', 'components', 'lib']) {
  const dp = path.join(WEB, d)
  if (fs.existsSync(dp)) walkAll(dp)
}

/** Replace type imports from an actions file to its tipos sibling in a consumer file */
function fixConsumer(consumerAbs, actionsAbs, typeNames) {
  if (!fs.existsSync(consumerAbs)) return false
  let src = fs.readFileSync(consumerAbs, 'utf8')

  // Build the import paths this consumer might use
  const relToConsumer = path.relative(path.dirname(consumerAbs), actionsAbs)
    .replace(/\\/g, '/').replace(/\.tsx?$/, '').replace(/^([^.])/, './$1')
  const aliased = '@/' + path.relative(WEB, actionsAbs).replace(/\\/g, '/').replace(/\.tsx?$/, '')
  const tiposRel = relToConsumer.replace(/([^-])$/, '$1') + (relToConsumer.endsWith('-tipos') ? '' : '')
    // For relative: './actions' → './actions-tipos'
  const tiposRelFixed = relToConsumer.endsWith('-tipos') ? relToConsumer : relToConsumer.replace(/([^/]+)$/, '$1-tipos')
  const tiposAliasFixed = aliased.endsWith('-tipos') ? aliased : aliased + '-tipos'

  let changed = false

  for (const importPath of [relToConsumer, aliased]) {
    // Match import blocks (possibly multiline) with this path
    // Using a state machine approach on the source
    const escaped = importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // This regex matches import ... { ... } from 'path' even multi-line
    const re = new RegExp(
      `(import(?:\\s+type)?\\s*\\{)([\\s\\S]*?)(\\}\\s*from\\s*['"])(${escaped})(['"])`,
      'g'
    )

    let newSrc = src.replace(re, (match, open, nameBlock, mid, fromPath, close) => {
      // Parse individual names from the block
      const parts = nameBlock.split(',').map(s => s.trim().replace(/\n/g, '')).filter(Boolean)
      const movedTypes = parts.filter(p => {
        const n = p.replace(/^type\s+/, '').trim()
        return typeNames.includes(n)
      })
      const keptParts = parts.filter(p => {
        const n = p.replace(/^type\s+/, '').trim()
        return !typeNames.includes(n)
      })

      if (!movedTypes.length) return match
      changed = true

      const isAlias = importPath.startsWith('@/')
      const tiposPath = isAlias ? tiposAliasFixed : tiposRelFixed
      const movedNames = movedTypes.map(p => p.replace(/^type\s+/, '').trim())

      let result = `import type { ${movedNames.join(', ')} } from '${tiposPath}'`
      if (keptParts.length) {
        result += `\n${open}${keptParts.join(', ')}${mid}${fromPath}${close}`
      }
      return result
    })

    if (newSrc !== src) {
      src = newSrc
    }
  }

  if (changed) {
    fs.writeFileSync(consumerAbs, src, 'utf8')
    return true
  }
  return false
}

let step2 = 0
for (const consumerAbs of allFiles) {
  for (const [actionsAbs, typeNames] of typesMap) {
    if (consumerAbs === actionsAbs) continue
    if (fixConsumer(consumerAbs, actionsAbs, typeNames)) {
      step2++
      break
    }
  }
}
console.log(`Step 2: Updated ${step2} consumer files.`)
console.log('Done.')
