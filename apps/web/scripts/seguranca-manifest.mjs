// Gera lib/seguranca/deps-manifest.json (dependências DIRETAS de produção + versão instalada) p/ o cron consultar o OSV.dev.
// Uso: node scripts/seguranca-manifest.mjs   (rode antes do build/Docker: `pnpm seguranca:manifest`)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'))
const deps = []
for (const [nome, range] of Object.entries(pkg.dependencies ?? {})) {
  if (String(range).startsWith('workspace:') || String(range).startsWith('file:') || String(range).startsWith('link:')) continue
  let versao = String(range).replace(/^[^\d]*/, '')
  try { versao = JSON.parse(fs.readFileSync(path.join(RAIZ, 'node_modules', nome, 'package.json'), 'utf8')).version ?? versao } catch { /* usa o range */ }
  if (/^\d/.test(versao)) deps.push({ nome, versao })
}
const saida = path.join(RAIZ, 'lib', 'seguranca', 'deps-manifest.json')
fs.writeFileSync(saida, JSON.stringify({ gerado_em: new Date().toISOString(), deps }, null, 2))
console.log(`deps-manifest.json: ${deps.length} dependências de produção -> ${path.relative(RAIZ, saida)}`)
