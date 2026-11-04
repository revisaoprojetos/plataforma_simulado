// Versão HTML do codemod da paleta nova (iframes em public/): embrulha hex/rgba em <style> e style="" com
// var(--pn-<hex>, #HEX) e injeta /paleta-iframe.js no <head>. NÃO toca <script> (JS pode montar cores/canvas).
// Idempotente (lookbehind). Atualiza o catálogo lib/brand/paleta-nova-hexes.json.
//   Uso (de apps/web):  node scripts/tokenizar-html.mjs <arquivo.html|pasta> [...]   |   --desfazer <...>
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const DESFAZER = args.includes('--desfazer')
const alvos = args.filter((a) => !a.startsWith('--'))
const HEX = /(?<!--pn-[0-9a-fA-F]{6},)#([0-9a-fA-F]{6})(?![0-9a-fA-F])/g
const catalogo = new Set()
const colorido = (h) => { const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return Math.max(r, g, b) - Math.min(r, g, b) >= 6 }
const wrap = (h) => { catalogo.add(h.toLowerCase()); return `var(--pn-${h.toLowerCase()},#${h})` }
const css = (s) => s
  .replace(/rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0?\.\d+|1|0)\s*\)/g, (m, r, g, b, a) => {
    const hx = [r, g, b].map((x) => Math.min(255, +x).toString(16).padStart(2, '0')).join('').toUpperCase()
    if (!colorido(hx)) return m
    return `color-mix(in srgb,${wrap(hx)} ${Math.round(parseFloat(a) * 1000) / 10}%,transparent)`
  })
  .replace(HEX, (m, h) => (colorido(h) ? wrap(h) : m))

function arquivos(p, out = []) {
  const st = statSync(p)
  if (st.isDirectory()) for (const n of readdirSync(p)) arquivos(join(p, n), out)
  else if (/\.(html|css)$/.test(p)) out.push(p)
  return out
}

function desfazer(t) {
  return t
    .replace(/var\(--pn-[0-9a-fA-F]{6},(#[0-9a-fA-F]{6})\)/g, '$1')
    .replace(/color-mix\(in srgb,#([0-9a-fA-F]{6}) ([\d.]+)%,transparent\)/g, (m, h, pct) => {
      const a = Math.round(parseFloat(pct) * 10) / 1000
      return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${String(a).replace(/^0\./, '.')})`
    })
    .replace(/\n?<script src="\/paleta-iframe\.js"><\/script>/g, '')
}

let n = 0
for (const alvo of alvos) for (const f of arquivos(alvo)) {
  const o = readFileSync(f, 'utf8')
  const crlf = o.includes('\r\n')
  let t = crlf ? o.replace(/\r\n/g, '\n') : o
  const base = t
  if (DESFAZER) t = desfazer(t)
  else if (/\.css$/.test(f)) t = css(t) // .css puro: o arquivo inteiro é contexto CSS
  else {
    t = t.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, b, c) => a + css(b) + c)
    t = t.replace(/(\sstyle=")([^"]*)(")/gi, (m, a, b, c) => a + css(b) + c)
    t = t.replace(/(\s(?:fill|stroke|stop-color)=")(#[0-9a-fA-F]{6})(")/g, (m, a, b, c) => a + css(b) + c)
    if (!/paleta-iframe\.js/.test(t)) t = t.replace(/<head>/i, (m) => `${m}\n<script src="/paleta-iframe.js"></script>`)
  }
  if (t === base) continue
  writeFileSync(f, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8'); n++
}
if (!DESFAZER) {
  const cat = join(process.cwd(), 'lib/brand/paleta-nova-hexes.json')
  const atual = JSON.parse(readFileSync(cat, 'utf8'))
  writeFileSync(cat, JSON.stringify([...new Set([...atual, ...catalogo])].sort()))
  console.log('catálogo:', new Set([...atual, ...catalogo]).size)
}
console.log(DESFAZER ? '[desfeito]' : '[gravado]', 'arquivos:', n)
