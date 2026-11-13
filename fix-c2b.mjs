/**
 * fix-c2b.mjs — Add 'import type' to actions files that use types moved to *-tipos.ts siblings.
 * Also fixes consumer files based on tsc errors (passed as stdin or error file).
 */
import fs from 'fs'
import path from 'path'

const WEB = path.resolve('apps/web')

// For each actions file, check its sibling tipos file and add missing imports
const actionsFiles = [
  'app/admin/administradores/actions.ts',
  'app/admin/atendimento/actions.ts',
  'app/admin/banco-questoes/actions.ts',
  'app/admin/biblioteca/actions.ts',
  'app/admin/biblioteca/areas-actions.ts',
  'app/admin/biblioteca/capa-actions.ts',
  'app/admin/biblioteca/editar/[versaoId]/previa-actions.ts',
  'app/admin/biblioteca/flashcards-actions.ts',
  'app/admin/biblioteca/gestao-actions.ts',
  'app/admin/cadernos-teste/actions.ts',
  'app/admin/cadernos/actions.ts',
  'app/admin/configuracoes/banners/actions.ts',
  'app/admin/configuracoes/novidades/actions.ts',
  'app/admin/conteudos/classificacao/actions.ts',
  'app/admin/conteudos/grupos/actions.ts',
  'app/admin/conteudos/materiais/questoes/actions.ts',
  'app/admin/conteudos/produtos/[id]/visibilidade-actions.ts',
  'app/admin/cronogramas/[id]/metas-actions.ts',
  'app/admin/cronogramas/actions.ts',
  'app/admin/cronogramas/adaptativo/actions.ts',
  'app/admin/cronogramas/conteudos/actions.ts',
  'app/admin/cronogramas/importar/actions.ts',
  'app/admin/cronogramas/lei-seca/actions.ts',
  'app/admin/cronogramas/links/actions.ts',
  'app/admin/cronogramas/metas/actions.ts',
  'app/admin/cronogramas/pacotes/actions.ts',
  'app/admin/cronogramas/relatorios/actions.ts',
  'app/admin/cronogramas/tipos-actions.ts',
  'app/admin/curseduca/actions.ts',
  'app/admin/entrada/actions.ts',
  'app/admin/estudantes/actions.ts',
  'app/admin/etiquetas/actions.ts',
  'app/admin/gamificacao/actions.ts',
  'app/admin/grupos/actions.ts',
  'app/admin/impersonation/actions.ts',
  'app/admin/leitura/actions.ts',
  'app/admin/leitura/biblioteca/actions.ts',
  'app/admin/lgpd/actions.ts',
  'app/admin/liberacao/actions.ts',
  'app/admin/lixeira/actions.ts',
  'app/admin/modelos-caderno/actions.ts',
  'app/admin/produtos/actions.ts',
  'app/admin/questoes/actions.ts',
  'app/admin/questoes/disciplinas-actions.ts',
  'app/admin/questoes/importar-plataforma-actions.ts',
  'app/admin/rbac/actions.ts',
  'app/admin/simulados/actions.ts',
  'app/admin/simulados/criar/acoes.ts',
  'app/admin/simulados/desafios-actions.ts',
  'app/admin/sistema/actions.ts',
  'app/admin/tenants/actions.ts',
  'app/admin/tenants/disciplinas-actions.ts',
  'app/admin/teste/agentes/actions.ts',
  'app/admin/teste/onlyoffice/[id]/previa-actions.ts',
  'app/admin/transcricao/actions.ts',
  'app/aluno/(portal)/cronograma/actions.ts',
  'app/aluno/(portal)/cronograma/checks-actions.ts',
  'app/aluno/(portal)/cronograma/download-actions.ts',
  'app/aluno/(portal)/cronograma/emissoes-actions.ts',
  'app/aluno/(portal)/cronograma/notas-actions.ts',
  'app/aluno/(portal)/cronograma/resolver-actions.ts',
  'app/aluno/(portal)/leitura/busca-actions.ts',
  'app/aluno/(portal)/simulados/builder-actions.ts',
  'app/aluno/(portal)/simulados/runner-actions.ts',
]

function tiposFile(absPath) {
  const dir = path.dirname(absPath)
  const base = path.basename(absPath, path.extname(absPath))
  const tiposBase = base.endsWith('-tipos') ? base : base + '-tipos'
  return path.join(dir, tiposBase + '.ts')
}

/** Extract type names exported from a tipos file */
function tiposExports(tiposAbs) {
  if (!fs.existsSync(tiposAbs)) return []
  const src = fs.readFileSync(tiposAbs, 'utf8')
  const names = []
  for (const m of src.matchAll(/^export\s+(?:type\s+|interface\s+)(\w+)/gm)) names.push(m[1])
  return names
}

/** Add import type to actions file for types it uses from its tipos sibling */
function addImportToActions(absPath) {
  const tiposAbs = tiposFile(absPath)
  const exported = tiposExports(tiposAbs)
  if (!exported.length) return false

  let src = fs.readFileSync(absPath, 'utf8')

  // Which types does this file actually use (not just in its own import type line)?
  const needed = exported.filter(name => {
    // Check if name appears in the file body (not inside an import type line for this tipos file)
    const re = new RegExp(`\\b${name}\\b`)
    // Remove existing import type lines to avoid false positives
    const bodyWithoutImport = src.replace(new RegExp(`import type \\{[^}]*\\} from '[^']*${path.basename(tiposAbs, '.ts')}'[^\n]*\n`, 'g'), '')
    return re.test(bodyWithoutImport)
  })
  if (!needed.length) return false

  // Check if import already exists
  const tiposBasename = path.basename(tiposAbs, '.ts')
  if (src.includes(`from './${tiposBasename}'`) || src.includes(`from "./${tiposBasename}"`)) {
    // Update existing import to add missing names
    const existingRe = new RegExp(`import type \\{([^}]+)\\} from '(\\./${tiposBasename})'`)
    const match = src.match(existingRe)
    if (match) {
      const existing = match[1].split(',').map(s => s.trim()).filter(Boolean)
      const all = [...new Set([...existing, ...needed])].sort()
      src = src.replace(existingRe, `import type { ${all.join(', ')} } from './${tiposBasename}'`)
    }
  } else {
    // Add after 'use server' line and existing imports
    const insertAfter = src.match(/^import .+\n/gm)?.slice(-1)[0]
    if (insertAfter) {
      const insertPos = src.lastIndexOf(insertAfter) + insertAfter.length
      src = src.slice(0, insertPos) + `import type { ${needed.join(', ')} } from './${tiposBasename}'\n` + src.slice(insertPos)
    } else {
      // No imports yet — insert after 'use server'
      src = src.replace(/^'use server'\n/, `'use server'\nimport type { ${needed.join(', ')} } from './${tiposBasename}'\n`)
    }
  }

  fs.writeFileSync(absPath, src, 'utf8')
  return true
}

let fixed = 0
for (const rel of actionsFiles) {
  const abs = path.join(WEB, rel)
  if (!fs.existsSync(abs)) continue
  if (addImportToActions(abs)) {
    console.log(`✓ added import type to ${rel}`)
    fixed++
  }
}
console.log(`\nDone: ${fixed} files updated with import type statements.`)
