// ÂNCORA DE TEXTO dos grifos de PDF. O vínculo do grifo é com o TEXTO do documento, não com a página/geometria:
// os rects (0..1 por página) são só CACHE de desenho. Módulo PURO (sem I/O, sem pdf.js) — testável em Node.
//
//  espinha  = concatenação do texto das páginas na ordem da text layer do pdf.js, normalizada de forma determinística
//             (normalizarTextoPdf; itens separados por 1 espaço; sem trim por página).
//  âncora   = { exact, prefix, suffix, char_inicio, char_fim } na espinha (offsets [inicio, fim) em UTF-16).
//  resolver = acha o trecho numa espinha NOVA (versão repaginada/editada): comparação em chave compacta (sem espaços,
//             caixa baixa) → depois "agressiva" (sem acentos/pontuação); desempate por prefix/suffix e proximidade;
//             ambíguo/inexistente → null (NUNCA adivinha). Nada aqui apaga nada.
import { mesclarRects, type RectNorm } from './pdf-rects'

export interface ItemPdf { str: string; x0: number; y0: number; x1: number; y1: number }
export interface PaginaPdf { pagina: number; itens: ItemPdf[] }
export interface Seg { ini: number; fim: number; pagina: number; x0: number; y0: number; x1: number; y1: number }
export interface Espinha { texto: string; segs: Seg[]; paginas: { pagina: number; ini: number; fim: number }[] }
export interface AncoraTexto { exact: string; prefix: string; suffix: string; char_inicio: number; char_fim: number }
export interface Resolucao { pagina: number; paginaFim: number; inicio: number; fim: number; /** 0..1 (>=0.7 = seguro p/ pintar) */ confianca: number; metodo: 'unica' | 'contexto' | 'posicao' | 'agressiva' }

export const CONTEXTO = 40
export const CONFIANCA_MIN = 0.7
const MIN_CHAVE = 8 // trechos mais curtos que isso (sem espaços) são ambíguos demais p/ busca por texto

/** Normalização determinística (NFKC: ligaduras ﬁ→fi; sem hífen-macio/zero-width; todo espaço→' ' colapsado). Sem trim. */
export function normalizarTextoPdf(s: string): string {
  return String(s ?? '').normalize('NFKC').replace(/[­​-‍⁠﻿]/g, '').replace(/\s+/g, ' ')
}

export function espinhaDoPdf(paginas: PaginaPdf[]): Espinha {
  let texto = ''
  const segs: Seg[] = []; const pgs: Espinha['paginas'] = []
  for (const p of paginas) {
    let ini = -1
    for (const it of p.itens) {
      const n = normalizarTextoPdf(it.str).trim()
      if (!n) continue
      if (texto && !texto.endsWith(' ')) texto += ' '
      if (ini < 0) ini = texto.length
      segs.push({ ini: texto.length, fim: texto.length + n.length, pagina: p.pagina, x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1 })
      texto += n
    }
    pgs.push({ pagina: p.pagina, ini: ini < 0 ? texto.length : ini, fim: texto.length })
  }
  return { texto, segs, paginas: pgs }
}

export function paginaDoOffset(e: Espinha, off: number): number {
  for (const p of e.paginas) if (off >= p.ini && off < p.fim) return p.pagina
  // offset em separador/fim: página do segmento mais próximo anterior
  let ult = e.paginas[0]?.pagina ?? 1
  for (const p of e.paginas) { if (p.ini <= off) ult = p.pagina; else break }
  return ult
}

// ───────────── chaves de comparação ─────────────
interface Chave { k: string; idx: number[] }
function chave(s: string, nivel: 1 | 2): Chave {
  let k = ''; const idx: number[] = []
  for (let i = 0; i < s.length; i++) {
    let c = s[i].toLowerCase()
    if (nivel === 2) c = c.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
    else if (/\s/.test(c)) continue
    for (const ch of c) { k += ch; idx.push(i) }
  }
  return { k, idx }
}
const soChave = (s: string, nivel: 1 | 2) => chave(s, nivel).k
const sufComum = (a: string, b: string) => { let n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++; return n }
const preComum = (a: string, b: string) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n }

