import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sqlQuery } from '@/lib/data/sql'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { plano, semHtml } from './texto-plano'
import { limparCacheDuplicadas, chavesDe, membrosDoGrupo, usoDeQuestoes } from './biblioteca-questoes-duplicadas'
import { limparCacheQuestoes } from './biblioteca-questoes'
import { aquecerDeteccao, deteccaoCache, invalidarDeteccao } from './cache-deteccao'
import { unificarQuestoes } from './biblioteca-questoes-acoes'
import {
  FILTROS_U_PADRAO, LIMIAR_MIN, LIMIAR_PADRAO, chavePar,
  type FacetaU, type FiltrosU, type GrupoU, type HistoricoU, type InicialUnificar, type NivelDup, type PreviaU, type RespostaGruposU, type ResumoU,
} from './questoes-unificar-tipos'

// DETECÇÃO + UNIFICAÇÃO SEGURA de questões duplicadas (Biblioteca › Questões › Unificar). Somente servidor.
//
// DETECÇÃO (cache 5 min por tenant; o pesado roda uma vez, filtros/limiar/paginação são baratos):
//   identica   = enunciado normalizado igual + mesmas alternativas (conjunto) + mesmo gabarito
//   codigo     = mesmo external_id
//   enunciado  = enunciado igual (≥ 40 car.) mas alternativas/gabarito diferentes
//   semelhante = similaridade de enunciado ≥ limiar (Jaccard de shingles de 3 palavras, achados por prefix-filter exato —
//                sem perder pares) e alternativas ≥ 50% iguais. O limiar (0,60–1,00) é aplicado na hora, sobre as arestas guardadas.
// pg_trgm NÃO está instalado neste banco → shingles/Jaccard em Node (exato, em memória, ~segundos para 5,7 mil questões).
//
// UNIFICAÇÃO: nada é apagado. `completa` (só se enunciado+alternativas+gabarito forem idênticos) copia etiquetas/bancos, move favoritos,
// comentários e reportes e (opcional) reaponta simulados SEM nenhuma sessão iniciada; respostas de alunos NUNCA são movidas. Tudo num
// ÚNICO comando SQL (CTEs de escrita = atômico). `arquivar` só arquiva (exige confirmação extra se não forem idênticas).
// DESFAZER: o estado anterior fica em simulado_questoes_unificacoes.snapshot (e na auditoria).

const TTL = 5 * 60_000
const RANK: Record<NivelDup, number> = { identica: 0, codigo: 1, enunciado: 2, semelhante: 3 }
const NIVEIS: NivelDup[] = ['identica', 'codigo', 'enunciado', 'semelhante']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const POSTING_MAX = 500
const COMPLETO_ATE = 10

interface It { id: string; cod: string | null; ext: string | null; status: string | null; enun: string; alt: string; gab: string; altSet: string[]; sh: number[]; amostra: string; disc: string | null; banca: string | null; ano: number | null }
interface Edge { a: number; b: number; n: NivelDup; s: number }
interface Comp { id: string; idx: number[]; ids: string[]; nivel: NivelDup; scoreMin: number; ativas: number; gabDiverge: boolean; ignorados: number; emSimulado: boolean; comRespostas: boolean; discs: Set<string>; bancas: Set<string>; anos: Set<string>; statuses: Set<string> }
interface Entry {
  at: number; items: It[]; edges: Edge[]; idx: Map<string, number>; usoSim: Set<string>; usoResp: Set<string>
  disc: Map<string, string>; banca: Map<string, string>; degradado: boolean
  ign: Set<string> | null; ignServidor: boolean; ignVer: number; memo: Map<string, Comp[]>
}
const chaveDet = (tenantId: string) => `unif:dup:${tenantId}`
const IGN_VER = new Map<string, number>()

export function limparCacheUnificar(tenantId: string) { invalidarDeteccao(chaveDet(tenantId)); limparCacheDuplicadas(tenantId); limparCacheQuestoes(tenantId) }
/** Aquece a detecção em segundo plano (chame em qualquer entrada da Biblioteca › Questões; custo zero se já estiver quente). */
export function aquecerUnificar(svc: SupabaseClient, tenantId: string) { aquecerDeteccao(chaveDet(tenantId), () => calcular(svc, tenantId)) }
/** Só o "não é duplicada" mudou: não recalcula a detecção, apenas as comparações. */
function invalidarIgnoradas(tenantId: string) {
  IGN_VER.set(tenantId, (IGN_VER.get(tenantId) ?? 0) + 1)
  // `entrada` percebe a mudança de versão, recarrega os pares ignorados e zera o memo (a detecção pesada NÃO é refeita)
  limparCacheDuplicadas(tenantId)
}

// ─────────────────────────── carga + detecção ───────────────────────────
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) } return h >>> 0 }
function shingles(enun: string): number[] {
  const w = enun.split(' ').filter(Boolean)
  if (w.length < 3) return [...new Set(w.map(fnv))]
  const s = new Set<number>(); for (let i = 0; i + 3 <= w.length; i++) s.add(fnv(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]))
  return [...s]
}
const jacc = (a: string[], b: string[]) => {
  if (!a.length && !b.length) return 1
  const s = new Set(a); let n = 0; for (const x of new Set(b)) if (s.has(x)) n++
  return n / (new Set([...a, ...b]).size || 1)
}

async function carregarItens(svc: SupabaseClient, tenantId: string): Promise<It[]> {
  // UMA ida e volta por tabela, em PARALELO (antes: sequencial = soma das latências)
  let [qs, alts] = await Promise.all([
    sqlQuery<any>('select id, codigo, external_id, status, enunciado, disciplina_id, banca_id, ano from simulado_questoes where tenant_id = $1 and deletado = false', [tenantId]),
    sqlQuery<any>('select a.questao_id, a.texto, a.correta from simulado_alternativas a join simulado_questoes q on q.id = a.questao_id where q.tenant_id = $1 and q.deletado = false', [tenantId]),
  ])
  if (!qs || !alts) {
    qs = await fetchAll<any>(() => svc.from('simulado_questoes').select('id, codigo, external_id, status, enunciado, disciplina_id, banca_id, ano').eq('tenant_id', tenantId).eq('deletado', false).order('id', { ascending: true }))
    alts = await fetchAllByIn<any>(qs.map((r: any) => r.id as string), (c) => svc.from('simulado_alternativas').select('id, questao_id, texto, correta').in('questao_id', c).order('id', { ascending: true }), { chunk: 80 }).catch(() => [])
  }
  const porQ = new Map<string, { t: string; c: boolean }[]>()
  for (const a of alts as any[]) { const arr = porQ.get(a.questao_id) ?? []; arr.push({ t: plano(a.texto), c: !!a.correta }); porQ.set(a.questao_id, arr) }
  return (qs as any[]).map((q) => {
    const A = porQ.get(q.id) ?? []; const enun = plano(q.enunciado)
    return {
      id: q.id, cod: q.codigo ?? null, ext: (q.external_id ?? '').trim() || null, status: q.status ?? null, enun,
      alt: A.map((x) => x.t).sort().join('|'), gab: A.filter((x) => x.c).map((x) => x.t).sort().join('|'), altSet: A.map((x) => x.t),
      sh: enun.split(' ').length >= 8 ? shingles(enun) : [], amostra: semHtml(q.enunciado).slice(0, 180),
      disc: q.disciplina_id ?? null, banca: q.banca_id ?? null, ano: q.ano ?? null,
    }
  })
}

