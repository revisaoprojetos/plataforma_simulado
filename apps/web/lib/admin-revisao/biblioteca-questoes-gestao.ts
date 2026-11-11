import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sqlQuery } from '@/lib/data/sql'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { chaveSemantica } from '@/lib/taxonomia/disciplina-semantica'
import { listarTaxonomia } from '@/app/admin/questoes/taxonomia-actions'
import { CAMPOS_CLASSIF, VISOES_Q } from './biblioteca-questoes-tipos'
import { VIS_SQL } from './biblioteca-questoes-vis'
import { aquecerDuplicadas, duplicadasEmCache, gruposDuplicados, idsDuplicadas, plano } from './biblioteca-questoes-duplicadas'
import { deteccaoCache, invalidarDeteccao } from './cache-deteccao'
import { chaveRelatorio, esquecer, remember } from '@/lib/cache/relatorio-cache'
import type {
  CandidatoTermo, Confianca, EtiquetaG, FuncaoEtiquetaG, ItemTaxG, RespostaEtiquetasG, RespostaTaxG, RespostaTermos, ResumoClassif, SugestaoQ, TipoTaxG,
} from './biblioteca-questoes-gestao-tipos'

// GESTÃO do banco de questões (Classificação · Unificar termos · Etiquetas). SQL agregado (lib/data/sql) com fallback PostgREST tolerante;
// listas e candidatos CACHEADOS (60 s / 5 min por tenant). Mutações chamam limparCacheGestao.

const TTL_CURTO = 60_000
const TTL_LONGO = 5 * 60_000
type Ent<T> = { at: number; v: T }
const caches = { itens: new Map<string, Ent<ItemTaxG[]>>(), termos: new Map<string, Ent<CandidatoTermo[]>>(), resumo: new Map<string, Ent<ResumoClassif>>(), etiquetas: new Map<string, Ent<EtiquetaG[]>>(), nomes: new Map<string, Ent<Nomes>>() }
function ler<T>(m: Map<string, Ent<T>>, k: string, ttl: number): T | undefined { const e = m.get(k); return e && Date.now() - e.at < ttl ? e.v : undefined }
export function limparCacheGestao(tenantId: string) { invalidarDeteccao(`resumoq:${tenantId}`); void esquecer(chaveRelatorio(tenantId, 'banco-resumo')).catch(() => {}); for (const m of Object.values(caches) as Map<string, Ent<any>>[]) for (const k of [...m.keys()]) if (k.startsWith(tenantId)) m.delete(k) }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ptbr = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })

// ───────────────────────── resumo de qualidade da classificação ─────────────────────────
const CHAVES_VIS = ['sem_classificacao', 'sem_disciplina', 'sem_assunto', 'sem_banca', 'sem_orgao', 'sem_ano', 'sem_dificuldade', 'sem_cargo', 'sem_etiqueta', 'assunto_divergente', 'rascunho', 'arquivada', 'anulada', 'reportada']

/** Calcula o resumo em UMA ida ao banco (totais + visões + cadastro num SELECT só). A contagem de duplicadas NÃO bloqueia: usa a detecção se já
 *  estiver em cache; senão aquece em segundo plano e devolve sem esse chip (o cliente completa na próxima leitura). */
