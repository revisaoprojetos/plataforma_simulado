// Classificação ÚNICA de dispositivos jurídicos (Livro/Parte/Título/Capítulo/Seção/Subseção, Art.,
// §, inciso, alínea, item). PURO (sem I/O, sem server-only): roda no servidor, no worker, no cliente e em
// teste. É a fonte única usada por `trechos.ts` (classificar), `leitura/sanitize.ts` (indexarDispositivos)
// e, na fase seguinte, pelo leitor-jus.html. A tabela de NÍVEIS vive em `lib/leitura/indice.ts`.
//
// Contrato:
//  - `classificarDispositivo(tag, texto, ctx?)` decide tipo + rótulo + chave (estável) de UM bloco.
//  - CITAÇÃO não é dispositivo: bloco em tabela/caixa/aspas, introduzido por "nos termos…", ou que só
//    referencia ("Art. 182, § 4º, III, CF;") devolve tipo 'texto' (citacao=true).
//  - `IndexadorDispositivos` mantém o contexto (artigo/§/inciso/alínea) e gera ids estáveis: derivados do
//    RÓTULO normalizado (nunca de contador global); repetidos recebem `~n` por id-base.
import { NIVEL_TIPO } from '../leitura/indice'

export type TipoDispositivo =
  | 'livro' | 'parte' | 'titulo' | 'capitulo' | 'secao' | 'subsecao'
  | 'artigo' | 'paragrafo' | 'inciso' | 'alinea' | 'item' | 'texto'

export interface CtxDispositivo {
  /** Bloco dentro de <table>/<td>/<th> ou de caixa (.caixa-colapsavel, data-caixa=stf|stj): é citação. */
  dentroDeTabelaOuCaixa?: boolean
  /** Bloco com aparência de título (negrito/maiúsculas/heading) — relaxa numerais por extenso. */
  titulo?: boolean
  /** Já estamos sob inciso/alínea: só então "1." vira item (evita lista numerada solta virar item). */
  emDispositivo?: boolean
}

export interface ClassificacaoDispositivo {
  tipo: TipoDispositivo
  rotulo: string | null
  /** Chave normalizada do rótulo (ex.: "1-a", "unico", "ii"); null quando não há rótulo. */
  chave: string | null
  /** Nível hierárquico (tabela única em leitura/indice.ts); -1 para 'texto'. */
  nivel: number
  /** 'texto' = padrão no texto; 'tag' = só por ser heading h1-h6 (sem rótulo); null = não é dispositivo. */
  via: 'texto' | 'tag' | null
  /** True quando o bloco foi descartado por ser citação. */
  citacao: boolean
}

const BORDA = '(?![A-Za-zÀ-ú0-9])'
const ROMANO = /^(?=[IVXLCDM])M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/
const ROMANO_INCISO = /^C{0,3}(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/ // I..CCC (sem D/M: evita "CD-ROM", "MIX-")
const ehRomano = (s: string) => s.length > 0 && ROMANO.test(s)
const ehRomanoInciso = (s: string) => s.length > 0 && ROMANO_INCISO.test(s)

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (s: string) => semAcento(s).toLowerCase()
const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)

export function nivelDoTipo(tipo: string): number {
  return NIVEL_TIPO[tipo] ?? -1
}

function res(tipo: TipoDispositivo, rotulo: string | null, chave: string | null, via: 'texto' | 'tag' | null, citacao = false): ClassificacaoDispositivo {
  return { tipo, rotulo, chave, nivel: tipo === 'texto' ? -1 : nivelDoTipo(tipo), via, citacao }
}
const NAO = (citacao = false) => res('texto', null, null, null, citacao)

