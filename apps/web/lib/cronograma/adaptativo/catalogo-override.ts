/**
 * EDIÇÃO DO CATÁLOGO DE METAS por plataforma (admin › Cronograma adaptativo › Catálogo de metas).
 *
 * O catálogo-base vem da Biblioteca + catalogo-html.json (modelo 2.9). O admin pode ajustar sem mexer na
 * Biblioteca: número/título/páginas/links (QConcursos, TEC) das aulas, ativar/desativar, reordenar,
 * criar aulas novas e editar/criar/reordenar metas de LegProc. As edições ficam num OVERLAY (só o que mudou),
 * aplicado por cima do catálogo-base em `aplicarOverride`.
 *
 * REGRAS QUE PROTEGEM OS PLANOS DOS ALUNOS (as metas usam a POSIÇÃO da aula em AS: `pf:<i>`):
 *  · AS é APPEND-ONLY: as aulas-base nunca mudam de posição nem somem; aulas novas são ANEXADAS ao fim
 *    (e, se removidas, ficam como "ativo:false" — a posição não é reaproveitada).
 *  · "Desativar" tira a aula da ORDEM de distribuição (não de AS); "reordenar" mexe só na ORDEM.
 *  · Metas de LegProc têm id textual estável (`lp:<lei>:<n>`); editar o texto não muda o id nem a chave de
 *    agrupamento da lei (`lei`), então regras de blocos/rodízio seguem iguais.
 *
 * Módulo PURO (sem 'server-only'): usado no servidor (loader) e no editor do admin (cliente).
 */

import type { AS } from './engine'
import type { ItemLP } from './motor28'

export interface MateriaisOv { pdflashPaginas?: number | null; pdfightPaginas?: number | null; videoaula?: string | null; atualizacao?: string | null }
export interface AulaOv { ativo?: boolean; num?: string; tema?: string; pags?: number; qc?: string; tec?: string; mat?: MateriaisOv }
export interface AulaNova { k: string; disc: string; num: string; tema: string; pags: number; qc: string; tec: string; ativo?: boolean; mat?: MateriaisOv }
export interface LpOv { ativo?: boolean; leiNome?: string; trecho?: string }
export interface LpNova { id: string; disc: string; leiNome: string; trecho: string }
export interface CatalogoOverride {
  v: 1
  aulas: Record<string, AulaOv>
  novas: AulaNova[]
  /** chaves das aulas ATIVAS na ordem global de distribuição (ausente = ordem do catálogo-base). */
  ordem?: string[]
  lp: Record<string, LpOv>
  lpNovas: LpNova[]
  /** ids das metas de LegProc ATIVAS na ordem de distribuição (ausente = ordem do catálogo-base). */
  lpOrdem?: string[]
}

export const OVERRIDE_VAZIO: CatalogoOverride = { v: 1, aulas: {}, novas: [], lp: {}, lpNovas: [] }

export const overrideVazio = (o: CatalogoOverride | null | undefined): boolean =>
  !o || (!Object.keys(o.aulas).length && !o.novas.length && !o.ordem && !Object.keys(o.lp).length && !o.lpNovas.length && !o.lpOrdem)

/** Id do catálogo efetivo: muda a cada versão do overlay → os planos dos alunos migram uma vez (preservando o feito). */
export const catalogoIdEfetivo = (baseId: string, versao: number): string => (versao > 0 ? `${baseId}-o${versao}` : baseId)

// ── chaves ───────────────────────────────────────────────────────────────────────────────────────
/** Chave estável da aula: id do doc da Biblioteca; senão disciplina|tema. (8º campo = chave original quando o tema foi editado.) */
export const chaveBaseAula = (e: AS[number]): string => (e[7] ? String(e[7]) : e[6] ? `d:${e[6]}` : `t:${e[0]}|${e[2]}`)