/** Arestas de duplicidade. As "semelhantes" são guardadas a partir de LIMIAR_MIN; o limiar do usuário filtra depois. */
function arestas(items: It[]): { edges: Edge[]; degradado: boolean } {
  const edges: Edge[] = []; let degradado = false
  // 1) enunciado igual → idêntica (alt+gab iguais) ou "enunciado" (alternativas/gabarito diferentes, só se o texto não for genérico)
  const porEnun = new Map<string, number[]>()
  items.forEach((b, i) => { if (b.enun) (porEnun.get(b.enun) ?? porEnun.set(b.enun, []).get(b.enun)!).push(i) })
  const ligarTodos = (g: number[], n: NivelDup) => {
    if (g.length <= COMPLETO_ATE) { for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length; y++) edges.push({ a: g[x], b: g[y], n, s: 1 }) }
    else for (let x = 1; x < g.length; x++) edges.push({ a: g[0], b: g[x], n, s: 1 })
  }
  for (const [k, arr] of porEnun) {
    if (arr.length < 2) continue
    const sub = new Map<string, number[]>()
    for (const i of arr) { const kk = items[i].alt + '#' + items[i].gab; (sub.get(kk) ?? sub.set(kk, []).get(kk)!).push(i) }
    for (const s of sub.values()) ligarTodos(s, 'identica')
    if (sub.size > 1 && k.length >= 40) { const reps = [...sub.values()].map((s) => s[0]); ligarTodos(reps, 'enunciado') }
  }
  // 2) mesmo external_id
  const porExt = new Map<string, number[]>()
  items.forEach((b, i) => { if (b.ext) (porExt.get(b.ext) ?? porExt.set(b.ext, []).get(b.ext)!).push(i) })
  for (const arr of porExt.values()) if (arr.length > 1) ligarTodos(arr, 'codigo')
  // 3) semelhantes: prefix-filter exato (tokens ordenados do mais raro ao mais comum) + verificação do Jaccard
  const T = LIMIAR_MIN
  const df = new Map<number, number>()
  for (const b of items) for (const h of b.sh) df.set(h, (df.get(h) ?? 0) + 1)
  const ord = items.map((b) => [...b.sh].sort((x, y) => (df.get(x)! - df.get(y)!) || x - y))
  const post = new Map<number, number[]>()
  const pref = (n: number) => n - Math.ceil(T * n) + 1
  ord.forEach((arr, i) => { if (!arr.length) return; const p = pref(arr.length); for (let k = 0; k < p; k++) (post.get(arr[k]) ?? post.set(arr[k], []).get(arr[k])!).push(i) })
  const visto = new Set<number>(); const N = items.length
  const sets = items.map((b) => new Set(b.sh))
  for (const lista of post.values()) {
    if (lista.length < 2) continue
    if (lista.length > POSTING_MAX) { degradado = true; continue }
    for (let x = 0; x < lista.length; x++) for (let y = x + 1; y < lista.length; y++) {
      const i = lista[x], j = lista[y]; const key = i * N + j
      if (visto.has(key)) continue; visto.add(key)
      const A = items[i], B = items[j]
      if (A.enun === B.enun) continue
      const na = A.sh.length, nb = B.sh.length
      if (Math.min(na, nb) < T * Math.max(na, nb)) continue
      let inter = 0; const sb = sets[j]; for (const h of A.sh) if (sb.has(h)) inter++
      const s = inter / (na + nb - inter)
      if (s < T) continue
      if (jacc(A.altSet, B.altSet) < 0.5) continue
      edges.push({ a: i, b: j, n: 'semelhante', s })
    }
  }
  return { edges, degradado }
}

