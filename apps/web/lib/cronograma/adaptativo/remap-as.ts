/**
 * REMAPEAMENTO POR CHAVE DE DOCUMENTO do Cronograma Adaptativo (módulo PURO — sem server-only; testado em __tests__/remap-as.test.ts).
 *
 * PROBLEMA: os ids de meta são POSICIONAIS (pf:<i>, fl:<i>, qu:<i>, pp:<i>:<k>, rf:<s>:<i>, ...), onde i = índice da aula em AS
 * (montado em conteudo-banco.ts a partir dos documentos publicados da Biblioteca, por disciplina e título). Se um documento é
 * despublicado/apagado/movido/recriado, as aulas seguintes deslocam e tudo o que o aluno gravou passa a apontar para a aula errada.
 *
 * SOLUÇÃO: o plano guarda a ASSINATURA do AS com que foi gerado/sincronizado (cfg.chavesAS = chave estável de cada aula, na
 * ordem de AS; cfg.discsAS = disciplina de cada posição; cfg.sigAS = hash curto dos dois). A chave estável é a de
 * catalogo-override.ts (chavesUnicas): `d:<uuid do documento>` (aula com documento) · `t:<disc>|<tema>` · `c:<id>` (aula criada
 * no admin). Quando a assinatura gravada difere do AS atual, `remapearEstado` converte TODAS as estruturas posicionais
 * índice_antigo → índice_novo pela CHAVE:
 *   · aula que continua            → o índice muda, o progresso acompanha a aula;
 *   · documento que SUMIU          → meta ÓRFÃ `og:<chave>:<modelo>` (o slot NÃO é reaproveitado; o progresso fica guardado e
 *                                    VOLTA se o documento voltar; a grade/contadores ficam guardados em cfg.orfas[chave]);
 *   · documento NOVO               → entra no AS sem herdar nada.
 * Nunca se "adivinha": só o que tem a mesma chave migra. O número pf:<posição> segue como apelido/rótulo interno; quem diz "qual
 * aula é esta meta" é `resolverAulaDaMeta` (via chave do documento).
 */

export type Grade = Record<string, [string, number]>
export type RevsMap = Record<string, Array<[string, string]>>
type Obj = Record<string, unknown>

export interface AssinaturaAS { chaves: string[]; discs: string[] }

/** Hash curto e determinístico da assinatura (chaves + disciplinas, na ordem). */
export function hashAS(chaves: string[], discs: string[] = []): string {
  let h1 = 0x811c9dc5, h2 = 0x9747b28c
  const s = chaves.map((c, i) => c + '\u0001' + (discs[i] ?? '')).join('\u0002')
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0; h2 = (h2 ^ (h2 >>> 13)) >>> 0
  }
  return `${h1.toString(36)}${h2.toString(36)}:${chaves.length}`
}

/** Lê a assinatura gravada no cfg do plano (null = plano legado, sem assinatura). */
export function assinaturaDoCfg(cfg: Obj | null | undefined): AssinaturaAS | null {
  const c = cfg?.chavesAS
  if (!Array.isArray(c) || !c.every((x) => typeof x === 'string')) return null
  const d = Array.isArray(cfg?.discsAS) ? (cfg!.discsAS as unknown[]).map((x) => String(x ?? '')) : []
  return { chaves: c as string[], discs: d.length === c.length ? d : c.map(() => '') }
}

/** Campos de assinatura a gravar no cfg. */
export function camposAssinatura(a: AssinaturaAS): { chavesAS: string[]; discsAS: string[]; sigAS: string } {
  return { chavesAS: a.chaves, discsAS: a.discs, sigAS: hashAS(a.chaves, a.discs) }
}

// ── mapa índice antigo → novo, por chave ─────────────────────────────────────────────────────────
export interface MapaAS {
  antigas: string[]
  novas: string[]
  /** chave → índice no AS novo */
  novoIdx: Map<string, number>
  /** índice antigo → índice novo (só aulas que continuam) */
  paraNovo: Map<number, number>
  /** índices ANTIGOS cujo documento sumiu */
  orfas: number[]
  /** índices NOVOS cujo documento não existia na assinatura antiga */
  novasIdx: number[]
}

export function mapaPorChave(antigas: string[], novas: string[]): MapaAS {
  const novoIdx = new Map<string, number>()
  novas.forEach((k, i) => { if (!novoIdx.has(k)) novoIdx.set(k, i) })
  const paraNovo = new Map<number, number>(), orfas: number[] = [], vistas = new Set<string>()
  antigas.forEach((k, i) => {
    const j = novoIdx.get(k)
    if (j == null || vistas.has(k)) orfas.push(i); else paraNovo.set(i, j)
    vistas.add(k)
  })
  const antigasSet = new Set(antigas)
  const novasIdx = novas.map((k, i) => (antigasSet.has(k) ? -1 : i)).filter((i) => i >= 0)
  return { antigas, novas, novoIdx, paraNovo, orfas, novasIdx }
}

