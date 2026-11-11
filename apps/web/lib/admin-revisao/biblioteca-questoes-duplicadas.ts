import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sqlQuery } from '@/lib/data/sql'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { plano, semHtml } from './texto-plano'
import { deteccaoCache, invalidarDeteccao } from './cache-deteccao'
import type { GrupoDup, MembroDup, NivelDup, RespostaDup, UsoQ } from './biblioteca-questoes-gestao-tipos'

// DETECÇÃO DE QUESTÕES DUPLICADAS/PARECIDAS (Biblioteca › Questões › Unificar). Tudo no servidor e CACHEADO (5 min por tenant):
// não varre as questões a cada clique. Normalização: sem HTML/acento/caixa/pontuação. Regras (da mais forte à mais fraca):
//   identica   = mesmo enunciado normalizado + mesmas alternativas (conjunto) + mesmo gabarito
//   codigo     = mesmo external_id (código de origem da importação)
//   enunciado  = mesmo enunciado (≥ 40 caracteres) mas alternativas/gabarito diferentes
//   semelhante = enunciado ≥ 90% igual (Jaccard de palavras) e alternativas ≥ 60% iguais, achados por blocos (início/fim do texto)
// Grupos = componentes conectados; o nível do grupo é o da ligação MAIS FRACA usada para formá-lo.

const TTL = 5 * 60_000
const RANK: Record<NivelDup, number> = { identica: 0, codigo: 1, enunciado: 2, semelhante: 3 }
const NIVEIS: NivelDup[] = ['identica', 'codigo', 'enunciado', 'semelhante']

export { plano, semHtml }

interface Base { id: string; ext: string | null; status: string | null; enun: string; alt: string; gab: string; toks: string[]; altSet: string[]; amostra: string }
interface Grupo { id: string; nivel: NivelDup; ids: string[]; ativas: number; amostra: string; usado: boolean }
interface Entrada { at: number; grupos: Grupo[]; total: number }
export function limparCacheDuplicadas(tenantId: string) { invalidarDeteccao(`dup:${tenantId}`) }

async function carregarBase(svc: SupabaseClient, tenantId: string): Promise<{ qs: any[]; alts: any[]; degradado: boolean }> {
  const qs = await sqlQuery<any>('select id, external_id, status, tipo, enunciado from simulado_questoes where tenant_id = $1 and deletado = false', [tenantId])
  const alts = qs ? await sqlQuery<any>('select a.questao_id, a.texto, a.correta from simulado_alternativas a join simulado_questoes q on q.id = a.questao_id where q.tenant_id = $1 and q.deletado = false', [tenantId]) : null
  if (qs && alts) return { qs, alts, degradado: false }
  const q2 = await fetchAll<any>(() => svc.from('simulado_questoes').select('id, external_id, status, tipo, enunciado').eq('tenant_id', tenantId).eq('deletado', false).order('id', { ascending: true }))
  const ids = q2.map((r) => r.id as string)
  const a2 = await fetchAllByIn<any>(ids, (c) => svc.from('simulado_alternativas').select('id, questao_id, texto, correta').in('questao_id', c).order('id', { ascending: true }), { chunk: 80 }).catch(() => [])
  return { qs: q2, alts: a2, degradado: true }
}

function montarBase(qs: any[], alts: any[]): Base[] {
  const porQ = new Map<string, { t: string; c: boolean }[]>()
  for (const a of alts) { const arr = porQ.get(a.questao_id) ?? []; arr.push({ t: plano(a.texto), c: !!a.correta }); porQ.set(a.questao_id, arr) }
  return qs.map((q) => {
    const A = porQ.get(q.id) ?? []
    const enun = plano(q.enunciado)
    return {
      id: q.id, ext: (q.external_id ?? '').trim() || null, status: q.status ?? null, enun,
      alt: A.map((x) => x.t).sort().join('|'), gab: A.filter((x) => x.c).map((x) => x.t).sort().join('|'),
      toks: [...new Set(enun.split(' ').filter(Boolean))], altSet: A.map((x) => x.t), amostra: semHtml(q.enunciado).slice(0, 180),
    }
  })
}

