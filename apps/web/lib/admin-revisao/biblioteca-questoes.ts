import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sqlQuery } from '@/lib/data/sql'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import type { ArvoreBib, NoPasta, ResumoBib } from './biblioteca-tipos'
import { idsDuplicadas, limparCacheDuplicadas } from './biblioteca-questoes-duplicadas'
import { VIS_SQL } from './biblioteca-questoes-vis'
import { limparCacheGestao } from './biblioteca-questoes-gestao'
import { AGRUPAMENTOS_Q, RAIZ_Q, compactarArvore, type AgrupamentoQ, type EstadoQ, type LinhaQuestaoBib, type OpcoesQ, type RespostaQ } from './biblioteca-questoes-tipos'

// BANCO DE QUESTÕES na Biblioteca (aba "Questões"): árvore por taxonomia da questão + lista paginada.
// Tudo no SERVIDOR: SQL agregado (lib/data/sql) com fallback PostgREST tolerante. A árvore e as opções ficam em cache de 30 s
// (limparCacheQuestoes após qualquer mutação em massa). A lista NÃO é cacheada aqui (o cliente guarda 60 s por chave).

const TTL = 30_000
type Entrada<T> = { at: number; v: T }
const cArvore = new Map<string, Entrada<ArvoreBib>>()
const cOpcoes = new Map<string, Entrada<OpcoesQ>>()
const cTotal = new Map<string, Entrada<number>>()
const fresco = <T,>(m: Map<string, Entrada<T>>, k: string): T | undefined => { const e = m.get(k); return e && Date.now() - e.at < TTL ? e.v : undefined }

export function limparCacheQuestoes(tenantId: string) {
  limparCacheDuplicadas(tenantId)
  limparCacheGestao(tenantId)
  for (const m of [cArvore, cOpcoes, cTotal] as Map<string, Entrada<any>>[]) for (const k of [...m.keys()]) if (k.startsWith(tenantId)) m.delete(k)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ptbr = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
const ROTULO_DIF: Record<string, string> = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }
const ROTULO_STATUS: Record<string, string> = { publicada: 'Publicada', rascunho: 'Rascunho', arquivada: 'Arquivada' }
const ROTULO_TIPO: Record<string, string> = { objetiva: 'Objetiva', discursiva: 'Discursiva' }
const ORDEM_FIXA: Record<string, string[]> = { dificuldade: ['facil', 'medio', 'dificil'], status: ['publicada', 'rascunho', 'arquivada'], tipo: ['objetiva', 'discursiva'] }

