import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sqlQuery } from '@/lib/data/sql'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { plano } from './texto-plano'
import type {
  DetalheEtiqueta, EtiquetaQ, FiltroEtiquetas, FuncaoEtiquetaQ, IndicadoresEtiquetas, ListaEtiquetas, OrdemEtiquetas, PreviaExcluir, PreviaMesclar, QuestaoMini,
} from './questoes-etiquetas-tipos'

// ETIQUETAS das questões (Biblioteca > Questões > Etiquetas). Tabelas: simulado_etiquetas (nome, cor, funcao?) e
// simulado_questao_etiquetas (N:N, PK questao_id+etiqueta_id). Leituras por SQL agregado (lib/data/sql) com fallback PostgREST tolerante a
// coluna ausente (deletado/funcao/created_at). Lista completa do tenant cacheada 45 s no servidor (poucas centenas de linhas); filtro,
// ordenação e paginação rodam sobre ela. Escritas por PostgREST (o pool SQL pode ser réplica de leitura) + auditoria; limpam o cache.

const TTL = 45_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Ent<T> = { at: number; v: T }
const cacheLista = new Map<string, Ent<{ itens: EtiquetaQ[]; ind: Omit<IndicadoresEtiquetas, 'duplicadas'>; degradado: boolean }>>()
const cacheDet = new Map<string, Ent<DetalheEtiqueta>>()
export function limparCacheEtiquetas(tenantId: string) {
  cacheLista.delete(tenantId)
  for (const k of [...cacheDet.keys()]) if (k.startsWith(tenantId + ':')) cacheDet.delete(k)
}
const FUNCOES = ['anular', 'avisar', 'desconsiderar']
const fn = (v: unknown): FuncaoEtiquetaQ | null => (typeof v === 'string' && FUNCOES.includes(v) ? (v as FuncaoEtiquetaQ) : null)
const iso = (v: unknown) => (v ? new Date(v as any).toISOString() : null)
const pedacos = <T,>(a: T[], n = 500) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
const ptbr = (a: string, b: string) => a.localeCompare(b, 'pt-BR')