async function carregarUso(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<{ sim: Set<string>; resp: Set<string> }> {
  if (!ids.length) return { sim: new Set(), resp: new Set() }
  const [a, b] = await Promise.all([
    sqlQuery<{ questao_id: string }>('select distinct questao_id from simulado_prova_questoes where tenant_id = $1 and questao_id = any($2::uuid[])', [tenantId, ids]),
    sqlQuery<{ questao_id: string }>('select distinct questao_id from simulado_respostas_objetivas where tenant_id = $1 and questao_id = any($2::uuid[])', [tenantId, ids]),
  ])
  const sim = a ? a.map((x) => x.questao_id) : (await fetchAllByIn<any>(ids, (c) => svc.from('simulado_prova_questoes').select('id, questao_id').in('questao_id', c).order('id', { ascending: true }), { chunk: 80 }).catch(() => [])).map((x: any) => x.questao_id)
  const resp = b ? b.map((x) => x.questao_id) : []
  return { sim: new Set(sim), resp: new Set(resp) }
}

async function nomes(svc: SupabaseClient, tenantId: string, tabela: string): Promise<Map<string, string>> {
  const r = await fetchAll<any>(() => svc.from(tabela).select('id, nome').eq('tenant_id', tenantId).order('id', { ascending: true })).catch(() => [])
  return new Map(r.map((x: any) => [x.id as string, String(x.nome)]))
}

async function calcular(svc: SupabaseClient, tenantId: string): Promise<Entry> {
  const items = await carregarItens(svc, tenantId)
  const { edges, degradado } = arestas(items)
  const envolvidos = [...new Set(edges.flatMap((e) => [items[e.a].id, items[e.b].id]))]
  const [uso, disc, banca] = await Promise.all([carregarUso(svc, tenantId, envolvidos), nomes(svc, tenantId, 'simulado_disciplinas'), nomes(svc, tenantId, 'simulado_bancas')])
  return { at: Date.now(), items, edges, idx: new Map(items.map((b, i) => [b.id, i])), usoSim: uso.sim, usoResp: uso.resp, disc, banca, degradado, ign: null, ignServidor: false, ignVer: -1, memo: new Map() }
}

async function entrada(svc: SupabaseClient, tenantId: string, fresh = false): Promise<Entry> {
  if (fresh) limparCacheDuplicadas(tenantId)
  const e = await deteccaoCache<Entry>(chaveDet(tenantId), () => calcular(svc, tenantId), { fresh })
  if (e.ign === null || e.ignVer !== (IGN_VER.get(tenantId) ?? 0)) {
    const r = await sqlQuery<{ questao_a: string; questao_b: string }>('select questao_a, questao_b from simulado_questoes_nao_duplicadas where tenant_id = $1', [tenantId])
    e.ignServidor = r !== null; e.ign = new Set((r ?? []).map((x) => chavePar(x.questao_a, x.questao_b))); e.ignVer = IGN_VER.get(tenantId) ?? 0; e.memo.clear()
  }
  return e
}

/** Componentes conexos (grupos) para um limiar, com ou sem os pares "não é duplicada". */
function comps(e: Entry, limiar: number, aplicarIgn: boolean): Comp[] {
  const key = `${limiar.toFixed(3)}|${aplicarIgn ? 1 : 0}`
  const hit = e.memo.get(key); if (hit) return hit
  const ign = e.ign ?? new Set<string>()
  const pai = e.items.map((_, i) => i)
  const find = (x: number): number => { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x] } return x }
  const ativas = e.edges.filter((ed) => (ed.n !== 'semelhante' || ed.s >= limiar - 1e-9) && (!aplicarIgn || !ign.has(chavePar(e.items[ed.a].id, e.items[ed.b].id))))
  for (const ed of ativas) { const ra = find(ed.a), rb = find(ed.b); if (ra !== rb) pai[ra] = rb }
  const nivelR = new Map<number, number>(), scoreR = new Map<number, number>()
  for (const ed of ativas) { const r = find(ed.a); nivelR.set(r, Math.max(nivelR.get(r) ?? 0, RANK[ed.n])); if (ed.n === 'semelhante') scoreR.set(r, Math.min(scoreR.get(r) ?? 1, ed.s)) }
  const porRaiz = new Map<number, number[]>()
  for (const ed of ativas) for (const i of [ed.a, ed.b]) { const r = find(i); const l = porRaiz.get(r) ?? porRaiz.set(r, []).get(r)!; if (!l.includes(i)) l.push(i) }
  const ignPorRaiz = new Map<number, number>()
  if (!aplicarIgn) for (const k of ign) { const [a, b] = k.split('|'); const ia = e.idx.get(a), ib = e.idx.get(b); if (ia === undefined || ib === undefined) continue; const r = find(ia); if (find(ib) === r) ignPorRaiz.set(r, (ignPorRaiz.get(r) ?? 0) + 1) }
  const out: Comp[] = []
  for (const [r, idx] of porRaiz) {
    if (idx.length < 2) continue
    idx.sort((x, y) => (e.items[x].id < e.items[y].id ? -1 : 1))
    const its = idx.map((i) => e.items[i])
    const gabs = new Set(its.map((b) => b.gab).filter(Boolean))
    out.push({
      id: its[0].id, idx, ids: its.map((b) => b.id), nivel: NIVEIS[nivelR.get(r) ?? 0], scoreMin: scoreR.get(r) ?? 1,
      ativas: its.filter((b) => b.status !== 'arquivada').length, gabDiverge: gabs.size > 1, ignorados: ignPorRaiz.get(r) ?? 0,
      emSimulado: its.some((b) => e.usoSim.has(b.id)), comRespostas: its.some((b) => e.usoResp.has(b.id)),
      discs: new Set(its.map((b) => b.disc).filter(Boolean) as string[]), bancas: new Set(its.map((b) => b.banca).filter(Boolean) as string[]),
      anos: new Set(its.map((b) => b.ano).filter((x) => x != null).map(String)), statuses: new Set(its.map((b) => b.status ?? '')),
    })
  }
  e.memo.set(key, out); return out
}

const faceta = (m: Map<string, number>, nomes: Map<string, string> | null): FacetaU[] =>
  [...m].map(([id, n]) => ({ id, nome: nomes ? nomes.get(id) ?? '(sem nome)' : id, n })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))

