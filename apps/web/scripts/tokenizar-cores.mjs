// CODEMOD da paleta nova: embrulha cada hex legado em `var(--pn-<hex6>, #HEX)` (fallback = o hex original ⇒ interruptor
// desligado fica IDÊNTICO ao atual). Só toca contextos seguros (onde o valor vai direto p/ CSS):
//   1) Tailwind arbitrário em texto:  bg-[#5B3FD0]  →  bg-[color:var(--pn-5b3fd0,#5B3FD0)]   (gradientes: troca o hex por dentro)
//   2) `style={{ ... }}` (JSX):  strings com hex/rgba  →  var()/color-mix()   (pula concatenação `'#hex' + '22'`)
//   3) Atributos SVG de cor (fill/stroke/stopColor/…) com string literal
// NÃO toca: constantes soltas, lib/**, rotas /api, canvas/docx/pdf/impressão, hex de 3 dígitos, cinzas puros.
// Catálogo gerado: lib/brand/paleta-nova-hexes.json (hexes que de fato foram embrulhados) — o css da paleta recolore cada um.
//   Uso (de apps/web):  node scripts/tokenizar-cores.mjs [--dry] [--only=<substring>]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const RAIZ = process.cwd()
const DRY = process.argv.includes('--dry')
const TODOS = process.argv.includes('--all') // modo amplo: também constantes de cor (com heurísticas de segurança)
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)
const SKIPS = (process.argv.find((a) => a.startsWith('--skip=')) || '').slice(7).split(',').filter(Boolean) // arquivos em edição por outra sessão
const PASTAS = ['app', 'components']
const EXCLUI_PATH = /(^|[\\/])(api|imprimir)[\\/]|pdf|print|docx|\.test\.|\.d\.ts$/i
const EXCLUI_CONTEUDO = /getContext\(|html-to-docx|from 'docx'|ImageResponse|puppeteer|satori|html2canvas|\bnew Image\(/
const COLOR_ATTRS = new Set(['fill', 'stroke', 'stopColor', 'floodColor', 'lightingColor', 'color'])
const HEX = /(?<!--pn-[0-9a-fA-F]{6},)#([0-9a-fA-F]{6})(?![0-9a-fA-F])/g // lookbehind: não re-embrulha o fallback de um var(--pn-…) já feito

const catalogo = new Set()
const stats = { arquivos: 0, tailwind: 0, style: 0, attr: 0, rgba: 0 }

function arquivos(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    const st = statSync(p)
    if (st.isDirectory()) { if (n === 'node_modules' || n.startsWith('.')) continue; arquivos(p, out) }
    else if (/\.tsx$/.test(n)) out.push(p)
  }
  return out
}

// croma mínimo p/ valer a pena (cinza/branco/preto puros ficam como estão)
function colorido(h) {
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return Math.max(r, g, b) - Math.min(r, g, b) >= 6
}
const wrapHex = (h) => { const k = h.toLowerCase(); catalogo.add(k); return `var(--pn-${k},#${h})` }

/** troca todos os hex de uma string CSS; devolve [novo, n] */
function trocarHex(s) {
  let n = 0
  const novo = s.replace(HEX, (m, h) => { if (!colorido(h)) return m; n++; return wrapHex(h) })
  return [novo, n]
}
/** rgba(r,g,b,a) → color-mix(in srgb,var(--pn-hex,#HEX) A%,transparent) */
function trocarRgba(s) {
  let n = 0
  const novo = s.replace(/rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0?\.\d+|1|0)\s*\)/g, (m, r, g, b, a) => {
    const hx = [r, g, b].map((x) => Math.min(255, +x).toString(16).padStart(2, '0')).join('').toUpperCase()
    if (!colorido(hx)) return m
    n++
    const pct = Math.round(parseFloat(a) * 1000) / 10
    return `color-mix(in srgb,${wrapHex(hx)} ${pct}%,transparent)`
  })
  return [novo, n]
}