// ───────────── criação ─────────────
/** Âncora do intervalo [inicio, fim) da espinha (aparado de espaços). null se vazio. */
export function criarAncora(e: Espinha, inicio: number, fim: number): AncoraTexto | null {
  let a = Math.max(0, Math.min(inicio, e.texto.length)), b = Math.max(0, Math.min(fim, e.texto.length))
  while (a < b && e.texto[a] === ' ') a++
  while (b > a && e.texto[b - 1] === ' ') b--
  if (b <= a) return null
  return {
    exact: e.texto.slice(a, b),
    prefix: e.texto.slice(Math.max(0, a - CONTEXTO), a),
    suffix: e.texto.slice(b, b + CONTEXTO),
    char_inicio: a, char_fim: b,
  }
}

/**
 * Intervalo da espinha coberto pelos rects (0..1) de UMA página — o caminho "geometria → texto" usado ao CRIAR o grifo
 * (os itens da text layer são a mesma fonte da espinha). Pontas parciais de item: proporção linear dos caracteres.
 */
export function intervaloDosRects(e: Espinha, pagina: number, rects: RectNorm[]): { inicio: number; fim: number } | null {
  let ini = Infinity, fim = -Infinity
  for (const s of e.segs) {
    if (s.pagina !== pagina) continue
    const h = Math.max(1e-6, s.y1 - s.y0), w = Math.max(1e-6, s.x1 - s.x0), len = s.fim - s.ini
    for (const r of rects) {
      const ov = Math.min(r.y1, s.y1) - Math.max(r.y0, s.y0)
      if (ov < Math.min(h, r.y1 - r.y0) * 0.5) continue // outra linha
      const xa = Math.max(r.x0, s.x0), xb = Math.min(r.x1, s.x1)
      if (xb - xa <= 0) continue
      const a = s.ini + Math.round(((xa - s.x0) / w) * len), b = s.ini + Math.round(((xb - s.x0) / w) * len)
      if (b <= a) continue
      ini = Math.min(ini, a); fim = Math.max(fim, b)
    }
  }
  return Number.isFinite(ini) && fim > ini ? { inicio: ini, fim } : null
}

/**
 * Âncora a partir de rects + texto selecionado (o `texto` do DOM). A geometria dá o intervalo aproximado (pontas ±alguns
 * caracteres); o `texto` refina: se existir (chave compacta) numa janela ao redor, usa o intervalo exato desse trecho.
 * Se o `texto` não casar com o que está sob os rects, devolve a âncora da geometria com `confere:false`.
 */
export function ancoraDeRectsETexto(e: Espinha, pagina: number, rects: RectNorm[], texto?: string | null): { ancora: AncoraTexto; confere: boolean } | null {
  const iv = intervaloDosRects(e, pagina, rects); if (!iv) return null
  const alvo = texto ? soChave(texto, 1) : ''
  if (alvo.length >= 3) {
    const JAN = 40
    const a0 = Math.max(0, iv.inicio - JAN), b0 = Math.min(e.texto.length, iv.fim + JAN)
    const { k, idx } = chave(e.texto.slice(a0, b0), 1)
    // o grifo multi-página guarda o texto TODO em cada página: aqui usamos só o trecho que cabe (o da geometria)
    const geo = soChave(e.texto.slice(iv.inicio, iv.fim), 1)
    const alvoUsar = alvo.length > geo.length + 2 * JAN ? '' : alvo
    if (alvoUsar) {
      const pos: number[] = []; for (let p = k.indexOf(alvoUsar); p >= 0; p = k.indexOf(alvoUsar, p + 1)) pos.push(p)
      if (pos.length) {
        // várias na janela: a mais próxima do intervalo da geometria
        let best = pos[0], bd = Infinity
        for (const p of pos) { const d = Math.abs(a0 + idx[p] - iv.inicio); if (d < bd) { bd = d; best = p } }
        const anc = criarAncora(e, a0 + idx[best], a0 + idx[best + alvoUsar.length - 1] + 1)
        if (anc) return { ancora: anc, confere: true }
      }
    }
    const anc = criarAncora(e, iv.inicio, iv.fim)
    if (!anc) return null
    // sem `texto` casando: confere se um contém o outro (pontas imprecisas) com razão razoável
    const g = soChave(anc.exact, 1)
    const confere = !!g && (alvo.includes(g) || g.includes(alvo)) && Math.min(g.length, alvo.length) / Math.max(g.length, alvo.length) >= 0.6
    return { ancora: anc, confere }
  }
  const anc = criarAncora(e, iv.inicio, iv.fim)
  return anc ? { ancora: anc, confere: !texto } : null
}