export async function listarGrupos(svc: SupabaseClient, tenantId: string, f: FiltrosU, fresh = false): Promise<RespostaGruposU> {
  const e = await entrada(svc, tenantId, fresh)
  const limiar = Math.min(1, Math.max(LIMIAR_MIN, Number.isFinite(f.limiar) ? f.limiar : LIMIAR_PADRAO))
  const aplicadas = comps(e, limiar, true)
  const pend = aplicadas.filter((g) => g.ativas >= 2)
  const resol = aplicadas.filter((g) => g.ativas < 2)
  const semIgn = comps(e, limiar, false)
  const ignoradas = semIgn.filter((g) => g.ignorados > 0 && g.ativas >= 2)
  const resumo: ResumoU = {
    grupos: pend.length, questoes: pend.reduce((s, g) => s + g.ids.length, 0),
    porNivel: { identica: 0, codigo: 0, enunciado: 0, semelhante: 0 }, gabDiverge: pend.filter((g) => g.gabDiverge).length,
    emSimulado: pend.filter((g) => g.emSimulado).length, comRespostas: pend.filter((g) => g.comRespostas).length, ignoradas: ignoradas.length, resolvidas: resol.length,
  }
  for (const g of pend) resumo.porNivel[g.nivel]++
  const base = f.vista === 'ignoradas' ? ignoradas : f.vista === 'resolvidas' ? resol : pend
  const termo = plano(f.q ?? '')
  const passa = (g: Comp) =>
    (!f.nivel || g.nivel === f.nivel) && (!f.disciplina || g.discs.has(f.disciplina)) && (!f.banca || g.bancas.has(f.banca)) && (!f.ano || g.anos.has(f.ano)) &&
    (!f.status || g.statuses.has(f.status)) &&
    (f.uso === 'simulado' ? g.emSimulado : f.uso === 'respostas' ? g.comRespostas : f.uso === 'livre' ? !g.emSimulado && !g.comRespostas : true) &&
    (f.gabarito === 'divergente' ? g.gabDiverge : f.gabarito === 'ok' ? !g.gabDiverge : true) &&
    (!termo || g.idx.some((i) => e.items[i].enun.includes(termo) || (e.items[i].cod ?? '').toLowerCase() === f.q.trim().toLowerCase() || (e.items[i].ext ?? '').toLowerCase().includes(f.q.trim().toLowerCase())))
  const filtrados = base.filter(passa)
  filtrados.sort((a, b) => RANK[a.nivel] - RANK[b.nivel] || Number(b.comRespostas) - Number(a.comRespostas) || b.ids.length - a.ids.length || b.scoreMin - a.scoreMin || (a.id < b.id ? -1 : 1))
  // facetas = grupos da vista, sem aplicar os filtros de taxonomia (para o usuário ver o que existe)
  const fd = new Map<string, number>(), fb = new Map<string, number>(), fa = new Map<string, number>()
  for (const g of base) { for (const x of g.discs) fd.set(x, (fd.get(x) ?? 0) + 1); for (const x of g.bancas) fb.set(x, (fb.get(x) ?? 0) + 1); for (const x of g.anos) fa.set(x, (fa.get(x) ?? 0) + 1) }
  const pp = Math.min(50, Math.max(5, f.pp || 14)), page = Math.max(1, f.page || 1)
  const grupos: GrupoU[] = filtrados.slice((page - 1) * pp, page * pp).map((g) => {
    const primeira = g.idx.map((i) => e.items[i]).find((b) => b.status !== 'arquivada') ?? e.items[g.idx[0]]
    return { id: g.id, ids: g.ids, n: g.ids.length, ativas: g.ativas, nivel: g.nivel, scoreMin: g.scoreMin, amostra: primeira.amostra, emSimulado: g.emSimulado, comRespostas: g.comRespostas, gabDiverge: g.gabDiverge, ignorados: g.ignorados }
  })
  return {
    ok: true, grupos, total: filtrados.length, page, pp, totalQuestoes: e.items.length, geradoEm: e.at, limiar, resumo, ignorarServidor: e.ignServidor, degradado: e.degradado,
    facetas: { disciplinas: faceta(fd, e.disc), bancas: faceta(fb, e.banca), anos: faceta(fa, null).map((x) => ({ ...x, nome: x.id })).sort((a, b) => Number(b.id) - Number(a.id)) },
  }
}

/** SSR: o que a tela precisa para renderizar IMEDIATAMENTE (sem chamada no load). Usa a detecção em cache (single-flight). */
export async function carregarInicialUnificar(tenantId: string): Promise<InicialUnificar | null> {
  try {
    const svc = createAdminClient()
    const grupos = await listarGrupos(svc, tenantId, FILTROS_U_PADRAO)
    const g0 = grupos.grupos[0]
    const membros = g0 ? await membrosDoGrupo(svc, tenantId, g0.ids).catch(() => null) : null
    return { grupos, primeiro: g0 && membros ? { ids: g0.ids, membros } : null }
  } catch { return null }
}

// ─────────────────────────── prévia ───────────────────────────
type Ator = { tenantId: string; userId: string | null }
type R = { ok: boolean; error?: string; [k: string]: any }

const CAMPOS: [string, string][] = [
  ['disciplina_id', 'disciplina'], ['assunto_id', 'assunto'], ['banca_id', 'banca'], ['orgao_id', 'órgão'], ['ano', 'ano'], ['nivel_dificuldade', 'dificuldade'],
  ['cargo', 'cargo'], ['assunto_detalhe', 'assunto específico'], ['comentario_professor', 'comentário do professor'],
]
const vazio = (v: any) => v == null || v === ''

const SQL_CAND = `select distinct on (p.simulado_id) p.id, p.questao_id as orig, p.simulado_id
  from simulado_prova_questoes p
  where p.tenant_id = $1 and p.questao_id = any($3::uuid[])
    and not exists (select 1 from simulado_sessoes_prova s where s.simulado_id = p.simulado_id and s.tenant_id = $1)
    and not exists (select 1 from simulado_prova_questoes m where m.simulado_id = p.simulado_id and m.questao_id = $2::uuid)
  order by p.simulado_id, p.ordem, p.id`

async function validar(svc: SupabaseClient, tenantId: string, mestreId: string, dupIds: string[]) {
  if (!UUID.test(mestreId) || !dupIds.length || dupIds.some((d) => !UUID.test(d))) return { ok: false as const, error: 'Escolha a questão mestre e ao menos uma duplicada.' }
  if (dupIds.includes(mestreId)) return { ok: false as const, error: 'A mestre não pode estar entre as duplicadas.' }
  if (dupIds.length > 12) return { ok: false as const, error: 'Máximo de 12 duplicadas por vez.' }
  const ids = [mestreId, ...dupIds]
  const { data } = await svc.from('simulado_questoes').select('id, status, anulada, deletado, disciplina_id, assunto_id, banca_id, orgao_id, ano, nivel_dificuldade, cargo, assunto_detalhe, comentario_professor, codigo').eq('tenant_id', tenantId).in('id', ids)
  const todos = new Map<string, any>(((data ?? []) as any[]).filter((x) => !x.deletado).map((x) => [x.id, x]))
  if (todos.size !== ids.length) return { ok: false as const, error: 'Alguma questão não existe neste tenant (ou está na Lixeira).' }
  if (todos.get(mestreId).status === 'arquivada') return { ok: false as const, error: 'A mestre está arquivada. Escolha uma questão ativa como mestre.' }
  const ch = await chavesDe(svc, tenantId, ids)
  const cm = ch.get(mestreId)
  const iguais = dupIds.every((d) => { const c = ch.get(d); return !!cm && !!c && c.enun === cm.enun && c.alt === cm.alt && c.gab === cm.gab && !!todos.get(d).anulada === !!todos.get(mestreId).anulada })
  const gabDiv = dupIds.filter((d) => { const c = ch.get(d); return !!cm && !!c && (c.gab !== cm.gab) })
  let motivo = ''
  if (!iguais) {
    const algum = dupIds.map((d) => ch.get(d)).find((c) => !cm || !c || c.enun !== cm.enun || c.alt !== cm.alt || c.gab !== cm.gab)
    motivo = !cm || !algum ? 'Não foi possível comparar o texto das questões.' : algum.enun !== cm.enun ? 'Os enunciados não são idênticos.' : algum.gab !== cm.gab ? 'GABARITO DIVERGENTE — as alternativas corretas são diferentes: revisar antes de qualquer unificação.' : algum.alt !== cm.alt ? 'As alternativas são diferentes.' : 'Uma delas está anulada e a outra não.'
  }
  return { ok: true as const, todos, iguais, motivo, gabDiv, codigos: new Map([...todos].map(([id, q]) => [id, q.codigo as string | null])) }
}

