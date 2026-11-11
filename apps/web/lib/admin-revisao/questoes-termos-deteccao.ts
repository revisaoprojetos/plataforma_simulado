import { plano } from './texto-plano'
import { chaveSemantica } from '@/lib/taxonomia/disciplina-semantica'
import type { ConfTermo, ProporNorm, TipoTermo, VarianteTermo } from './questoes-termos-tipos'

// DETECÇÃO de termos repetidos/variantes da taxonomia (PURA: sem I/O, testável). Estratégia em camadas, cada ligação com um score 0–100:
//   100  mesmo texto, mudando só acento, caixa, pontuação, espaços                         (alta)
//    94  mesmas palavras: ordem, artigos, plural/singular, abreviações (adm.→administrativo) (média)
//    92  disciplina: mesma matéria pelo nome ("Processo Civil" ≡ "Direito Processual Civil") (média)
//    88  sigla × nome por extenso (iniciais ou lista de aliases) — ex.: STF × Supremo Tribunal Federal (média)
//   ≤99  erro de digitação: similaridade (Levenshtein + trigramas) ≥ limiar E diferença só em palavras parecidas (baixa; ≥95 média)
// Salvaguardas contra falso positivo: números/algarismos romanos têm de coincidir ("Direito Penal I" ≠ "II", "Lei 8.112" ≠ "8.666");
// uma palavra que só existe de um lado ("Procurador do Estado" × "…de Alagoas") NÃO é variante; palavras diferentes de verdade
// ("Civil" × "Penal") não casam. Assuntos só são comparados dentro da MESMA disciplina.

const STOP = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'a', 'o', 'as', 'os', 'para', 'com', 'por', 'pela', 'pelo'])
// palavras institucionais que não distinguem a entidade (só para banca/órgão)
const STOP_INST = new Set(['instituto', 'fundacao', 'centro', 'associacao'])

const ABREV_COMUM: Record<string, string> = {
  arts: 'art', artigo: 'art', artigos: 'art', inciso: 'inc', incisos: 'inc', incs: 'inc', paragrafo: 'par', paragrafos: 'par', paragr: 'par',
  adm: 'administrativo', admin: 'administrativo', dir: 'direito', const: 'constitucional', constit: 'constitucional', civ: 'civil', pen: 'penal',
  proc: 'processual', processo: 'processual', processos: 'processual', prev: 'previdenciario', previd: 'previdenciario', trab: 'trabalho', amb: 'ambiental',
  internac: 'internacional', empres: 'empresarial', financ: 'financeiro', econ: 'economico',
}
const ABREV_TIPO: Partial<Record<TipoTermo, Record<string, string>>> = {
  disciplina: { trib: 'tributario' }, assunto: { trib: 'tributario' }, assunto_detalhe: { trib: 'tributario' },
  banca: { univ: 'universidade', inst: 'instituto', fund: 'fundacao' },
  orgao: { trib: 'tribunal', min: 'ministerio', sec: 'secretaria', univ: 'universidade', inst: 'instituto', fund: 'fundacao', prefeitura: 'prefeitura', munic: 'municipal' },
  cargo: { proc: 'procurador', adv: 'advogado', mun: 'municipio', munic: 'municipio', est: 'estado', fed: 'federal' },
}
// sufixos de concordância (plural/gênero) reduzidos a uma forma comum
const SINONIMO_TOK: Record<string, string> = { municipal: 'municipio', municipais: 'municipio', estadual: 'estado', estaduais: 'estado', federais: 'federal', leis: 'lei' }

// grupos de sigla ↔ nome por extenso (normalizados). Só equivalências inequívocas.
const ALIAS: string[][] = [
  ['fcc', 'fundacao carlos chagas'], ['cespe', 'cebraspe', 'cespe unb', 'cespe cebraspe', 'cebraspe cespe'], ['fgv', 'fundacao getulio vargas', 'fgv projetos'],
  ['agu', 'advocacia geral da uniao'], ['pgfn', 'procuradoria geral da fazenda nacional'], ['stf', 'supremo tribunal federal'], ['stj', 'superior tribunal de justica'],
  ['oab', 'ordem dos advogados do brasil'], ['unb', 'universidade de brasilia'], ['uerj', 'universidade do estado do rio de janeiro'],
  ['pge', 'procuradoria geral do estado'], ['pgm', 'procuradoria geral do municipio'], ['mpf', 'ministerio publico federal'], ['tcu', 'tribunal de contas da uniao'],
  ['cf', 'constituicao federal'], ['cf 88', 'cf 1988', 'constituicao federal de 1988', 'crfb'], ['cc', 'codigo civil'], ['cp', 'codigo penal'], ['cpc', 'codigo de processo civil'], ['cpp', 'codigo de processo penal'],
]
const aliasDe = (() => { const m = new Map<string, number>(); ALIAS.forEach((g, i) => g.forEach((x) => m.set(x, i))); return m })()

