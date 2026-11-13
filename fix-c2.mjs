/**
 * fix-c2.mjs — Move type/interface exports out of 'use server' files into *-tipos.ts siblings.
 * Usage: node fix-c2.mjs  (run from repo root)
 */
import fs from 'fs'
import path from 'path'

const WEB = path.resolve('apps/web')

const targets = [
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

/** Extract top-level export type/interface blocks; returns moved blocks + cleaned source */
function extractTypeExports(src) {
  const lines = src.split('\n')
  const blocks = []
  const keep = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Strip re-exports from tipos files (e.g. export type { Foo } from './actions-tipos')
    if (/^export\s+(type\s*)?\{[^}]+\}\s+from\s+['"][^'"]*-tipos['"]/.test(line)) {
      i++; continue
    }
    // Detect export type / export interface at start of line
    if (/^export\s+(type\s+\w|interface\s+\w)/.test(line)) {
      let block = line
      let depth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
      i++
      while (i < lines.length && depth > 0) {
        block += '\n' + lines[i]
        depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length
        i++
      }
      blocks.push(block.trimEnd())
    } else {
      keep.push(line)
      i++
    }
  }
  // Remove excess blank lines
  const cleaned = keep.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
  return { blocks, cleaned }
}

function tiposFile(absPath) {
  const dir = path.dirname(absPath)
  const base = path.basename(absPath, path.extname(absPath))
  const tiposBase = base.endsWith('-tipos') ? base : base + '-tipos'
  return path.join(dir, tiposBase + '.ts')
}

function typeName(block) {
  return block.match(/^export\s+(?:type\s+|interface\s+)(\w+)/)?.[1]
}

let fixed = 0
for (const rel of targets) {
  const abs = path.join(WEB, rel)
  if (!fs.existsSync(abs)) { console.log(`SKIP (not found): ${rel}`); continue }

  const src = fs.readFileSync(abs, 'utf8')
  const { blocks, cleaned } = extractTypeExports(src)
  if (!blocks.length) { console.log(`OK (no types): ${rel}`); continue }

  const tiposAbs = tiposFile(abs)
  let tiposSrc = fs.existsSync(tiposAbs)
    ? fs.readFileSync(tiposAbs, 'utf8')
    : `// Tipos de ${path.basename(abs)} — sem 'use server' para não quebrar o next build\n`

  const names = []
  for (const block of blocks) {
    const name = typeName(block)
    if (!name) continue
    // Skip if already in tipos file
    const alreadyThere = tiposSrc.includes(`export type ${name} `) ||
                         tiposSrc.includes(`export type ${name}=`) ||
                         tiposSrc.includes(`export interface ${name} `) ||
                         tiposSrc.includes(`export interface ${name}{`)
    if (!alreadyThere) {
      tiposSrc = tiposSrc.trimEnd() + '\n\n' + block + '\n'
      names.push(name)
    }
  }

  fs.writeFileSync(tiposAbs, tiposSrc, 'utf8')
  fs.writeFileSync(abs, cleaned, 'utf8')

  console.log(`✓ ${rel} → ${names.length} types moved to ${path.basename(tiposAbs)}`)
  fixed++
}

console.log(`\nDone: ${fixed} files updated.`)
console.log('Next step: update importers that reference types from these action files.')
console.log('Run: grep -r "from.*actions\'" apps/web/app apps/web/components apps/web/lib to find affected imports.')