export async function previa(svc: SupabaseClient, tenantId: string, mestreId: string, dupIdsIn: string[]): Promise<PreviaU | { ok: false; error: string }> {
  const dupIds = [...new Set(dupIdsIn)]
  // tudo em paralelo (o banco é remoto: cada ida e volta custa ~160 ms)
  const [v, uso, novas, sim, vinc] = await Promise.all([
    validar(svc, tenantId, mestreId, dupIds),
    usoDeQuestoes(svc, tenantId, [mestreId, ...dupIds]),
    sqlQuery<{ n: number }>('select count(distinct e.etiqueta_id)::int as n from simulado_questao_etiquetas e where e.tenant_id = $1 and e.questao_id = any($3::uuid[]) and not exists (select 1 from simulado_questao_etiquetas m where m.questao_id = $2::uuid and m.etiqueta_id = e.etiqueta_id)', [tenantId, mestreId, dupIds]),
    sqlQuery<any>(`with cand as (${SQL_CAND})
      select (select count(*) from cand)::int as reap,
        (select count(distinct simulado_id) from simulado_prova_questoes where tenant_id = $1 and questao_id = any($3::uuid[]))::int as total,
        (select count(distinct p.simulado_id) from simulado_prova_questoes p where p.tenant_id = $1 and p.questao_id = any($3::uuid[])
           and not exists (select 1 from simulado_sessoes_prova s where s.simulado_id = p.simulado_id and s.tenant_id = $1)
           and exists (select 1 from simulado_prova_questoes m where m.simulado_id = p.simulado_id and m.questao_id = $2::uuid))::int as com_mestre`, [tenantId, mestreId, dupIds]),
    sqlQuery<{ t: string | null }>("select to_regclass('public.simulado_questoes_unificacoes')::text as t", []),
  ])
  if (!v.ok) return v
  const soma = (f: (u: (typeof uso)[string]) => number) => dupIds.reduce((s, d) => s + f(uso[d]), 0)
  const m = v.todos.get(mestreId)
  const preenche: string[] = []
  for (const [col, rot] of CAMPOS) if (vazio(m[col]) && dupIds.some((d) => !vazio(v.todos.get(d)[col]))) preenche.push(rot)
  const reap = sim?.[0]?.reap ?? 0, total = sim?.[0]?.total ?? soma((u) => u.simulados)
  const arqConf = !v.iguais
  return {
    ok: true,
    modos: {
      completa: { permitido: v.iguais, motivo: v.iguais ? '' : v.motivo },
      arquivar: { permitido: true, motivo: arqConf ? v.motivo : '', precisaConfirmar: arqConf },
    },
    gabaritoDivergente: v.gabDiv.length > 0,
    gabaritoDetalhe: v.gabDiv.length ? `Gabarito diferente da mestre em: ${v.gabDiv.map((d) => v.codigos.get(d) ?? d.slice(0, 8)).join(', ')}.` : '',
    uso,
    moveria: { etiquetas: novas?.[0]?.n ?? null, favoritos: soma((u) => u.favoritos), comentarios: soma((u) => u.comentarios), feedbacks: soma((u) => u.feedbacks), bancos: soma((u) => u.bancos) },
    simulados: { reapontaveis: reap, mantidos: Math.max(0, total - reap), semSessaoMasComMestre: sim?.[0]?.com_mestre ?? 0 },
    ficam: { simulados: total, respostas: soma((u) => u.respostas), conteudos: soma((u) => u.conteudos) },
    preenche, vinculoServidor: !!vinc?.[0]?.t,
  }
}

// ─────────────────────────── executar (atômico) ───────────────────────────
const SQL_EXEC = (completa: boolean, reapontar: boolean) => `
with
${completa ? `cand as (${reapontar ? SQL_CAND : `select null::uuid as id, null::uuid as orig, null::uuid as simulado_id where false`}),
et as (insert into simulado_questao_etiquetas (tenant_id, questao_id, etiqueta_id)
  select distinct $1::uuid, $2::uuid, e.etiqueta_id from simulado_questao_etiquetas e where e.tenant_id = $1 and e.questao_id = any($3::uuid[]) on conflict do nothing returning etiqueta_id),
pa as (insert into simulado_questao_pasta (tenant_id, questao_id, pasta_id)
  select distinct $1::uuid, $2::uuid, e.pasta_id from simulado_questao_pasta e where e.tenant_id = $1 and e.questao_id = any($3::uuid[]) on conflict do nothing returning pasta_id),
fmv as (select distinct on (f.estudante_id) f.id from simulado_favoritos f where f.tenant_id = $1 and f.questao_id = any($3::uuid[])
  and not exists (select 1 from simulado_favoritos m where m.tenant_id = $1 and m.questao_id = $2::uuid and m.estudante_id = f.estudante_id) order by f.estudante_id, f.criado_em, f.id),
fup as (update simulado_favoritos set questao_id = $2::uuid where tenant_id = $1 and id in (select id from fmv) returning id),
fdel as (delete from simulado_favoritos where tenant_id = $1 and questao_id = any($3::uuid[]) and id not in (select id from fmv) returning id),
cup as (update simulado_comentarios_questao set questao_id = $2::uuid where tenant_id = $1 and questao_id = any($3::uuid[]) returning id),
bup as (update simulado_feedbacks_questao set questao_id = $2::uuid where tenant_id = $1 and questao_id = any($3::uuid[]) returning id),
pq as (update simulado_prova_questoes p set questao_id = $2::uuid from cand c where p.id = c.id and p.tenant_id = $1 returning p.id, c.orig, c.simulado_id),
mest as (update simulado_questoes m set
    disciplina_id = coalesce(m.disciplina_id, a.disciplina_id),
    assunto_id = coalesce(m.assunto_id, (select d.assunto_id from simulado_questoes d where d.tenant_id = $1 and d.id = any($3::uuid[]) and d.assunto_id is not null and d.disciplina_id is not distinct from coalesce(m.disciplina_id, a.disciplina_id) order by d.id limit 1)),
    banca_id = coalesce(m.banca_id, a.banca_id), orgao_id = coalesce(m.orgao_id, a.orgao_id), ano = coalesce(m.ano, a.ano),
    nivel_dificuldade = coalesce(m.nivel_dificuldade, a.nivel_dificuldade),
    cargo = coalesce(nullif(m.cargo, ''), a.cargo), assunto_detalhe = coalesce(nullif(m.assunto_detalhe, ''), a.assunto_detalhe),
    comentario_professor = coalesce(nullif(m.comentario_professor, ''), a.comentario_professor)
  from (select (array_agg(disciplina_id order by id) filter (where disciplina_id is not null))[1] as disciplina_id,
               (array_agg(banca_id order by id) filter (where banca_id is not null))[1] as banca_id,
               (array_agg(orgao_id order by id) filter (where orgao_id is not null))[1] as orgao_id,
               (array_agg(ano order by id) filter (where ano is not null))[1] as ano,
               (array_agg(nivel_dificuldade order by id) filter (where nivel_dificuldade is not null))[1] as nivel_dificuldade,
               (array_agg(cargo order by id) filter (where cargo is not null and cargo <> ''))[1] as cargo,
               (array_agg(assunto_detalhe order by id) filter (where assunto_detalhe is not null and assunto_detalhe <> ''))[1] as assunto_detalhe,
               (array_agg(comentario_professor order by id) filter (where comentario_professor is not null and comentario_professor <> ''))[1] as comentario_professor
        from simulado_questoes where tenant_id = $1 and id = any($3::uuid[])) a
  where m.tenant_id = $1 and m.id = $2::uuid returning m.id),
