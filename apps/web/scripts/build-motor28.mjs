// Gera public/cronograma/adaptativo/motor28.js a partir de lib/cronograma/adaptativo/motor28.ts
// (FONTE ÚNICA do motor 2.8: o servidor importa o .ts; o iframe do aluno carrega este .js → window.Motor28).
// Rode após editar o motor:  pnpm --filter web cronograma:motor
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(raiz, 'lib/cronograma/adaptativo/motor28.ts'), 'utf8')
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, removeComments: false } }).outputText
const saida = `/* GERADO por scripts/build-motor28.mjs a partir de lib/cronograma/adaptativo/motor28.ts — NÃO editar à mão. */
(function () {
  var exports = {}; var module = { exports: exports };
${js}
  window.Motor28 = module.exports && Object.keys(module.exports).length ? module.exports : exports;
})();
`
writeFileSync(join(raiz, 'public/cronograma/adaptativo/motor28.js'), saida)
console.log('✓ public/cronograma/adaptativo/motor28.js (' + saida.length + ' bytes)')

// Cache-buster por CONTEÚDO: o index.html referencia motor28.js?v=<hash>. Sem isso, o navegador reaproveita um motor antigo
// com o index.html novo (erro "PR.regras218 is undefined" no cronograma).
const hash = createHash('sha1').update(saida).digest('hex').slice(0, 8)
const htmlPath = join(raiz, 'public/cronograma/adaptativo/index.html')
const html = readFileSync(htmlPath, 'utf8')
const novo = html.replace(/motor28\.js\?v=[\w.-]+/, 'motor28.js?v=' + hash)
if (novo !== html) writeFileSync(htmlPath, novo)
console.log('✓ index.html → motor28.js?v=' + hash)