// ───────────── resolução ─────────────
function ocorrencias(k: string, alvo: string): number[] {
  const out: number[] = []
  for (let p = k.indexOf(alvo); p >= 0; p = k.indexOf(alvo, p + 1)) out.push(p)
  return out
}

function resolverNivel(e: Espinha, a: AncoraTexto, nivel: 1 | 2, ci: number | null): Resolucao | null {
  const alvo = soChave(a.exact, nivel); if (!alvo) return null
  const { k, idx } = chave(e.texto, nivel)
  const pos = ocorrencias(k, alvo); if (!pos.length) return null
  const kp = soChave(a.prefix || '', nivel), ks = soChave(a.suffix || '', nivel)
  const tem = (kp ? 1 : 0) + (ks ? 1 : 0)
  const cands = pos.map((p) => {
    const inicio = idx[p], fim = idx[p + alvo.length - 1] + 1
    // contexto na MESMA chave: recorta o antes/depois do candidato na espinha e compara com prefix/suffix
    const antes = soChave(e.texto.slice(Math.max(0, inicio - CONTEXTO * 3), inicio), nivel)
    const depois = soChave(e.texto.slice(fim, fim + CONTEXTO * 3), nivel)
    const sp = kp ? Math.min(1, sufComum(kp, antes) / kp.length) : 0
    const ss = ks ? Math.min(1, preComum(ks, depois) / ks.length) : 0
    const ctx = tem ? (sp + ss) / tem : null
    return { inicio, fim, ctx, dist: ci == null ? Infinity : Math.abs(inicio - ci) }
  })
  const mk = (c: { inicio: number; fim: number }, confianca: number, metodo: Resolucao['metodo']): Resolucao =>
    ({ pagina: paginaDoOffset(e, c.inicio), paginaFim: paginaDoOffset(e, Math.max(c.inicio, c.fim - 1)), inicio: c.inicio, fim: c.fim, confianca: Math.round(confianca * 100) / 100, metodo })
  const curto = alvo.length < MIN_CHAVE
  if (cands.length === 1) {
    const c = cands[0]
    if (curto && !(c.dist <= 2 && (c.ctx ?? 0) >= 0.8)) return null
    return mk(c, c.ctx == null ? 0.9 : 0.7 + 0.3 * c.ctx, nivel === 1 ? 'unica' : 'agressiva')
  }
  const ord = [...cands].sort((x, y) => ((y.ctx ?? 0) - (x.ctx ?? 0)) || (x.dist - y.dist))
  const [b, s] = ord
  if (b.ctx != null && b.ctx >= 0.5 && b.ctx - (s.ctx ?? 0) >= 0.25 && !(curto && b.ctx < 0.8)) return mk(b, 0.5 + 0.45 * b.ctx, nivel === 1 ? 'contexto' : 'agressiva')
  // sem contexto decisivo: só aceita a posição idêntica à gravada (mesmo texto ainda no mesmo offset ⇒ mesma versão)
  const naPos = cands.filter((c) => c.dist <= 2)
  if (naPos.length === 1 && !curto) return mk(naPos[0], 0.78, 'posicao')
  return null
}