` : ''}arq as (update simulado_questoes set status = 'arquivada' where tenant_id = $1 and deletado = false and id = any($3::uuid[]) and $2::uuid is not null returning id)
select (select count(*) from arq)::int as arquivadas${completa ? `,
  (select count(*) from et)::int as etiquetas, (select count(*) from pa)::int as bancos, (select count(*) from fup)::int as favoritos_movidos, (select count(*) from fdel)::int as favoritos_repetidos,
  (select count(*) from cup)::int as comentarios, (select count(*) from bup)::int as feedbacks, (select count(*) from mest)::int as mestre,
  (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'orig', orig, 'simulado_id', simulado_id)), '[]'::jsonb) from pq) as prova` : ''}`

const SQL_SNAP = `select
  (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from simulado_favoritos f where f.tenant_id = $1 and f.questao_id = any($3::uuid[])) as favoritos,
  (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'questao_id', c.questao_id)), '[]'::jsonb) from simulado_comentarios_questao c where c.tenant_id = $1 and c.questao_id = any($3::uuid[])) as comentarios,
  (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'questao_id', c.questao_id)), '[]'::jsonb) from simulado_feedbacks_questao c where c.tenant_id = $1 and c.questao_id = any($3::uuid[])) as feedbacks,
  (select coalesce(jsonb_agg(distinct e.etiqueta_id), '[]'::jsonb) from simulado_questao_etiquetas e where e.tenant_id = $1 and e.questao_id = any($3::uuid[]) and not exists (select 1 from simulado_questao_etiquetas m where m.questao_id = $2::uuid and m.etiqueta_id = e.etiqueta_id)) as etiquetas_novas,
  (select coalesce(jsonb_agg(distinct e.pasta_id), '[]'::jsonb) from simulado_questao_pasta e where e.tenant_id = $1 and e.questao_id = any($3::uuid[]) and not exists (select 1 from simulado_questao_pasta m where m.questao_id = $2::uuid and m.pasta_id = e.pasta_id)) as pastas_novas,
  (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'status', q.status)), '[]'::jsonb) from simulado_questoes q where q.tenant_id = $1 and q.id = any($3::uuid[])) as dups,
  (select to_jsonb(q) from (select disciplina_id, assunto_id, banca_id, orgao_id, ano, nivel_dificuldade, cargo, assunto_detalhe, comentario_professor from simulado_questoes where tenant_id = $1 and id = $2::uuid) q) as mestre`

export async function executar(svc: SupabaseClient, a: Ator, mestreId: string, dupIdsIn: string[], modo: 'completa' | 'arquivar', o: { reapontar?: boolean; confirmarDivergente?: boolean } = {}): Promise<R> {
  const { tenantId } = a
  const dupIds = [...new Set(dupIdsIn)]
  const v = await validar(svc, tenantId, mestreId, dupIds)
  if (!v.ok) return v
  if (modo === 'completa' && !v.iguais) return { ok: false, error: `Unificação completa bloqueada: ${v.motivo} Use “Arquivar duplicada” (com confirmação).` }
  if (modo === 'arquivar' && !v.iguais && !o.confirmarDivergente) return { ok: false, error: `Confirmação necessária: ${v.motivo} Marque a confirmação para arquivar mesmo assim.`, precisaConfirmar: true }
  const reapontar = modo === 'completa' && o.reapontar !== false
  const completa = modo === 'completa'

  const snapRows = completa ? await sqlQuery<any>(SQL_SNAP, [tenantId, mestreId, dupIds]) : await sqlQuery<any>("select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'status', q.status)), '[]'::jsonb) as dups from simulado_questoes q where q.tenant_id = $1 and q.id = any($3::uuid[]) and $2::uuid is not null", [tenantId, mestreId, dupIds])
  if (!snapRows) {
    // sem SQL direto: caminho legado (passos idempotentes, NÃO atômico) — mantém só o estado de status para desfazer
    const antes = dupIds.map((d) => ({ id: d, status: v.todos.get(d).status }))
    const r = await unificarQuestoes(svc, a, mestreId, dupIds, modo)
    if (r.ok) limparCacheUnificar(tenantId)
    return r.ok ? { ...r, atomico: false, desfazer: { snapshot: { dups: antes }, mestreId, duplicadas: dupIds, modo } } : r
  }
  const snap = snapRows[0]
  const mestreAntes = snap.mestre ?? null
  const r = await sqlQuery<any>(SQL_EXEC(completa, reapontar), [tenantId, mestreId, dupIds])
  if (!r) return { ok: false, error: 'Falha ao gravar (nada foi alterado — o comando é atômico). Tente de novo.' }
  const res = r[0]
  // campos que a mestre ganhou (para o desfazer restaurar só o que mudou)
  let camposAntes: Record<string, any> = {}, camposDepois: Record<string, any> = {}
  if (completa && mestreAntes) {
    const dep = await sqlQuery<any>('select disciplina_id, assunto_id, banca_id, orgao_id, ano, nivel_dificuldade, cargo, assunto_detalhe, comentario_professor from simulado_questoes where tenant_id = $1 and id = $2::uuid', [tenantId, mestreId])
    const d = dep?.[0]
    if (d) for (const [col] of CAMPOS) if (vazio(mestreAntes[col]) && !vazio(d[col])) { camposAntes[col] = mestreAntes[col] ?? null; camposDepois[col] = d[col] }
  }
  const snapshot = { ...snap, mestre: undefined, camposAntes, camposDepois, prova: res.prova ?? [] }
  const resumo = { arquivadas: res.arquivadas, etiquetas: res.etiquetas ?? 0, bancos: res.bancos ?? 0, favoritos: (res.favoritos_movidos ?? 0), favoritosRepetidos: res.favoritos_repetidos ?? 0, comentarios: res.comentarios ?? 0, feedbacks: res.feedbacks ?? 0, simuladosReapontados: (res.prova ?? []).length, camposPreenchidos: Object.keys(camposDepois).length }

  let unificacaoId: string | null = null
  const ins = await sqlQuery<{ id: string }>('insert into simulado_questoes_unificacoes (tenant_id, mestre_id, duplicadas, modo, snapshot, resumo, executado_por) values ($1, $2::uuid, $3::uuid[], $4, $5::jsonb, $6::jsonb, $7) returning id', [tenantId, mestreId, dupIds, modo, JSON.stringify(snapshot), JSON.stringify(resumo), a.userId])
  unificacaoId = ins?.[0]?.id ?? null

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: mestreId, atorId: a.userId, tenantId,
    antes: { duplicadas_status: (snap.dups ?? []) as unknown[], mestre_campos: camposAntes },
    depois: { unificacao_questoes: modo, versao_tela: 'unificar_v2', mestre: mestreId, duplicadas: dupIds, resultado: resumo, unificacao_id: unificacaoId, gabarito_divergente_confirmado: !!o.confirmarDivergente && !v.iguais } }).catch(() => {})
  for (const d of dupIds) await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: d, atorId: a.userId, tenantId, antes: { status: v.todos.get(d).status }, depois: { status: 'arquivada', duplicada_de: mestreId, modo, unificacao_id: unificacaoId } }).catch(() => {})
  limparCacheUnificar(tenantId)
  return { ok: true, modo, atomico: true, resumo, unificacaoId, desfazer: unificacaoId ? { unificacaoId } : { snapshot, mestreId, duplicadas: dupIds, modo } }
}