// ── Citação ────────────────────────────────────────────────────────────────────────────────────
const ABRE_ASPAS = /^[“"‘'«„]/
const INTRODUTOR = /^(?:nos termos|nos moldes|conforme|consoante|de acordo com|segundo|vide|v\.|cf\.?|ver|previst[oa]s?\s+(?:no|na|nos|nas)|c\/c)\b/i
const T = (s: string) => `(?:${s})${BORDA}`
const REF_TOKEN = [
  T('caput'), T('§§?\\s*\\d+[º°]?(?:-[A-Z])?'), T('[IVXLC]+'), T('incs?\\.?'), T('incisos?'), T('al[ií]neas?'),
  '[a-z]\\)', T('\\d+[º°]?'), T('e'), T('ou'), T('a'),
].join('|')
const SIGLA = [
  'CF(?:\\/\\d{2,4})?', 'CRFB(?:\\/\\d{2,4})?', 'CC(?:\\/\\d{2,4})?', 'CPC(?:\\/\\d{2,4})?', 'CPP', 'CP', 'CLT', 'CTN', 'ECA', 'CDC', 'LINDB', 'LEP', 'LRF', 'LC',
  'Constitui[çc][ãa]o(?:\\s+Federal)?(?:\\s+de\\s+\\d{4})?',
  'C[óo]digo\\s+[A-ZÀ-Ú][\\wÀ-ú]*(?:\\s+(?:de\\s+)?[A-ZÀ-Ú][\\wÀ-ú]*){0,3}',
  'Lei(?:\\s+Complementar)?\\s+(?:n\\.?[º°o]?\\s*)?[\\d.]+(?:\\/\\d{2,4})?',
  'Decreto(?:-Lei)?\\s+(?:n\\.?[º°o]?\\s*)?[\\d.]+(?:\\/\\d{2,4})?',
].join('|')
const RE_SO_REFERENCIA = new RegExp(`^(?:[\\s,;]|${REF_TOKEN})*(?:d[aoe]s?\\s+|c\\/c\\s+)?(?:${SIGLA})\\s*[.;,)]*$`, 'i')

/** True se o RESTO do bloco (depois do rótulo) só referencia outra norma — ex.: ", § 4º, III, CF;". */
function soReferencia(resto: string): boolean {
  const r = resto.trim()
  if (!r || r.length > 110) return false // sem resto = dispositivo "puro" (texto vem em outro bloco)
  return RE_SO_REFERENCIA.test(r)
}

/** Citação por forma: aspas, introdutor ("nos termos do art. X…") ou contexto de tabela/caixa. */
export function ehCitacao(texto: string, ctx?: CtxDispositivo): boolean {
  if (ctx?.dentroDeTabelaOuCaixa) return true
  const t = (texto || '').trim()
  return ABRE_ASPAS.test(t) || INTRODUTOR.test(t)
}

interface NoLike { parentNode?: NoLike | null; tagName?: string; getAttribute?: (n: string) => string | null | undefined }
/** True se o nó está dentro de table/td/th, .caixa-colapsavel ou data-caixa="stf|stj" (DOM ou node-html-parser). */
export function dentroDeTabelaOuCaixa(el: NoLike | null | undefined): boolean {
  let p = el?.parentNode
  while (p) {
    const tag = (p.tagName || '').toUpperCase()
    if (tag === 'TABLE' || tag === 'TD' || tag === 'TH') return true
    const cls = p.getAttribute?.('class') || ''
    if (/(^|\s)caixa-colapsavel(\s|$)/.test(cls)) return true
    const cx = (p.getAttribute?.('data-caixa') || '').toLowerCase()
    if (cx === 'stf' || cx === 'stj') return true
    p = p.parentNode
  }
  return false
}

// ── Estruturais (Livro/Parte/Título/Capítulo/Seção/Subseção) ───────────────────────────────────────
const RE_ESTRUT = /^(sub-?se[çc][ãa]o|se[çc][ãa]o|livro|parte|t[ií]tulo|cap[ií]tulo)\s+(\S+)([\s\S]*)$/i
const NOME_ESTRUT: Record<string, { tipo: TipoDispositivo; nome: string }> = {
  livro: { tipo: 'livro', nome: 'Livro' }, parte: { tipo: 'parte', nome: 'Parte' }, titulo: { tipo: 'titulo', nome: 'Título' },
  capitulo: { tipo: 'capitulo', nome: 'Capítulo' }, secao: { tipo: 'secao', nome: 'Seção' }, subsecao: { tipo: 'subsecao', nome: 'Subseção' },
}
const NUM_EXTENSO = /^(unic[oa]|geral|especial|preliminar|complementar|final|transitori[oa]s?|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|setim[oa]|oitav[oa]|non[oa]|decim[oa])$/

function ehMaiusculo(s: string): boolean {
  const letras = s.replace(/[^A-Za-zÀ-ú]/g, '')
  return letras.length > 0 && letras === letras.toUpperCase()
}
function dominanteMaiusculo(s: string): boolean {
  const letras = s.replace(/[^A-Za-zÀ-ú]/g, '')
  if (letras.length < 3) return false
  return (letras.match(/[A-ZÀ-Ú]/g) || []).length / letras.length >= 0.7
}

function classificarEstrutural(texto: string, ctx?: CtxDispositivo): ClassificacaoDispositivo | null {
  const m = texto.match(RE_ESTRUT)
  if (!m) return null
  const kwRaw = m[1]
  const kw = norm(kwRaw).replace('-', '')
  const def = NOME_ESTRUT[kw]
  if (!def) return null
  const tokBruto = m[2]
  const resto = (m[3] || '').trim()
  const tok = tokBruto.replace(/[.\-–—:,;]+$/, '')
  const sepNoToken = tok.length < tokBruto.length
  const sep = sepNoToken || /^[-–—:.]/.test(resto)
  // numeral: romano MAIÚSCULO (+ sufixo -A), arábico (+º), ou por extenso
  let chave: string | null = null
  let rotNum = ''
  let porExtenso = false
  const mRom = tok.match(/^([IVXLCDM]+)(?:-([A-Z]))?$/)
  const mNum = tok.match(/^(\d{1,3})[º°ª]?(?:-([A-Z]))?$/)
  if (mRom && ehRomano(mRom[1])) { chave = mRom[1].toLowerCase() + (mRom[2] ? '-' + mRom[2].toLowerCase() : ''); rotNum = mRom[1] + (mRom[2] ? '-' + mRom[2] : '') }
  else if (mNum) { chave = mNum[1] + (mNum[2] ? '-' + mNum[2].toLowerCase() : ''); rotNum = mNum[1] + (mNum[2] ? '-' + mNum[2] : '') }
  else if (NUM_EXTENSO.test(norm(tok))) { chave = norm(tok); rotNum = tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase(); porExtenso = true }
  if (!chave) return null
  // Anti-falso-positivo ("Parte da doutrina…", "Parte I do edital é…"): exige sinal de título.
  const kwUpper = ehMaiusculo(kwRaw)
  const restoVazio = resto === ''
  const base = restoVazio || sep || ctx?.titulo === true
  const aceita = porExtenso ? base || (kwUpper && dominanteMaiusculo(resto)) : base || kwUpper || dominanteMaiusculo(resto)
  if (!aceita) return null
  return res(def.tipo, `${def.nome} ${rotNum}`, chave, 'texto')
}

// ── Artigo ────────────────────────────────────────────────────────────────────────────────────────
function classificarArtigo(texto: string): { c: ClassificacaoDispositivo; resto: string } | null {
  const m = texto.match(/^(Art(?:igo)?)(?:\.\s*|\s+)([\s\S]*)$/i)
  if (!m) return null
  const rest = m[2]
  const palavra = m[1]
  // "Artigo único" / "Art. único"
  let mm = rest.match(new RegExp(`^[úu]nico${BORDA}`, 'i'))
  if (mm) return { c: res('artigo', `${/^artigo$/i.test(palavra) ? 'Artigo' : 'Art.'} único`, 'unico', 'texto'), resto: rest.slice(mm[0].length) }
  // número (aceita 1.234), ordinal opcional (º ° .º), sufixo adjacente -A
  // "Art. 1º - A lei…": hífen separado por espaço NÃO é sufixo (só "-A" colado ao número/ordinal).
  mm = rest.match(/^(\d{1,4}(?:\.\d{3})*)(\.?[º°˚])?(?:[-–]([A-Z]))?(?![A-Za-zÀ-ú0-9])/)
  if (mm) {
    const n = mm[1].replace(/\./g, '')
    const suf = mm[3]
    return {
      c: res('artigo', `Art. ${mm[1]}${mm[2] ? 'º' : ''}${suf ? '-' + suf : ''}`, n + (suf ? '-' + suf.toLowerCase() : ''), 'texto'),
      resto: rest.slice(mm[0].length),
    }
  }
  // romano MAIÚSCULO ("Art. XII")
  mm = rest.match(/^([IVXLC]{1,6})(?![A-Za-zÀ-ú0-9])/)
  if (mm && ehRomano(mm[1])) return { c: res('artigo', `Art. ${mm[1]}`, mm[1].toLowerCase(), 'texto'), resto: rest.slice(mm[0].length) }
  return null
}

// ── Parágrafo (§) ────────────────────────────────────────────────────────────────────────────────
function classificarParagrafo(texto: string): { c: ClassificacaoDispositivo; resto: string } | null {
  let m = texto.match(/^§§\s*(\d+[º°˚]?(?:-[A-Z])?(?:\s*(?:,|e|a|ao|ou|\/)\s*\d+[º°˚]?(?:-[A-Z])?)*)/)
  if (m) {
    const nums = (m[1].match(/\d+(?:-[A-Z])?/g) || []).map((x) => x.toLowerCase())
    return { c: res('paragrafo', `§§ ${m[1].replace(/\.?[°˚]/g, 'º').replace(/\s+/g, ' ')}`, 's-' + nums.join('-'), 'texto'), resto: texto.slice(m[0].length) }
  }
  m = texto.match(new RegExp(`^§\\s*[úu]nico${BORDA}`, 'i'))
  if (m) return { c: res('paragrafo', '§ único', 'unico', 'texto'), resto: texto.slice(m[0].length) }
  m = texto.match(new RegExp(`^Par[áa]grafo\\s+[úu]nico${BORDA}`, 'i'))
  if (m) return { c: res('paragrafo', 'Parágrafo único', 'unico', 'texto'), resto: texto.slice(m[0].length) }
  m = texto.match(/^§\s*(\d+)(\.?[º°˚])?(?:-([A-Z]))?(?![A-Za-zÀ-ú0-9])/)
  if (m) return { c: res('paragrafo', `§ ${m[1]}${m[2] ? 'º' : ''}${m[3] ? '-' + m[3] : ''}`, m[1] + (m[3] ? '-' + m[3].toLowerCase() : ''), 'texto'), resto: texto.slice(m[0].length) }
  return null
}

// ── Inciso / alínea / item ───────────────────────────────────────────────────────────────────────
function classificarInciso(texto: string): { c: ClassificacaoDispositivo; resto: string } | null {
  const m = texto.match(/^([IVXLC]{1,7})(?:-([A-Z]))?\s*([-–—.)])/)
  if (!m || !ehRomanoInciso(m[1])) return null
  const apos = texto.slice(m[0].length)
  if (m[3] === '.' && apos !== '' && !/^\s/.test(apos)) return null // "I.C.A." etc.
  return { c: res('inciso', m[1] + (m[2] ? '-' + m[2] : ''), m[1].toLowerCase() + (m[2] ? '-' + m[2].toLowerCase() : ''), 'texto'), resto: apos }
}
function classificarAlinea(texto: string): ClassificacaoDispositivo | null {
  const m = texto.match(/^([a-z])(\1)?\s*\)/)
  return m ? res('alinea', m[1] + (m[2] ?? '') + ')', m[1] + (m[2] ?? ''), 'texto') : null
}
function classificarItem(texto: string): ClassificacaoDispositivo | null {
  const m = texto.match(/^(\d{1,2})\s*[.)–-]\s+\S/)
  return m ? res('item', m[1] + '.', m[1], 'texto') : null
}