const jaccard = (a: string[], b: string[]) => {
  if (!a.length && !b.length) return 1
  const s = new Set(a); let inter = 0
  for (const x of new Set(b)) if (s.has(x)) inter++
  return inter / (new Set([...a, ...b]).size || 1)
}

/** Constrói os grupos (CPU pura sobre a base já carregada). */
export function detectar(base: Base[]): Grupo[] {
  const pai = new Map<string, string>()
  const find = (x: string): string => { let r = x; while (pai.get(r) !== r) r = pai.get(r)!; let c = x; while (pai.get(c) !== r) { const n = pai.get(c)!; pai.set(c, r); c = n } return r }
  for (const b of base) pai.set(b.id, b.id)
  const arestas: { a: string; b: string; n: NivelDup }[] = []
  const ligar = (a: string, b: string, n: NivelDup) => { arestas.push({ a, b, n }); const ra = find(a), rb = find(b); if (ra !== rb) pai.set(ra, rb) }

  // 1) enunciado igual → idêntica (alt+gab iguais) ou "enunciado" (alternativas diferentes, só se o enunciado não for genérico)
  const porEnun = new Map<string, Base[]>()
  for (const b of base) if (b.enun) (porEnun.get(b.enun) ?? porEnun.set(b.enun, []).get(b.enun)!).push(b)
  const jaLigados = new Set<string>()
  for (const [k, arr] of porEnun) {
    if (arr.length < 2) continue
    const sub = new Map<string, Base[]>()
    for (const b of arr) (sub.get(b.alt + '#' + b.gab) ?? sub.set(b.alt + '#' + b.gab, []).get(b.alt + '#' + b.gab)!).push(b)
    for (const s of sub.values()) for (let i = 1; i < s.length; i++) { ligar(s[0].id, s[i].id, 'identica'); jaLigados.add(s[i].id + '|' + s[0].id) }
    if (sub.size > 1 && k.length >= 40) { const reps = [...sub.values()].map((s) => s[0]); for (let i = 1; i < reps.length; i++) ligar(reps[0].id, reps[i].id, 'enunciado') }
  }
  // 2) mesmo código externo
  const porExt = new Map<string, Base[]>()
  for (const b of base) if (b.ext) (porExt.get(b.ext) ?? porExt.set(b.ext, []).get(b.ext)!).push(b)
  for (const arr of porExt.values()) for (let i = 1; i < arr.length; i++) ligar(arr[0].id, arr[i].id, 'codigo')
  // 3) semelhantes, por blocos (5 primeiras e 5 últimas palavras)
  const blocos = new Map<string, Base[]>()
  for (const b of base) {
    if (b.toks.length < 8) continue
    const w = b.enun.split(' ')
    for (const k of ['i:' + w.slice(0, 5).join(' '), 'f:' + w.slice(-5).join(' ')]) (blocos.get(k) ?? blocos.set(k, []).get(k)!).push(b)
  }
  const visto = new Set<string>()
  for (const arr of blocos.values()) {
    if (arr.length < 2 || arr.length > 150) continue
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const A = arr[i], B = arr[j]
      if (A.enun === B.enun) continue
      const key = A.id < B.id ? A.id + B.id : B.id + A.id
      if (visto.has(key)) continue; visto.add(key)
      if (Math.abs(A.toks.length - B.toks.length) > Math.max(3, A.toks.length * 0.15)) continue
      if (jaccard(A.toks, B.toks) < 0.9) continue
      if (jaccard(A.altSet, B.altSet) < 0.6) continue
      ligar(A.id, B.id, 'semelhante')
    }
  }

  const porRaiz = new Map<string, string[]>()
  for (const b of base) { const r = find(b.id); (porRaiz.get(r) ?? porRaiz.set(r, []).get(r)!).push(b.id) }
  const nivelRaiz = new Map<string, number>()
  for (const e of arestas) { const r = find(e.a); nivelRaiz.set(r, Math.max(nivelRaiz.get(r) ?? 0, RANK[e.n])) }
  const porId = new Map(base.map((b) => [b.id, b]))
  const out: Grupo[] = []
  for (const [r, ids] of porRaiz) {
    if (ids.length < 2) continue
    ids.sort()
    out.push({ id: ids[0], nivel: NIVEIS[nivelRaiz.get(r) ?? 0], ids, ativas: ids.filter((i) => porId.get(i)!.status !== 'arquivada').length, amostra: porId.get(ids[0])!.amostra, usado: false })
  }
  return out
}