/** Resolve a âncora numa espinha (qualquer versão). null = não existe ou é ambígua — o chamador NÃO deve adivinhar. */
export function resolverAncora(e: Espinha, a: AncoraTexto): Resolucao | null {
  if (!a || !a.exact || !e.texto) return null
  const ci = Number.isFinite(a.char_inicio) ? a.char_inicio : null
  return resolverNivel(e, a, 1, ci) ?? resolverNivel(e, a, 2, ci)
}

/** Âncora a partir do `texto` + página gravada (backfill de grifos antigos): aceita só match ÚNICO (preferindo a página dada). */
export function ancoraDeTexto(e: Espinha, texto: string, paginaDica?: number | null): { ancora: AncoraTexto; resolucao: Resolucao } | null {
  const alvo = soChave(texto, 1); if (alvo.length < MIN_CHAVE) return null
  for (const nivel of [1, 2] as const) {
    const alv = nivel === 1 ? alvo : soChave(texto, 2); if (alv.length < MIN_CHAVE) continue
    const { k, idx } = chave(e.texto, nivel)
    let pos = ocorrencias(k, alv)
    if (pos.length > 1 && paginaDica != null) {
      const naPag = pos.filter((p) => paginaDoOffset(e, idx[p]) === paginaDica)
      if (naPag.length === 1) pos = naPag // só 1 na página original → confiante
    }
    if (pos.length !== 1) continue
    const p = pos[0]
    const anc = criarAncora(e, idx[p], idx[p + alv.length - 1] + 1); if (!anc) continue
    const res = resolverAncora(e, anc); if (res) return { ancora: anc, resolucao: res }
  }
  return null
}

// ───────────── desenho (cache) ─────────────
/** Rects (0..1) por página que cobrem [inicio, fim) — largura proporcional aos caracteres nas pontas; linhas mescladas. */
export function rectsDoTrecho(e: Espinha, inicio: number, fim: number, mesclar = true): { pagina: number; rects: RectNorm[] }[] {
  const porPag = new Map<number, RectNorm[]>()
  for (const s of e.segs) {
    if (s.fim <= inicio || s.ini >= fim) continue
    const len = Math.max(1, s.fim - s.ini), w = s.x1 - s.x0
    const a = Math.max(inicio, s.ini) - s.ini, b = Math.min(fim, s.fim) - s.ini
    const r = { x0: s.x0 + (w * a) / len, y0: s.y0, x1: s.x0 + (w * b) / len, y1: s.y1 }
    if (!(r.x1 > r.x0 && r.y1 > r.y0)) continue
    const l = porPag.get(s.pagina) ?? []; l.push(r); porPag.set(s.pagina, l)
  }
  return [...porPag.entries()].map(([pagina, rs]) => ({ pagina, rects: mesclar ? mesclarRects(rs) : rs }))
}

/** Rects do trecho só na página `pagina` (o grifo do leitor é 1 por página). */
export function rectsDoTrechoNaPagina(e: Espinha, inicio: number, fim: number, pagina: number): RectNorm[] {
  return rectsDoTrecho(e, inicio, fim).find((x) => x.pagina === pagina)?.rects ?? []
}

/** Recorta [inicio, fim) ao trecho que está na página `pagina` (grifo de PDF é 1 por página; o texto do DOM pode atravessar páginas). */
export function recortarNaPagina(e: Espinha, inicio: number, fim: number, pagina: number): { inicio: number; fim: number } | null {
  const p = e.paginas.find((x) => x.pagina === pagina); if (!p) return null
  const a = Math.max(inicio, p.ini), b = Math.min(fim, p.fim)
  return b > a ? { inicio: a, fim: b } : null
}

export interface GrifoParaRecalculo { texto: string | null; pagina: number; ancora?: { exact?: string | null; prefix?: string | null; suffix?: string | null; char_inicio?: number | null; char_fim?: number | null; ancora_hash?: string | null } | null }
export interface GrifoRecalculado { pagina: number; rects: RectNorm[]; ancora: AncoraTexto; confianca: number; metodo: Resolucao['metodo'] | 'texto-pagina' }