async function calcularResumo(svc: SupabaseClient, tenantId: string): Promise<ResumoClassif> {
  const cols = (chaves: string[]) => chaves.map((c) => `count(*) filter (where ${VIS_SQL[c]})::int as ${c}`).join(', ')
  const cadastro = `(select count(*) from simulado_disciplinas where tenant_id = $1)::int as c_disciplinas, (select count(*) from simulado_assuntos where tenant_id = $1)::int as c_assuntos,
      (select count(*) from simulado_bancas where tenant_id = $1)::int as c_bancas, (select count(*) from simulado_orgaos where tenant_id = $1)::int as c_orgaos,
      (select count(*) from simulado_etiquetas where tenant_id = $1 and deletado = false)::int as c_etiquetas`
  const tentar = (chaves: string[]) => sqlQuery<any>(`select count(*)::int as total, count(*) filter (where disciplina_id is not null and assunto_id is not null and banca_id is not null and ano is not null)::int as completas,
      count(distinct nullif(btrim(coalesce(cargo, '')), ''))::int as c_cargos, count(distinct nullif(btrim(coalesce(assunto_detalhe, '')), ''))::int as c_assuntos_detalhe, count(distinct ano)::int as c_anos,
      ${cols(chaves)}, ${cadastro} from simulado_questoes q where q.tenant_id = $1 and q.deletado = false`, [tenantId])
  let r = await tentar(CHAVES_VIS)
  if (!r) r = await tentar(CHAVES_VIS.filter((c) => c !== 'reportada')) // tabela de feedbacks ausente
  let degradado = false
  let linha = r?.[0]
  if (!linha) {
    degradado = true
    const head = async (f: (q: any) => any) => (await f(svc.from('simulado_questoes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('deletado', false))).count ?? 0
    const [total, sd, sa, sb, so, sy, sdf, sc] = await Promise.all([
      head((q) => q), head((q) => q.is('disciplina_id', null)), head((q) => q.is('assunto_id', null)), head((q) => q.is('banca_id', null)),
      head((q) => q.is('orgao_id', null)), head((q) => q.is('ano', null)), head((q) => q.is('nivel_dificuldade', null)), head((q) => q.is('cargo', null)),
    ])
    linha = { total, completas: 0, sem_disciplina: sd, sem_assunto: sa, sem_banca: sb, sem_orgao: so, sem_ano: sy, sem_dificuldade: sdf, sem_cargo: sc, sem_etiqueta: 0 }
  }
  const dup = duplicadasEmCache(tenantId)
  if (dup === null) aquecerDuplicadas(svc, tenantId)
  const total = Number(linha.total ?? 0)
  const campos = CAMPOS_CLASSIF.map((c) => {
    const sem = Number(linha[c.visao] ?? 0)
    return { ...c, sem, com: Math.max(0, total - sem), pct: total ? Math.round(((total - sem) / total) * 1000) / 10 : 100 }
  })
  const visoes: Record<string, number> = {}
  for (const v of VISOES_Q) { if (v.id === 'duplicada') { if (dup !== null) visoes[v.id] = dup.length } else visoes[v.id] = Number(linha[v.id] ?? 0) }
  return {
    total, campos, completas: Number(linha.completas ?? 0), divergentes: Number(linha.assunto_divergente ?? 0), visoes, degradado,
    cadastro: { disciplinas: linha.c_disciplinas ?? 0, assuntos: linha.c_assuntos ?? 0, bancas: linha.c_bancas ?? 0, orgaos: linha.c_orgaos ?? 0, cargos: linha.c_cargos ?? 0, assuntosDetalhe: linha.c_assuntos_detalhe ?? 0, anos: linha.c_anos ?? 0, etiquetas: linha.c_etiquetas ?? 0 },
  }
}

/** Resumo de qualidade (chips das visões do Banco + Classificação). Cache 60 s por tenant: single-flight + stale-while-revalidate em memória
 *  (deteccaoCache) por cima do cache compartilhado (remember/Redis). SSR da página usa o mesmo caminho → a chamada de API some do load. */
export async function resumoClassificacao(svc: SupabaseClient, tenantId: string, fresh = false): Promise<ResumoClassif> {
  const chave = `resumoq:${tenantId}`
  if (fresh) { invalidarDeteccao(chave); await esquecer(chaveRelatorio(tenantId, 'banco-resumo')).catch(() => {}) }
  return deteccaoCache(chave, () => remember(chaveRelatorio(tenantId, 'banco-resumo'), 60, () => calcularResumo(svc, tenantId)), { ttl: TTL_CURTO, stale: 10 * 60_000 })
}

// ───────────────────────── itens da taxonomia (com contagem) ─────────────────────────
const SQL_ITENS: Record<TipoTaxG, string> = {
  disciplina: `select d.id::text as id, d.nome, d.cor, d.classificacao, coalesce(c.n, 0)::int as questoes, coalesce(a.n, 0)::int as extra from simulado_disciplinas d
    left join (select disciplina_id, count(*) n from simulado_questoes where tenant_id = $1 and deletado = false group by 1) c on c.disciplina_id = d.id
    left join (select disciplina_id, count(*) n from simulado_assuntos where tenant_id = $1 group by 1) a on a.disciplina_id = d.id where d.tenant_id = $1`,
  assunto: `select s.id::text as id, s.nome, s.disciplina_id::text as pai_id, d.nome as pai_nome, coalesce(c.n, 0)::int as questoes from simulado_assuntos s
    left join simulado_disciplinas d on d.id = s.disciplina_id
    left join (select assunto_id, count(*) n from simulado_questoes where tenant_id = $1 and deletado = false group by 1) c on c.assunto_id = s.id where s.tenant_id = $1`,
  banca: `select b.id::text as id, b.nome, coalesce(c.n, 0)::int as questoes from simulado_bancas b
    left join (select banca_id, count(*) n from simulado_questoes where tenant_id = $1 and deletado = false group by 1) c on c.banca_id = b.id where b.tenant_id = $1`,
  orgao: `select o.id::text as id, o.nome, coalesce(c.n, 0)::int as questoes from simulado_orgaos o
    left join (select orgao_id, count(*) n from simulado_questoes where tenant_id = $1 and deletado = false group by 1) c on c.orgao_id = o.id where o.tenant_id = $1`,
  cargo: `select cargo as id, cargo as nome, count(*)::int as questoes from simulado_questoes where tenant_id = $1 and deletado = false and btrim(coalesce(cargo, '')) <> '' group by 1`,
  assunto_detalhe: `select assunto_detalhe as id, assunto_detalhe as nome, count(*)::int as questoes from simulado_questoes where tenant_id = $1 and deletado = false and btrim(coalesce(assunto_detalhe, '')) <> '' group by 1`,
  ano: `select ano::text as id, ano::text as nome, count(*)::int as questoes from simulado_questoes where tenant_id = $1 and deletado = false and ano is not null group by 1`,
}

export async function itensTaxonomia(svc: SupabaseClient, tenantId: string, tipo: TipoTaxG, fresh = false): Promise<{ itens: ItemTaxG[]; degradado: boolean }> {
  const k = `${tenantId}|${tipo}`
  if (!fresh) { const h = ler(caches.itens, k, TTL_CURTO); if (h) return { itens: h, degradado: false } }
  const r = await sqlQuery<any>(SQL_ITENS[tipo], [tenantId])
  let itens: ItemTaxG[]; let degradado = false
  if (r) {
    itens = r.map((x) => ({ id: String(x.id), nome: String(x.nome ?? '').trim() || '—', questoes: x.questoes ?? 0, extra: x.extra, paiId: x.pai_id ?? null, paiNome: x.pai_nome ?? null, cor: x.cor ?? null, classificacao: x.classificacao ?? null }))
  } else {
    degradado = true
    const fb = await listarTaxonomia(tipo as any) // PostgREST (cacheado 5 min)
    itens = (fb.itens ?? []).map((x) => ({ id: x.id, nome: x.nome, questoes: x.questoes, extra: x.extra }))
  }
  caches.itens.set(k, { at: Date.now(), v: itens })
  return { itens, degradado }
}

export async function listarTaxonomiaG(svc: SupabaseClient, tenantId: string, tipo: TipoTaxG, o: { q?: string; sort?: string; dir?: 'asc' | 'desc'; page?: number; pp?: number; disciplina?: string; semUso?: boolean; fresh?: boolean }): Promise<RespostaTaxG> {
  const { itens, degradado } = await itensTaxonomia(svc, tenantId, tipo, o.fresh)
  const termo = plano(o.q ?? '')
  let l = itens.filter((i) => (!termo || plano(i.nome).includes(termo) || plano(i.paiNome ?? '').includes(termo)) && (!o.disciplina || i.paiId === o.disciplina) && (!o.semUso || i.questoes === 0))
  const dir = o.dir === 'desc' ? -1 : 1
  const sort = o.sort ?? (tipo === 'ano' ? 'nome' : 'questoes')
  l = [...l].sort((a, b) => {
    const c = sort === 'questoes' ? a.questoes - b.questoes : sort === 'extra' ? (a.extra ?? 0) - (b.extra ?? 0) : sort === 'pai' ? ptbr(a.paiNome ?? '', b.paiNome ?? '') : tipo === 'ano' ? Number(a.nome) - Number(b.nome) : ptbr(a.nome, b.nome)
    return (c || ptbr(a.nome, b.nome) || (a.id < b.id ? -1 : 1)) * dir
  })
  const pp = Math.min(100, Math.max(5, o.pp ?? 14)), page = Math.max(1, o.page ?? 1)
  const out: RespostaTaxG = { itens: l.slice((page - 1) * pp, page * pp), total: l.length, page, pp, degradado }
  if (tipo === 'assunto') out.disciplinas = (await itensTaxonomia(svc, tenantId, 'disciplina')).itens.map((d) => ({ id: d.id, nome: d.nome })).sort((a, b) => ptbr(a.nome, b.nome))
  return out
}

// ───────────────────────── nomes (para sugestões) ─────────────────────────
interface Nomes { disc: Map<string, string>; ass: Map<string, { nome: string; disc: string | null }>; banca: Map<string, string>; orgao: Map<string, string> }
async function nomes(svc: SupabaseClient, tenantId: string): Promise<Nomes> {
  const h = ler(caches.nomes, tenantId, TTL_CURTO); if (h) return h
  const [d, a, b, o] = await Promise.all([
    itensTaxonomia(svc, tenantId, 'disciplina'), itensTaxonomia(svc, tenantId, 'assunto'), itensTaxonomia(svc, tenantId, 'banca'), itensTaxonomia(svc, tenantId, 'orgao'),
  ])
  const v: Nomes = {
    disc: new Map(d.itens.map((x) => [x.id, x.nome])), ass: new Map(a.itens.map((x) => [x.id, { nome: x.nome, disc: x.paiId ?? null }])),
    banca: new Map(b.itens.map((x) => [x.id, x.nome])), orgao: new Map(o.itens.map((x) => [x.id, x.nome])),
  }
  caches.nomes.set(tenantId, { at: Date.now(), v }); return v
}

// ───────────────────────── sugestões de classificação (sinais REAIS) ─────────────────────────
// 1) a mesma questão repetida (grupo de duplicadas) já classificada → vale para todos os campos que faltam;
// 2) questões com o MESMO assunto específico (texto) → disciplina/assunto majoritários (≥ 80% e ≥ 2 questões);
// 3) o assunto específico coincide com o nome de um assunto do cadastro (na disciplina da questão, ou único no cadastro).
// Banca/órgão/ano só vêm do sinal 1 (o tema não determina a banca).
export async function sugestoesQuestoes(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<Record<string, SugestaoQ>> {
  const lista = ids.filter((i) => UUID.test(i)).slice(0, 100)
  if (!lista.length) return {}
  const rows = await sqlQuery<any>('select id::text, disciplina_id::text, assunto_id::text, banca_id::text, orgao_id::text, ano, assunto_detalhe from simulado_questoes where tenant_id = $1 and deletado = false and id = any($2::uuid[])', [tenantId, lista])
    ?? ((await svc.from('simulado_questoes').select('id, disciplina_id, assunto_id, banca_id, orgao_id, ano, assunto_detalhe').eq('tenant_id', tenantId).eq('deletado', false).in('id', lista)).data ?? []) as any[]
  const N = await nomes(svc, tenantId)
  const out: Record<string, SugestaoQ> = {}

  // sinal 1: grupo de duplicadas
  const grupos = (await gruposDuplicados(svc, tenantId)).grupos
  const grupoDe = new Map<string, string[]>(); for (const g of grupos) for (const i of g.ids) grupoDe.set(i, g.ids)
  const parIds = [...new Set(lista.flatMap((i) => grupoDe.get(i) ?? []))].filter((i) => !lista.includes(i))
  const pares = parIds.length ? (await sqlQuery<any>('select id::text, disciplina_id::text, assunto_id::text, banca_id::text, orgao_id::text, ano from simulado_questoes where tenant_id = $1 and id = any($2::uuid[])', [tenantId, parIds])
    ?? ((await svc.from('simulado_questoes').select('id, disciplina_id, assunto_id, banca_id, orgao_id, ano').eq('tenant_id', tenantId).in('id', parIds)).data ?? [])) as any[] : []
  const dadosPar = new Map<string, any>([...pares, ...rows].map((r) => [r.id, r]))

  // sinal 2: pares por assunto específico
  const chaves = [...new Set(rows.map((r) => String(r.assunto_detalhe ?? '').trim().toLowerCase()).filter(Boolean))]
  const peers = new Map<string, { d: string | null; a: string | null; n: number }[]>()
  if (chaves.length) {
    const pr = await sqlQuery<any>(`select lower(btrim(assunto_detalhe)) as k, disciplina_id::text as d, assunto_id::text as a, count(*)::int as n from simulado_questoes
      where tenant_id = $1 and deletado = false and lower(btrim(assunto_detalhe)) = any($2::text[]) and disciplina_id is not null group by 1, 2, 3`, [tenantId, chaves])
    for (const p of pr ?? []) (peers.get(p.k) ?? peers.set(p.k, []).get(p.k)!).push({ d: p.d, a: p.a, n: p.n })
  }
  // sinal 3: índice de assuntos do cadastro por nome normalizado
  const porNomeAss = new Map<string, { id: string; disc: string | null }[]>()
  for (const [id, a] of N.ass) (porNomeAss.get(plano(a.nome)) ?? porNomeAss.set(plano(a.nome), []).get(plano(a.nome))!).push({ id, disc: a.disc })

  for (const r of rows) {
    const s: SugestaoQ = { fonte: '' }; const fontes: string[] = []
    const falta = { d: !r.disciplina_id, a: !r.assunto_id, b: !r.banca_id, o: !r.orgao_id, y: r.ano == null }
    // 1
    const irmaos = (grupoDe.get(r.id) ?? []).filter((i) => i !== r.id).map((i) => dadosPar.get(i)).filter(Boolean)
    if (irmaos.length) {
      const pega = (f: string) => irmaos.map((x) => x[f]).find((v) => v != null && v !== '')
      let usou = false
      if (falta.d && pega('disciplina_id')) { s.disciplinaId = pega('disciplina_id'); s.disciplina = N.disc.get(s.disciplinaId!) ?? null; usou = true }
      if (falta.a && pega('assunto_id')) { s.assuntoId = pega('assunto_id'); s.assunto = N.ass.get(s.assuntoId!)?.nome ?? null; s.disciplinaId ??= pega('disciplina_id') ?? r.disciplina_id; usou = true }
      if (falta.b && pega('banca_id')) { s.bancaId = pega('banca_id'); s.banca = N.banca.get(s.bancaId!) ?? null; usou = true }
      if (falta.o && pega('orgao_id')) { s.orgaoId = pega('orgao_id'); s.orgao = N.orgao.get(s.orgaoId!) ?? null; usou = true }
      if (falta.y && pega('ano') != null) { s.ano = pega('ano'); usou = true }
      if (usou) fontes.push('a mesma questão repetida já tem classificação')
    }
    // 2
    const k = String(r.assunto_detalhe ?? '').trim().toLowerCase()
    const pp = k ? peers.get(k) : undefined
    if (pp && (falta.d || falta.a) && !s.disciplinaId) {
      const tot = pp.reduce((x, y) => x + y.n, 0)
      if (tot >= 2) {
        const porD = new Map<string, number>(); for (const p of pp) if (p.d) porD.set(p.d, (porD.get(p.d) ?? 0) + p.n)
        const [dTop, nTop] = [...porD].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
        if (dTop && nTop / tot >= 0.8 && (falta.d || dTop === r.disciplina_id)) {
          if (falta.d) { s.disciplinaId = dTop; s.disciplina = N.disc.get(dTop) ?? null }
          const porA = new Map<string, number>(); for (const p of pp) if (p.d === dTop && p.a) porA.set(p.a, (porA.get(p.a) ?? 0) + p.n)
          const [aTop, nA] = [...porA].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
          if (falta.a && aTop && nA / tot >= 0.8 && !s.assuntoId) { s.assuntoId = aTop; s.assunto = N.ass.get(aTop)?.nome ?? null; s.disciplinaId = dTop; s.disciplina = N.disc.get(dTop) ?? null }
          if (s.disciplinaId || s.assuntoId) fontes.push(`${tot} questões com o mesmo assunto específico apontam para isso`)
        }
      }
    }
    // 3
    if (falta.a && !s.assuntoId && r.assunto_detalhe) {
      const c = porNomeAss.get(plano(r.assunto_detalhe)) ?? []
      const alvo = r.disciplina_id ? c.filter((x) => x.disc === r.disciplina_id) : c
      if (alvo.length === 1) {
        s.assuntoId = alvo[0].id; s.assunto = N.ass.get(alvo[0].id)?.nome ?? null
        s.disciplinaId = r.disciplina_id ?? alvo[0].disc; s.disciplina = s.disciplinaId ? N.disc.get(s.disciplinaId) ?? null : null
        fontes.push('o assunto específico coincide com um assunto do cadastro')
      }
    }
    if (fontes.length) { s.fonte = fontes.join(' · '); out[r.id] = s }
  }
  return out
}

// ───────────────────────── termos parecidos da taxonomia ─────────────────────────
const STOP = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'a', 'o', 'as', 'os', 'para', 'com', 'instituto', 'fundacao', 'centro'])
const SIN: Record<string, string> = {
  municipal: 'municipio', municipais: 'municipio', estadual: 'estado', estaduais: 'estado', arts: 'art', artigo: 'art', artigos: 'art', inciso: 'inc', incisos: 'inc', incs: 'inc',
  paragrafo: 'par', paragrafos: 'par', leis: 'lei', adm: 'administrativo', dir: 'direito', const: 'constitucional', trib: 'tributario', proc: 'processual', processo: 'processual',
}
// grupos de sigla ↔ nome por extenso (normalizados). Só equivalências inequívocas.
const ALIAS: string[][] = [
  ['fcc', 'fundacao carlos chagas'], ['cespe', 'cebraspe', 'cespe unb', 'cespe cebraspe', 'cebraspe cespe'], ['fgv', 'fundacao getulio vargas', 'fgv projetos'],
  ['agu', 'advocacia geral da uniao'], ['pgfn', 'procuradoria geral da fazenda nacional'], ['stf', 'supremo tribunal federal'], ['stj', 'superior tribunal de justica'],
  ['oab', 'ordem dos advogados do brasil'], ['unb', 'universidade de brasilia'], ['uerj', 'universidade do estado do rio de janeiro'],
]
const aliasDe = (() => { const m = new Map<string, number>(); ALIAS.forEach((g, i) => g.forEach((x) => m.set(x, i))); return m })()
const toks = (s: string) => plano(s).split(' ').filter(Boolean).map((t) => SIN[t] ?? t)
const chaveSem = (s: string) => toks(s).filter((t) => !STOP.has(t)).sort().join(' ')
const digitos = (s: string) => (plano(s).match(/\d+/g) ?? []).join(',')

function lev(a: string, b: string): number {
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

const RANK_CONF: Record<Confianca, number> = { alta: 0, media: 1, baixa: 2 }
/** Agrupa itens que parecem o MESMO termo. `escopo` limita a comparação (ex.: assuntos só dentro da mesma disciplina). */
export function agruparVariantes(itens: ItemTaxG[], opts: { disciplina?: boolean; fuzzy?: boolean; escopo?: (i: ItemTaxG) => string } = {}): CandidatoTermo[] {
  const pai = new Map<string, string>(); for (const i of itens) pai.set(i.id, i.id)
  const find = (x: string): string => { let r = x; while (pai.get(r) !== r) r = pai.get(r)!; return r }
  const arestas: { a: string; b: string; c: Confianca; m: string }[] = []
  const ligar = (a: string, b: string, c: Confianca, m: string) => { arestas.push({ a, b, c, m }); const ra = find(a), rb = find(b); if (ra !== rb) pai.set(ra, rb) }
  const escopo = opts.escopo ?? (() => '')
  const porEscopo = new Map<string, ItemTaxG[]>(); for (const i of itens) (porEscopo.get(escopo(i)) ?? porEscopo.set(escopo(i), []).get(escopo(i))!).push(i)
  for (const lista of porEscopo.values()) {
    const bucket = (fn: (i: ItemTaxG) => string, c: Confianca, m: string) => {
      const mp = new Map<string, ItemTaxG[]>()
      for (const i of lista) { const k = fn(i); if (k) (mp.get(k) ?? mp.set(k, []).get(k)!).push(i) }
      for (const g of mp.values()) for (let x = 1; x < g.length; x++) ligar(g[0].id, g[x].id, c, m)
    }
    bucket((i) => plano(i.nome), 'alta', 'Mesmo texto, mudando só acento, maiúsculas, pontuação ou espaços')
    bucket((i) => (opts.disciplina ? chaveSemantica(i.nome) || chaveSem(i.nome) : chaveSem(i.nome)), 'media', opts.disciplina ? 'Mesma matéria pelo nome (ex.: “Processo Civil” ≡ “Direito Processual Civil”)' : 'Mesmas palavras (abreviações, artigos e “Instituto/Fundação” ignorados)')
    bucket((i) => { const k = plano(i.nome); const a = aliasDe.get(k) ?? aliasDe.get(chaveSem(i.nome)); return a == null ? '' : `a${a}` }, 'media', 'Sigla e nome por extenso da mesma instituição')
    if (opts.fuzzy) {
      const pl = lista.map((i) => ({ i, p: plano(i.nome), d: digitos(i.nome) })).filter((x) => x.p.length >= 8)
      const bk = new Map<string, typeof pl>(); for (const x of pl) (bk.get(x.p[0]) ?? bk.set(x.p[0], []).get(x.p[0])!).push(x)
      for (const g of bk.values()) {
        if (g.length > 400) continue
        for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length; y++) {
          const A = g[x], B = g[y]
          if (A.d !== B.d || Math.abs(A.p.length - B.p.length) > 3 || find(A.i.id) === find(B.i.id)) continue
          const dist = lev(A.p, B.p)
          if (1 - dist / Math.max(A.p.length, B.p.length) >= 0.9) ligar(A.i.id, B.i.id, 'baixa', 'Nomes muito parecidos (possível erro de digitação) — confira antes')
        }
      }
    }
  }
  const por = new Map<string, ItemTaxG[]>(); for (const i of itens) (por.get(find(i.id)) ?? por.set(find(i.id), []).get(find(i.id))!).push(i)
  const pior = new Map<string, { c: Confianca; m: string }>()
  for (const e of arestas) { const r = find(e.a); const p = pior.get(r); if (!p || RANK_CONF[e.c] > RANK_CONF[p.c]) pior.set(r, { c: e.c, m: e.m }) }
  const out: CandidatoTermo[] = []
  for (const [r, g] of por) {
    if (g.length < 2) continue
    const ord = [...g].sort((a, b) => b.questoes - a.questoes || a.nome.length - b.nome.length || ptbr(a.nome, b.nome))
    const pr = pior.get(r)!
    out.push({ id: ord.map((x) => x.id).sort()[0], confianca: pr.c, motivo: pr.m, itens: ord, canonicaId: ord[0].id, questoes: g.reduce((s, x) => s + x.questoes, 0) })
  }
  return out.sort((a, b) => RANK_CONF[a.confianca] - RANK_CONF[b.confianca] || b.questoes - a.questoes || ptbr(a.itens[0].nome, b.itens[0].nome))
}

export async function candidatosTermos(svc: SupabaseClient, tenantId: string, tipo: TipoTaxG, o: { confianca?: string; q?: string; page?: number; pp?: number; fresh?: boolean }): Promise<RespostaTermos> {
  const k = `${tenantId}|${tipo}`
  let todos = o.fresh ? undefined : ler(caches.termos, k, TTL_LONGO)
  const { itens } = await itensTaxonomia(svc, tenantId, tipo, o.fresh)
  if (!todos) {
    todos = tipo === 'ano' ? [] : agruparVariantes(itens, { disciplina: tipo === 'disciplina', fuzzy: true, escopo: tipo === 'assunto' ? (i) => i.paiId ?? '' : undefined })
    caches.termos.set(k, { at: Date.now(), v: todos })
  }
  const porConfianca: Record<Confianca, number> = { alta: 0, media: 0, baixa: 0 }
  for (const g of todos) porConfianca[g.confianca]++
  const termo = plano(o.q ?? '')
  const l = todos.filter((g) => (!o.confianca || g.confianca === o.confianca) && (!termo || g.itens.some((i) => plano(i.nome).includes(termo))))
  const pp = Math.min(50, Math.max(5, o.pp ?? 12)), page = Math.max(1, o.page ?? 1)
  return { grupos: l.slice((page - 1) * pp, page * pp), total: l.length, page, pp, porConfianca, geradoEm: Date.now(), totalItens: itens.length }
}

// ───────────────────────── etiquetas ─────────────────────────
export async function listarEtiquetasG(svc: SupabaseClient, tenantId: string, o: { q?: string; sort?: string; dir?: 'asc' | 'desc'; filtro?: string; page?: number; pp?: number; fresh?: boolean }): Promise<RespostaEtiquetasG> {
  let todas = o.fresh ? undefined : ler(caches.etiquetas, tenantId, TTL_CURTO)
  if (!todas) {
    const base = (comFuncao: boolean) => sqlQuery<any>(`select e.id::text as id, e.nome, e.cor, ${comFuncao ? 'e.funcao' : 'null::text as funcao'}, e.created_at, coalesce(c.n, 0)::int as questoes, coalesce(s.n, 0)::int as em_simulados
      from simulado_etiquetas e
      left join (select qe.etiqueta_id, count(*) n from simulado_questao_etiquetas qe join simulado_questoes q on q.id = qe.questao_id and q.deletado = false where q.tenant_id = $1 group by 1) c on c.etiqueta_id = e.id
      left join (select qe.etiqueta_id, count(distinct qe.questao_id) n from simulado_questao_etiquetas qe join simulado_prova_questoes p on p.questao_id = qe.questao_id where qe.tenant_id = $1 group by 1) s on s.etiqueta_id = e.id
      where e.tenant_id = $1 and e.deletado = false`, [tenantId])
    let r = await base(true); if (!r) r = await base(false)
    if (r) todas = r.map((x) => ({ id: x.id, nome: x.nome, cor: x.cor ?? null, funcao: (['anular', 'avisar', 'desconsiderar'].includes(x.funcao) ? x.funcao : null) as FuncaoEtiquetaG | null, questoes: x.questoes, emSimulados: x.em_simulados, criadoEm: x.created_at ? new Date(x.created_at).toISOString() : null }))
    else {
      let sel: any = await svc.from('simulado_etiquetas').select('id, nome, cor, funcao, created_at').eq('tenant_id', tenantId).eq('deletado', false).order('id', { ascending: true })
      if (sel.error) sel = await svc.from('simulado_etiquetas').select('id, nome, cor, created_at').eq('tenant_id', tenantId).order('id', { ascending: true })
      const vinc = await fetchAll<any>(() => svc.from('simulado_questao_etiquetas').select('questao_id, etiqueta_id').eq('tenant_id', tenantId).order('questao_id', { ascending: true }).order('etiqueta_id', { ascending: true }))
      const n = new Map<string, number>(); for (const v of vinc) n.set(v.etiqueta_id, (n.get(v.etiqueta_id) ?? 0) + 1)
      todas = ((sel.data ?? []) as any[]).map((x) => ({ id: x.id, nome: x.nome, cor: x.cor ?? null, funcao: (['anular', 'avisar', 'desconsiderar'].includes(x.funcao) ? x.funcao : null) as FuncaoEtiquetaG | null, questoes: n.get(x.id) ?? 0, emSimulados: 0, criadoEm: x.created_at ?? null }))
    }
    caches.etiquetas.set(tenantId, { at: Date.now(), v: todas })
  }
  const tot = await sqlQuery<{ total: number; sem: number }>(`select count(*)::int as total, count(*) filter (where not exists (select 1 from simulado_questao_etiquetas e where e.questao_id = q.id))::int as sem from simulado_questoes q where q.tenant_id = $1 and q.deletado = false`, [tenantId])
  const termo = plano(o.q ?? '')
  let l = todas.filter((e) => (!termo || plano(e.nome).includes(termo)) && (o.filtro === 'sem_uso' ? e.questoes === 0 : o.filtro === 'funcao' ? !!e.funcao : o.filtro === 'em_simulados' ? e.emSimulados > 0 : true))
  const dir = o.dir === 'desc' ? -1 : 1, sort = o.sort ?? 'nome'
  l = [...l].sort((a, b) => ((sort === 'questoes' ? a.questoes - b.questoes : sort === 'simulados' ? a.emSimulados - b.emSimulados : ptbr(a.nome, b.nome)) || ptbr(a.nome, b.nome)) * dir)
  const pp = Math.min(100, Math.max(5, o.pp ?? 14)), page = Math.max(1, o.page ?? 1)
  const parecidas = agruparVariantes(todas.map((e) => ({ id: e.id, nome: e.nome, questoes: e.questoes })), { fuzzy: true }).flatMap((g) => g.itens.slice(1).map((i) => ({ a: g.itens[0].id, b: i.id, motivo: g.motivo })))
  return { itens: l.slice((page - 1) * pp, page * pp), total: l.length, semUso: todas.filter((e) => e.questoes === 0).length, semEtiqueta: tot?.[0]?.sem ?? 0, totalQuestoes: tot?.[0]?.total ?? 0, parecidas }
}

/** Prévia da mesclagem: quantas questões cada etiqueta tem, quantas se sobrepõem e quantas ficam. */
export async function previaMesclarEtiquetas(svc: SupabaseClient, tenantId: string, origemId: string, destinoId: string) {
  const r = await sqlQuery<any>(`select
      (select count(*) from simulado_questao_etiquetas where tenant_id = $1 and etiqueta_id = $2::uuid)::int as origem,
      (select count(*) from simulado_questao_etiquetas where tenant_id = $1 and etiqueta_id = $3::uuid)::int as destino,
      (select count(*) from simulado_questao_etiquetas a join simulado_questao_etiquetas b on b.questao_id = a.questao_id where a.tenant_id = $1 and a.etiqueta_id = $2::uuid and b.etiqueta_id = $3::uuid)::int as ambas`, [tenantId, origemId, destinoId])
  const x = r?.[0]
  if (!x) {
    const c = async (id: string) => (await svc.from('simulado_questao_etiquetas').select('questao_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('etiqueta_id', id)).count ?? 0
    const [origem, destino] = await Promise.all([c(origemId), c(destinoId)]); return { origem, destino, ambas: 0, resultado: destino + origem }
  }
  return { origem: x.origem, destino: x.destino, ambas: x.ambas, resultado: x.origem + x.destino - x.ambas }
}

export { fetchAllByIn }