async function idsEmUso(svc: SupabaseClient, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const r = await sqlQuery<{ questao_id: string }>('select distinct questao_id from simulado_prova_questoes where questao_id = any($1::uuid[])', [ids])
  if (r) return new Set(r.map((x) => x.questao_id))
  const rows = await fetchAllByIn<any>(ids, (c) => svc.from('simulado_prova_questoes').select('id, questao_id').in('questao_id', c).order('id', { ascending: true }), { chunk: 80 }).catch(() => [])
  return new Set(rows.map((x: any) => x.questao_id))
}

async function calcular(svc: SupabaseClient, tenantId: string): Promise<Entrada> {
  const { qs, alts } = await carregarBase(svc, tenantId)
  const grupos = detectar(montarBase(qs, alts))
  const uso = await idsEmUso(svc, grupos.flatMap((g) => g.ids))
  for (const g of grupos) g.usado = g.ids.some((i) => uso.has(i))
  grupos.sort((a, b) => RANK[a.nivel] - RANK[b.nivel] || b.ids.length - a.ids.length || a.amostra.localeCompare(b.amostra, 'pt-BR'))
  return { at: Date.now(), grupos, total: qs.length }
}

export async function gruposDuplicados(svc: SupabaseClient, tenantId: string, fresh = false): Promise<Entrada> {
  // single-flight + stale-while-revalidate (cache-deteccao): uma única varredura por tenant, mesmo com chamadas simultâneas
  return deteccaoCache(`dup:${tenantId}`, () => calcular(svc, tenantId), { ttl: TTL, fresh })
}

/** Ids das duplicadas pendentes SE a detecção já estiver em cache (não dispara cálculo); null = ainda não calculada. */
export function duplicadasEmCache(tenantId: string): string[] | null {
  const g = (globalThis as unknown as { __deteccaoCache?: { val: Map<string, { v: unknown }> } }).__deteccaoCache
  const e = g?.val.get(`dup:${tenantId}`)?.v as Entrada | undefined
  return e ? e.grupos.filter((x) => x.ativas >= 2).flatMap((x) => x.ids) : null
}
/** Aquece a detecção em segundo plano (single-flight; erros ignorados) — o resumo do Banco nunca espera por ela. */
export function aquecerDuplicadas(svc: SupabaseClient, tenantId: string) { void gruposDuplicados(svc, tenantId).catch(() => {}) }

/** Ids das questões em grupos AINDA PENDENTES (≥ 2 ativas) — alimenta a visão "Duplicadas suspeitas" do Banco. */
export async function idsDuplicadas(svc: SupabaseClient, tenantId: string): Promise<string[]> {
  const e = await gruposDuplicados(svc, tenantId)
  return e.grupos.filter((g) => g.ativas >= 2).flatMap((g) => g.ids)
}
export async function totalDuplicadasPendentes(svc: SupabaseClient, tenantId: string): Promise<number> {
  return (await idsDuplicadas(svc, tenantId)).length
}

export async function paginaDuplicados(svc: SupabaseClient, tenantId: string, o: { nivel?: string; uso?: string; q?: string; resolvidas?: boolean; page: number; pp: number; fresh?: boolean }): Promise<RespostaDup> {
  const e = await gruposDuplicados(svc, tenantId, o.fresh)
  const base = e.grupos.filter((g) => (o.resolvidas ? g.ativas < 2 : g.ativas >= 2))
  const porNivel: Record<NivelDup, number> = { identica: 0, codigo: 0, enunciado: 0, semelhante: 0 }
  for (const g of base) porNivel[g.nivel]++
  const termo = plano(o.q ?? '')
  const filtrados = base.filter((g) => (!o.nivel || g.nivel === o.nivel) && (o.uso === 'usado' ? g.usado : o.uso === 'livre' ? !g.usado : true) && (!termo || plano(g.amostra).includes(termo)))
  const pp = Math.min(50, Math.max(5, o.pp || 14)), page = Math.max(1, o.page || 1)
  const itens = filtrados.slice((page - 1) * pp, page * pp)
  const grupos: GrupoDup[] = itens.map((g) => ({ id: g.id, nivel: g.nivel, n: g.ids.length, ativas: g.ativas, amostra: g.amostra, ids: g.ids, usado: g.usado }))
  return { grupos, total: filtrados.length, page, pp, totalQuestoes: e.total, geradoEm: e.at, porNivel }
}