// ───────────────────────── lista ─────────────────────────
// UMA ida ao banco: etiquetas + contagens (questões, em simulados, último uso) + totais do banco (total / sem etiqueta) no mesmo SELECT.
// A variante que funcionou (com/sem coluna `funcao`, com/sem `deletado`) fica memorizada — sem tentativas repetidas a cada carga fria.
type Carga = { itens: EtiquetaQ[]; ind: Omit<IndicadoresEtiquetas, 'duplicadas'>; degradado: boolean }
let variante: readonly [boolean, boolean] | null = null
const emVoo = new Map<string, Promise<Carga>>()
async function carregarTodas(svc: SupabaseClient, tenantId: string): Promise<Carga> {
  const qBase = (funcao: boolean, deletado: boolean) => sqlQuery<any>(`with c as (
      select qe.etiqueta_id, count(*) n, max(coalesce(q.updated_at, q.created_at)) ult from simulado_questao_etiquetas qe
        join simulado_questoes q on q.id = qe.questao_id and q.deletado = false where qe.tenant_id = $1 group by 1),
    s as (select qe.etiqueta_id, count(distinct qe.questao_id) n from simulado_questao_etiquetas qe
        join simulado_prova_questoes p on p.questao_id = qe.questao_id where qe.tenant_id = $1 group by 1),
    t as (select count(*)::int as total, (count(*) filter (where not exists (select 1 from simulado_questao_etiquetas e where e.questao_id = q.id)))::int as sem
        from simulado_questoes q where q.tenant_id = $1 and q.deletado = false)
    select e.id::text as id, e.nome, e.cor, ${funcao ? 'e.funcao' : 'null::text as funcao'}, e.created_at,
      coalesce(c.n, 0)::int as questoes, c.ult as ultimo, coalesce(s.n, 0)::int as em_simulados, t.total as t_total, t.sem as t_sem
    from t left join simulado_etiquetas e on e.tenant_id = $1${deletado ? ' and e.deletado = false' : ''}
    left join c on c.etiqueta_id = e.id left join s on s.etiqueta_id = e.id`, [tenantId])
  let r: any[] | null = null
  const ordem = variante ? [variante] : ([[true, true], [true, false], [false, true], [false, false]] as const)
  for (const [f, d] of ordem) { r = await qBase(f, d); if (r) { variante = [f, d]; break } else variante = null }
  let itens: EtiquetaQ[]
  let degradado = false
  let totalQuestoes: number | undefined, semEtiqueta: number | undefined
  if (r) {
    totalQuestoes = r[0]?.t_total; semEtiqueta = r[0]?.t_sem
    itens = r.filter((x) => x.id).map((x) => ({ id: x.id, nome: x.nome, cor: x.cor ?? null, funcao: fn(x.funcao), questoes: x.questoes, emSimulados: x.em_simulados, criadoEm: iso(x.created_at), ultimoUso: iso(x.ultimo), grupoDup: null }))
  } else {
    degradado = true
    let sel: any = await svc.from('simulado_etiquetas').select('id, nome, cor, funcao, created_at').eq('tenant_id', tenantId).eq('deletado', false).order('id', { ascending: true })
    if (sel.error) sel = await svc.from('simulado_etiquetas').select('id, nome, cor, created_at').eq('tenant_id', tenantId).order('id', { ascending: true })
    const vinc = await fetchAll<any>(() => svc.from('simulado_questao_etiquetas').select('questao_id, etiqueta_id').eq('tenant_id', tenantId).order('questao_id', { ascending: true }).order('etiqueta_id', { ascending: true }))
    const n = new Map<string, number>()
    for (const v of vinc) n.set(v.etiqueta_id, (n.get(v.etiqueta_id) ?? 0) + 1)
    itens = ((sel.data ?? []) as any[]).map((x) => ({ id: x.id, nome: x.nome, cor: x.cor ?? null, funcao: fn(x.funcao), questoes: n.get(x.id) ?? 0, emSimulados: 0, criadoEm: iso(x.created_at), ultimoUso: null, grupoDup: null }))
    const t = await svc.from('simulado_questoes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('deletado', false)
    totalQuestoes = t.count ?? 0; semEtiqueta = 0
  }
  return { itens, ind: { etiquetas: itens.length, semUso: itens.filter((e) => e.questoes === 0).length, comFuncao: itens.filter((e) => e.funcao).length, totalQuestoes: totalQuestoes ?? 0, semEtiqueta: semEtiqueta ?? 0 }, degradado }
}
/** Lista completa do tenant em cache (45 s) com single-flight: cargas simultâneas (SSR + API) compartilham a mesma ida ao banco. */
async function listaEmCache(svc: SupabaseClient, tenantId: string, fresh?: boolean): Promise<Carga> {
  const ent = fresh ? undefined : cacheLista.get(tenantId)
  if (ent && Date.now() - ent.at <= TTL) return ent.v
  let p = fresh ? undefined : emVoo.get(tenantId)
  if (!p) { p = carregarTodas(svc, tenantId).finally(() => emVoo.delete(tenantId)); emVoo.set(tenantId, p) }
  const v = await p
  cacheLista.set(tenantId, { at: Date.now(), v })
  return v
}

/** SSR (page.tsx): 1ª página da lista com os parâmetros padrão da tela (nome A-Z, 14/página) + indicadores — o componente renderiza sem chamada. */
export async function carregarInicialEtiquetas(tenantId: string): Promise<ListaEtiquetas | null> {
  try { return await listarEtiquetasQ(createAdminClient(), tenantId, { q: '', filtro: '', sort: 'nome', dir: 'asc', page: 1, pp: 14 }) } catch { return null }
}

export async function listarEtiquetasQ(svc: SupabaseClient, tenantId: string, o: { q?: string; filtro?: FiltroEtiquetas; sort?: OrdemEtiquetas; dir?: 'asc' | 'desc'; page?: number; pp?: number; fresh?: boolean }): Promise<ListaEtiquetas> {
  const { itens: todas, ind, degradado } = await listaEmCache(svc, tenantId, o.fresh)
  // duplicadas por nome normalizado
  const grupos = new Map<string, EtiquetaQ[]>()
  for (const e of todas) { const k = plano(e.nome); if (!k) continue; const a = grupos.get(k) ?? []; a.push(e); grupos.set(k, a) }
  const duplicadas = [...grupos.entries()].filter(([, a]) => a.length > 1).map(([chave, a]) => ({ chave, itens: a.map((e) => ({ id: e.id, nome: e.nome, questoes: e.questoes })) }))
  const dupDe = new Map<string, string>(); for (const d of duplicadas) for (const i of d.itens) dupDe.set(i.id, d.chave)
  const base = todas.map((e) => ({ ...e, grupoDup: dupDe.get(e.id) ?? null }))

  const termo = plano(o.q ?? '')
  let l = base.filter((e) => !termo || plano(e.nome).includes(termo))
  if (o.filtro === 'sem_uso') l = l.filter((e) => e.questoes === 0)
  else if (o.filtro === 'duplicadas') l = l.filter((e) => e.grupoDup)
  else if (o.filtro === 'funcao') l = l.filter((e) => e.funcao)
  else if (o.filtro === 'mais_usadas') { const top = [...base].filter((e) => e.questoes > 0).sort((a, b) => b.questoes - a.questoes).slice(0, 10).map((e) => e.id); const s = new Set(top); l = l.filter((e) => s.has(e.id)) }
  const sort: OrdemEtiquetas = o.sort ?? (o.filtro === 'mais_usadas' ? 'questoes' : 'nome')
  const dir = (o.dir ?? (sort === 'nome' ? 'asc' : 'desc')) === 'desc' ? -1 : 1
  const val = (e: EtiquetaQ) => (sort === 'questoes' ? e.questoes : sort === 'simulados' ? e.emSimulados : sort === 'ultimo' ? (e.ultimoUso ? Date.parse(e.ultimoUso) : 0) : sort === 'criada' ? (e.criadoEm ? Date.parse(e.criadoEm) : 0) : 0)
  l = [...l].sort((a, b) => ((sort === 'nome' ? ptbr(a.nome, b.nome) : val(a) - val(b)) || ptbr(a.nome, b.nome) || (a.id < b.id ? -1 : 1)) * dir)
  const pp = Math.min(100, Math.max(5, o.pp ?? 14)), page = Math.max(1, o.page ?? 1)
  return { itens: l.slice((page - 1) * pp, page * pp), total: l.length, page, pp, indicadores: { ...ind, duplicadas }, degradado }
}

// ───────────────────────── detalhe (drawer) ─────────────────────────
const LIMPA = String.raw`left(btrim(regexp_replace(regexp_replace(coalesce(q.enunciado,''), '<[^>]*>', ' ', 'g'), '\s+', ' ', 'g')), 180)`
const semHtml = (s: unknown) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
const mini = (r: any): QuestaoMini => ({ id: r.id, codigo: r.codigo ?? null, enunciado: r.enunciado ?? '', disciplina: r.disciplina ?? null, banca: r.banca ?? null, atualizadoEm: iso(r.atualizado) })

export async function detalheEtiqueta(svc: SupabaseClient, tenantId: string, id: string, fresh = false): Promise<DetalheEtiqueta> {
  const ck = `${tenantId}:${id}`
  const c = cacheDet.get(ck)
  if (!fresh && c && Date.now() - c.at < TTL) return c.v
  // UMA ida ao banco (antes eram 4 consultas em paralelo disputando o pool): totais, recentes e distribuições num único JSON.
  const limpa = LIMPA.replace('q.enunciado', 'b.enunciado')
  const r = await sqlQuery<{ j: any }>(`with b as (
      select q.id, q.codigo, q.enunciado, q.disciplina_id, q.banca_id, coalesce(q.updated_at, q.created_at) as atualizado,
        not exists (select 1 from simulado_questao_etiquetas o where o.questao_id = q.id and o.etiqueta_id <> qe.etiqueta_id) as sem_outra
      from simulado_questao_etiquetas qe join simulado_questoes q on q.id = qe.questao_id and q.deletado = false
      where qe.tenant_id = $1 and qe.etiqueta_id = $2::uuid)
    select json_build_object(
      'total', (select count(*)::int from b),
      'sem_outra', (select (count(*) filter (where sem_outra))::int from b),
      'recentes', (select coalesce(json_agg(r), '[]'::json) from (select b.id::text as id, b.codigo, ${limpa} as enunciado, d.nome as disciplina, bn.nome as banca, b.atualizado
          from b left join simulado_disciplinas d on d.id = b.disciplina_id left join simulado_bancas bn on bn.id = b.banca_id
          order by b.atualizado desc nulls last, b.id desc limit 12) r),
      'disc', (select coalesce(json_agg(r), '[]'::json) from (select coalesce(d.nome, 'Sem disciplina') as nome, count(*)::int as n from b left join simulado_disciplinas d on d.id = b.disciplina_id group by 1 order by n desc, nome limit 8) r),
      'banca', (select coalesce(json_agg(r), '[]'::json) from (select coalesce(bn.nome, 'Sem banca') as nome, count(*)::int as n from b left join simulado_bancas bn on bn.id = b.banca_id group by 1 order by n desc, nome limit 8) r)
    ) as j`, [tenantId, id])
  let v: DetalheEtiqueta
  const j = r?.[0]?.j
  if (j) {
    v = { total: j.total ?? 0, semOutra: j.sem_outra ?? 0, recentes: (j.recentes ?? []).map(mini), porDisciplina: (j.disc ?? []).map((x: any) => ({ nome: x.nome, n: x.n })), porBanca: (j.banca ?? []).map((x: any) => ({ nome: x.nome, n: x.n })) }
  } else {
    // Fallback PostgREST: total exato + 12 vínculos; distribuições indisponíveis.
    const t = await svc.from('simulado_questao_etiquetas').select('questao_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('etiqueta_id', id)
    const l = await svc.from('simulado_questao_etiquetas').select('questao_id, simulado_questoes(id, codigo, enunciado)').eq('tenant_id', tenantId).eq('etiqueta_id', id).order('questao_id', { ascending: false }).range(0, 11)
    v = {
      total: t.count ?? 0, semOutra: 0, porDisciplina: [], porBanca: [],
      recentes: ((l.data ?? []) as any[]).map((r) => { const q = Array.isArray(r.simulado_questoes) ? r.simulado_questoes[0] : r.simulado_questoes; return { id: r.questao_id, codigo: q?.codigo ?? null, enunciado: semHtml(q?.enunciado), disciplina: null, banca: null, atualizadoEm: null } }),
    }
  }
  cacheDet.set(ck, { at: Date.now(), v })
  return v
}

/** Questões SEM nenhuma etiqueta (candidatas a receber esta). `daEtiqueta`: restringe às disciplinas mais frequentes da própria etiqueta. */
export async function candidatasSemEtiqueta(svc: SupabaseClient, tenantId: string, etiquetaId: string, o: { daEtiqueta?: boolean; q?: string }): Promise<{ itens: QuestaoMini[]; restringiu: boolean } | null> {
  const termo = (o.q ?? '').trim().slice(0, 60)
  const args: any[] = [tenantId]
  let filtro = ''
  let restringiu = false
  if (o.daEtiqueta) {
    args.push(etiquetaId)
    filtro += ` and q.disciplina_id in (select q2.disciplina_id from simulado_questao_etiquetas x join simulado_questoes q2 on q2.id = x.questao_id where x.tenant_id = $1 and x.etiqueta_id = $2::uuid and q2.disciplina_id is not null group by 1 order by count(*) desc limit 3)`
    restringiu = true
  }
  if (termo) { args.push(`%${termo.replace(/[%_]/g, '')}%`); filtro += ` and q.enunciado ilike $${args.length}` }
  const r = await sqlQuery<any>(`select q.id::text as id, q.codigo, ${LIMPA} as enunciado, d.nome as disciplina, b.nome as banca, coalesce(q.updated_at, q.created_at) as atualizado
    from simulado_questoes q left join simulado_disciplinas d on d.id = q.disciplina_id left join simulado_bancas b on b.id = q.banca_id
    where q.tenant_id = $1 and q.deletado = false and not exists (select 1 from simulado_questao_etiquetas e where e.questao_id = q.id)${filtro}
    order by coalesce(q.updated_at, q.created_at) desc nulls last, q.id desc limit 15`, args)
  return r ? { itens: r.map(mini), restringiu } : null
}

// ───────────────────────── prévias ─────────────────────────
export async function previaExcluir(svc: SupabaseClient, tenantId: string, id: string): Promise<PreviaExcluir | null> {
  const r = await sqlQuery<any>(`select e.nome, (select count(*) from simulado_questao_etiquetas x join simulado_questoes q on q.id = x.questao_id and q.deletado = false where x.tenant_id = $1 and x.etiqueta_id = e.id)::int as n,
      (select count(distinct x.questao_id) from simulado_questao_etiquetas x join simulado_prova_questoes p on p.questao_id = x.questao_id where x.tenant_id = $1 and x.etiqueta_id = e.id)::int as s
    from simulado_etiquetas e where e.tenant_id = $1 and e.id = $2::uuid`, [tenantId, id])
  const f = await sqlQuery<any>(`select funcao from simulado_etiquetas where tenant_id = $1 and id = $2::uuid`, [tenantId, id])
  if (r?.[0]) return { nome: r[0].nome, questoes: r[0].n, emSimulados: r[0].s, funcao: fn(f?.[0]?.funcao) }
  const e = await svc.from('simulado_etiquetas').select('id, nome, funcao').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  if (e.error && /funcao/.test(e.error.message)) { const e2 = await svc.from('simulado_etiquetas').select('id, nome').eq('tenant_id', tenantId).eq('id', id).maybeSingle(); if (!e2.data) return null; const c = await svc.from('simulado_questao_etiquetas').select('questao_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('etiqueta_id', id); return { nome: (e2.data as any).nome, questoes: c.count ?? 0, emSimulados: 0, funcao: null } }
  if (!e.data) return null
  const c = await svc.from('simulado_questao_etiquetas').select('questao_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('etiqueta_id', id)
  return { nome: (e.data as any).nome, questoes: c.count ?? 0, emSimulados: 0, funcao: fn((e.data as any).funcao) }
}

export async function previaMesclar(svc: SupabaseClient, tenantId: string, origemIds: string[], destinoId: string): Promise<PreviaMesclar | null> {
  const todos = [...new Set([...origemIds, destinoId])]
  const [r, u] = await Promise.all([
    sqlQuery<any>(`select e.id::text as id, e.nome, (select count(*) from simulado_questao_etiquetas x where x.tenant_id = $1 and x.etiqueta_id = e.id)::int as n
      from simulado_etiquetas e where e.tenant_id = $1 and e.id = any($2::uuid[])`, [tenantId, todos]),
    sqlQuery<any>(`select count(distinct questao_id)::int as n from simulado_questao_etiquetas where tenant_id = $1 and etiqueta_id = any($2::uuid[])`, [tenantId, todos]),
  ])
  const funcs = await lerFuncoes(svc, tenantId, todos)
  if (!r || !u || !funcs) return null
  const dest = r.find((x: any) => x.id === destinoId); if (!dest) return null
  const origens = r.filter((x: any) => x.id !== destinoId)
  return { destino: dest.nome, origens: origens.map((x: any) => ({ id: x.id, nome: x.nome, questoes: x.n })), resultado: u[0]?.n ?? 0, funcaoDiferente: origens.some((x: any) => (funcs.get(x.id) ?? null) !== (funcs.get(destinoId) ?? null)) }
}

async function lerFuncoes(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<Map<string, FuncaoEtiquetaQ | null> | null> {
  const r = await sqlQuery<any>(`select id::text as id, funcao from simulado_etiquetas where tenant_id = $1 and id = any($2::uuid[])`, [tenantId, ids])
  const m = new Map<string, FuncaoEtiquetaQ | null>()
  if (r) { for (const x of r) m.set(x.id, fn(x.funcao)); return m }
  const s = await svc.from('simulado_etiquetas').select('id, funcao').eq('tenant_id', tenantId).in('id', ids)
  if (s.error) { const s2 = await svc.from('simulado_etiquetas').select('id').eq('tenant_id', tenantId).in('id', ids); for (const x of (s2.data ?? []) as any[]) m.set(x.id, null); return m }
  for (const x of (s.data ?? []) as any[]) m.set(x.id, fn(x.funcao))
  return m
}

// ───────────────────────── escritas ─────────────────────────
type Ator = { tenantId: string; userId: string | null }
type R = { ok: boolean; error?: string; [k: string]: any }

/** Nome já usado por outra etiqueta do tenant (comparação normalizada: acento, caixa e pontuação). */
export async function nomeEmUso(svc: SupabaseClient, tenantId: string, nome: string, ignorarId?: string): Promise<string | null> {
  const k = plano(nome)
  const { itens } = (cacheLista.get(tenantId)?.v) ?? (await carregarTodas(svc, tenantId))
  const hit = itens.find((e) => e.id !== ignorarId && plano(e.nome) === k)
  return hit ? hit.nome : null
}

/** Mescla VÁRIAS etiquetas em uma: reaponta os vínculos (sem duplicar), apaga as origens e audita cada uma. Funções diferentes são recusadas. */
export async function mesclarVarias(svc: SupabaseClient, a: Ator, origemIds: string[], destinoId: string): Promise<R> {
  const { tenantId } = a
  const origens = [...new Set(origemIds)].filter((x) => UUID.test(x) && x !== destinoId)
  if (!UUID.test(destinoId) || !origens.length) return { ok: false, error: 'Escolha o destino e ao menos uma etiqueta de origem diferente.' }
  const ids = [destinoId, ...origens]
  const funcs = await lerFuncoes(svc, tenantId, ids)
  const { data: nomes, error: en } = await svc.from('simulado_etiquetas').select('id, nome').eq('tenant_id', tenantId).in('id', ids)
  if (en || !funcs) return { ok: false, error: en?.message ?? 'Falha ao ler as etiquetas.' }
  const nome = new Map<string, string>(((nomes ?? []) as any[]).map((x) => [x.id, x.nome]))
  if (ids.some((i) => !nome.has(i))) return { ok: false, error: 'Etiqueta não encontrada (talvez já excluída). Atualize a lista.' }
  const bad = origens.find((o) => (funcs.get(o) ?? null) !== (funcs.get(destinoId) ?? null))
  if (bad) return { ok: false, error: `“${nome.get(bad)}” tem função diferente do destino. Mesclar mudaria a correção dos simulados; não permitido.` }
  let movidas = 0, mescladas = 0
  for (const o of origens) {
    const qids: string[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await svc.from('simulado_questao_etiquetas').select('questao_id').eq('tenant_id', tenantId).eq('etiqueta_id', o).order('questao_id', { ascending: true }).range(from, from + 999)
      if (error) { limparCacheEtiquetas(tenantId); return { ok: false, error: error.message, mescladas, movidas } }
      qids.push(...((data ?? []) as any[]).map((x) => x.questao_id)); if ((data ?? []).length < 1000) break
    }
    for (const c of pedacos(qids)) {
      const r = await svc.from('simulado_questao_etiquetas').upsert(c.map((questao_id) => ({ tenant_id: tenantId, questao_id, etiqueta_id: destinoId })), { onConflict: 'questao_id,etiqueta_id', ignoreDuplicates: true })
      if (r.error) { limparCacheEtiquetas(tenantId); return { ok: false, error: `Falha ao mover os vínculos de “${nome.get(o)}”: ${r.error.message}. Ela foi mantida.`, mescladas, movidas } }
    }
    const dv = await svc.from('simulado_questao_etiquetas').delete().eq('tenant_id', tenantId).eq('etiqueta_id', o)
    if (dv.error) { limparCacheEtiquetas(tenantId); return { ok: false, error: dv.error.message, mescladas, movidas } }
    const de = await svc.from('simulado_etiquetas').delete().eq('tenant_id', tenantId).eq('id', o)
    if (de.error) { limparCacheEtiquetas(tenantId); return { ok: false, error: de.error.message, mescladas, movidas } }
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_etiquetas', entidadeId: destinoId, atorId: a.userId, tenantId, antes: { origem: { id: o, nome: nome.get(o) } }, depois: { mesclou_etiqueta: nome.get(o), em: nome.get(destinoId), questoes_movidas: qids.length } }).catch(() => {})
    movidas += qids.length; mescladas++
  }
  limparCacheEtiquetas(tenantId)
  return { ok: true, mescladas, movidas, destino: nome.get(destinoId) }
}

/** Aplica ou remove a etiqueta em questões escolhidas (máx. 200, validadas por tenant). */
export async function massaEtiqueta(svc: SupabaseClient, a: Ator, etiquetaId: string, ids: string[], remover: boolean): Promise<R> {
  const { tenantId } = a
  if (!UUID.test(etiquetaId)) return { ok: false, error: 'Etiqueta inválida.' }
  const { data: et } = await svc.from('simulado_etiquetas').select('id, nome').eq('tenant_id', tenantId).eq('id', etiquetaId).maybeSingle()
  if (!et) return { ok: false, error: 'Etiqueta não encontrada.' }
  const validas: string[] = []
  for (const c of pedacos([...new Set(ids)].filter((x) => UUID.test(x)), 80)) {
    const { data } = await svc.from('simulado_questoes').select('id').eq('tenant_id', tenantId).eq('deletado', false).in('id', c).order('id', { ascending: true })
    validas.push(...((data ?? []) as any[]).map((x) => x.id))
  }
  if (!validas.length) return { ok: false, error: 'Nenhuma questão válida.' }
  for (const c of pedacos(validas, 200)) {
    const r = remover
      ? await svc.from('simulado_questao_etiquetas').delete().eq('tenant_id', tenantId).eq('etiqueta_id', etiquetaId).in('questao_id', c)
      : await svc.from('simulado_questao_etiquetas').upsert(c.map((questao_id) => ({ tenant_id: tenantId, questao_id, etiqueta_id: etiquetaId })), { onConflict: 'questao_id,etiqueta_id', ignoreDuplicates: true })
    if (r.error) { limparCacheEtiquetas(tenantId); return { ok: false, error: r.error.message } }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: validas[0], atorId: a.userId, tenantId, depois: { acao_em_massa: remover ? 'remover_etiqueta' : 'aplicar_etiqueta', etiqueta_id: etiquetaId, etiqueta: (et as any).nome, questoes: validas.length, ids: validas.slice(0, 50) } }).catch(() => {})
  limparCacheEtiquetas(tenantId)
  return { ok: true, atualizadas: validas.length }
}