/**
 * UNIFICA o recálculo de um grifo numa espinha (versão atual): com âncora gravada → resolverAncora; sem (legado) → busca do `texto`
 * na página gravada (só match único/confiante). Devolve rects (cache de desenho), a nova âncora (offsets da espinha ATUAL) e a
 * confiança. null = o texto não existe mais OU é ambíguo (o chamador mantém o grifo como "desatualizado"; nada é apagado).
 */
export function recalcularGrifo(e: Espinha, g: GrifoParaRecalculo): GrifoRecalculado | null {
  let ini: number, fim: number, confianca: number, metodo: GrifoRecalculado['metodo']
  const an = g.ancora
  const exact = (an?.exact || g.texto || '').trim()
  if (an && an.char_inicio != null && an.char_fim != null && exact) {
    // modo recuperação: hash → offsets/contexto → texto+página (reconciliarGrifos); ambíguo/ausente → null (fica 'desatualizado')
    const [r] = reconciliarGrifos(e, [{ id: 'g', texto: g.texto, pagina: g.pagina, ancora: an }])
    if (r.estado !== 'resolvido' || r.inicio == null || r.fim == null) return null
    ini = r.inicio; fim = r.fim; confianca = r.confianca; metodo = r.metodo === 'hash' ? 'unica' : (r.metodo as GrifoRecalculado['metodo'])
  } else if (exact) {
    const r = ancoraDeTexto(e, exact, g.pagina)
    if (!r || r.resolucao.confianca < CONFIANCA_MIN) return null
    ini = r.resolucao.inicio; fim = r.resolucao.fim; confianca = r.resolucao.confianca; metodo = 'texto-pagina'
  } else return null
  // o grifo é de UMA página: se o trecho atravessa, fica a parte da página que melhor corresponde (a gravada, se existir)
  const pgs = rectsDoTrecho(e, ini, fim)
  if (!pgs.length) return null
  const alvo = pgs.find((x) => x.pagina === g.pagina) ?? pgs[0]
  const rc = recortarNaPagina(e, ini, fim, alvo.pagina); if (!rc) return null
  const ancora = criarAncora(e, rc.inicio, rc.fim); if (!ancora) return null
  return { pagina: alvo.pagina, rects: alvo.rects, ancora, confianca, metodo }
}

// ═════════════ IDENTIDADE DO GRIFO (hash estável) ═════════════
/** Hash estável (cyrb53, hex 14) — sem crypto, roda no navegador e no Node. */
function hash53(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}
const CTX_HASH = 24
/**
 * Identificador do grifo INDEPENDENTE de página/versão/layout/offsets: hash de exact + cauda do prefix + cabeça do suffix,
 * todos na chave "agressiva" (minúsculas, sem acento/pontuação/espaço). Mesma âncora em versões diferentes ⇒ mesmo hash
 * (enquanto texto e vizinhança imediata forem os mesmos). Dois grifos do mesmo doc com o mesmo hash = o mesmo grifo.
 */
export function hashAncora(a: Pick<AncoraTexto, 'exact' | 'prefix' | 'suffix'>): string {
  const k = (s: string) => soChave(s ?? '', 2)
  const p = k(a.prefix), s = k(a.suffix)
  return hash53(`${k(a.exact)}|${p.slice(Math.max(0, p.length - CTX_HASH))}|${s.slice(0, CTX_HASH)}`)
}

// ═════════════ METADADOS SEMÂNTICOS (o que está sendo grifado) ═════════════
export type TipoTrecho = 'artigo' | 'paragrafo' | 'inciso' | 'sumula' | 'jurisprudencia' | 'titulo' | 'texto'
export interface MetaTrecho { rotulo: string | null; contexto: string; tipo_trecho: TipoTrecho }
const RX_ROTULO = /(Súmula(?:\s+Vinculante)?\s+\d+(?:\s*(?:do|\/)\s*(?:STF|STJ|TST|TSE))?|Art(?:igo)?\.?\s*\d+[ºo°]?(?:-[A-Z])?|§\s*\d+[ºo°]?|Parágrafo\s+único|Par[áa]grafo\s+\d+[ºo°]?)/gi
const RX_INCISO = /(?:^|\s)([IVXL]{1,6})\s*[-–—]\s/g
const RX_JURIS = /\b(STF|STJ|TST|TSE|REsp|RE\s?\d|ADI|ADPF|ADC|HC\s?\d|AgRg|Tema\s+\d+)\b/

