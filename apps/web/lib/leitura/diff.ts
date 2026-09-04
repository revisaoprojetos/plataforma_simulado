import 'server-only'
import { parse, NodeType } from 'node-html-parser'
import type { BlocoDiff, DiffDoc, Token } from './diff-tipos'

// Diff de versões da Leitura (antes/depois).
//
// Estratégia em DOIS níveis, aproveitando a estrutura que o sanitizador já cria:
//  1. BLOCOS: cada bloco (art./§/inciso) tem uma âncora estável (data-disp, senão data-art).
//     Casamos os blocos das duas versões por essa chave (LCS). Blocos só na versão nova =
//     ADICIONADO; só na antiga = REMOVIDO; presentes nos dois com texto diferente = ALTERADO.
//  2. PALAVRAS: dentro de um bloco ALTERADO, um diff de palavras (LCS) marca o que entrou/saiu.
//
// Blocos sem âncora casam por TEXTO (chave = o próprio texto), então mudanças neles aparecem
// como remover+adicionar — aceitável para cabeçalhos/preâmbulo.

type Bloco = { key: string; rotulo: string | null; texto: string; html: string }

const norm = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Rótulo curto do dispositivo, derivado do começo do texto (Art. 5º, § 2º, CAPÍTULO II…). */
function rotuloDe(el: any, texto: string): string | null {
  const m = texto.match(
    /^\s*(cap[íi]tulo\s+[IVXLCDM0-9]+|t[íi]tulo\s+[IVXLCDM0-9]+|se[çc][ãa]o\s+[IVXLCDM0-9]+|livro\s+[IVXLCDM0-9]+|art(?:igo)?\.?\s*\d+[ºo.\-]?|§\s*\d+[ºo]?|par[áa]grafo\s+[úu]nico|[IVXLCDM]+\s*[-–]|[a-z]\))/i,
  )
  if (m) return norm(m[1])
  const tipo = el.getAttribute?.('data-disp-tipo')
  return tipo || null
}

function extrairBlocos(html: string): Bloco[] {
  const root = parse(html || '')
  const out: Bloco[] = []
  // Blocos com âncora estável (data-disp/data-art) em QUALQUER profundidade — o sanitizador
  // ancora via querySelectorAll, então um wrapper <div>/<section> de topo (comum no import de
  // Word) NÃO pode colapsar o documento inteiro num bloco só. Pegamos só os FOLHA (âncora sem
  // âncora descendente), para um capítulo que envolva artigos não duplicar o texto deles.
  // Chaves duplicadas (ex.: data-art repetido vindo do input, ou textos idênticos) recebem um
  // sufixo por ocorrência — senão o LCS casaria blocos errados.
  const vistos = new Map<string, number>()
  const unica = (k: string) => { const n = (vistos.get(k) ?? 0) + 1; vistos.set(k, n); return n === 1 ? k : `${k}#${n}` }

  const ancorados = Array.from(root.querySelectorAll('[data-disp], [data-art]')) as any[]
  const folhas = ancorados.filter((el) => !el.querySelector?.('[data-disp], [data-art]'))
  if (folhas.length) {
    for (const el of folhas) {
      const texto = norm(el.text ?? '')
      if (!texto) continue
      const disp = el.getAttribute?.('data-disp')
      const art = el.getAttribute?.('data-art')
      out.push({ key: unica(disp ? `d:${disp}` : `a:${art}`), rotulo: rotuloDe(el, texto), texto, html: el.outerHTML ?? String(el) })
    }
    return out
  }
  // Sem âncoras (preâmbulo/cabeçalho): cai nos filhos de topo, casados por texto.
  for (const node of root.childNodes) {
    if (node.nodeType !== NodeType.ELEMENT_NODE) continue
    const el: any = node
    const texto = norm(el.text ?? '')
    if (!texto) continue
    out.push({ key: unica(`t:${texto.toLowerCase()}`), rotulo: rotuloDe(el, texto), texto, html: el.outerHTML ?? String(el) })
  }
  return out
}

/** Diff LCS genérico → lista de operações em ordem (eq/rem/add). */
function lcsOps<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): Array<{ t: 'eq' | 'rem' | 'add'; a?: T; b?: T }> {
  const n = a.length, m = b.length
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const ops: Array<{ t: 'eq' | 'rem' | 'add'; a?: T; b?: T }> = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (eq(a[i], b[j])) { ops.push({ t: 'eq', a: a[i], b: b[j] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: 'rem', a: a[i] }); i++ }
    else { ops.push({ t: 'add', b: b[j] }); j++ }
  }
  while (i < n) ops.push({ t: 'rem', a: a[i++] })
  while (j < m) ops.push({ t: 'add', b: b[j++] })
  return ops
}

/** Diff de palavras entre dois textos → tokens do "antes" e do "depois". */
function palavrasDiff(a: string, b: string): { antes: Token[]; depois: Token[] } {
  const pa = a.split(/(\s+)/).filter((x) => x !== '')
  const pb = b.split(/(\s+)/).filter((x) => x !== '')
  // Teto de segurança: bloco gigante vira "trocado por inteiro" (evita LCS O(n·m) explosivo).
  if (pa.length * pb.length > 4_000_000) {
    return { antes: pa.map((s) => ({ t: 'rem' as const, s })), depois: pb.map((s) => ({ t: 'add' as const, s })) }
  }
  const ops = lcsOps(pa, pb, (x, y) => x === y)
  const antes: Token[] = [], depois: Token[] = []
  for (const op of ops) {
    if (op.t === 'eq') { antes.push({ t: 'ig', s: op.a! }); depois.push({ t: 'ig', s: op.b! }) }
    else if (op.t === 'rem') antes.push({ t: 'rem', s: op.a! })
    else depois.push({ t: 'add', s: op.b! })
  }
  return { antes, depois }
}

/** Compara duas versões de HTML (já sanitizado) e devolve só o que MUDOU, em ordem. */
export function diffDocumentos(htmlAntes: string, htmlDepois: string): DiffDoc {
  const A = extrairBlocos(htmlAntes)
  const B = extrairBlocos(htmlDepois)
  const ops = lcsOps(A, B, (x, y) => x.key === y.key)
  const blocos: BlocoDiff[] = []
  const resumo = { mod: 0, add: 0, rem: 0, igual: 0 }
  for (const op of ops) {
    if (op.t === 'eq') {
      const a = op.a!, b = op.b!
      if (a.texto === b.texto) { resumo.igual++; continue }
      const { antes, depois } = palavrasDiff(a.texto, b.texto)
      blocos.push({ estado: 'mod', rotulo: b.rotulo ?? a.rotulo, antes, depois })
      resumo.mod++
    } else if (op.t === 'rem') {
      blocos.push({ estado: 'rem', rotulo: op.a!.rotulo, html: op.a!.html })
      resumo.rem++
    } else {
      blocos.push({ estado: 'add', rotulo: op.b!.rotulo, html: op.b!.html })
      resumo.add++
    }
  }
  return { blocos, resumo }
}
