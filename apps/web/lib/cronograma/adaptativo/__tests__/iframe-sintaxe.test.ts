import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import vm from 'vm'

// Um SyntaxError em QUALQUER <script> inline do iframe derruba o cronograma inteiro (tela em branco, "Salvo neste navegador").
// Já aconteceu (v4.3.1: const duplicado; v4.24.0: linha solta fora da função). Este teste pega antes do deploy.
const ARQUIVOS = ['public/cronograma/adaptativo/index.html', 'public/leitura/leitor-jus.html']

describe('iframes: scripts inline compilam', () => {
  for (const rel of ARQUIVOS) {
    it(rel, () => {
      const html = readFileSync(join(process.cwd(), rel), 'utf8')
      const re = /<script(?![^>]*\b(?:src|type)=)[^>]*>([\s\S]*?)<\/script>/g
      let m: RegExpExecArray | null, n = 0
      while ((m = re.exec(html))) {
        n++
        const linha = html.slice(0, m.index).split('\n').length
        expect(() => new vm.Script(m![1], { filename: `${rel}#script${n}@L${linha}` }), `script ${n} (linha ${linha})`).not.toThrow()
      }
      expect(n).toBeGreaterThan(0)
    })
  }
})