const ROMANO = /^[ivx]+$/

function stem(t: string): string {
  if (t.length > 4 && t.endsWith('oes')) return t.slice(0, -3) + 'ao'
  if (t.length > 4 && t.endsWith('ais')) return t.slice(0, -3) + 'al'
  if (t.length > 4 && t.endsWith('eis')) return t.slice(0, -3) + 'el'
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1)
  return t
}

/** Palavras significativas (normalizadas, abreviações expandidas, plural reduzido, artigos/preposições removidos). */
export function palavras(nome: string, tipo: TipoTermo): string[] {
  const ab = ABREV_TIPO[tipo] ?? {}
  const inst = tipo === 'banca' || tipo === 'orgao'
  return plano(nome).split(' ').filter(Boolean)
    .map((t) => ab[t] ?? ABREV_COMUM[t] ?? SINONIMO_TOK[t] ?? t)
    .filter((t) => !STOP.has(t) && !(inst && STOP_INST.has(t)))
    .map(stem)
}
const chavePalavras = (nome: string, tipo: TipoTermo) => [...new Set(palavras(nome, tipo))].sort().join(' ')
/** dígitos e algarismos romanos do texto, em ordem — têm de coincidir para haver similaridade */
const numeros = (s: string) => plano(s).split(' ').filter((t) => /^\d+$/.test(t) || ROMANO.test(t)).join(',')

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1))
    prev = cur
  }
  return prev[n]
}
const simLev = (a: string, b: string) => (a || b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 1)
function trigramas(s: string): Set<string> { const p = `  ${s} `; const o = new Set<string>(); for (let i = 0; i + 3 <= p.length; i++) o.add(p.slice(i, i + 3)); return o }
function jaccard(a: Set<string>, b: Set<string>): number { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1) }

/** Limpeza segura de espaços e pontuação final (sugestão de nome). */
export function tidy(s: string): string {
  return (s ?? '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').replace(/\s+([,;.:])/g, '$1').replace(/[\s.,;:]+$/g, '').trim()
}

interface Aresta { a: string; b: string; score: number; conf: ConfTermo; motivo: string }
const RANK: Record<ConfTermo, number> = { alta: 0, media: 1, baixa: 2 }
const ptbr = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })

/** Qualidade de escrita (maior = melhor): acentos, caixa mista, sem espaços duplicados/pontuação sobrando. */
export function qualidadeEscrita(nome: string): number {
  let q = 0
  const t = nome.trim()
  if (t === tidy(nome)) q += 2
  if (/[À-ÿ]/.test(t)) q += 2
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, '')
  const maius = letras.replace(/[^A-ZÀ-Þ]/g, '').length
  if (letras.length > 5 && maius === letras.length) q -= 3 // TUDO EM CAIXA ALTA (não é sigla)
  else if (letras.length > 3 && maius === 0) q -= 2 // tudo minúsculo
  else q += 1
  if (/\s{2,}|[–—]\s*(verificar|revisar)/i.test(nome)) q -= 2
  return q
}

export interface OpcDetec { tipo: TipoTermo; limiar: number /* 0.6–0.98 */; escopo?: (v: VarianteTermo) => string }
export interface GrupoBruto { variantes: VarianteTermo[]; canonicaId: string; confianca: ConfTermo; score: number; motivo: string; questoes: number }

