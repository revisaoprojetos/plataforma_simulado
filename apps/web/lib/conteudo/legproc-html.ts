// .docx de LegProc → HTML RICO que PRESERVA a formatação do professor (o mammoth puro joga fora realce,
// sombreamento e cor): é o que o leitor em modo TEXTO precisa p/ mostrar as marcações (Núcleo/Complemento/
// Prazos/exceção) e as caixas (STF/STJ/atenção) iguais ao documento.
//
// Estratégia (não muda a ESTRUTURA de blocos do mammoth → os uids dos trechos continuam casando 1:1):
//   1) pré-processa o XML do docx: marcações de RUN viram "carregadores" de realce que o mammoth entende
//      (highlight yellow/green/magenta/red) e parágrafos ganham um estilo `Lp…` que codifica sombreamento
//      (do parágrafo OU da célula) + alinhamento;
//   2) mammoth com styleMap mapeia esses carregadores p/ classes;
//   3) pós-processa as classes em `<span class="ed n|c|p|x">` (o MESMO vocabulário do leitor-jus: legenda
//      Núcleo/Complemento/Prazos/exceção) e em `style` inline (fundo/alinhamento).
import 'server-only'
import mammoth from 'mammoth'
import PizZip from 'pizzip'

// Núcleo = realce amarelo · Complemento = sombreamento verde · Prazos = sombreamento roxo · exceção = vermelho.
const VERMELHOS = new Set(['ee0000', 'ff0000', 'c00000'])
const CARREGADOR: Record<string, string> = { n: 'yellow', c: 'green', p: 'magenta', x: 'red' }
// sombreamentos que NÃO viram fundo (branco/automático)
const SEM_FUNDO = new Set(['auto', 'ffffff', ''])

const attr = (s: string, re: RegExp) => (re.exec(s) || [])[1] || ''

/** Matiz (0-360), saturação e brilho (0-1) de um hex "rrggbb"; null se inválido. */
function hsv(hex: string): { h: number; s: number; v: number } | null {
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null
  const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx }
}

/** Sombreamento de RUN → categoria pela COR (amarelo, verde, roxo), seja qual for o tom usado no Word. */
function classePorSombra(fill: string): '' | 'n' | 'c' | 'p' {
  const c = hsv(fill)
  if (!c || c.s < 0.22 || c.v < 0.55) return ''
  if (c.h >= 40 && c.h <= 70) return 'n'
  if (c.h > 70 && c.h <= 170) return 'c'
  if (c.h >= 250 && c.h <= 320) return 'p'
  return ''
}

function classeDoRun(rpr: string): '' | 'n' | 'c' | 'p' | 'x' {
  const hl = attr(rpr, /<w:highlight w:val="([^"]+)"/)
  if (hl === 'yellow') return 'n'
  const porSombra = classePorSombra(attr(rpr, /<w:shd [^>]*w:fill="([^"]+)"/).toLowerCase())
  if (porSombra) return porSombra
  const cor = attr(rpr, /<w:color w:val="([^"]+)"/).toLowerCase()
  if (VERMELHOS.has(cor)) return 'x'
  return ''
}

/** Troca, DENTRO dos runs do parágrafo, o realce/sombreamento/cor por um carregador de highlight. */
function marcarRuns(par: string): string {
  return par.replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*<\/w:r>/g, (run) => {
    const m = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)
    if (!m) return run
    const k = classeDoRun(m[1])
    if (!k) return run
    const novo = m[1].replace(/<w:highlight [^>]*\/>/g, '') + `<w:highlight w:val="${CARREGADOR[k]}"/>`
    return run.replace(m[0], `<w:rPr>${novo}</w:rPr>`)
  })
}

const nomeEstilo = (fill: string, jc: string) => `Lp${fill || 'none'}${jc ? jc.charAt(0).toUpperCase() + jc.slice(1) : ''}`

/** Pré-processa o document.xml. Devolve o XML novo + os estilos (fill/jc) a declarar. */
// ── Numeração automática do Word (I, II, III · a), b) · 1. 2.) ────────────────────────────────────────────────
// O mammoth converte listas em <ol><li> e perde o FORMATO (romano/letra) e a CONTINUAÇÃO entre listas ("1. 1. 1. 2. 3."
// no lugar de "III - IV - V -"). Simulamos os contadores do Word a partir do numbering.xml, geramos o rótulo de cada item
// e, depois do mammoth, injetamos data-n="III -" nos <li> NA MESMA ORDEM (CSS mostra o rótulo via ::before → o TEXTO do
// bloco não muda e os grifos já ancorados seguem valendo). Se a contagem de <li> não bater, não injeta (fica o do mammoth).
type NivelNum = { start: number; fmt: string; text: string }
type ModeloNum = {
  abstratos: Map<string, Map<number, NivelNum>>
  nums: Map<string, { abs: string; starts: Map<number, number> }>
}