// ── ids ──────────────────────────────────────────────────────────────────────────────────────────
export interface ParteAula { pre: string; idx: number; pos: string }
/** Parte posicional de um id de meta de aula (null = lp/jp/og/inválido). `pre` + idx + `pos` reconstitui o id. */
export function parteAula(id: string): ParteAula | null {
  let m = /^(pf|fl|qu|pp):(\d{1,6})((?::.*)?)$/.exec(id)
  if (m) return { pre: `${m[1]}:`, idx: Number(m[2]), pos: m[3] }
  m = /^(rf|rq):(\d{1,6}):(\d{1,6})$/.exec(id)
  if (m) return { pre: `${m[1]}:${m[2]}:`, idx: Number(m[3]), pos: '' }
  return null
}
const preencher = (tpl: string, idx: number): string => tpl.replace('#', String(idx))

export const PREFIXO_ORFA = 'og:'
export const idOrfao = (chave: string, tpl: string): string => `${PREFIXO_ORFA}${encodeURIComponent(chave)}:${tpl}`
export function lerOrfao(id: string): { chave: string; tpl: string } | null {
  const m = /^og:([^:]+):(.+)$/.exec(id)
  if (!m) return null
  let chave: string
  try { chave = decodeURIComponent(m[1]) } catch { return null }
  return { chave, tpl: m[2] }
}
export const ehMetaOrfa = (id: string): boolean => id.startsWith(PREFIXO_ORFA)

/** uuid do documento de uma chave `d:<uuid>[#n]` (null para t:/c:). */
export function docIdDaChave(chave: string | null | undefined): string | null {
  const m = /^d:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:#\d+)?$/i.exec(chave ?? '')
  return m ? m[1].toLowerCase() : null
}

export type TipoId = 'igual' | 'movida' | 'restaurada' | 'orfa'
export interface ResultadoId { tipo: TipoId; id: string; chave?: string; tpl?: string }

export function remapearId(id: string, m: MapaAS): ResultadoId {
  const o = lerOrfao(id)
  if (o) {
    const j = m.novoIdx.get(o.chave)
    return j == null ? { tipo: 'igual', id, chave: o.chave, tpl: o.tpl } : { tipo: 'restaurada', id: preencher(o.tpl, j), chave: o.chave, tpl: o.tpl }
  }
  const p = parteAula(id)
  if (!p) return { tipo: 'igual', id }
  const tpl = `${p.pre}#${p.pos}`
  const j = m.paraNovo.get(p.idx)
  if (j != null) return j === p.idx ? { tipo: 'igual', id } : { tipo: 'movida', id: preencher(tpl, j) }
  const chave = m.antigas[p.idx] ?? `i:${p.idx}` // índice fora da assinatura antiga: dado inconsistente → órfão sem volta
  return { tipo: 'orfa', id: idOrfao(chave, tpl), chave, tpl }
}

/** Resolve QUAL AULA é uma meta, pela chave do documento (e não pelo número). `chavesAtuais` só para plano legado sem assinatura. */
export interface AulaDaMeta { tipo: string; indice: number | null; chave: string | null; docId: string | null; orfa: boolean; apelido: string }
export function resolverAulaDaMeta(plano: { cfg?: Obj | null } | null | undefined, metaId: string, chavesAtuais?: string[]): AulaDaMeta | null {
  const o = lerOrfao(metaId)
  if (o) return { tipo: o.tpl.split(':')[0], indice: null, chave: o.chave, docId: docIdDaChave(o.chave), orfa: true, apelido: o.tpl }
  const p = parteAula(metaId)
  if (!p) return null
  const lista = assinaturaDoCfg(plano?.cfg ?? null)?.chaves ?? chavesAtuais ?? []
  const chave = lista[p.idx] ?? null
  return { tipo: p.pre.split(':')[0], indice: p.idx, chave, docId: docIdDaChave(chave), orfa: chave == null, apelido: metaId }
}

// ── estado completo ──────────────────────────────────────────────────────────────────────────────
export interface Orfa {
  pag?: number; partes?: number
  plano?: Record<string, [string, number]>
  revs?: Array<[string, string, string]> // [semana, modelo do id, data]
  rem?: Record<string, unknown>; sob?: Record<string, unknown>; ref?: Record<string, unknown>
}
export interface EntradaRemap<M extends { meta_id: string }> {
  cfg: Obj
  plano: Grade
  revs: RevsMap
  detalhes: Record<string, Obj>
  metas: M[]
}
export interface StatsRemap {
  aulasMovidas: number; aulasOrfas: number; aulasNovas: number
  metasMovidas: number; metasOrfas: number; metasRestauradas: number; gradeRemovida: number
}
export interface SaidaRemap<M extends { meta_id: string }> extends EntradaRemap<M> {
  stats: StatsRemap
  /** metas (linhas) cujo id mudou: de → para */
  mudancas: Array<{ de: string; para: string }>
}