export function detectarGrupos(itens: VarianteTermo[], o: OpcDetec): GrupoBruto[] {
  const { tipo } = o
  if (tipo === 'ano') return []
  const escopoDe = o.escopo ?? (() => '')
  const pai = new Map<string, string>(); for (const i of itens) pai.set(i.id, i.id)
  const find = (x: string): string => { let r = x; while (pai.get(r) !== r) { pai.set(r, pai.get(pai.get(r)!)!); r = pai.get(r)! } return r }
  const arestas: Aresta[] = []
  const ligar = (a: VarianteTermo, b: VarianteTermo, score: number, conf: ConfTermo, motivo: string) => {
    if (a.id === b.id) return
    arestas.push({ a: a.id, b: b.id, score, conf, motivo })
    const ra = find(a.id), rb = find(b.id); if (ra !== rb) pai.set(ra, rb)
  }
  const porEscopo = new Map<string, VarianteTermo[]>()
  for (const i of itens) { const k = escopoDe(i); (porEscopo.get(k) ?? porEscopo.set(k, []).get(k)!).push(i) }

  for (const lista of porEscopo.values()) {
    const bucket = (fn: (i: VarianteTermo) => string, score: number, conf: ConfTermo, motivo: string) => {
      const mp = new Map<string, VarianteTermo[]>()
      for (const i of lista) { const k = fn(i); if (k) (mp.get(k) ?? mp.set(k, []).get(k)!).push(i) }
      for (const g of mp.values()) for (let x = 1; x < g.length; x++) ligar(g[0], g[x], score, conf, motivo)
    }
    bucket((i) => plano(i.nome), 100, 'alta', 'Mesmo texto — muda só acento, maiúsculas, pontuação ou espaços')
    bucket((i) => chavePalavras(i.nome, tipo), 94, 'media', 'Mesmas palavras — muda ordem, artigos, plural/singular ou abreviação')
    if (tipo === 'disciplina') bucket((i) => chaveSemantica(i.nome), 92, 'media', 'Mesma matéria pelo nome (ex.: “Processo Civil” ≡ “Direito Processual Civil”)')

    // sigla × nome por extenso
    if (tipo === 'banca' || tipo === 'orgao' || tipo === 'assunto_detalhe' || tipo === 'assunto' || tipo === 'cargo') {
      bucket((i) => { const k = plano(i.nome); const a = aliasDe.get(k) ?? aliasDe.get(chavePalavras(i.nome, tipo).split(' ').join(' ')); return a == null ? '' : `a${a}` }, 88, 'media', 'Sigla e nome por extenso da mesma instituição/norma')
      const iniciais = new Map<string, VarianteTermo[]>()
      for (const i of lista) {
        const ts = plano(i.nome).split(' ').filter((t) => t && !STOP.has(t))
        if (ts.length >= 2 && ts.length <= 8) { const k = ts.map((t) => t[0]).join(''); (iniciais.get(k) ?? iniciais.set(k, []).get(k)!).push(i) }
      }
      for (const i of lista) {
        const p = plano(i.nome)
        if (/^[a-z]{2,7}$/.test(p) && iniciais.has(p)) for (const j of iniciais.get(p)!) ligar(i, j, 88, 'media', 'Sigla × nome por extenso (as iniciais batem) — confira')
      }
    }

    // erro de digitação (fuzzy)
    const pl = lista.map((i) => { const p = plano(i.nome); return { i, p, w: new Set(palavras(i.nome, tipo)), n: numeros(i.nome), tg: p.length >= 6 ? trigramas(p) : null } }).filter((x) => x.p.length >= 6)
    if (pl.length <= 4000) {
      for (let x = 0; x < pl.length; x++) for (let y = x + 1; y < pl.length; y++) {
        const A = pl[x], B = pl[y]
        if (A.n !== B.n || Math.abs(A.p.length - B.p.length) > Math.max(3, Math.round(Math.max(A.p.length, B.p.length) * 0.15))) continue
        if (find(A.i.id) === find(B.i.id)) continue
        // palavras que só existem de um lado: precisam ser pares parecidos (typo), na mesma quantidade
        const so1 = [...A.w].filter((t) => !B.w.has(t)), so2 = [...B.w].filter((t) => !A.w.has(t))
        if (!so1.length || so1.length !== so2.length || so1.length > 2) continue
        const usados = new Set<string>(); let ok = true
        for (const t of so1) {
          const par = so2.find((u) => !usados.has(u) && (t.length >= 4 && u.length >= 4) && simLev(t, u) >= 0.7)
          if (!par) { ok = false; break }
          usados.add(par)
        }
        if (!ok) continue
        const s = 0.5 * simLev(A.p, B.p) + 0.5 * (A.tg && B.tg ? jaccard(A.tg, B.tg) : 0)
        if (s >= o.limiar) { const sc = Math.min(99, Math.round(s * 100)); ligar(A.i, B.i, sc, sc >= 95 ? 'media' : 'baixa', 'Nomes muito parecidos (possível erro de digitação) — confira antes') }
      }
    }
  }

  const por = new Map<string, VarianteTermo[]>(); for (const i of itens) (por.get(find(i.id)) ?? por.set(find(i.id), []).get(find(i.id))!).push(i)
  const pior = new Map<string, { c: ConfTermo; m: string; s: number }>()
  for (const e of arestas) {
    const r = find(e.a); const p = pior.get(r)
    if (!p) pior.set(r, { c: e.conf, m: e.motivo, s: e.score })
    else { if (RANK[e.conf] > RANK[p.c]) { p.c = e.conf; p.m = e.motivo } if (e.score < p.s) p.s = e.score }
  }
  const out: GrupoBruto[] = []
  for (const [r, g] of por) {
    if (g.length < 2) continue
    const ord = [...g].sort((a, b) => b.questoes - a.questoes || qualidadeEscrita(b.nome) - qualidadeEscrita(a.nome) || a.nome.length - b.nome.length || ptbr(a.nome, b.nome))
    const pr = pior.get(r)!
    const grande = g.length > 8
    out.push({ variantes: ord, canonicaId: ord[0].id, confianca: grande ? 'baixa' : pr.c, score: pr.s, motivo: grande ? `${pr.m} (grupo grande: ${g.length} termos — revise um a um)` : pr.m, questoes: g.reduce((s, x) => s + x.questoes, 0) })
  }
  return out.sort((a, b) => RANK[a.confianca] - RANK[b.confianca] || b.questoes - a.questoes || ptbr(a.variantes[0].nome, b.variantes[0].nome))
}