function lerNumbering(xml: string): ModeloNum {
  const abstratos = new Map<string, Map<number, NivelNum>>()
  for (const a of xml.matchAll(/<w:abstractNum [^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    const niveis = new Map<number, NivelNum>()
    for (const l of a[2].matchAll(/<w:lvl [^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) {
      niveis.set(+l[1], {
        start: +(attr(l[2], /<w:start w:val="(-?\d+)"/) || '1'),
        fmt: attr(l[2], /<w:numFmt w:val="([^"]+)"/) || 'decimal',
        text: attr(l[2], /<w:lvlText w:val="([^"]*)"/),
      })
    }
    abstratos.set(a[1], niveis)
  }
  const nums = new Map<string, { abs: string; starts: Map<number, number> }>()
  for (const n of xml.matchAll(/<w:num [^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
    const starts = new Map<number, number>()
    for (const o of n[2].matchAll(/<w:lvlOverride [^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvlOverride>/g)) {
      const so = attr(o[2], /<w:startOverride w:val="(-?\d+)"/)
      if (so) starts.set(+o[1], +so)
    }
    nums.set(n[1], { abs: attr(n[2], /<w:abstractNumId w:val="(\d+)"/), starts })
  }
  return { abstratos, nums }
}

const ROMANOS: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
function formatarNum(n: number, fmt: string): string {
  if (fmt === 'lowerRoman' || fmt === 'upperRoman') {
    let r = '', v = Math.max(1, n)
    for (const [val, s] of ROMANOS) while (v >= val) { r += s; v -= val }
    return fmt === 'upperRoman' ? r.toUpperCase() : r
  }
  if (fmt === 'lowerLetter' || fmt === 'upperLetter') {
    let r = '', v = Math.max(1, n)
    while (v > 0) { r = String.fromCharCode(97 + ((v - 1) % 26)) + r; v = Math.floor((v - 1) / 26) }
    return fmt === 'upperLetter' ? r.toUpperCase() : r
  }
  if (fmt === 'decimalZero') return n < 10 ? `0${n}` : String(n)
  return String(n)
}

/** Gera o rótulo ("III -", "a)", "2.") do próximo item numerado, avançando os contadores do Word. '' = marcador (bullet). */
function proximoRotulo(m: ModeloNum, cont: Map<string, Map<number, number>>, vistos: Set<string>, numId: string, ilvl: number): string | null {
  const num = m.nums.get(numId)
  const niveis = num && m.abstratos.get(num.abs)
  const nivel = niveis?.get(ilvl)
  if (!num || !niveis || !nivel) return null
  let c = cont.get(num.abs)
  if (!c) { c = new Map(); cont.set(num.abs, c) }
  if (!vistos.has(numId)) { // 1º uso desta instância: startOverride reinicia o nível
    vistos.add(numId)
    for (const [lv, st] of num.starts) c.set(lv, st - 1)
  }
  const atual = c.has(ilvl) ? (c.get(ilvl) as number) + 1 : nivel.start
  c.set(ilvl, atual)
  for (const lv of [...c.keys()]) if (lv > ilvl) c.delete(lv) // níveis mais fundos recomeçam
  if (nivel.fmt === 'bullet' || nivel.fmt === 'none') return ''
  return nivel.text.replace(/%(\d)/g, (_f, d: string) => {
    const lv = +d - 1
    const ni = niveis.get(lv)
    return ni ? formatarNum(c!.get(lv) ?? ni.start, ni.fmt) : ''
  }).trim()
}

type EstiloLp = { fill: string; jc: string; base?: string }
function prepararXml(xml: string, titulos: Set<string>, numBase: Map<string, string>, modeloNum: ModeloNum | null): { xml: string; estilos: Map<string, EstiloLp>; rotulos: string[] } {
  const estilos = new Map<string, EstiloLp>()
  const rotulos: string[] = [] // rótulo de cada item de lista, na ordem do documento (casa 1:1 com os <li> do mammoth)
  const contadores = new Map<string, Map<number, number>>()
  const instVistas = new Set<string>()
  const pilhaFill: string[] = [] // sombreamento da célula corrente (aninhamento de tabelas)
  const tok = /<w:tc>|<\/w:tc>|<w:tcPr>[\s\S]*?<\/w:tcPr>|<w:p[ >]/g
  let out = ''
  let ult = 0
  let m: RegExpExecArray | null
  while ((m = tok.exec(xml))) {
    const t = m[0]
    if (t === '<w:tc>') { pilhaFill.push(''); continue }
    if (t === '</w:tc>') { pilhaFill.pop(); continue }
    if (t.startsWith('<w:tcPr>')) {
      const f = attr(t, /<w:shd [^>]*w:fill="([^"]+)"/).toLowerCase()
      if (pilhaFill.length) pilhaFill[pilhaFill.length - 1] = SEM_FUNDO.has(f) ? '' : f
      continue
    }
    // parágrafo: do <w:p até </w:p>
    const ini = m.index
    const fim = xml.indexOf('</w:p>', ini)
    if (fim < 0) break
    const fimT = fim + 6
    let par = xml.slice(ini, fimT)
    tok.lastIndex = fimT
    if (par.includes('<w:txbxContent')) continue // caixa de texto aninhada: não mexe
    par = marcarRuns(par)
    // numeração automática: rótulo do item (direto no parágrafo ou herdado do estilo)
    if (modeloNum) {
      const pprN = (/<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(par)?.[1] ?? '').replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, '')
      const pstN = attr(pprN, /<w:pStyle w:val="([^"]+)"/)
      let numId = attr(pprN, /<w:numId w:val="(\d+)"/), il = attr(pprN, /<w:ilvl w:val="(\d+)"/)
      if (!numId && pstN && numBase.has(pstN)) { const nb = numBase.get(pstN) as string; numId = attr(nb, /<w:numId w:val="(\d+)"/); il = il || attr(nb, /<w:ilvl w:val="(\d+)"/) }
      if (numId && numId !== '0') {
        const rot = proximoRotulo(modeloNum, contadores, instVistas, numId, +(il || '0'))
        if (rot !== null) rotulos.push(rot)
      }
    }
    // estilo do parágrafo: fundo (do parágrafo OU da célula) + alinhamento. Sem pStyle próprio → estilo novo;
    // com pStyle (ex.: "artigo") → estilo COMPOSTO baseado nele (herda a formatação). Títulos (h1..h4) ficam como estão.
    {
      const ppr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(par)
      const pprTxt = ppr ? ppr[1].replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, '') : '' // sem o rPr da marca de parágrafo (o shd dele é do texto, não do parágrafo)
      const jcRaw = attr(pprTxt, /<w:jc w:val="([^"]+)"/)
      const jc = jcRaw === 'center' || jcRaw === 'right' || jcRaw === 'both' ? jcRaw : ''
      const fp = attr(pprTxt, /<w:shd [^>]*w:fill="([^"]+)"/).toLowerCase()
      const fCel = pilhaFill.length ? pilhaFill[pilhaFill.length - 1] : ''
      const fill = !SEM_FUNDO.has(fp) ? fp : fCel
      const pst = attr(par, /<w:pStyle w:val="([^"]+)"/)
      // item de lista (numeração direto no parágrafo OU herdada do estilo) NÃO ganha estilo composto: o mammoth
      // trocaria <li> por <p> e perderia marcador/numeração ("2)", "•").
      const ehLista = /<w:numPr>/.test(pprTxt) || (!!pst && numBase.has(pst))
      if ((fill || jc) && !ehLista && !(pst && titulos.has(pst))) {
        const base = pst ? pst.replace(/[^A-Za-z0-9]/g, '').slice(0, 24) : ''
        const nome = nomeEstilo(fill, jc) + (pst ? `X${base}` : '')
        estilos.set(nome, { fill, jc, base: pst || undefined })
        if (pst) par = par.replace(/<w:pStyle w:val="[^"]+"\/>/, `<w:pStyle w:val="${nome}"/>`)
        else if (ppr) par = par.replace(ppr[0], `<w:pPr><w:pStyle w:val="${nome}"/>${ppr[1]}</w:pPr>`)
        else par = par.replace(/^<w:p[^>]*>/, (a) => `${a}<w:pPr><w:pStyle w:val="${nome}"/></w:pPr>`)
      }
    }
    out += xml.slice(ult, ini) + par
    ult = fimT
  }
  return { xml: out + xml.slice(ult), estilos, rotulos }
}