/**
 * Classifica UM bloco. Ordem: citação → estrutural → artigo → § → inciso → alínea → item → heading (tag).
 * Nunca lança. Bloco que não é dispositivo devolve tipo 'texto'.
 */
export function classificarDispositivo(tag: string, texto: string, ctx?: CtxDispositivo): ClassificacaoDispositivo {
  const t = (tag || '').toLowerCase()
  const txt = (texto || '').replace(/\s+/g, ' ').trim()
  if (!txt) return NAO()
  const ehHeading = /^h[1-6]$/.test(t)
  if (t === 'td' || t === 'th') return NAO(true)
  if (ehCitacao(txt, ctx)) return NAO(true)
  const c2: CtxDispositivo = ehHeading && !ctx?.titulo ? { ...ctx, titulo: true } : (ctx ?? {})

  const est = classificarEstrutural(txt, c2)
  if (est) return est
  const art = classificarArtigo(txt)
  if (art) return soReferencia(art.resto) ? NAO(true) : art.c
  const par = classificarParagrafo(txt)
  if (par) return soReferencia(par.resto) ? NAO(true) : par.c
  const inc = classificarInciso(txt)
  if (inc) return inc.c
  const ali = classificarAlinea(txt)
  if (ali) return ali
  if (ctx?.emDispositivo) { const it = classificarItem(txt); if (it) return it }
  if (ehHeading) return res('secao', txt.slice(0, 60), slug(txt) || 'sec', 'tag')
  return NAO()
}