// ─────────────────────────── desfazer ───────────────────────────
const SQL_UNDO = `
with
st as (update simulado_questoes q set status = x.status from jsonb_to_recordset($3::jsonb -> 'dups') as x(id uuid, status text) where q.tenant_id = $1 and q.id = x.id returning q.id),
fup as (update simulado_favoritos f set questao_id = x.questao_id from jsonb_to_recordset($3::jsonb -> 'favoritos') as x(id uuid, questao_id uuid)
  where f.tenant_id = $1 and f.id = x.id and exists (select 1 from simulado_questoes q where q.id = x.questao_id and q.tenant_id = $1) returning f.id),
fin as (insert into simulado_favoritos select (jsonb_populate_record(null::simulado_favoritos, j || jsonb_build_object('tenant_id', $1::text))).*
  from jsonb_array_elements($3::jsonb -> 'favoritos') j
  where not exists (select 1 from simulado_favoritos f where f.id = (j ->> 'id')::uuid)
    and exists (select 1 from simulado_questoes q where q.id = (j ->> 'questao_id')::uuid and q.tenant_id = $1) returning id),
cup as (update simulado_comentarios_questao c set questao_id = x.questao_id from jsonb_to_recordset($3::jsonb -> 'comentarios') as x(id uuid, questao_id uuid)
  where c.tenant_id = $1 and c.id = x.id and exists (select 1 from simulado_questoes q where q.id = x.questao_id and q.tenant_id = $1) returning c.id),
bup as (update simulado_feedbacks_questao c set questao_id = x.questao_id from jsonb_to_recordset($3::jsonb -> 'feedbacks') as x(id uuid, questao_id uuid)
  where c.tenant_id = $1 and c.id = x.id and exists (select 1 from simulado_questoes q where q.id = x.questao_id and q.tenant_id = $1) returning c.id),
edel as (delete from simulado_questao_etiquetas where tenant_id = $1 and questao_id = $2::uuid and etiqueta_id in (select (jsonb_array_elements_text($3::jsonb -> 'etiquetas_novas'))::uuid) returning etiqueta_id),
pdel as (delete from simulado_questao_pasta where tenant_id = $1 and questao_id = $2::uuid and pasta_id in (select (jsonb_array_elements_text($3::jsonb -> 'pastas_novas'))::uuid) returning pasta_id),
pq as (update simulado_prova_questoes p set questao_id = x.orig from jsonb_to_recordset($3::jsonb -> 'prova') as x(id uuid, orig uuid)
  where p.tenant_id = $1 and p.id = x.id and p.questao_id = $2::uuid
    and exists (select 1 from simulado_questoes q where q.id = x.orig and q.tenant_id = $1)
    and not exists (select 1 from simulado_sessoes_prova s where s.simulado_id = p.simulado_id and s.tenant_id = $1) returning p.id),
mest as (update simulado_questoes m set
    disciplina_id = case when jsonb_exists($4::jsonb, 'disciplina_id') then ($4::jsonb ->> 'disciplina_id')::uuid else m.disciplina_id end,
    assunto_id = case when jsonb_exists($4::jsonb, 'assunto_id') then ($4::jsonb ->> 'assunto_id')::uuid else m.assunto_id end,
    banca_id = case when jsonb_exists($4::jsonb, 'banca_id') then ($4::jsonb ->> 'banca_id')::uuid else m.banca_id end,
    orgao_id = case when jsonb_exists($4::jsonb, 'orgao_id') then ($4::jsonb ->> 'orgao_id')::uuid else m.orgao_id end,
    ano = case when jsonb_exists($4::jsonb, 'ano') then ($4::jsonb ->> 'ano')::int else m.ano end,
    nivel_dificuldade = case when jsonb_exists($4::jsonb, 'nivel_dificuldade') then $4::jsonb ->> 'nivel_dificuldade' else m.nivel_dificuldade end,
    cargo = case when jsonb_exists($4::jsonb, 'cargo') then $4::jsonb ->> 'cargo' else m.cargo end,
    assunto_detalhe = case when jsonb_exists($4::jsonb, 'assunto_detalhe') then $4::jsonb ->> 'assunto_detalhe' else m.assunto_detalhe end,
    comentario_professor = case when jsonb_exists($4::jsonb, 'comentario_professor') then $4::jsonb ->> 'comentario_professor' else m.comentario_professor end
  where m.tenant_id = $1 and m.id = $2::uuid and $4::jsonb <> '{}'::jsonb returning m.id)
select (select count(*) from st)::int as status, (select count(*) from fup)::int + (select count(*) from fin)::int as favoritos, (select count(*) from cup)::int as comentarios,
  (select count(*) from bup)::int as feedbacks, (select count(*) from edel)::int as etiquetas, (select count(*) from pdel)::int as bancos, (select count(*) from pq)::int as simulados, (select count(*) from mest)::int as mestre`