/** Chaves únicas por posição (duplicatas ganham sufixo #n) — a ordem usa chaves, então não pode haver repetição. */
export function chavesUnicas(AS: AS): string[] {
  const vistas = new Map<string, number>()
  return AS.map((e) => {
    const k = chaveBaseAula(e), n = (vistas.get(k) ?? 0) + 1
    vistas.set(k, n)
    return n === 1 ? k : `${k}#${n}`
  })
}

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function partirTexto(texto: string): { leiNome: string; trecho: string } {
  const i = String(texto || '').indexOf(' — ')
  return i < 0 ? { leiNome: String(texto || ''), trecho: '' } : { leiNome: texto.slice(0, i), trecho: texto.slice(i + 3) }
}
export const comporTexto = (leiNome: string, trecho: string): string => (trecho ? `${leiNome} — ${trecho}` : leiNome)

// ── ordem efetiva (compartilhada servidor × editor) ──────────────────────────────────────────────
/**
 * Ordem de distribuição efetiva. `baseOrdem` = ordem do catálogo-base (só chaves ativas nele); `todas` = todas as
 * chaves na ordem de posição (base + novas); `ativo` decide quem entra. Quem estiver ativo e fora da lista salva
 * (nova aula, aula reativada, aula nova no catálogo-base) vai para o FIM, na ordem de posição.
 */
export function ordemEfetiva(baseOrdem: string[], todas: string[], ativo: (k: string) => boolean, ovOrdem?: string[]): string[] {
  const ativos = new Set(todas.filter(ativo)), vistos = new Set<string>(), out: string[] = []
  const push = (k: string) => { if (ativos.has(k) && !vistos.has(k)) { vistos.add(k); out.push(k) } }
  ;(ovOrdem ?? baseOrdem).forEach(push)
  baseOrdem.forEach(push)
  todas.forEach(push)
  return out
}

/** Sobe/desce `k` dentro da sua disciplina, mantendo o "desenho" de intercalação entre disciplinas. */
export function moverNaDisciplina(ordem: string[], discDe: (k: string) => string, k: string, dir: -1 | 1): string[] {
  const disc = discDe(k)
  const pos = ordem.map((x, i) => (discDe(x) === disc ? i : -1)).filter((i) => i >= 0)
  const j = pos.findIndex((i) => ordem[i] === k)
  const alvo = j + dir
  if (j < 0 || alvo < 0 || alvo >= pos.length) return ordem
  const out = [...ordem]
  ;[out[pos[j]], out[pos[alvo]]] = [out[pos[alvo]], out[pos[j]]]
  return out
}

// ── aplicação sobre o catálogo (tuplas do motor) ─────────────────────────────────────────────────
export interface ConteudoParaOverride { AS: AS; ordem?: number[]; LP?: ItemLP[] }
export interface ConteudoComOverride { AS: AS; ordem: number[] | undefined; LP: ItemLP[]; chaves: string[] }