const stripHtml = (s: string) => (s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

// ─────────────────────────── total do banco ───────────────────────────
export async function totalBanco(svc: SupabaseClient, tenantId: string): Promise<number> {
  const hit = fresco(cTotal, tenantId); if (hit !== undefined) return hit
  const r = await sqlQuery<{ n: number }>('select count(*)::int as n from simulado_questoes where tenant_id = $1 and deletado = false', [tenantId])
  let n = r?.[0]?.n
  if (n === undefined) {
    const { count } = await svc.from('simulado_questoes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('deletado', false)
    n = count ?? 0
  }
  cTotal.set(tenantId, { at: Date.now(), v: n })
  return n
}

// ─────────────────────────── árvore ───────────────────────────
const no = (id: string, nome: string, paiId: string | null, proprios: number, extra: Partial<NoPasta> = {}): NoPasta => ({
  id, nome, paiId, cor: null, disciplinaId: null, classificacao: null, tipoMaterial: null, restrito: false, proprios, total: proprios, ...extra,
})

/** Soma as contagens dos filhos nos pais (total = próprios + descendentes). */
function totalizar(nos: NoPasta[]) {
  const porId = new Map(nos.map((n) => [n.id, n])); const filhos = new Map<string, NoPasta[]>()
  for (const n of nos) if (n.paiId) (filhos.get(n.paiId) ?? filhos.set(n.paiId, []).get(n.paiId)!).push(n)
  const calc = (n: NoPasta, prof = 0): number => { if (prof > 30) return n.proprios; n.total = n.proprios + (filhos.get(n.id) ?? []).reduce((s, f) => s + calc(f, prof + 1), 0); return n.total }
  for (const n of nos) if (!n.paiId || !porId.has(n.paiId)) calc(n)
}

export async function arvoreQuestoes(svc: SupabaseClient, tenantId: string, agrupar: AgrupamentoQ): Promise<ArvoreBib> {
  const k = `${tenantId}|${agrupar}`
  const hit = fresco(cArvore, k); if (hit) return hit
  const v = agrupar === 'disciplina' ? await arvoreDisciplina(svc, tenantId) : await arvorePlana(svc, tenantId, agrupar)
  cArvore.set(k, { at: Date.now(), v })
  return v
}

async function arvoreDisciplina(svc: SupabaseClient, tenantId: string): Promise<ArvoreBib> {
  type Par = { d: string | null; a: string | null; n: number }
  let pares = await sqlQuery<Par>('select disciplina_id as d, assunto_id as a, count(*)::int as n from simulado_questoes where tenant_id = $1 and deletado = false group by 1, 2', [tenantId])
  let discs = await sqlQuery<{ id: string; nome: string; cor: string | null; classificacao: string | null }>('select id, nome, cor, classificacao from simulado_disciplinas where tenant_id = $1', [tenantId])
  let assuntos = await sqlQuery<{ id: string; nome: string; pai_id: string | null }>('select id, nome, pai_id from simulado_assuntos where tenant_id = $1', [tenantId])
  if (!pares) {
    const rows = await fetchAll<any>(() => svc.from('simulado_questoes').select('id, disciplina_id, assunto_id').eq('tenant_id', tenantId).eq('deletado', false).order('id', { ascending: true }))
    const m = new Map<string, Par>()
    for (const r of rows) { const key = `${r.disciplina_id}|${r.assunto_id}`; const p = m.get(key) ?? { d: r.disciplina_id ?? null, a: r.assunto_id ?? null, n: 0 }; p.n++; m.set(key, p) }
    pares = [...m.values()]
  }
  if (!discs) discs = await fetchAll<any>(() => svc.from('simulado_disciplinas').select('id, nome, cor, classificacao').eq('tenant_id', tenantId).order('id', { ascending: true }))
  if (!assuntos) assuntos = await fetchAll<any>(() => svc.from('simulado_assuntos').select('id, nome, pai_id').eq('tenant_id', tenantId).order('id', { ascending: true }))

  const nomeAss = new Map(assuntos.map((a) => [a.id, a]))
  const nodes = new Map<string, NoPasta>()
  const garantir = (n: NoPasta) => { if (!nodes.has(n.id)) nodes.set(n.id, n); return nodes.get(n.id)! }
  let semDisc = 0
  const discUsadas = new Set<string>()
  for (const p of pares) {
    if (!p.d) semDisc += p.n
    else discUsadas.add(p.d)
  }
  for (const d of discs) {
    garantir(no(`d:${d.id}`, d.nome ?? '—', null, 0, { cor: d.cor ?? null, disciplinaId: d.id, classificacao: d.classificacao ?? null }))
  }
  // disciplina referenciada por questão mas ausente do cadastro (não deveria ocorrer)
  for (const id of discUsadas) garantir(no(`d:${id}`, 'Disciplina removida', null, 0, { disciplinaId: id }))

  for (const p of pares) {
    const dKey = p.d ?? '_'
    const dNode = p.d ? nodes.get(`d:${p.d}`)! : null
    if (!p.a) { if (dNode) dNode.proprios += p.n; continue }
    const a = nomeAss.get(p.a)
    // ancestrais do assunto (pai_id) — hoje não há uso, mas a árvore já aceita subassuntos
    const cadeia: string[] = []; let cur: string | null = p.a; let g = 0
    while (cur && g++ < 12) { cadeia.unshift(cur); cur = nomeAss.get(cur)?.pai_id ?? null }
    cadeia.forEach((aid, i) => {
      const id = `a:${dKey}:${aid}`
      const pai = i === 0 ? (dNode ? dNode.id : null) : `a:${dKey}:${cadeia[i - 1]}`
      const n = garantir(no(id, nomeAss.get(aid)?.nome ?? (a?.nome ?? 'Assunto'), pai, 0))
      if (i === cadeia.length - 1) n.proprios += p.n
    })
  }
  // "Sem assunto" (só quando a disciplina também tem assuntos) — as questões sem assunto ficam nesse nó
  const temFilhoAssunto = new Set<string>()
  for (const n of nodes.values()) if (n.id.startsWith('a:') && n.paiId?.startsWith('d:')) temFilhoAssunto.add(n.paiId)
  for (const d of [...nodes.values()].filter((n) => n.id.startsWith('d:'))) {
    if (temFilhoAssunto.has(d.id) && d.proprios > 0) { garantir(no(`sa:${d.disciplinaId}`, 'Sem assunto', d.id, d.proprios)); d.proprios = 0 }
  }
  const todos = [...nodes.values()]
  totalizar(todos)
  const ordenados = todos.sort((a, b) => {
    const sa = a.id.startsWith('sa:') ? 1 : 0, sb = b.id.startsWith('sa:') ? 1 : 0
    return sa - sb || ptbr(a.nome, b.nome)
  })
  return { nos: ordenados, semPasta: semDisc, categoria: 'conteudo' }
}

async function arvorePlana(svc: SupabaseClient, tenantId: string, ag: Exclude<AgrupamentoQ, 'disciplina'>): Promise<ArvoreBib> {
  const COL: Record<string, string> = { banca: 'banca_id', orgao: 'orgao_id', ano: 'ano', cargo: 'cargo', dificuldade: 'nivel_dificuldade', status: 'status', tipo: 'tipo' }
  const PREF: Record<string, string> = { banca: 'b', orgao: 'o', ano: 'y', cargo: 'c', dificuldade: 'f', status: 's', tipo: 't', etiqueta: 'e' }
  let pares: { v: string | number | null; n: number }[] | null
  let nomes = new Map<string, { nome: string; cor?: string | null }>()
  let sem = 0
  if (ag === 'etiqueta') {
    pares = await sqlQuery('select e.etiqueta_id::text as v, count(*)::int as n from simulado_questao_etiquetas e join simulado_questoes q on q.id = e.questao_id where q.tenant_id = $1 and q.deletado = false group by 1', [tenantId])
    const s = await sqlQuery<{ n: number }>('select count(*)::int as n from simulado_questoes q where q.tenant_id = $1 and q.deletado = false and not exists (select 1 from simulado_questao_etiquetas e where e.questao_id = q.id)', [tenantId])
    let ets = await sqlQuery<{ id: string; nome: string; cor: string | null }>('select id, nome, cor from simulado_etiquetas where tenant_id = $1 and deletado = false', [tenantId])
    if (!pares || !s || !ets) {
      const vinc = await fetchAll<any>(() => svc.from('simulado_questao_etiquetas').select('questao_id, etiqueta_id').eq('tenant_id', tenantId).order('questao_id', { ascending: true }).order('etiqueta_id', { ascending: true }))
      const m = new Map<string, number>(); const comEt = new Set<string>()
      for (const r of vinc) { m.set(r.etiqueta_id, (m.get(r.etiqueta_id) ?? 0) + 1); comEt.add(r.questao_id) }
      pares = [...m].map(([v, n]) => ({ v, n }))
      sem = Math.max(0, (await totalBanco(svc, tenantId)) - comEt.size)
      ets = ets ?? await fetchAll<any>(() => svc.from('simulado_etiquetas').select('id, nome, cor').eq('tenant_id', tenantId).eq('deletado', false).order('id', { ascending: true }))
    } else sem = s[0]?.n ?? 0
    nomes = new Map(ets.map((e) => [e.id, { nome: e.nome, cor: e.cor }]))
  } else {
    const col = COL[ag]
    pares = await sqlQuery(`select ${col}${ag === 'banca' || ag === 'orgao' ? '::text' : ag === 'ano' ? '::text' : ''} as v, count(*)::int as n from simulado_questoes where tenant_id = $1 and deletado = false group by 1`, [tenantId])
    if (!pares) {
      const rows = await fetchAll<any>(() => svc.from('simulado_questoes').select(`id, ${col}`).eq('tenant_id', tenantId).eq('deletado', false).order('id', { ascending: true }))
      const m = new Map<string, number>()
      for (const r of rows) { const key = String(r[col] ?? '\u0000'); m.set(key, (m.get(key) ?? 0) + 1) }
      pares = [...m].map(([v, n]) => ({ v: v === '\u0000' ? null : v, n }))
    }
    if (ag === 'banca' || ag === 'orgao') {
      const tab = ag === 'banca' ? 'simulado_bancas' : 'simulado_orgaos'
      let rs = await sqlQuery<{ id: string; nome: string }>(`select id, nome from ${tab} where tenant_id = $1`, [tenantId])
      if (!rs) rs = await fetchAll<any>(() => svc.from(tab).select('id, nome').eq('tenant_id', tenantId).order('id', { ascending: true }))
      nomes = new Map(rs.map((r) => [r.id, { nome: r.nome }]))
    }
  }
  const nos: NoPasta[] = []
  for (const p of pares) {
    const raw = p.v === null || p.v === undefined || p.v === '' ? null : String(p.v)
    if (raw === null) { if (ag !== 'etiqueta') sem += p.n; continue }
    let nome = raw
    if (ag === 'banca' || ag === 'orgao' || ag === 'etiqueta') nome = nomes.get(raw)?.nome ?? '(removido)'
    else if (ag === 'dificuldade') nome = ROTULO_DIF[raw] ?? raw
    else if (ag === 'status') nome = ROTULO_STATUS[raw] ?? raw
    else if (ag === 'tipo') nome = ROTULO_TIPO[raw] ?? raw
    nos.push(no(`${PREF[ag]}:${raw}`, nome, null, p.n, { cor: nomes.get(raw)?.cor ?? null }))
  }
  const fixa = ORDEM_FIXA[ag]
  nos.sort((a, b) => {
    if (fixa) return fixa.indexOf(a.id.slice(2)) - fixa.indexOf(b.id.slice(2))
    if (ag === 'ano') return Number(b.nome) - Number(a.nome)
    return ptbr(a.nome, b.nome)
  })
  return { nos, semPasta: sem, categoria: 'conteudo' }
}

// ─────────────────────────── opções dos filtros ───────────────────────────
export async function opcoesQuestoes(svc: SupabaseClient, tenantId: string): Promise<OpcoesQ> {
  const hit = fresco(cOpcoes, tenantId); if (hit) return hit
  const [b, o, a, e, d] = await Promise.all([
    sqlQuery<{ id: string; nome: string }>('select id, nome from simulado_bancas where tenant_id = $1 order by nome', [tenantId]),
    sqlQuery<{ id: string; nome: string }>('select id, nome from simulado_orgaos where tenant_id = $1 order by nome', [tenantId]),
    sqlQuery<{ ano: number }>('select distinct ano from simulado_questoes where tenant_id = $1 and deletado = false and ano is not null order by ano desc', [tenantId]),
    sqlQuery<{ id: string; nome: string; cor: string | null }>('select id, nome, cor from simulado_etiquetas where tenant_id = $1 and deletado = false order by nome', [tenantId]),
    sqlQuery<{ id: string; nome: string }>('select id, nome from simulado_disciplinas where tenant_id = $1 order by nome', [tenantId]),
  ])
  const pg = async (t: string, cols: string) => (await fetchAll<any>(() => svc.from(t).select(cols).eq('tenant_id', tenantId).order('id', { ascending: true }))).sort((x, y) => ptbr(x.nome ?? '', y.nome ?? ''))
  const v: OpcoesQ = {
    bancas: b ?? await pg('simulado_bancas', 'id, nome'),
    orgaos: o ?? await pg('simulado_orgaos', 'id, nome'),
    anos: a ? a.map((x) => x.ano) : [...new Set((await fetchAll<any>(() => svc.from('simulado_questoes').select('id, ano').eq('tenant_id', tenantId).eq('deletado', false).not('ano', 'is', null).order('id', { ascending: true }))).map((r) => r.ano as number))].sort((x, y) => y - x),
    etiquetas: e ?? (await pg('simulado_etiquetas', 'id, nome, cor, deletado')).filter((x: any) => !x.deletado),
    disciplinas: d ?? await pg('simulado_disciplinas', 'id, nome'),
  }
  cOpcoes.set(tenantId, { at: Date.now(), v })
  return v
}

/** Assuntos de uma disciplina (para o diálogo "Mover"). */
export async function assuntosDaDisciplina(svc: SupabaseClient, tenantId: string, disciplinaId: string): Promise<{ id: string; nome: string }[]> {
  if (!UUID.test(disciplinaId)) return []
  const r = await sqlQuery<{ id: string; nome: string }>('select id, nome from simulado_assuntos where tenant_id = $1 and disciplina_id = $2 order by nome', [tenantId, disciplinaId])
  if (r) return r
  return (await fetchAll<any>(() => svc.from('simulado_assuntos').select('id, nome').eq('tenant_id', tenantId).eq('disciplina_id', disciplinaId).order('id', { ascending: true }))).sort((a, b) => ptbr(a.nome, b.nome))
}

// ─────────────────────────── lista paginada ───────────────────────────
type Where = { sql: string; params: any[] }

/** Monta o WHERE parametrizado (tenant SEMPRE no $1). dupIds = ids das duplicadas suspeitas (só para a visão 'duplicada'). */
export function montarWhere(tenantId: string, e: EstadoQ, dupIds: string[] = []): Where {
  const p: any[] = [tenantId]
  const w = ['q.tenant_id = $1', 'q.deletado = false']
  const add = (v: any) => { p.push(v); return `$${p.length}` }

  if (e.vis === 'duplicada') w.push(dupIds.length ? `q.id = any(${add(dupIds)}::uuid[])` : 'false')
  else if (e.vis && VIS_SQL[e.vis]) w.push(VIS_SQL[e.vis])

  if (e.no) {
    const NULOS: Record<string, string> = { disciplina: 'q.disciplina_id is null', banca: 'q.banca_id is null', orgao: 'q.orgao_id is null', ano: 'q.ano is null', cargo: "(q.cargo is null or q.cargo = '')", dificuldade: 'q.nivel_dificuldade is null', status: 'q.status is null', tipo: 'q.tipo is null', etiqueta: 'not exists (select 1 from simulado_questao_etiquetas ne where ne.questao_id = q.id)' }
    if (e.no === RAIZ_Q) w.push(NULOS[e.agrupar])
    else {
      const i = e.no.indexOf(':'); const pref = e.no.slice(0, i); const val = e.no.slice(i + 1)
      if (e.agrupar === 'disciplina') {
        if (pref === 'd' && UUID.test(val)) w.push(`q.disciplina_id = ${add(val)}::uuid`)
        else if (pref === 'sa' && UUID.test(val)) w.push(`q.disciplina_id = ${add(val)}::uuid and q.assunto_id is null`)
        else if (pref === 'a') {
          const [d, a] = val.split(':')
          if (!UUID.test(a ?? '') || (d !== '_' && !UUID.test(d ?? ''))) w.push('false')
          else {
            w.push(d === '_' ? 'q.disciplina_id is null' : `q.disciplina_id = ${add(d)}::uuid`)
            // assunto + descendentes (pai_id)
            w.push(`q.assunto_id in (with recursive t as (select id from simulado_assuntos where id = ${add(a)}::uuid and tenant_id = $1 union all select c.id from simulado_assuntos c join t on c.pai_id = t.id where c.tenant_id = $1) select id from t)`)
          }
        } else w.push('false')
      } else if (e.agrupar === 'banca') w.push(UUID.test(val) ? `q.banca_id = ${add(val)}::uuid` : 'false')
      else if (e.agrupar === 'orgao') w.push(UUID.test(val) ? `q.orgao_id = ${add(val)}::uuid` : 'false')
      else if (e.agrupar === 'ano') w.push(/^\d{4}$/.test(val) ? `q.ano = ${add(Number(val))}` : 'false')
      else if (e.agrupar === 'cargo') w.push(`q.cargo = ${add(val)}`)
      else if (e.agrupar === 'dificuldade') w.push(`q.nivel_dificuldade = ${add(val)}`)
      else if (e.agrupar === 'status') w.push(`q.status = ${add(val)}`)
      else if (e.agrupar === 'tipo') w.push(`q.tipo = ${add(val)}`)
      else if (e.agrupar === 'etiqueta') w.push(UUID.test(val) ? `exists (select 1 from simulado_questao_etiquetas ne where ne.questao_id = q.id and ne.etiqueta_id = ${add(val)}::uuid)` : 'false')
    }
  }
  if (e.status) w.push(`q.status = ${add(e.status)}`)
  if (e.dif) w.push(`q.nivel_dificuldade = ${add(e.dif)}`)
  if (e.tipo) w.push(`q.tipo = ${add(e.tipo)}`)
  if (e.banca && UUID.test(e.banca)) w.push(`q.banca_id = ${add(e.banca)}::uuid`)
  if (e.orgao && UUID.test(e.orgao)) w.push(`q.orgao_id = ${add(e.orgao)}::uuid`)
  if (e.ano) w.push(`q.ano = ${add(Number(e.ano))}`)
  const busca = e.q.replace(/[\\%_]/g, (c) => `\\${c}`).trim()
  if (busca) {
    const cod = /^Q-?([0-9a-f]{8})$/i.exec(e.q.trim())
    const like = add(`%${busca}%`)
    w.push(`(q.enunciado ilike ${like} or q.codigo ilike ${like} or q.assunto_detalhe ilike ${like}${cod ? ` or q.id::text like ${add(cod[1].toLowerCase() + '-%')}` : ''})`)
  }
  return { sql: w.join(' and '), params: p }
}

const ORDER_SQL: Record<string, string> = {
  atualizado: 'coalesce(q.updated_at, q.created_at)',
  enunciado: 'q.enunciado',
  disciplina: 'd.nome',
  assunto: 'a.nome',
  banca: 'b.nome',
  orgao: 'o.nome',
  ano: 'q.ano',
  dif: "case q.nivel_dificuldade when 'facil' then 0 when 'medio' then 1 when 'dificil' then 2 else 3 end",
  tipo: 'q.tipo',
  status: "case q.status when 'publicada' then 0 when 'rascunho' then 1 when 'arquivada' then 2 else 3 end",
  versao: 'coalesce(q.versao, 1)',
  alternativas: 'coalesce(sa.n, 0)',
  cargo: 'q.cargo',
  codigo: "coalesce(nullif(q.codigo, ''), 'Q-' || upper(left(replace(q.id::text, '-', ''), 8)))",
}

function paraLinha(r: any): LinhaQuestaoBib {
  const n = Number(r.nalt ?? 0)
  return {
    id: r.id, codigo: r.codigo ?? null, enunciado: r.enunciado ?? '', tipo: r.tipo ?? null,
    formato: r.tipo !== 'discursiva' && n === 2 ? 'certo_errado' : 'multipla',
    status: r.status ?? null, nivel_dificuldade: r.nivel_dificuldade ?? null, ano: r.ano ?? null, cargo: r.cargo ?? null,
    assuntoDetalhe: r.assunto_detalhe ?? null, disciplina: r.disciplina ?? null, assunto: r.assunto ?? null, banca: r.banca ?? null, orgao: r.orgao ?? null,
    nAlternativas: n, versao: Number(r.versao ?? 1), anulada: !!r.anulada, atualizadoEm: r.atualizado ? new Date(r.atualizado).toISOString() : null,
  }
}

export async function listarQuestoes(svc: SupabaseClient, tenantId: string, e: EstadoQ): Promise<{ rows: LinhaQuestaoBib[]; total: number; degradado?: boolean }> {
  const dupIds = e.vis === 'duplicada' ? await idsDuplicadas(svc, tenantId) : []
  const { sql: where, params } = montarWhere(tenantId, e, dupIds)
  const ord = ORDER_SQL[e.sort] ?? ORDER_SQL.atualizado
  const dir = e.dir === 'asc' ? 'asc' : 'desc'
  const lim = `$${params.length + 1}`, off = `$${params.length + 2}`
  // nº de alternativas: agregado UMA vez (sem índice em simulado_alternativas.questao_id, subconsulta correlacionada por linha custava ~40 s ao ordenar)
  const joinAlt = e.sort === 'alternativas' ? 'left join (select questao_id, count(*)::int as n from simulado_alternativas group by 1) sa on sa.questao_id = q.id' : ''
  const SQL = `
    with pagina as (
      select q.id, count(*) over ()::int as total, row_number() over (order by ${ord} ${dir} nulls last, q.id) as rn
      from simulado_questoes q
      left join simulado_disciplinas d on d.id = q.disciplina_id
      left join simulado_assuntos a on a.id = q.assunto_id
      left join simulado_bancas b on b.id = q.banca_id
      left join simulado_orgaos o on o.id = q.orgao_id
      ${joinAlt}
      where ${where}
      order by ${ord} ${dir} nulls last, q.id
      limit ${lim} offset ${off}
    ), alt as (
      select al.questao_id, count(*)::int as n from simulado_alternativas al where al.questao_id in (select id from pagina) group by 1
    )
    select q.id, q.codigo,
      left(btrim(regexp_replace(regexp_replace(q.enunciado, '<[^>]*>', ' ', 'g'), '\\s+', ' ', 'g')), 260) as enunciado,
      q.tipo, q.status, q.nivel_dificuldade, q.ano, q.cargo, q.assunto_detalhe, coalesce(q.versao, 1) as versao, coalesce(q.anulada, false) as anulada,
      coalesce(q.updated_at, q.created_at) as atualizado,
      d.nome as disciplina, a.nome as assunto, b.nome as banca, o.nome as orgao,
      coalesce(alt.n, 0) as nalt, p.total
    from pagina p
    join simulado_questoes q on q.id = p.id
    left join alt on alt.questao_id = q.id
    left join simulado_disciplinas d on d.id = q.disciplina_id
    left join simulado_assuntos a on a.id = q.assunto_id
    left join simulado_bancas b on b.id = q.banca_id
    left join simulado_orgaos o on o.id = q.orgao_id
    order by p.rn`
  const r = await sqlQuery<any>(SQL, [...params, e.pp, (e.page - 1) * e.pp])
  if (r) {
    // página além do fim (ex.: filtro encolheu): sem linhas → total vem de uma contagem separada
    if (!r.length && e.page > 1) {
      const c = await sqlQuery<{ n: number }>(`select count(*)::int as n from simulado_questoes q where ${where}`, params)
      return { rows: [], total: c?.[0]?.n ?? 0 }
    }
    return { rows: r.map(paraLinha), total: r[0]?.total ?? 0 }
  }
  return listarQuestoesRest(svc, tenantId, e)
}

/** Fallback sem SQL direto (DATABASE_URL ausente): PostgREST com .range()+count; ordenação/filtros reduzidos. */
async function listarQuestoesRest(svc: SupabaseClient, tenantId: string, e: EstadoQ): Promise<{ rows: LinhaQuestaoBib[]; total: number; degradado: true }> {
  const op = await opcoesQuestoes(svc, tenantId).catch(() => null)
  const montar = (cols: string) => {
    let q = svc.from('simulado_questoes').select(cols, { count: 'exact' }).eq('tenant_id', tenantId).eq('deletado', false)
    const set = (c: string, v: string) => { q = q.eq(c, v) }
    if (e.no && e.no !== RAIZ_Q) {
      const i = e.no.indexOf(':'); const pref = e.no.slice(0, i); const val = e.no.slice(i + 1)
      if (e.agrupar === 'disciplina') { if (pref === 'd') set('disciplina_id', val); else if (pref === 'sa') { set('disciplina_id', val); q = q.is('assunto_id', null) } else if (pref === 'a') { const [d, a] = val.split(':'); if (d !== '_') set('disciplina_id', d); set('assunto_id', a) } }
      else if (e.agrupar === 'banca') set('banca_id', val)
      else if (e.agrupar === 'orgao') set('orgao_id', val)
      else if (e.agrupar === 'ano') set('ano', val)
      else if (e.agrupar === 'cargo') set('cargo', val)
      else if (e.agrupar === 'dificuldade') set('nivel_dificuldade', val)
      else if (e.agrupar === 'status') set('status', val)
      else if (e.agrupar === 'tipo') set('tipo', val)
    } else if (e.no === RAIZ_Q) {
      const col: Record<string, string> = { disciplina: 'disciplina_id', banca: 'banca_id', orgao: 'orgao_id', ano: 'ano', cargo: 'cargo', dificuldade: 'nivel_dificuldade', status: 'status', tipo: 'tipo' }
      if (col[e.agrupar]) q = q.is(col[e.agrupar], null)
    }
    // visões rápidas simples no fallback (as que dependem de subconsulta ficam só no SQL direto)
    const visCol: Record<string, string> = { sem_disciplina: 'disciplina_id', sem_assunto: 'assunto_id', sem_banca: 'banca_id', sem_orgao: 'orgao_id', sem_ano: 'ano', sem_dificuldade: 'nivel_dificuldade', sem_cargo: 'cargo' }
    if (e.vis && visCol[e.vis]) q = q.is(visCol[e.vis], null)
    else if (e.vis === 'rascunho' || e.vis === 'arquivada') q = q.eq('status', e.vis)
    else if (e.vis === 'anulada') q = q.eq('anulada', true)
    if (e.status) q = q.eq('status', e.status); if (e.dif) q = q.eq('nivel_dificuldade', e.dif); if (e.tipo) q = q.eq('tipo', e.tipo)
    if (e.banca && UUID.test(e.banca)) q = q.eq('banca_id', e.banca); if (e.orgao && UUID.test(e.orgao)) q = q.eq('orgao_id', e.orgao); if (e.ano) q = q.eq('ano', Number(e.ano))
    const busca = e.q.replace(/[,()%*\\]/g, ' ').trim()
    if (busca) q = q.or(`enunciado.ilike.%${busca}%,assunto_detalhe.ilike.%${busca}%`)
    const col: Record<string, string> = { atualizado: 'updated_at', enunciado: 'enunciado', ano: 'ano', tipo: 'tipo', status: 'status', versao: 'versao', cargo: 'cargo', dif: 'nivel_dificuldade' }
    return q.order(col[e.sort] ?? 'updated_at', { ascending: e.dir === 'asc', nullsFirst: false }).order('id', { ascending: true }).range((e.page - 1) * e.pp, e.page * e.pp - 1)
  }
  let res: any = await montar('id, codigo, enunciado, tipo, status, nivel_dificuldade, ano, cargo, assunto_detalhe, versao, anulada, updated_at, created_at, disciplina_id, assunto_id, banca_id, orgao_id')
  if (res.error) res = await (async () => { const m = montar('id, enunciado, tipo, status, nivel_dificuldade, ano, updated_at, created_at, disciplina_id, assunto_id, banca_id, orgao_id'); return m })()
  const data: any[] = res.data ?? []
  const ids = data.map((r) => r.id)
  const alts = ids.length ? await fetchAllByIn<any>(ids, (c) => svc.from('simulado_alternativas').select('questao_id, ordem').in('questao_id', c).order('questao_id', { ascending: true }).order('ordem', { ascending: true }), { chunk: 80 }).catch(() => []) : []
  const nAlt = new Map<string, number>(); for (const a of alts) nAlt.set(a.questao_id, (nAlt.get(a.questao_id) ?? 0) + 1)
  const mapa = (arr?: { id: string; nome: string }[]) => new Map((arr ?? []).map((x) => [x.id, x.nome]))
  const md = mapa(op?.disciplinas), mb = mapa(op?.bancas), mo = mapa(op?.orgaos)
  const ass = new Map<string, string>()
  const aIds = [...new Set(data.map((r) => r.assunto_id).filter(Boolean))] as string[]
  if (aIds.length) for (const a of await fetchAllByIn<any>(aIds, (c) => svc.from('simulado_assuntos').select('id, nome').in('id', c).order('id', { ascending: true }), { chunk: 80 }).catch(() => [])) ass.set(a.id, a.nome)
  const rows = data.map((r) => paraLinha({
    ...r, enunciado: stripHtml(r.enunciado ?? '').slice(0, 260), atualizado: r.updated_at ?? r.created_at, nalt: nAlt.get(r.id) ?? 0,
    disciplina: r.disciplina_id ? md.get(r.disciplina_id) : null, assunto: r.assunto_id ? ass.get(r.assunto_id) : null,
    banca: r.banca_id ? mb.get(r.banca_id) : null, orgao: r.orgao_id ? mo.get(r.orgao_id) : null,
  }))
  return { rows, total: res.count ?? rows.length, degradado: true }
}

/** Resposta completa (lista + total do banco [+ árvore e opções]) — usada pela página e pela rota de API. */
export async function respostaQuestoes(svc: SupabaseClient, tenantId: string, e: EstadoQ, comArvore: boolean | 'opcoes'): Promise<RespostaQ> {
  const [lista, tb, arvore, opcoes] = await Promise.all([
    listarQuestoes(svc, tenantId, e),
    totalBanco(svc, tenantId),
    comArvore === true ? arvoreQuestoes(svc, tenantId, e.agrupar) : undefined, // 'opcoes' = só as opções dos filtros (fila de classificação não usa a árvore)
    comArvore ? opcoesQuestoes(svc, tenantId) : undefined,
  ])
  return { total: lista.total, page: e.page, pp: e.pp, rows: lista.rows, totalBanco: tb, arvoreC: arvore ? compactarArvore(arvore) : undefined, opcoes, degradado: lista.degradado }
}

/** Troca o contador da aba Questões pelo total REAL do banco (os conjuntos-documento passam para `conjuntosQuestoes`). KPIs gerais não mudam. */
export function resumoComBanco(r: ResumoBib, tb: number): ResumoBib {
  return { ...r, conjuntosQuestoes: r.conjuntosQuestoes ?? r.porTipo.questoes, bancoQuestoes: tb, porTipo: { ...r.porTipo, questoes: tb } }
}

export { AGRUPAMENTOS_Q }