const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null)) as T

/** "Já estuda pelo Revisão?": cfg.ultimosTemas[disc] = posição (0-based) da última aula estudada DENTRO da disciplina. Conservador: nunca marca mais aulas. */
export function remapearUltimosTemas(ut: unknown, antiga: AssinaturaAS, nova: AssinaturaAS): Record<string, number> | undefined {
  if (!ut || typeof ut !== 'object') return undefined
  const out: Record<string, number> = {}
  for (const [disc, lim] of Object.entries(ut as Record<string, unknown>)) {
    if (typeof lim !== 'number' || !Number.isFinite(lim)) { out[disc] = lim as number; continue }
    if (lim < 0) { out[disc] = lim; continue }
    const velhas = antiga.chaves.filter((_, i) => antiga.discs[i] === disc)
    const membros = new Set(velhas.slice(0, lim + 1))
    const novasDisc = nova.chaves.filter((_, i) => nova.discs[i] === disc)
    let n = -1
    for (let k = 0; k < novasDisc.length; k++) { if (membros.has(novasDisc[k])) n = k; else break }
    if (n >= 0) out[disc] = n
  }
  return out
}

export function remapearEstado<M extends { meta_id: string }>(
  ent: EntradaRemap<M>, antiga: AssinaturaAS, nova: AssinaturaAS,
): SaidaRemap<M> {
  const m = mapaPorChave(antiga.chaves, nova.chaves)
  const cfg: Obj = clone(ent.cfg)
  const orfas: Record<string, Orfa> = clone(obj(cfg.orfas)) as Record<string, Orfa>
  const orfa = (chave: string): Orfa => (orfas[chave] ||= {})
  const stats: StatsRemap = { aulasMovidas: 0, aulasOrfas: m.orfas.length, aulasNovas: m.novasIdx.length, metasMovidas: 0, metasOrfas: 0, metasRestauradas: 0, gradeRemovida: 0 }
  for (const [i, j] of m.paraNovo) if (i !== j) stats.aulasMovidas++

  // 1) linhas de progresso (meta_id → novo id) ─────────────────────────────────────────────────────
  const idsLinhas = new Set(ent.metas.map((x) => x.meta_id))
  const restauradasIds = new Set<string>()
  const mudancas: Array<{ de: string; para: string }> = []
  const metas = ent.metas.map((x) => {
    const r = remapearId(x.meta_id, m)
    if (r.tipo === 'igual') return x
    mudancas.push({ de: x.meta_id, para: r.id })
    if (r.tipo === 'orfa') stats.metasOrfas++; else if (r.tipo === 'restaurada') { stats.metasRestauradas++; restauradasIds.add(r.id) } else stats.metasMovidas++
    return { ...x, meta_id: r.id }
  })
  const temLinha = (id: string) => idsLinhas.has(id)

  // 2) grade ───────────────────────────────────────────────────────────────────────────────────────
  const plano: Grade = {}
  for (const [id, v] of Object.entries(ent.plano || {})) {
    const r = remapearId(id, m)
    if (r.tipo === 'igual' || r.tipo === 'movida') plano[r.id] = v
    else if (r.tipo === 'orfa') {
      if (temLinha(id)) (orfa(r.chave!).plano ||= {})[r.tpl!] = v // só vale guardar quando há progresso a ressuscitar
      else stats.gradeRemovida++
    }
  }

  // 3) revisões congeladas (revs[semana] = [[id, data]]) ───────────────────────────────────────────
  const revs: RevsMap = {}
  for (const [sem, lista] of Object.entries(ent.revs || {})) {
    const out: Array<[string, string]> = []
    for (const par of Array.isArray(lista) ? lista : []) {
      const [id, data] = par
      const r = remapearId(String(id), m)
      if (r.tipo === 'igual' || r.tipo === 'movida') out.push([r.id, data])
      else if (r.tipo === 'orfa' && temLinha(String(id))) (orfa(r.chave!).revs ||= []).push([sem, r.tpl!, data])
    }
    revs[sem] = out
  }

  // 4) cfg: contadores por aula (índice → n) e mapas por meta ───────────────────────────────────────
  for (const campo of ['paginasLidas', 'partesLidas'] as const) {
    const src = obj(cfg[campo]); if (!Object.keys(src).length && cfg[campo] === undefined) continue
    const dst: Obj = {}
    for (const [k, n] of Object.entries(src)) {
      if (!/^\d{1,6}$/.test(k)) { dst[k] = n; continue }
      const j = m.paraNovo.get(Number(k))
      if (j != null) dst[String(j)] = n
      else { const chave = m.antigas[Number(k)] ?? `i:${k}`; const o = orfa(chave); if (campo === 'paginasLidas') o.pag = Number(n); else o.partes = Number(n) }
    }
    cfg[campo] = dst
  }
  const mapaPorMeta = (campo: 'remanejadas' | 'sobras' | 'reforcosHistorico', slot: 'rem' | 'sob' | 'ref') => {
    if (cfg[campo] === undefined) return
    const dst: Obj = {}
    for (const [id, v] of Object.entries(obj(cfg[campo]))) {
      const r = remapearId(id, m)
      if (r.tipo === 'igual' || r.tipo === 'movida') dst[r.id] = remapearInternos(v, m)
      else if (r.tipo === 'orfa' && temLinha(id)) (orfa(r.chave!)[slot] ||= {})[r.tpl!] = v
    }
    cfg[campo] = dst
  }
  mapaPorMeta('remanejadas', 'rem'); mapaPorMeta('sobras', 'sob'); mapaPorMeta('reforcosHistorico', 'ref')
  if (cfg.ultimosTemas !== undefined) {
    const u = remapearUltimosTemas(cfg.ultimosTemas, antiga, nova)
    if (u) cfg.ultimosTemas = u; else delete cfg.ultimosTemas
  }

  // 5) detalhes por meta ────────────────────────────────────────────────────────────────────────────
  const detalhes: Record<string, Obj> = {}
  for (const [id, d] of Object.entries(ent.detalhes || {})) {
    const r = remapearId(id, m)
    if (r.tipo === 'igual' || r.tipo === 'movida') detalhes[r.id] = remapearInternos(d, m) as Obj
  }

  // 6) RESTAURA o que estava órfão e cujo documento voltou ────────────────────────────────────────
  for (const chave of Object.keys(orfas)) {
    const j = m.novoIdx.get(chave); if (j == null) continue
    const o = orfas[chave]
    const pl = obj(cfg.paginasLidas), pa = obj(cfg.partesLidas)
    if (o.pag != null && pl[String(j)] === undefined) pl[String(j)] = o.pag
    if (o.partes != null && pa[String(j)] === undefined) pa[String(j)] = o.partes
    if (o.pag != null) cfg.paginasLidas = pl
    if (o.partes != null) cfg.partesLidas = pa
    for (const [tpl, v] of Object.entries(o.plano ?? {})) { const id = preencher(tpl, j); if (restauradasIds.has(id) && !(id in plano)) plano[id] = v }
    for (const [sem, tpl, data] of o.revs ?? []) {
      const id = preencher(tpl, j); if (!restauradasIds.has(id)) continue
      const lista = (revs[sem] ||= []); if (!lista.some(([x]) => x === id)) lista.push([id, data])
    }
    for (const [slot, campo] of [['rem', 'remanejadas'], ['sob', 'sobras'], ['ref', 'reforcosHistorico']] as const) {
      for (const [tpl, v] of Object.entries(o[slot] ?? {})) {
        const id = preencher(tpl, j); if (!restauradasIds.has(id)) continue
        const dst = obj(cfg[campo]); if (!(id in dst)) { dst[id] = remapearInternos(v, m); cfg[campo] = dst }
      }
    }
    delete orfas[chave]
  }
  if (Object.keys(orfas).length) cfg.orfas = orfas; else delete cfg.orfas

  return { cfg, plano, revs, detalhes, metas, stats, mudancas }
}

/** ids de meta guardados DENTRO de valores (detalhe.origem/pai, geracao 'reforco:<id>', reforcosHistorico.id): remapeia os que mudaram; referência órfã é removida. */
function remapearInternos(v: unknown, m: MapaAS): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v
  const out: Obj = { ...(v as Obj) }
  const refId = (s: unknown): string | null | undefined => { // undefined = não é id; null = órfão
    if (typeof s !== 'string' || !parteAula(s)) return undefined
    const r = remapearId(s, m); return r.tipo === 'orfa' ? null : r.id
  }
  for (const k of ['origem', 'pai', 'id']) {
    const r = refId(out[k]); if (r === undefined) continue
    if (r === null) delete out[k]; else out[k] = r
  }
  if (typeof out.geracao === 'string') {
    const mm = /^(reforco:)(.+)$/.exec(out.geracao)
    if (mm) { const r = refId(mm[2]); if (r === null) delete out.geracao; else if (r !== undefined) out.geracao = mm[1] + r }
  }
  if (out.detalhe && typeof out.detalhe === 'object') out.detalhe = remapearInternos(out.detalhe, m)
  return out
}