function tipoDoRotulo(r: string): TipoTrecho {
  if (/^s[úu]mula/i.test(r)) return 'sumula'
  if (/^art/i.test(r)) return 'artigo'
  if (/^§|^par[áa]grafo/i.test(r)) return 'paragrafo'
  return 'texto'
}
const curto = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

/** Frase/parágrafo que contém [inicio,fim) (até ~200 chars). */
export function contextoDoTrecho(e: Espinha, inicio: number, fim: number, max = 200): string {
  const t = e.texto
  const ant = Math.max(t.lastIndexOf('. ', inicio - 1), t.lastIndexOf('; ', inicio - 1), t.lastIndexOf(': ', inicio - 1))
  let a = ant >= 0 && inicio - ant < max ? ant + 2 : Math.max(0, inicio - 60)
  const dep = t.indexOf('. ', fim)
  let b = dep >= 0 && dep - fim < max ? dep + 1 : Math.min(t.length, fim + 60)
  if (b - a > max) { const meio = Math.floor((inicio + fim) / 2); a = Math.max(a, meio - max / 2); b = Math.min(b, a + max) }
  return t.slice(Math.max(0, a), b).trim()
}

/**
 * Rótulo legível + contexto + tipo do trecho, calculados da ESPINHA (texto + altura da fonte dos itens do pdf.js):
 *  - título/seção mais próxima ACIMA: item curto com altura >= 1,2x a mediana do documento;
 *  - rótulo jurídico por regex (Art. 5º, § 2º, Súmula 700…) no próprio trecho ou nos ~400 chars anteriores.
 * A página é só DICA (não entra no rótulo). Rótulo composto: "Título › Art. 5º".
 */
export function metadadosDoTrecho(e: Espinha, inicio: number, fim: number): MetaTrecho {
  const contexto = contextoDoTrecho(e, inicio, fim)
  const exact = e.texto.slice(inicio, fim)
  const hs = e.segs.map((s) => s.y1 - s.y0).filter((h) => h > 0).sort((a, b) => a - b)
  const med = hs.length ? hs[Math.floor(hs.length / 2)] : 0
  let titulo: string | null = null
  if (med > 0) for (let i = e.segs.length - 1; i >= 0; i--) {
    const s = e.segs[i]; if (s.ini >= inicio) continue
    const len = s.fim - s.ini
    if (len <= 120 && len >= 3 && s.y1 - s.y0 >= med * 1.2) { titulo = e.texto.slice(s.ini, s.fim); break }
    if (inicio - s.ini > 20000) break
  }
  const eTitulo = !!e.segs.find((s) => med > 0 && s.ini <= inicio && s.fim >= fim && s.fim - s.ini <= 120 && s.y1 - s.y0 >= med * 1.2)
  const janela = e.texto.slice(Math.max(0, inicio - 400), Math.min(e.texto.length, inicio + Math.min(60, fim - inicio)))
  let rot: string | null = null
  const todos = [...janela.matchAll(RX_ROTULO)]
  if (todos.length) rot = todos[todos.length - 1][1].replace(/\s+/g, ' ').replace(/(\d)o\b/g, '$1º') // NFKC da espinha troca º por o
  else { const inc = [...janela.matchAll(RX_INCISO)]; if (inc.length) rot = inc[inc.length - 1][1] }
  const partes = [titulo && !eTitulo ? curto(titulo, 50) : null, rot].filter(Boolean) as string[]
  const rotulo = partes.length ? curto(partes.join(' › '), 80) : null
  let tipo: TipoTrecho = eTitulo ? 'titulo' : rot ? (/^[IVXL]+$/.test(rot) ? 'inciso' : tipoDoRotulo(rot)) : 'texto'
  if (tipo === 'texto' && RX_JURIS.test(exact + ' ' + contexto)) tipo = 'jurisprudencia'
  return { rotulo, contexto, tipo_trecho: tipo }
}