// ── Indexador com contexto + ids estáveis ───────────────────────────────────────────────────────────
export interface DispositivoIndexado {
  id: string
  tipo: TipoDispositivo
  rotulo: string
  nivel: number
}

const ORDEM_ESTRUT: TipoDispositivo[] = ['livro', 'parte', 'titulo', 'capitulo', 'secao', 'subsecao']
const PREFIXO: Record<string, string> = { livro: 'livro-', parte: 'parte-', titulo: 'titulo-', capitulo: 'capitulo-', secao: 'secao-', subsecao: 'subsecao-', artigo: 'art-' }

export class IndexadorDispositivos {
  private usados = new Map<string, number>()
  private estrut: (string | '')[] = ['', '', '', '', '', '']
  private artigo = ''
  private paragrafo = ''
  private inciso = ''
  private alinea = ''

  private unico(base: string): string {
    const n = (this.usados.get(base) ?? 0) + 1
    this.usados.set(base, n)
    return n === 1 ? base : `${base}~${n}`
  }
  private resetAbaixoDeArtigo() { this.paragrafo = ''; this.inciso = ''; this.alinea = '' }

  /** Classifica o próximo bloco (em ordem de documento). null = não é dispositivo. */
  proximo(tag: string, texto: string, ctx?: CtxDispositivo): DispositivoIndexado | null {
    const emDispositivo = !!(this.alinea || this.inciso)
    const c = classificarDispositivo(tag, texto, { ...ctx, emDispositivo: ctx?.emDispositivo ?? emDispositivo })
    if (c.tipo === 'texto' || !c.chave) return null
    let id = ''
    const idx = ORDEM_ESTRUT.indexOf(c.tipo)
    if (c.via === 'tag') {
      id = this.unico('sec-' + c.chave)
      this.artigo = ''; this.resetAbaixoDeArtigo()
    } else if (idx >= 0) {
      let pai = ''
      for (let i = idx - 1; i >= 0; i--) if (this.estrut[i]) { pai = this.estrut[i]; break }
      id = this.unico((pai ? pai + '.' : '') + PREFIXO[c.tipo] + c.chave)
      this.estrut[idx] = id
      for (let i = idx + 1; i < this.estrut.length; i++) this.estrut[i] = ''
      this.artigo = ''; this.resetAbaixoDeArtigo()
    } else if (c.tipo === 'artigo') {
      id = this.unico('art-' + c.chave); this.artigo = id; this.resetAbaixoDeArtigo()
    } else if (c.tipo === 'paragrafo') {
      id = this.unico((this.artigo || 'art') + '.par-' + c.chave); this.paragrafo = id; this.inciso = ''; this.alinea = ''
    } else if (c.tipo === 'inciso') {
      id = this.unico((this.paragrafo || this.artigo || 'art') + '.inc-' + c.chave); this.inciso = id; this.alinea = ''
    } else if (c.tipo === 'alinea') {
      id = this.unico((this.inciso || this.paragrafo || this.artigo || 'art') + '.al-' + c.chave); this.alinea = id
    } else {
      id = this.unico((this.alinea || this.inciso || this.paragrafo || this.artigo || 'art') + '.item-' + c.chave)
    }
    return { id, tipo: c.tipo, rotulo: c.rotulo ?? '', nivel: c.nivel }
  }
}
