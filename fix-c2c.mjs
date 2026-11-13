/**
 * fix-c2c.mjs — Comprehensive C2 fix:
 * 1. For each actions+tipos pair: ensure the actions file imports ALL types from its tipos sibling.
 * 2. For consumer files: update `import type { X }` from actions → actions-tipos.
 */
import fs from 'fs'
import path from 'path'

const WEB = path.resolve('apps/web')

function tiposFile(absPath) {
  const dir = path.dirname(absPath)
  const base = path.basename(absPath, path.extname(absPath))
  if (base.endsWith('-tipos')) return absPath
  return path.join(dir, base + '-tipos.ts')
}

/** All type/interface names exported from a tipos file */
function tiposExports(tiposAbs) {
  if (!fs.existsSync(tiposAbs)) return []
  const src = fs.readFileSync(tiposAbs, 'utf8')
  return [...src.matchAll(/^export\s+(?:type\s+|interface\s+)(\w+)/gm)].map(m => m[1])
}

/** Fix an actions file: ensure it has a complete import type for all types in its tipos sibling */
function fixActionsImports(actionsAbs) {
  const tiposAbs = tiposFile(actionsAbs)
  const names = tiposExports(tiposAbs)
  if (!names.length) return false

  let src = fs.readFileSync(actionsAbs, 'utf8')
  const tiposBase = path.basename(tiposAbs, '.ts')

  // Remove any existing import type from this tipos file (we'll re-add with complete list)
  const existingRe = new RegExp(`import type \\{[^}]+\\} from '(\\.\\/)?${tiposBase}'\\n?`, 'g')
  src = src.replace(existingRe, '')

  // Find the insertion point: after last top-level import line
  const importLines = [...src.matchAll(/^import .+\n/gm)]
  const lastImport = importLines[importLines.length - 1]
  const newImport = `import type { ${names.join(', ')} } from './${tiposBase}'\n`

  if (lastImport) {
    const pos = src.lastIndexOf(lastImport[0]) + lastImport[0].length
    // Insert AFTER the last import block (skip multi-line imports)
    // Find real end of last import by scanning forward for '}'  then 'from'
    let insertPos = pos
    // If the last import starts with 'import {' and doesn't close on same line, it's multiline
    // Simple heuristic: scan for next 'import ' or start of code
    src = src.slice(0, insertPos) + newImport + src.slice(insertPos)
  } else {
    src = src.replace(/^'use server'\n/, `'use server'\n${newImport}`)
  }

  fs.writeFileSync(actionsAbs, src, 'utf8')
  return true
}

/** For a consumer file: redirect import type { X, Y } from './actions' → './actions-tipos'
 *  when X, Y are defined in actions-tipos. */
function fixConsumerImports(consumerAbs, actionsRel, typeNames) {
  if (!fs.existsSync(consumerAbs)) return false
  let src = fs.readFileSync(consumerAbs, 'utf8')
  let changed = false

  // Build the tipos path relative to consumer
  // actionsRel is like './actions' or '@/app/admin/foo/actions' or '../actions'
  const isAlias = actionsRel.startsWith('@/')
  let tiposRel

  if (isAlias) {
    // e.g. @/app/admin/foo/actions -> @/app/admin/foo/actions-tipos
    const base = actionsRel.replace(/\.tsx?$/, '')
    tiposRel = base.endsWith('-tipos') ? base : base + '-tipos'
  } else {
    // relative: './actions' -> './actions-tipos'
    const base = actionsRel.replace(/\.tsx?$/, '')
    tiposRel = base.endsWith('-tipos') ? base : base + '-tipos'
  }

  // Pattern: import type { ... X ... } from 'actionsRel'
  // Also handles: import { type X, type Y, functionZ } from 'actionsRel'
  const escapedRel = actionsRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const importRe = new RegExp(
    `(import(?:\\s+type)?\\s*\\{)([^}]+)(\\}\\s*from\\s*['"])(${escapedRel})(['"])`,
    'g'
  )

  src = src.replace(importRe, (match, open, names, mid, from, close) => {
    const isTypeImport = open.includes('type')
    const parts = names.split(',').map(s => s.trim()).filter(Boolean)

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

    const movedNames = movedTypes.map(p => p.replace(/^type\s+/, '').trim())
    let result = ''
    if (movedNames.length) {
      result += `import type { ${movedNames.join(', ')} } from '${tiposRel}'\n`
    }
    if (keptParts.length) {
      result += `${open}${keptParts.join(', ')}${mid}${from}${close}`
    }
    return result.trim()
  })

  if (changed) {
    fs.writeFileSync(consumerAbs, src, 'utf8')
    return true
  }
  return false
}

// ── Step 1: Fix all actions files imports ──────────────────────────────────────
const actionsFiles = fs.readdirSync(WEB + '/app', { recursive: true })
  .filter(f => typeof f === 'string' && (f.endsWith('/actions.ts') || f.endsWith('/actions.tsx') ||
    (f.includes('-actions') && f.endsWith('.ts') && !f.endsWith('-tipos.ts'))))
  .map(f => path.join(WEB + '/app', f))
  .filter(f => {
    if (!fs.existsSync(f)) return false
    const src = fs.readFileSync(f, 'utf8')
    return src.startsWith("'use server'") || src.startsWith('"use server"')
  })

let step1fixed = 0
for (const abs of actionsFiles) {
  if (fixActionsImports(abs)) step1fixed++
}
console.log(`Step 1: Updated import type in ${step1fixed} actions files.`)

// ── Step 2: Find consumer files and fix their imports ──────────────────────────
// Build a map: actions file -> type names defined in its tipos sibling
const typesMap = new Map() // key = absolute actions path, value = type names[]
for (const abs of actionsFiles) {
  const tiposAbs = tiposFile(abs)
  const names = tiposExports(tiposAbs)
  if (names.length) typesMap.set(abs, names)
}

// Scan all .ts/.tsx files in app/ and components/ and lib/
const allFiles = []
for (const dir of ['app', 'components', 'lib']) {
  const dirAbs = path.join(WEB, dir)
  if (!fs.existsSync(dirAbs)) continue
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) { walk(path.join(d, entry.name)); continue }
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        allFiles.push(path.join(d, entry.name))
      }
    }
  }
  walk(dirAbs)
}

let step2fixed = 0
for (const consumerAbs of allFiles) {
  const consumerSrc = fs.existsSync(consumerAbs) ? fs.readFileSync(consumerAbs, 'utf8') : ''
  if (!consumerSrc) continue

  for (const [actionsAbs, typeNames] of typesMap) {
    // Skip self
    if (consumerAbs === actionsAbs) continue

    // Build possible import path forms
    const actionsRelToConsumer = path.relative(path.dirname(consumerAbs), actionsAbs)
      .replace(/\\/g, '/').replace(/\.tsx?$/, '').replace(/^([^.])/, './$1')
    const actionsAliased = '@/' + path.relative(WEB, actionsAbs).replace(/\\/g, '/').replace(/\.tsx?$/, '')

    for (const importPath of [actionsRelToConsumer, actionsAliased]) {
      if (consumerSrc.includes(`'${importPath}'`) || consumerSrc.includes(`"${importPath}"`)) {
        if (fixConsumerImports(consumerAbs, importPath, typeNames)) {
          step2fixed++
          break
        }
      }
    }
  }
}
console.log(`Step 2: Updated import paths in ${step2fixed} consumer files.`)
console.log('Done. Run tsc --noEmit to verify.')