/** 1) Tailwind arbitrário em texto bruto (className, cva, constantes de classe). */
function tailwindTexto(src) {
  let n = 0
  // valor simples: prefix-[#HEX](/op)?  → prefix-[color:var(...)]
  src = src.replace(/\b((?:[a-z-]+:)*(?:bg|text|border|border-[trblxy]|from|via|to|ring|outline|fill|stroke|decoration|accent|caret|divide|shadow)-)\[#([0-9a-fA-F]{6})\]/g, (m, pre, h) => {
    if (!colorido(h)) return m
    n++
    return `${pre}[color:var(--pn-${h.toLowerCase()},#${h})]`.replace(/\(--pn-/, '(--pn-') // catalogo abaixo
  })
  // registra no catálogo os que acabaram de entrar (regex acima não passa por wrapHex)
  for (const mm of src.matchAll(/\[color:var\(--pn-([0-9a-f]{6}),#/g)) catalogo.add(mm[1])
  // grupos compostos sem espaço (gradientes etc.): [..#HEX..] → troca o hex por dentro
  src = src.replace(/\b((?:[a-z-]+:)*[a-z-]+-)\[([^\]\s]*#[0-9a-fA-F]{6}[^\]\s]*)\]/g, (m, pre, inner) => {
    if (/^color:var\(--pn-[0-9a-f]{6},#[0-9a-fA-F]{6}\)$/.test(inner)) return m
    if (inner.includes('var(--pn-')) return m
    if (!/(gradient|rgba?\(|shadow|_)/.test(inner) && !/^#/.test(inner)) return m
    const [novo, k] = trocarHex(inner)
    if (!k) return m
    n += k
    return `${pre}[${novo}]`
  })
  return [src, n]
}

/** 2) e 3) AST: style={{}} e atributos SVG. */
function viaAst(file, src) {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = [] // {start,end,text}
  const dentroDeBinario = (node) => ts.isBinaryExpression(node.parent) || ts.isTemplateSpan?.(node.parent)

  function transformarString(node) {
    // node: StringLiteral | NoSubstitutionTemplateLiteral
    if (dentroDeBinario(node)) return
    const bruto = node.getText(sf)
    const aspas = bruto[0]
    const conteudo = bruto.slice(1, -1)
    let [novo, a] = trocarHex(conteudo)
    let b = 0
    ;[novo, b] = trocarRgba(novo)
    if (!(a + b)) return
    if (aspas === '"' && /"/.test(novo)) return // evitaria quebrar aspas
    edits.push({ start: node.getStart(sf), end: node.getEnd(), text: `${aspas}${novo}${aspas}` })
    stats.style += a; stats.rgba += b
  }

  function percorrerEstilo(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { transformarString(node); return }
    if (ts.isTemplateExpression(node)) { // só os pedaços literais (head/middle/tail), nunca as expressões
      const partes = [node.head, ...node.templateSpans.map((s) => s.literal)]
      for (const p of partes) {
        const [novo, a] = trocarHex(p.text)
        if (!a) continue
        const bruto = p.getText(sf)
        const ini = p.getStart(sf), fim = p.getEnd()
        const prefixo = bruto.startsWith('`') ? '`' : '}'
        const sufixo = bruto.endsWith('`') ? '`' : '${'
        edits.push({ start: ini, end: fim, text: `${prefixo}${novo}${sufixo}` })
        stats.style += a
      }
      node.templateSpans.forEach((s) => percorrerEstilo(s.expression))
      return
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return // concatenação: não mexe
    if (ts.isCallExpression(node)) return // funções de cor (mix(), alpha()) recebem o valor cru
    ts.forEachChild(node, percorrerEstilo)
  }

  function visitar(node) {
    if (ts.isJsxAttribute(node)) {
      const nome = node.name.getText(sf)
      const ini = node.initializer
      if (nome === 'style' && ini && ts.isJsxExpression(ini) && ini.expression && ts.isObjectLiteralExpression(ini.expression)) {
        for (const prop of ini.expression.properties) {
          if (!ts.isPropertyAssignment(prop)) continue
          const chave = prop.name.getText(sf)
          if (/^['"]?--/.test(chave)) { /* variáveis CSS também valem */ }
          percorrerEstilo(prop.initializer)
        }
      } else if (COLOR_ATTRS.has(nome) && ini && ts.isStringLiteral(ini)) {
        const [novo, a] = trocarHex(ini.text)
        if (a && !/"/.test(novo)) { edits.push({ start: ini.getStart(sf), end: ini.getEnd(), text: `"${novo}"` }); stats.attr += a }
      }
    }
    ts.forEachChild(node, visitar)
  }
  visitar(sf)
  if (!edits.length) return src
  edits.sort((x, y) => y.start - x.start)
  let out = src
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}


// ── modo --all: strings de cor em qualquer lugar do .tsx (constantes C = {…}, arrays, ternários), com guardas ──
const SKIP_ARQUIVO = /\$\{[^}]+\}[0-9a-fA-F]{2}[`'"]|hexToRgb|hexToRGB|withAlpha|\balpha\(|lighten\(|darken\(|parseInt\([^)]*,\s*16\)|getContrast|luminance|getContext\(|type=["']color["']|ColorPicker|SeletorCor|CampoCor|presets_cor|paleta-nova|localStorage\.setItem\([^)]*#/
const SKIP_CHAMADA = /useState|useRef|useReducer|createContext|alpha|mix|hex|rgb|lighten|darken|contrast|parse|slice|replace|test|includes|startsWith|endsWith|indexOf|toLowerCase|toUpperCase|Number|setItem|getItem|postMessage|stringify|salvar|update|insert|upsert|push|set[A-Z]/i
const SKIP_CHAVE = /^(hex|hexa|value|valor|id|key|cor_?hex|codigo|slug|href|src|url|nome|name|label|type|tipo)$/i
function viaAstTodos(file, src) {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = []
  const ehTipo = (n) => { for (let p = n.parent; p; p = p.parent) { if (ts.isTypeNode(p) || ts.isImportDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) return true } return false }
  function pulaLiteral(n) {
    const p = n.parent
    if (!p || ehTipo(n)) return true
    if (ts.isParameter(p) || ts.isBindingElement(p) || ts.isShorthandPropertyAssignment(p)) return true // valor padrão de parâmetro/prop
    if (ts.isArrayLiteralExpression(p) && p.elements.length >= 4 && p.elements.every((e) => ts.isStringLiteral(e) && /^#[0-9a-fA-F]{6}$/.test(e.text))) return true // paleta de opções (seletores)
    if (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.parent) && ts.isArrayLiteralExpression(p.parent.parent) && p.parent.parent.elements.length >= 4 && /^(cor|color|hex|fg|bg|valor|value)$/i.test(p.name.getText(sf))) return true // lista de opções de cor
    if (ts.isBinaryExpression(p) || ts.isCaseClause(p) || ts.isElementAccessExpression(p) || ts.isTemplateSpan(p)) return true
    if (ts.isPropertyAssignment(p)) { if (p.name === n) return true; if (SKIP_CHAVE.test(p.name.getText(sf).replace(/['"]/g, ''))) return true }
    if (ts.isJsxAttribute(p)) { const nome = p.name.getText(sf); if (!COLOR_ATTRS.has(nome)) return true }
    if (ts.isCallExpression(p) && p.arguments.includes(n) && SKIP_CHAMADA.test(p.expression.getText(sf))) return true
    return false
  }
  function visitar(n) {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !pulaLiteral(n)) {
      const bruto = n.getText(sf), aspas = bruto[0], conteudo = bruto.slice(1, -1)
      let [novo, a] = trocarHex(conteudo); let b = 0
      ;[novo, b] = trocarRgba(novo)
      if (a + b && !(aspas === '"' && /"/.test(novo)) && !(aspas === "'" && /'/.test(novo.replace(/\'/g, '')))) {
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `${aspas}${novo}${aspas}` }); stats.style += a; stats.rgba += b
      }
    } else if (ts.isTemplateExpression(n) && !ehTipo(n)) {
      for (const p of [n.head, ...n.templateSpans.map((x) => x.literal)]) {
        const [novo, a] = trocarHex(p.text)
        if (!a) continue
        const bruto = p.getText(sf)
        edits.push({ start: p.getStart(sf), end: p.getEnd(), text: `${bruto.startsWith('`') ? '`' : '}'}${novo}${bruto.endsWith('`') ? '`' : '${'}` }); stats.style += a
      }
    }
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  if (!edits.length) return src
  edits.sort((x, y) => y.start - x.start)
  let out = src
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}

// ── --desfazer: remove os embrulhos (var(--pn-hex,#HEX) → #HEX; color-mix(...) → rgba(...)) em app/ e components/ ──
if (process.argv.includes('--desfazer')) {
  let n = 0
  for (const pasta of PASTAS) for (const f of arquivos(join(RAIZ, pasta))) {
    const o = readFileSync(f, 'utf8')
    if (!o.includes('--pn-')) continue
    let t = o
    t = t.replace(/\[color:var\(--pn-[0-9a-fA-F]{6},(#[0-9a-fA-F]{6})\)\]/g, '[$1]')
    t = t.replace(/var\(--pn-[0-9a-fA-F]{6},(#[0-9a-fA-F]{6})\)/g, '$1')
    t = t.replace(/color-mix\(in srgb,#([0-9a-fA-F]{6}) ([\d.]+)%,transparent\)/g, (m, h, pct) => {
      const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
      const a = Math.round(parseFloat(pct) * 10) / 1000
      return `rgba(${r},${g},${b},${String(a).replace(/^0\./, '.')})`
    })
    if (t !== o) { writeFileSync(f, t, 'utf8'); n++ }
  }
  writeFileSync(join(RAIZ, 'lib/brand/paleta-nova-hexes.json'), '[]')
  console.log('[desfeito] arquivos:', n)
  process.exit(0)
}

let alterados = 0
for (const pasta of PASTAS) {
  for (const f of arquivos(join(RAIZ, pasta))) {
    const rel = relative(RAIZ, f).replace(/\\/g, '/')
    if (EXCLUI_PATH.test(rel) || (ONLY && !rel.includes(ONLY)) || SKIPS.some((k) => rel.includes(k))) continue
    const original = readFileSync(f, 'utf8')
    if (EXCLUI_CONTEUDO.test(original) || !/#[0-9a-fA-F]{6}|rgba\(/.test(original)) continue
    const FORM_OU_PICKER = /picker|editor|editar|designer|personaliz|carimbo|builder|seletor|[-/]form\.|-form[-.]|formulario/i
    const modoAmplo = TODOS && !(SKIP_ARQUIVO.test(original) || /app\/admin\/configuracoes\//.test(rel) || FORM_OU_PICKER.test(rel))
    const crlf = original.includes('\r\n')
    let src = crlf ? original.replace(/\r\n/g, '\n') : original
    let n
    ;[src, n] = tailwindTexto(src); stats.tailwind += n
    src = modoAmplo ? viaAstTodos(f, viaAst(f, src)) : viaAst(f, src)
    if (src === (crlf ? original.replace(/\r\n/g, '\n') : original)) continue
    alterados++; stats.arquivos++
    if (!DRY) writeFileSync(f, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8')
  }
}
if (!DRY) {
  const atual = (() => { try { return JSON.parse(readFileSync(join(RAIZ, 'lib/brand/paleta-nova-hexes.json'), 'utf8')) } catch { return [] } })()
  const todos = [...new Set([...atual, ...catalogo])].sort()
  writeFileSync(join(RAIZ, 'lib/brand/paleta-nova-hexes.json'), JSON.stringify(todos))
  console.log(`catálogo: ${todos.length} hexes`)
}
console.log(DRY ? '[dry]' : '[gravado]', JSON.stringify(stats), `arquivos alterados: ${alterados}`)