export async function desfazer(svc: SupabaseClient, a: Ator, o: { unificacaoId?: string; snapshot?: any; mestreId?: string; duplicadas?: string[] }): Promise<R> {
  const { tenantId } = a
  let snap = o.snapshot, mestreId = o.mestreId, dups = o.duplicadas, uid: string | null = null
  if (o.unificacaoId) {
    if (!UUID.test(o.unificacaoId)) return { ok: false, error: 'Registro inválido.' }
    const r = await sqlQuery<any>('select id, mestre_id, duplicadas, snapshot, desfeito_em from simulado_questoes_unificacoes where tenant_id = $1 and id = $2::uuid', [tenantId, o.unificacaoId])
    if (!r?.[0]) return { ok: false, error: 'Unificação não encontrada.' }
    if (r[0].desfeito_em) return { ok: false, error: 'Esta unificação já foi desfeita.' }
    snap = r[0].snapshot; mestreId = r[0].mestre_id; dups = r[0].duplicadas; uid = r[0].id
  }
  if (!snap || !mestreId || !UUID.test(mestreId) || !Array.isArray(dups)) return { ok: false, error: 'Nada para desfazer.' }
  // só restaura os campos da mestre que ainda têm o valor que a unificação colocou (não desfaz edição posterior)
  let patch: Record<string, any> = {}
  const cd = snap.camposDepois ?? {}, ca = snap.camposAntes ?? {}
  if (Object.keys(cd).length) {
    const cur = (await sqlQuery<any>('select disciplina_id, assunto_id, banca_id, orgao_id, ano, nivel_dificuldade, cargo, assunto_detalhe, comentario_professor from simulado_questoes where tenant_id = $1 and id = $2::uuid', [tenantId, mestreId]))?.[0]
    for (const k of Object.keys(cd)) if (cur && String(cur[k] ?? '') === String(cd[k] ?? '')) patch[k] = ca[k] ?? null
  }
  const r = await sqlQuery<any>(SQL_UNDO, [tenantId, mestreId, JSON.stringify(snap), JSON.stringify(patch)])
  if (!r) return { ok: false, error: 'Falha ao desfazer (nada foi alterado). Tente de novo.' }
  if (uid) await sqlQuery('update simulado_questoes_unificacoes set desfeito_em = now(), desfeito_por = $3 where tenant_id = $1 and id = $2::uuid', [tenantId, uid, a.userId])
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: mestreId, atorId: a.userId, tenantId, depois: { desfazer_unificacao_questoes: true, mestre: mestreId, duplicadas: dups, resultado: r[0], unificacao_id: uid } }).catch(() => {})
  limparCacheUnificar(tenantId)
  return { ok: true, resultado: r[0] }
}

export async function historico(tenantId: string): Promise<{ disponivel: boolean; itens: HistoricoU[] }> {
  const r = await sqlQuery<any>('select id, mestre_id, duplicadas, modo, executado_em, desfeito_em, resumo from simulado_questoes_unificacoes where tenant_id = $1 order by executado_em desc, id limit 30', [tenantId])
  if (!r) return { disponivel: false, itens: [] }
  return { disponivel: true, itens: r.map((x) => ({ id: x.id, mestreId: x.mestre_id, duplicadas: x.duplicadas ?? [], modo: x.modo, executadoEm: new Date(x.executado_em).toISOString(), desfeitoEm: x.desfeito_em ? new Date(x.desfeito_em).toISOString() : null, resumo: x.resumo ?? {} })) }
}

// ─────────────────────────── "Não é duplicada" ───────────────────────────
/** Marca pares como NÃO duplicados. `ids` x `contra` (ou todos os pares de `ids` quando `contra` é omitido). */
export async function ignorar(a: Ator, ids: string[], contra?: string[]): Promise<R> {
  const { tenantId } = a
  const A = [...new Set(ids.filter((x) => UUID.test(x)))].slice(0, 40), B = contra ? [...new Set(contra.filter((x) => UUID.test(x)))].slice(0, 40) : A
  if (A.length < 1 || B.length < 1 || (!contra && A.length < 2)) return { ok: false, error: 'Informe ao menos duas questões.' }
  const r = await sqlQuery<{ n: number }>(`with ins as (
      insert into simulado_questoes_nao_duplicadas (tenant_id, questao_a, questao_b, criado_por)
      select $1::uuid, least(x.id, y.id), greatest(x.id, y.id), $4::uuid
      from (select id from simulado_questoes where tenant_id = $1 and id = any($2::uuid[])) x cross join (select id from simulado_questoes where tenant_id = $1 and id = any($3::uuid[])) y
      where x.id <> y.id on conflict do nothing returning 1)
    select count(*)::int as n from ins`, [tenantId, A, B, a.userId])
  if (!r) return { ok: false, servidor: false, error: 'O registro de “não é duplicada” ainda não existe no banco (migration 20261113050000). Guardado só neste navegador.' }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: A[0], atorId: a.userId, tenantId, depois: { nao_e_duplicada: true, ids: A, contra: contra ? B : undefined, pares: r[0].n } }).catch(() => {})
  invalidarIgnoradas(tenantId)
  return { ok: true, pares: r[0].n }
}

export async function restaurarIgnoradas(a: Ator, ids: string[]): Promise<R> {
  const { tenantId } = a
  const A = [...new Set(ids.filter((x) => UUID.test(x)))].slice(0, 40)
  if (A.length < 2) return { ok: false, error: 'Informe ao menos duas questões.' }
  const r = await sqlQuery<{ n: number }>('with d as (delete from simulado_questoes_nao_duplicadas where tenant_id = $1 and questao_a = any($2::uuid[]) and questao_b = any($2::uuid[]) returning 1) select count(*)::int as n from d', [tenantId, A])
  if (!r) return { ok: false, error: 'Não foi possível restaurar (tabela ausente).' }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: A[0], atorId: a.userId, tenantId, depois: { nao_e_duplicada_removido: true, ids: A, pares: r[0].n } }).catch(() => {})
  invalidarIgnoradas(tenantId)
  return { ok: true, pares: r[0].n }
}