export function aplicarOverride(c: ConteudoParaOverride, ov: CatalogoOverride | null | undefined): ConteudoComOverride {
  const chavesBase = chavesUnicas(c.AS)
  if (overrideVazio(ov) || !ov) return { AS: c.AS, ordem: c.ordem, LP: c.LP ?? [], chaves: chavesBase }

  // ── aulas ──
  const AS2: AS = c.AS.map((e) => [...e] as AS[number])
  const chaves = [...chavesBase]
  const idxPorChave = new Map<string, number>()
  chaves.forEach((k, i) => { if (!idxPorChave.has(k)) idxPorChave.set(k, i) })
  for (const [k, o] of Object.entries(ov.aulas)) {
    const i = idxPorChave.get(k); if (i == null) continue
    const e = AS2[i]
    if (o.num != null) e[1] = o.num
    if (o.tema != null && o.tema !== e[2]) { if (!e[6] && !e[7]) e[7] = chavesBase[i]; e[2] = o.tema }
    if (o.pags != null) e[3] = o.pags
    if (o.qc != null) e[4] = o.qc
    if (o.tec != null) e[5] = o.tec
  }
  const novaPorChave = new Map<string, AulaNova>()
  for (const n of ov.novas) {
    if (idxPorChave.has(n.k)) continue
    idxPorChave.set(n.k, AS2.length); chaves.push(n.k); novaPorChave.set(n.k, n)
    AS2.push([n.disc, n.num, n.tema, n.pags, n.qc, n.tec, undefined, n.k])
  }
  const baseOrdemIdx = c.ordem && c.ordem.length ? c.ordem : c.AS.map((_, i) => i)
  const baseOrdemKeys = baseOrdemIdx.map((i) => chavesBase[i]).filter(Boolean)
  const baseAtivas = new Set(baseOrdemKeys)
  const ativo = (k: string): boolean => {
    const o = ov.aulas[k]; if (o && o.ativo != null) return o.ativo
    const n = novaPorChave.get(k); if (n) return n.ativo !== false
    return baseAtivas.has(k)
  }
  const ordemKeys = ordemEfetiva(baseOrdemKeys, chaves, ativo, ov.ordem)
  const ordem = ordemKeys.map((k) => idxPorChave.get(k)).filter((i): i is number => i != null)

  // ── LegProc ──
  const baseLP = c.LP ?? []
  const LP2: ItemLP[] = baseLP.map((x) => ({ ...x }))
  const lpPorId = new Map(LP2.map((x) => [x.id, x]))
  for (const [id, o] of Object.entries(ov.lp)) {
    const it = lpPorId.get(id); if (!it || (o.leiNome == null && o.trecho == null)) continue
    const p = partirTexto(it.texto)
    it.texto = comporTexto(o.leiNome ?? p.leiNome, o.trecho ?? p.trecho)
  }
  // chave de agrupamento da lei: metas novas com o MESMO nome de uma lei existente entram no mesmo grupo
  const leiPorNome = new Map<string, string>()
  for (const x of baseLP) leiPorNome.set(`${norm(x.disc)}|${norm(partirTexto(x.texto).leiNome)}`, x.lei)
  for (const n of ov.lpNovas) {
    if (lpPorId.has(n.id)) continue
    const nk = `${norm(n.disc)}|${norm(n.leiNome)}`
    const it: ItemLP = { id: n.id, disc: n.disc, lei: leiPorNome.get(nk) ?? `ov:${nk}`, texto: comporTexto(n.leiNome, n.trecho), doc: null, min: 30 }
    leiPorNome.set(nk, it.lei); LP2.push(it); lpPorId.set(it.id, it)
  }
  const ordemLp = ordemEfetiva(baseLP.map((x) => x.id), LP2.map((x) => x.id), (id) => ov.lp[id]?.ativo !== false, ov.lpOrdem)
  const LP = ordemLp.map((id) => lpPorId.get(id)!).filter(Boolean)

  return { AS: AS2, ordem, LP, chaves }
}

// ── validação/normalização (servidor, ao salvar; também ao ler do banco) ────────────────────────
const txt = (v: unknown, max: number): string => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
/** Link: http(s) ou termo de busca livre; qualquer outro esquema (javascript:, data:, mailto:…) é descartado. */
export function linkSeguro(v: unknown): string {
  const s = txt(v, 1200); if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? '' : s
}
const inteiro = (v: unknown, min: number, max: number): number | undefined => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : undefined }
const mat = (m: unknown): MateriaisOv | undefined => {
  if (!m || typeof m !== 'object') return undefined
  const r = m as Record<string, unknown>, out: MateriaisOv = {}
  if ('pdflashPaginas' in r) out.pdflashPaginas = r.pdflashPaginas == null || r.pdflashPaginas === '' ? null : inteiro(r.pdflashPaginas, 0, 5000) ?? null
  if ('pdfightPaginas' in r) out.pdfightPaginas = r.pdfightPaginas == null || r.pdfightPaginas === '' ? null : inteiro(r.pdfightPaginas, 0, 5000) ?? null
  if ('videoaula' in r) out.videoaula = txt(r.videoaula, 40) || null
  if ('atualizacao' in r) out.atualizacao = txt(r.atualizacao, 20) || null
  return Object.keys(out).length ? out : undefined
}