/** ids dos estilos de parágrafo que o mammoth trata como título/estrutura (não recebem estilo composto). */
function estilosDeTitulo(stylesXml: string): Set<string> {
  const out = new Set<string>()
  for (const m of stylesXml.matchAll(/<w:style [^>]*w:styleId="([^"]+)"[^>]*>\s*<w:name w:val="([^"]+)"/g)) {
    if (/^(t[ií]tulo|heading|title|subt[ií]tulo|subtitle)/i.test(m[2])) out.add(m[1])
  }
  return out
}

/** Estilos de parágrafo que carregam numeração automática (numPr) — itens de lista. */
function numeracaoDosEstilos(stylesXml: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of stylesXml.matchAll(/<w:style [^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const n = /<w:numPr>[\s\S]*?<\/w:numPr>/.exec(m[2])
    if (n) out.set(m[1], n[0])
  }
  return out
}

function declararEstilos(stylesXml: string, estilos: Map<string, EstiloLp>): string {
  const add = [...estilos.entries()].map(([n, v]) => `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${n}"><w:name w:val="${n}"/><w:basedOn w:val="${v.base || 'Normal'}"/></w:style>`).join('')
  return stylesXml.replace('</w:styles>', `${add}</w:styles>`)
}

export async function docxParaHtmlLegproc(data: Buffer): Promise<string> {
  const zip = new PizZip(data)
  const docF = zip.file('word/document.xml')
  const stF = zip.file('word/styles.xml')
  if (!docF || !stF) throw new Error('docx sem document.xml/styles.xml')
  const numF = zip.file('word/numbering.xml')
  const modeloNum = numF ? lerNumbering(numF.asText()) : null
  const { xml, estilos, rotulos } = prepararXml(docF.asText(), estilosDeTitulo(stF.asText()), numeracaoDosEstilos(stF.asText()), modeloNum)
  zip.file('word/document.xml', xml)
  zip.file('word/styles.xml', declararEstilos(stF.asText(), estilos))
  const buffer: Buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })

  const styleMap = [
    'u => u', 'strike => s',
    "highlight[color='yellow'] => span.lp-n", "highlight[color='green'] => span.lp-c",
    "highlight[color='magenta'] => span.lp-p", "highlight[color='red'] => span.lp-x",
    "p[style-name='Título 1'] => h1:fresh", "p[style-name='Titulo 1'] => h1:fresh",
    "p[style-name='Título 2'] => h2:fresh", "p[style-name='Titulo 2'] => h2:fresh",
    "p[style-name='Título 3'] => h3:fresh", "p[style-name='Titulo 3'] => h3:fresh",
    "p[style-name='Título 4'] => h4:fresh", "p[style-name='Titulo 4'] => h4:fresh",
    "p[style-name='Título'] => h1:fresh", "p[style-name='Titulo'] => h1:fresh",
    ...[...estilos.keys()].map((n) => `p[style-name='${n}'] => p.${n.toLowerCase()}:fresh`),
  ]
  const r = await mammoth.convertToHtml({ buffer }, { styleMap } as any)
  let html = r.value || ''

  // classes → vocabulário do leitor (span.ed.n…) e estilos inline (fundo/alinhamento do parágrafo)
  html = html.replace(/class="lp-([ncpx])"/g, 'class="ed $1"')
  const porClasse = new Map([...estilos.entries()].map(([n, v]) => [n.toLowerCase(), v]))
  html = html.replace(/<p class="(lp[0-9a-z]+)"/g, (full, cls: string) => {
    const v = porClasse.get(cls)
    if (!v) return full
    const css = [v.fill ? `background:#${v.fill}` : '', v.jc ? `text-align:${v.jc === 'both' ? 'justify' : v.jc}` : ''].filter(Boolean).join(';')
    return `<p style="${css}"`
  })
  // rótulos da numeração do Word (I, II, a), 1.) nos <li> — só se a contagem casar (senão fica a numeração do mammoth)
  if (modeloNum && rotulos.length && (html.match(/<li[ >]/g) || []).length === rotulos.length) {
    let i = 0
    html = html.replace(/<li(?=[ >])/g, (f) => { const r = rotulos[i++]; return r ? `<li data-n="${r.replace(/"/g, '&quot;')}"` : f })
  }
  // célula sombreada: o fundo vai na CÉLULA (não só atrás do texto do parágrafo) — pega o do 1º parágrafo dela.
  html = html.replace(/<(td|th)([^>]*)>(<p style="background:(#[0-9a-f]{6})[^"]*")/gi, (_f, tag: string, resto: string, p1: string, cor: string) => `<${tag}${resto} style="background:${cor}">${p1}`)
  return html
}
