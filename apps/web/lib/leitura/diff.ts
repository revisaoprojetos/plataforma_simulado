import 'server-only'
import { parse, NodeType } from 'node-html-parser'
import type { AncoraBloco, BlocoDiff, DiffDoc, Token } from './diff-tipos'

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

// Blocos de conteúdo considerados no diff (folha = não contém outro desses).
const CONTENT_SEL = 'p,li,h1,h2,h3,h4,h5,h6,div,section,blockquote'

function extrairBlocos(html: string): Bloco[] {
  const root = parse(html || '')
  const out: Bloco[] = []
  // Pegamos os blocos FOLHA de conteúdo (que não contêm outro bloco) — assim um wrapper <div> de
  // topo (comum no import de Word) ou um capítulo que envolve artigos NÃO duplica o texto dos
  // filhos. Entram TANTO os dispositivos ancorados (art./§ — casados pela âncora data-disp/data-art,
  // estável) QUANTO o conteúdo sem âncora (preâmbulo, cabeçalho, caixas STJ/legenda — casado por
  // TEXTO), então QUALQUER mudança de texto conta no antes/depois. Chaves duplicadas (data-art
  // repetido, textos idênticos) recebem sufixo por ocorrência — senão o LCS casaria blocos errados.
  const vistos = new Map<string, number>()
  const unica = (k: string) => { const n = (vistos.get(k) ?? 0) + 1; vistos.set(k, n); return n === 1 ? k : `${k}#${n}` }

  const cands = Array.from(root.querySelectorAll(CONTENT_SEL)) as any[]
  const folhas = cands.filter((el) => !el.querySelector?.(CONTENT_SEL))
  const lista: any[] = folhas.length ? folhas : (root.childNodes as any[]).filter((n) => n.nodeType === NodeType.ELEMENT_NODE)
  for (const el of lista) {
    const texto = norm(el.text ?? '')
    if (!texto) continue
    const disp = el.getAttribute?.('data-disp')
    const art = el.getAttribute?.('data-art')
    const key = disp ? `d:${disp}` : art ? `a:${art}` : `t:${texto.toLowerCase()}`
    out.push({ key: unica(key), rotulo: rotuloDe(el, texto), texto, html: el.outerHTML ?? String(el) })
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

/** Âncora (data-disp/data-art) a partir da chave do bloco (`d:xxx`/`a:xxx`, sem o sufixo `#n` de dedup). */
function ancoraDaKey(key: string): AncoraBloco | undefined {
  const base = key.replace(/#\d+$/, '')
  if (base.startsWith('d:')) return { tipo: 'disp', id: base.slice(2) }
  if (base.startsWith('a:')) return { tipo: 'art', id: base.slice(2) }
  return undefined
}

/** Acha o elemento com data-disp/data-art = id, comparando o atributo (sem selector CSS,
 *  evita problemas de escape com pontos/aspas nos ids gerados pelo sanitizador). */
function acharPorAncora(root: any, anchor: AncoraBloco): any {
  const attr = anchor.tipo === 'disp' ? 'data-disp' : 'data-art'
  return (root.querySelectorAll(`[${attr}]`) as any[]).find((e) => e.getAttribute(attr) === anchor.id) ?? null
}

/**
 * Reverte UM dispositivo do rascunho ao conteúdo da versão anterior (antes). Devolve o novo HTML
 * do rascunho, ou null se não localizou o alvo:
 *  - 'mod': troca o bloco do rascunho pelo do antes.
 *  - 'add': remove o bloco do rascunho (não existia antes).
 *  - 'rem': re-insere o bloco do antes logo após o dispositivo anterior que ainda existe no rascunho.
 */
export function reverterBlocoHtml(htmlRascunho: string, htmlAntes: string, anchor: AncoraBloco, estado: 'mod' | 'add' | 'rem'): string | null {
  const rootR = parse(htmlRascunho || '')
  const rootA = parse(htmlAntes || '')

  if (estado === 'add') {
    const elR = acharPorAncora(rootR, anchor)
    if (!elR) return null
    elR.remove()
    return rootR.toString()
  }

  if (estado === 'mod') {
    const elR = acharPorAncora(rootR, anchor)
    const elA = acharPorAncora(rootA, anchor)
    if (!elR || !elA) return null
    elR.insertAdjacentHTML('afterend', elA.outerHTML)
    elR.remove()
    return rootR.toString()
  }

  // 'rem': o bloco existia no antes e sumiu no rascunho → re-inserir na posição aproximada.
  const elA = acharPorAncora(rootA, anchor)
  if (!elA) return null
  const ancorasA = Array.from(rootA.querySelectorAll('[data-disp], [data-art]')) as any[]
  const idx = ancorasA.findIndex((e) => e === elA)
  for (let i = idx - 1; i >= 0; i--) {
    const prev = ancorasA[i]
    const pdisp = prev.getAttribute('data-disp'); const part = prev.getAttribute('data-art')
    const prevAnchor: AncoraBloco | null = pdisp ? { tipo: 'disp', id: pdisp } : part ? { tipo: 'art', id: part } : null
    if (!prevAnchor) continue
    const prevR = acharPorAncora(rootR, prevAnchor)
    if (prevR) { prevR.insertAdjacentHTML('afterend', elA.outerHTML); return rootR.toString() }
  }
  const primeiraR = acharPorAncora(rootR, anchor) ? null : (rootR.querySelector('[data-disp], [data-art]') as any)
  if (primeiraR) { primeiraR.insertAdjacentHTML('beforebegin', elA.outerHTML); return rootR.toString() }
  rootR.insertAdjacentHTML('beforeend', elA.outerHTML)
  return rootR.toString()
}

/** Compara duas versões de HTML (já sanitizado) e devolve só o que MUDOU, em ordem. */
export function diffDocumentos(htmlAntes: string, htmlDepois: string): DiffDoc {
  const A = extrairBlocos(htmlAntes)
  const B = extrairBlocos(htmlDepois)
  const ops = lcsOps(A, B, (x, y) => x.key === y.key)
  const blocos: BlocoDiff[] = []
  const resumo = { mod: 0, add: 0, rem: 0, igual: 0 }
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (op.t === 'eq') {
      const a = op.a!, b = op.b!
      if (a.texto === b.texto) {
        // Texto igual: se o HTML também for igual, nada mudou. Se o HTML diferir (grifo/negrito/
        // caixa/formatação), conta como alteração e mostra os dois lados renderizados.
        if (norm(a.html) === norm(b.html)) { resumo.igual++; continue }
        blocos.push({ estado: 'mod', rotulo: b.rotulo ?? a.rotulo, antes: [], depois: [], anchor: ancoraDaKey(b.key), htmlAntes: a.html, htmlDepois: b.html })
        resumo.mod++
        continue
      }
      const { antes, depois } = palavrasDiff(a.texto, b.texto)
      blocos.push({ estado: 'mod', rotulo: b.rotulo ?? a.rotulo, antes, depois, anchor: ancoraDaKey(b.key) })
      resumo.mod++
    } else if (op.t === 'rem') {
      // Se o próximo op é um ADD parecido, é uma ALTERAÇÃO do mesmo bloco (ex.: título que ganhou
      // um ".") — mostra como "Alterado" (palavra a palavra) em vez de remover+adicionar idênticos.
      const prox = ops[i + 1]
      if (prox && prox.t === 'add' && similares(op.a!.texto, prox.b!.texto)) {
        const { antes, depois } = palavrasDiff(op.a!.texto, prox.b!.texto)
        blocos.push({ estado: 'mod', rotulo: prox.b!.rotulo ?? op.a!.rotulo, antes, depois, anchor: ancoraDaKey(prox.b!.key) })
        resumo.mod++; i++
        continue
      }
      blocos.push({ estado: 'rem', rotulo: op.a!.rotulo, html: op.a!.html, anchor: ancoraDaKey(op.a!.key) })
      resumo.rem++
    } else {
      blocos.push({ estado: 'add', rotulo: op.b!.rotulo, html: op.b!.html, anchor: ancoraDaKey(op.b!.key) })
      resumo.add++
    }
  }
  return { blocos, resumo }
}

/** Dois textos são "o mesmo bloco alterado"? (≥50% das palavras em comum via LCS). */
function similares(a: string, b: string): boolean {
  const pa = a.split(/\s+/).filter(Boolean), pb = b.split(/\s+/).filter(Boolean)
  if (!pa.length || !pb.length) return false
  if (pa.length * pb.length > 40_000) return a.slice(0, 40).toLowerCase() === b.slice(0, 40).toLowerCase()
  const ig = lcsOps(pa, pb, (x, y) => x.toLowerCase() === y.toLowerCase()).filter((o) => o.t === 'eq').length
  return (ig * 2) / (pa.length + pb.length) >= 0.5
}