export function normalizarOverride(raw: unknown): CatalogoOverride {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: CatalogoOverride = { v: 1, aulas: {}, novas: [], lp: {}, lpNovas: [] }
  const aulas = (r.aulas && typeof r.aulas === 'object' ? r.aulas : {}) as Record<string, Record<string, unknown>>
  for (const [k, o] of Object.entries(aulas).slice(0, 4000)) {
    if (!o || typeof o !== 'object') continue
    const key = txt(k, 240); if (!key) continue
    const a: AulaOv = {}
    if (typeof o.ativo === 'boolean') a.ativo = o.ativo
    if (o.num != null) a.num = txt(o.num, 12)
    if (o.tema != null) { const t = txt(o.tema, 220); if (t) a.tema = t }
    if (o.pags != null) { const p = inteiro(o.pags, 0, 5000); if (p != null) a.pags = p }
    if (o.qc != null) a.qc = linkSeguro(o.qc)
    if (o.tec != null) a.tec = linkSeguro(o.tec)
    const m = mat(o.mat); if (m) a.mat = m
    if (Object.keys(a).length) out.aulas[key] = a
  }
  const vistosN = new Set<string>()
  for (const n of (Array.isArray(r.novas) ? r.novas : []).slice(0, 600) as Array<Record<string, unknown>>) {
    const k = txt(n?.k, 80), tema = txt(n?.tema, 220), disc = txt(n?.disc, 100)
    if (!/^c:[A-Za-z0-9_-]{4,40}$/.test(k) || vistosN.has(k) || !tema || !disc) continue
    vistosN.add(k)
    out.novas.push({ k, disc, num: txt(n.num, 12), tema, pags: inteiro(n.pags, 0, 5000) ?? 0, qc: linkSeguro(n.qc), tec: linkSeguro(n.tec), ...(n.ativo === false ? { ativo: false } : {}), ...(mat(n.mat) ? { mat: mat(n.mat) } : {}) })
  }
  if (Array.isArray(r.ordem)) out.ordem = [...new Set((r.ordem as unknown[]).map((x) => txt(x, 240)).filter(Boolean))].slice(0, 5000)
  const lp = (r.lp && typeof r.lp === 'object' ? r.lp : {}) as Record<string, Record<string, unknown>>
  for (const [id, o] of Object.entries(lp).slice(0, 5000)) {
    if (!o || typeof o !== 'object') continue
    const key = txt(id, 120); if (!key) continue
    const a: LpOv = {}
    if (typeof o.ativo === 'boolean') a.ativo = o.ativo
    if (o.leiNome != null) { const t = txt(o.leiNome, 220); if (t) a.leiNome = t }
    if (o.trecho != null) a.trecho = txt(o.trecho, 300)
    if (Object.keys(a).length) out.lp[key] = a
  }
  const vistosL = new Set<string>()
  for (const n of (Array.isArray(r.lpNovas) ? r.lpNovas : []).slice(0, 2000) as Array<Record<string, unknown>>) {
    const id = txt(n?.id, 80), leiNome = txt(n?.leiNome, 220), disc = txt(n?.disc, 100)
    if (!/^lp:ov:[A-Za-z0-9_-]{4,40}$/.test(id) || vistosL.has(id) || !leiNome || !disc) continue
    vistosL.add(id); out.lpNovas.push({ id, disc, leiNome, trecho: txt(n.trecho, 300) })
  }
  if (Array.isArray(r.lpOrdem)) out.lpOrdem = [...new Set((r.lpOrdem as unknown[]).map((x) => txt(x, 120)).filter(Boolean))].slice(0, 8000)
  return out
}

/** Quantidade de itens alterados (p/ a barra "N alterações não salvas"). */
export function contarAlteracoes(o: CatalogoOverride): number {
  return Object.keys(o.aulas).length + o.novas.length + (o.ordem ? 1 : 0) + Object.keys(o.lp).length + o.lpNovas.length + (o.lpOrdem ? 1 : 0)
}