/** Contagem de vínculos de cada questão (para a prévia de impacto e a comparação lado a lado). */
export async function usoDeQuestoes(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<Record<string, UsoQ>> {
  const vazio = (): UsoQ => ({ simulados: 0, respostas: 0, favoritos: 0, comentarios: 0, feedbacks: 0, bancos: 0, conteudos: 0 })
  const out: Record<string, UsoQ> = {}; for (const i of ids) out[i] = vazio()
  if (!ids.length) return out
  const r = await sqlQuery<any>(`
    select x.id,
      (select count(distinct u.simulado_id) from (select simulado_id from simulado_prova_questoes where questao_id = x.id union select simulado_id from simulado_simulado_questoes where questao_id = x.id) u)::int as simulados,
      (select count(*) from simulado_respostas_objetivas where questao_id = x.id)::int as respostas,
      (select count(*) from simulado_favoritos where questao_id = x.id)::int as favoritos,
      (select count(*) from simulado_comentarios_questao where questao_id = x.id)::int as comentarios,
      (select count(*) from simulado_feedbacks_questao where questao_id = x.id)::int as feedbacks,
      (select count(*) from simulado_questao_pasta where questao_id = x.id)::int as bancos,
      ((select count(*) from simulado_conteudo_quiz_questoes where questao_id = x.id) + (select count(*) from simulado_cronograma_meta_questoes where questao_id = x.id) + (select count(*) from simulado_questao_conjunto_itens where questao_id = x.id))::int as conteudos
    from unnest($1::uuid[]) as x(id)
    where exists (select 1 from simulado_questoes q where q.id = x.id and q.tenant_id = $2)`, [ids, tenantId])
  if (r) { for (const l of r) out[l.id] = { simulados: l.simulados, respostas: l.respostas, favoritos: l.favoritos, comentarios: l.comentarios, feedbacks: l.feedbacks, bancos: l.bancos, conteudos: l.conteudos }; return out }
  // fallback PostgREST (poucos ids)
  const cnt = async (tabela: string, id: string) => (await svc.from(tabela).select('*', { count: 'exact', head: true }).eq('questao_id', id)).count ?? 0
  await Promise.all(ids.map(async (id) => {
    const [sim, resp, fav, com, fb, ban, q1, q2, q3] = await Promise.all(['simulado_prova_questoes', 'simulado_respostas_objetivas', 'simulado_favoritos', 'simulado_comentarios_questao', 'simulado_feedbacks_questao', 'simulado_questao_pasta', 'simulado_conteudo_quiz_questoes', 'simulado_cronograma_meta_questoes', 'simulado_questao_conjunto_itens'].map((t) => cnt(t, id)))
    out[id] = { simulados: sim, respostas: resp, favoritos: fav, comentarios: com, feedbacks: fb, bancos: ban, conteudos: q1 + q2 + q3 }
  }))
  return out
}

/** Dados completos dos membros de um grupo, para a revisão lado a lado. */
export async function membrosDoGrupo(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<MembroDup[]> {
  const lista = ids.slice(0, 12)
  if (!lista.length) return []
  const [uso, qs, alts, ets] = await Promise.all([
    usoDeQuestoes(svc, tenantId, lista),
    sqlQuery<any>(`select q.id, q.codigo, q.status, q.enunciado, q.ano, q.cargo, q.nivel_dificuldade, coalesce(q.versao, 1) as versao, coalesce(q.anulada, false) as anulada, q.external_id, q.created_at,
        d.nome as disciplina, a.nome as assunto, b.nome as banca, o.nome as orgao
      from simulado_questoes q left join simulado_disciplinas d on d.id = q.disciplina_id left join simulado_assuntos a on a.id = q.assunto_id
      left join simulado_bancas b on b.id = q.banca_id left join simulado_orgaos o on o.id = q.orgao_id
      where q.tenant_id = $1 and q.deletado = false and q.id = any($2::uuid[])`, [tenantId, lista]),
    sqlQuery<any>('select questao_id, ordem, texto, correta from simulado_alternativas where questao_id = any($1::uuid[]) order by questao_id, ordem', [lista]),
    sqlQuery<any>('select qe.questao_id, e.id, e.nome, e.cor from simulado_questao_etiquetas qe join simulado_etiquetas e on e.id = qe.etiqueta_id where qe.questao_id = any($1::uuid[]) and e.deletado = false', [lista]),
  ])
  let linhas = qs
  if (!linhas) {
    const r = await svc.from('simulado_questoes').select('id, codigo, status, enunciado, ano, cargo, nivel_dificuldade, versao, anulada, external_id, created_at, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome), bancas:simulado_bancas(nome), orgaos:simulado_orgaos(nome)').eq('tenant_id', tenantId).eq('deletado', false).in('id', lista)
    linhas = ((r.data ?? []) as any[]).map((x) => ({ ...x, disciplina: x.disciplinas?.nome ?? null, assunto: x.assuntos?.nome ?? null, banca: x.bancas?.nome ?? null, orgao: x.orgaos?.nome ?? null, versao: x.versao ?? 1, anulada: !!x.anulada }))
  }
  const altsOk = alts ?? ((await svc.from('simulado_alternativas').select('questao_id, ordem, texto, correta').in('questao_id', lista).order('ordem', { ascending: true })).data ?? [])
  const etsOk = ets ?? (((await svc.from('simulado_questao_etiquetas').select('questao_id, etiqueta_id, e:simulado_etiquetas(id, nome, cor)').in('questao_id', lista)).data ?? []) as any[]).map((x) => ({ questao_id: x.questao_id, id: x.e?.id, nome: x.e?.nome, cor: x.e?.cor })).filter((x) => x.id)
  return lista.map((id) => linhas!.find((l: any) => l.id === id)).filter(Boolean).map((l: any) => ({
    id: l.id, codigo: l.codigo ?? null, status: l.status ?? null, enunciado: String(l.enunciado ?? ''), disciplina: l.disciplina ?? null, assunto: l.assunto ?? null, banca: l.banca ?? null, orgao: l.orgao ?? null,
    ano: l.ano ?? null, cargo: l.cargo ?? null, nivel: l.nivel_dificuldade ?? null, versao: Number(l.versao ?? 1), anulada: !!l.anulada, externalId: l.external_id ?? null,
    criadoEm: l.created_at ? new Date(l.created_at).toISOString() : null,
    alternativas: (altsOk as any[]).filter((a) => a.questao_id === l.id).map((a) => ({ ordem: a.ordem ?? 0, texto: String(a.texto ?? ''), correta: !!a.correta })),
    etiquetas: (etsOk as any[]).filter((e) => e.questao_id === l.id).map((e) => ({ id: e.id, nome: e.nome, cor: e.cor ?? null })),
    uso: uso[l.id],
  }))
}

/** Chaves normalizadas de um conjunto de questões (revalidação no servidor antes de unificar). */
export async function chavesDe(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<Map<string, Base>> {
  const qs = await sqlQuery<any>('select id, external_id, status, tipo, enunciado from simulado_questoes where tenant_id = $1 and deletado = false and id = any($2::uuid[])', [tenantId, ids])
    ?? ((await svc.from('simulado_questoes').select('id, external_id, status, tipo, enunciado').eq('tenant_id', tenantId).eq('deletado', false).in('id', ids)).data ?? [])
  const alts = await sqlQuery<any>('select questao_id, texto, correta from simulado_alternativas where questao_id = any($1::uuid[])', [ids])
    ?? ((await svc.from('simulado_alternativas').select('questao_id, texto, correta').in('questao_id', ids)).data ?? [])
  return new Map(montarBase(qs as any[], alts as any[]).map((b) => [b.id, b]))
}