// ═════════════ MODO RECUPERAÇÃO ═════════════
export interface GrifoParaReconciliar { id: string; texto: string | null; pagina: number; ancora?: { exact?: string | null; prefix?: string | null; suffix?: string | null; char_inicio?: number | null; char_fim?: number | null; ancora_hash?: string | null } | null }
export interface ResultadoReconciliacao {
  id: string; estado: 'resolvido' | 'ambiguo' | 'ausente'; confianca: number
  metodo: 'hash' | 'offset' | 'unica' | 'contexto' | 'posicao' | 'agressiva' | 'texto-pagina' | null
  pagina: number | null; inicio: number | null; fim: number | null
}

/**
 * Para cada grifo resolve na espinha pela ordem: (1) hash (candidatos do exact cujo hash recalculado == ancora_hash, único);
 * (2) offsets/contexto (resolverAncora); (3) texto + página gravada; (4) normalizado agressivo (dentro dos anteriores).
 * Devolve resolvido | ambiguo (existe mas não dá p/ escolher) | ausente (texto não existe). NUNCA apaga nem escreve.
 */
export function reconciliarGrifos(e: Espinha, grifos: GrifoParaReconciliar[]): ResultadoReconciliacao[] {
  return grifos.map((g): ResultadoReconciliacao => {
    const nulo = { id: g.id, pagina: null, inicio: null, fim: null }
    const an = g.ancora; const exact = (an?.exact || g.texto || '').trim()
    if (!exact) return { ...nulo, estado: 'ausente', confianca: 0, metodo: null }
    if (an?.ancora_hash) {
      for (const nivel of [1, 2] as const) {
        const alvo = soChave(exact, nivel); if (!alvo) continue
        const { k, idx } = chave(e.texto, nivel)
        const hits = ocorrencias(k, alvo).map((p) => criarAncora(e, idx[p], idx[p + alvo.length - 1] + 1)).filter((x): x is AncoraTexto => !!x && hashAncora(x) === an.ancora_hash)
        if (hits.length === 1) { const h = hits[0]; return { id: g.id, estado: 'resolvido', confianca: 1, metodo: 'hash', pagina: paginaDoOffset(e, h.char_inicio), inicio: h.char_inicio, fim: h.char_fim } }
        if (hits.length > 1) break
      }
    }
    if (an && an.char_inicio != null && an.char_fim != null) {
      const r = resolverAncora(e, { exact, prefix: an.prefix ?? '', suffix: an.suffix ?? '', char_inicio: an.char_inicio, char_fim: an.char_fim })
      if (r && r.confianca >= CONFIANCA_MIN) return { id: g.id, estado: 'resolvido', confianca: r.confianca, metodo: r.metodo, pagina: r.pagina, inicio: r.inicio, fim: r.fim }
    }
    const t = ancoraDeTexto(e, exact, g.pagina)
    if (t && t.resolucao.confianca >= CONFIANCA_MIN) return { id: g.id, estado: 'resolvido', confianca: t.resolucao.confianca, metodo: 'texto-pagina', pagina: t.resolucao.pagina, inicio: t.resolucao.inicio, fim: t.resolucao.fim }
    const existe = ([1, 2] as const).some((n) => { const a = soChave(exact, n); return a.length >= 3 && chave(e.texto, n).k.includes(a) })
    return { ...nulo, estado: existe ? 'ambiguo' : 'ausente', confianca: 0, metodo: null }
  })
}

/** Dedupe por identidade: agrupa grifos com o mesmo ancora_hash (mesmo doc) — o 1º de cada grupo é o "mesmo grifo". */
export function agruparPorHash<T extends { id: string; ancora_hash?: string | null }>(grifos: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const g of grifos) if (g.ancora_hash) { const l = m.get(g.ancora_hash) ?? []; l.push(g); m.set(g.ancora_hash, l) }
  return m
}
