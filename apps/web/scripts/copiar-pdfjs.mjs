// Copia o pdf.js (BUILD LEGACY) de node_modules para public/pdf — usado pelo leitor da Biblioteca
// (public/leitura/leitor-jus.html + components/aluno/leitor-biblioteca.tsx).
//
// Por que LEGACY: o build "moderno" do pdf.js 6 usa Promise.withResolvers, Map.getOrInsertComputed,
// Math.sumPrecise, Float16Array… e QUEBRA no Safari do iPhone/iPad e em tablets Android com Chrome antigo
// (o leitor abria sem conteúdo). O legacy traz os polyfills.
//
// Rode após atualizar o pdfjs-dist:  pnpm --filter web pdfjs:copiar
// E troque a versão em `?v=` (leitor-jus.html → PDFJS_V e leitor-biblioteca.tsx → PDFJS_WORKER) para o
// Service Worker não servir o arquivo antigo do cache.
import { copyFileSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const raiz = dirname(require.resolve('pdfjs-dist/package.json'))
const versao = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).version
const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'pdf')

for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  copyFileSync(join(raiz, 'legacy', 'build', f), join(destino, f))
  console.log(`✓ ${f} (pdfjs-dist ${versao}, legacy) → public/pdf/`)
}
console.log(`Lembre de usar ?v=${versao}-legacy nos imports do leitor.`)
