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
const compilar = (nome) => ts.transpileModule(readFileSync(join(raiz, 'lib/cronograma/adaptativo/' + nome + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, removeComments: false } }).outputText
// motor30 (atual) importa helpers do motor28 (legado 2.8.1): dois módulos CommonJS num mini-require dentro de uma IIFE.
// window.Motor28 = motor atual (mesma API usada pelo iframe); window.Motor28.legado = motor 2.8.1 (planos antigos, não regenerados).
const saida = `/* GERADO por scripts/build-motor28.mjs a partir de lib/cronograma/adaptativo/motor30.ts (+ motor28.ts legado) — NÃO editar à mão. */
(function () {
  var defs = {}, cache = {};
  function req(n) { n = String(n).split('/').pop(); if (cache[n]) return cache[n].exports; var m = { exports: {} }; cache[n] = m; defs[n](m, m.exports, req); return m.exports; }
  defs['motor28'] = function (module, exports, require) {
${compilar('motor28')}
  };
  defs['motor30'] = function (module, exports, require) {
${compilar('motor30')}
  };
  var atual = req('motor30'); atual.legado = req('motor28');
  window.Motor28 = atual;
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
