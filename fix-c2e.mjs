/**
 * fix-c2e.mjs — Fix consumer files (single-line imports only, safe)
 * Updates `import { TypeX } from './actions'` lines where TypeX is now in actions-tipos.
 * Only handles single-line imports (no \n inside {}). Multi-line imports are skipped.
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

// Build map: actions abs path → type names
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

// Scan all ts/tsx consumer files
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

let fixed = 0
for (const consumerAbs of allFiles) {
  let src
  try { src = fs.readFileSync(consumerAbs, 'utf8') } catch { continue }

  for (const [actionsAbs, typeNames] of typesMap) {
    if (consumerAbs === actionsAbs) continue

    const relToConsumer = path.relative(path.dirname(consumerAbs), actionsAbs)
      .replace(/\\/g, '/').replace(/\.tsx?$/, '').replace(/^([^.])/, './$1')
    const aliased = '@/' + path.relative(WEB, actionsAbs).replace(/\\/g, '/').replace(/\.tsx?$/, '')

    for (const importPath of [relToConsumer, aliased]) {
      const escaped = importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // ONLY single-line imports: no \n inside {}
      const re = new RegExp(
        `^(import(?:\\s+type)?\\s*\\{)([^}\\n]+)(\\}\\s*from\\s*['"]${escaped}['"])`,
        'gm'
      )

      let changed = false
      const newSrc = src.replace(re, (match, open, nameBlock, close) => {
        const parts = nameBlock.split(',').map(s => s.trim()).filter(Boolean)
        const movedTypes = parts.filter(p => typeNames.includes(p.replace(/^type\s+/, '').trim()))
        const keptParts = parts.filter(p => !typeNames.includes(p.replace(/^type\s+/, '').trim()))

        if (!movedTypes.length) return match
        changed = true

        const isAlias = importPath.startsWith('@/')
        const tiposPath = isAlias
          ? (aliased.endsWith('-tipos') ? aliased : aliased + '-tipos')
          : (relToConsumer.endsWith('-tipos') ? relToConsumer : relToConsumer + '-tipos')
        const movedNames = movedTypes.map(p => p.replace(/^type\s+/, '').trim())

        let result = `import type { ${movedNames.join(', ')} } from '${tiposPath}'`
        if (keptParts.length) {
          result += `\n${open}${keptParts.join(', ')}${close}`
        }
        return result
      })

      if (changed) {
        src = newSrc
        fs.writeFileSync(consumerAbs, src, 'utf8')
        fixed++
        break
      }
    }
  }
}
console.log(`Fixed ${fixed} consumer files.`)
