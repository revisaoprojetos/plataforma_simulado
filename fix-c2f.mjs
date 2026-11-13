/**
 * fix-c2f.mjs — Handle multi-line import blocks with inline `type X` entries.
 * Pattern:
 *   import { funcA, type TypeX, type TypeY } from './actions'
 * or multi-line:
 *   import {
 *     funcA, funcB,
 *     type TypeX,
 *   } from './actions'
 * →
 *   import type { TypeX, TypeY } from './actions-tipos'
 *   import { funcA, funcB } from './actions'   (or removed if only types)
 */
import fs from 'fs'
import path from 'path'

const WEB = path.resolve('apps/web')

function tiposFile(absPath) {
  const base = path.basename(absPath, path.extname(absPath))
  return base.endsWith('-tipos') ? absPath : path.join(path.dirname(absPath), base + '-tipos.ts')
}

function tiposExports(tiposAbs) {
  if (!fs.existsSync(tiposAbs)) return []
  const src = fs.readFileSync(tiposAbs, 'utf8')
  return [...src.matchAll(/^export\s+(?:type\s+|interface\s+)(\w+)/gm)].map(m => m[1])
}

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

const typesMap = new Map()
for (const abs of actionsFiles) {
  const tiposAbs = tiposFile(abs)
  const names = tiposExports(tiposAbs)
  if (names.length) typesMap.set(abs, names)
}

const allFiles = []
function walkAll(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { walkAll(full); continue }
    if ((entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('-tipos.ts')) {
      allFiles.push(full)
    }
  }
}
for (const d of ['app', 'components', 'lib']) {
  const dp = path.join(WEB, d)
  if (fs.existsSync(dp)) walkAll(dp)
}

/** Extract all import blocks from source, return array of {start, end, text} */
function findImportBlocks(src) {
  const blocks = []
  let i = 0
  while (i < src.length) {
    // Find 'import' keyword at start of line or after newline
    const idx = src.indexOf('import', i)
    if (idx === -1) break

    // Ensure it's at word boundary (not inside a string)
    const before = idx > 0 ? src[idx - 1] : '\n'
    if (before !== '\n' && before !== '\r' && before !== ' ' && before !== '\t') {
      i = idx + 1
      continue
    }

    // Skip 'import type {' (we don't reprocess those)
    const afterImport = src.slice(idx + 6).trimStart()
    if (afterImport.startsWith('type {') || afterImport.startsWith('type{')) {
      i = idx + 7
      continue
    }

    // Find the opening brace
    let j = idx + 6
    while (j < src.length && src[j] !== '{' && src[j] !== '\n' && src[j] !== ';') j++
    if (src[j] !== '{') { i = j; continue }

    // Find the closing brace
    let k = j + 1
    let depth = 1
    while (k < src.length && depth > 0) {
      if (src[k] === '{') depth++
      else if (src[k] === '}') depth--
      k++
    }
    if (depth !== 0) { i = j + 1; continue }
    // k is now after the '}'

    // Now expect: whitespace, 'from', whitespace, quote, path, quote
    const afterBrace = src.slice(k)
    const fromMatch = afterBrace.match(/^\s*from\s*['"]([^'"]+)['"]/)
    if (!fromMatch) { i = k; continue }

    const end = k + fromMatch[0].length
    blocks.push({
      start: idx,
      end,
      text: src.slice(idx, end),
      importPath: fromMatch[1],
      namesRaw: src.slice(j + 1, k - 1), // content between { }
    })
    i = end
  }
  return blocks
}

let fixed = 0
for (const consumerAbs of allFiles) {
  let src
  try { src = fs.readFileSync(consumerAbs, 'utf8') } catch { continue }

  for (const [actionsAbs, typeNames] of typesMap) {
    if (consumerAbs === actionsAbs) continue

    const relToConsumer = path.relative(path.dirname(consumerAbs), actionsAbs)
      .replace(/\\/g, '/').replace(/\.tsx?$/, '').replace(/^([^.])/, './$1')
    const aliased = '@/' + path.relative(WEB, actionsAbs).replace(/\\/g, '/').replace(/\.tsx?$/, '')

    const blocks = findImportBlocks(src)
    let changed = false
    // Process in reverse order so positions stay valid
    for (const block of [...blocks].reverse()) {
      if (block.importPath !== relToConsumer && block.importPath !== aliased) continue

      // Parse names from the block
      const parts = block.namesRaw
        .split(',')
        .map(s => s.trim().replace(/\n/g, '').replace(/\r/g, ''))
        .filter(Boolean)

      // Find type entries (either `type X` or just X if it's in typeNames)
      const typeParts = parts.filter(p => {
        if (p.startsWith('type ')) return true
        return typeNames.includes(p.trim())
      })
      const valueParts = parts.filter(p => {
        if (p.startsWith('type ')) return false
        return !typeNames.includes(p.trim())
      })

      if (!typeParts.length) continue
      changed = true

      const isAlias = block.importPath.startsWith('@/')
      const tiposPath = isAlias
        ? (aliased.endsWith('-tipos') ? aliased : aliased + '-tipos')
        : (relToConsumer.endsWith('-tipos') ? relToConsumer : relToConsumer + '-tipos')

      const movedNames = typeParts.map(p => p.replace(/^type\s+/, '').trim())
      let replacement = `import type { ${movedNames.join(', ')} } from '${tiposPath}'`
      if (valueParts.length) {
        replacement += `\nimport { ${valueParts.join(', ')} } from '${block.importPath}'`
      }

      src = src.slice(0, block.start) + replacement + src.slice(block.end)
    }

    if (changed) {
      fs.writeFileSync(consumerAbs, src, 'utf8')
      fixed++
      break
    }
  }
}
console.log(`Fixed ${fixed} consumer files.`)