/** Texto canônico que identifica o grupo (para o hash "São termos diferentes"). */
export const chaveDoGrupo = (tipo: TipoTermo, vs: VarianteTermo[]) => `${tipo}|${vs.map((v) => plano(v.nome) + (v.paiId ? `@${v.paiId}` : '')).sort().join('|')}`

// ───────────────────────── normalização em lote de texto livre ─────────────────────────
const PEQUENAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'a', 'o', 'as', 'os', 'ao', 'aos', 'para', 'com', 'por', 'ou'])
function titulo(s: string): string {
  return s.toLowerCase().split(' ').map((w, i) => {
    if (!w) return w
    if (i > 0 && PEQUENAS.has(w)) return w
    if (ROMANO.test(w) && w.length <= 4) return w.toUpperCase()
    return w.charAt(0).toUpperCase() + w.slice(1)
  }).join(' ')
}
/** Propostas seguras de normalização de um valor de texto livre: espaços, pontuação final e caixa (tudo maiúsculo / tudo minúsculo). */
export function proporNormalizacao(valor: string): { para: string; motivo: string } | null {
  const motivos: string[] = []
  let t = valor
  if (/[​-‍﻿]/.test(t) || /\s{2,}/.test(t) || t !== t.trim() || /\s+[,;:]/.test(t)) { t = t.replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').replace(/\s+([,;:])/g, '$1').trim(); motivos.push('espaços') }
  // ponto final de abreviação ("etc.", "art.", "Ltda.") faz parte do texto: só tira pontuação final de frase/lista
  if (/[.,;:]+$/.test(t) && !/(^|\s)(etc|art|arts|inc|par|cf|ex|obs|ltda|s\.a|dr|dra|nº|n)\.$/i.test(t) && !/\s[A-Za-zÀ-ÿ]{1,3}\.$/.test(t)) { t = t.replace(/[.,;:\s]+$/g, ''); motivos.push('pontuação final') }
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, '')
  const maius = letras.replace(/[^A-ZÀ-Þ]/g, '').length
  if (letras.length > 5 && t.includes(' ') && maius === letras.length) { t = titulo(t); motivos.push('TUDO EM MAIÚSCULAS') }
  else if (letras.length > 5 && t.includes(' ') && maius === 0) { t = titulo(t); motivos.push('tudo em minúsculas') }
  return t !== valor && t ? { para: t, motivo: motivos.join(' + ') } : null
}
export function proporLote(valores: { nome: string; questoes: number }[]): ProporNorm[] {
  const out: ProporNorm[] = []
  for (const v of valores) { const p = proporNormalizacao(v.nome); if (p) out.push({ de: v.nome, para: p.para, questoes: v.questoes, motivo: p.motivo }) }
  return out
}
