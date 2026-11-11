import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sqlQuery } from '@/lib/data/sql'
import { PARAMS_PADRAO } from '@/lib/cronograma/adaptativo/params'
import { lerParamsMotor } from '@/lib/cronograma/adaptativo/config-metas'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { normalizarMetadados } from '@/lib/conteudo/metadados'
import { ehTipoBib, type ArvoreBib, type EstadoBib, type LinhaMaterial, type NoPasta, type OpcoesFiltroBib, type ResumoBib, type TipoBib } from './biblioteca-tipos'
import {
  carregarPastasResolvidas, filtroSql, limparCachePastas, listarMateriaisAba, resumoBiblioteca, temColunaOculto, type PastaInfo,
} from './biblioteca'

// GESTÃO DA BIBLIOTECA (Plataforma Revisão): lista com pastas/subpastas, seleção, colunas de metadados do legado, ordenação,
// filtros e paginação — tudo no SERVIDOR (SQL único com count(*) OVER()). A árvore de pastas e as contagens ficam em cache
// curto (30 s); qualquer mutação de pasta chama `limparCacheGestao`. A tela só LÊ o resultado pronto.

const TTL = 30_000
type Entrada<T> = { at: number; v: T }
const cacheArvore = new Map<string, Entrada<ArvoreBib>>()
const cacheOpcoes = new Map<string, Entrada<OpcoesFiltroBib>>()
const cacheResumo = new Map<string, Entrada<ResumoBib>>()
const fresco = <T,>(m: Map<string, Entrada<T>>, k: string): T | undefined => { const e = m.get(k); return e && Date.now() - e.at < TTL ? e.v : undefined }
// single-flight: página (SSR) + API + prefetch pedem o mesmo dado ao mesmo tempo — uma só ida ao banco para todos.
const voo = new Map<string, Promise<any>>()
function unico<T>(chave: string, f: () => Promise<T>): Promise<T> {
  let p = voo.get(chave) as Promise<T> | undefined
  if (!p) { p = f().finally(() => voo.delete(chave)); voo.set(chave, p) }
  return p
}

export function limparCacheGestao(tenantId: string) {
  limparCachePastas(tenantId)
  for (const m of [cacheArvore, cacheOpcoes, cacheResumo] as Map<string, Entrada<any>>[]) for (const k of [...m.keys()]) if (k.startsWith(tenantId)) m.delete(k)
}

export async function resumoEmCache(svc: SupabaseClient, tenantId: string): Promise<ResumoBib> {
  const hit = fresco(cacheResumo, tenantId); if (hit) return hit
  return unico('resumo|' + tenantId, async () => {
    const v = await resumoBiblioteca(svc, tenantId)
    cacheResumo.set(tenantId, { at: Date.now(), v })
    return v
  })
}

const areaDaAba = (aba: TipoBib) => (aba === 'jurisclub' ? 'conteudo_jurisclub' : 'conteudo')
export const META_KEYS = ['disciplina', 'assunto_especifico', 'tribunal', 'informativo', 'ano', 'estado_origem', 'selos'] as const
const MULTI = new Set(['tribunal', 'selos'])
const VAZIO = '__vazio__'
export const RAIZ = '__raiz__'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ids da pasta + todos os descendentes (da árvore já carregada). */
function subarvore(pastas: Map<string, PastaInfo>, raiz: string): string[] {
  const filhos = new Map<string, string[]>()
  for (const p of pastas.values()) if (p.paiId) (filhos.get(p.paiId) ?? filhos.set(p.paiId, []).get(p.paiId)!).push(p.id)
  const ids = [raiz]
  for (let i = 0; i < ids.length && ids.length < 5000; i++) for (const f of filhos.get(ids[i]) ?? []) ids.push(f)
  return ids
}
function caminho(pastas: Map<string, PastaInfo>, id: string | null): string | null {
  const partes: string[] = []; let cur = id; let g = 0
  while (cur && pastas.has(cur) && g++ < 30) { const p = pastas.get(cur)!; partes.unshift(p.nome); cur = p.paiId }
  return partes.length ? partes.join(' › ') : null
}

// ── ÁRVORE DE PASTAS (contagem = todos os documentos da pasta, de qualquer tipo; não depende da aba aberta) ─────────────────────────────────
export async function arvoreBiblioteca(svc: SupabaseClient, tenantId: string, aba: TipoBib, forcar = false): Promise<ArvoreBib> {
  const chave = `${tenantId}|${aba === 'jurisclub' ? 'jurisclub' : 'conteudo'}` // a contagem não depende da aba (só da categoria)
  if (!forcar) { const hit = fresco(cacheArvore, chave); if (hit) return hit }
  return unico('arvore|' + chave, () => montarArvore(svc, tenantId, aba, chave))
}
async function montarArvore(svc: SupabaseClient, tenantId: string, aba: TipoBib, chave: string): Promise<ArvoreBib> {
  // contagens + classificação das disciplinas em PARALELO com as pastas (antes: pastas → contagens → classificação, em fila)
  const categoriaSql = aba === 'jurisclub' ? 'jurisclub' : 'conteudo'
  const [pastas, rows, cls] = await Promise.all([
    carregarPastasResolvidas(svc, tenantId),
    // Contagem por pasta: TODOS os documentos da categoria (PDFull/PDFlash/PDFight/LegProc/Questões…), exceto vídeo/áudio.
    // Assim a pasta "PDFull" mostra o seu número mesmo estando na aba PDFlash (e o clique nela leva para a aba certa).
    sqlQuery<{ pasta_id: string | null; n: number }>(`SELECT d.pasta_id::text AS pasta_id, count(*)::int AS n FROM simulado_conteudo_documentos d WHERE d.tenant_id = $1 AND d.deletado = false AND d.categoria = '${categoriaSql}' AND COALESCE(d.tipo_origem,'') NOT IN ('video','audio') GROUP BY d.pasta_id`, [tenantId]),
    sqlQuery<{ id: string; classificacao: string | null }>('SELECT id::text AS id, classificacao FROM simulado_disciplinas WHERE tenant_id = $1', [tenantId]),
  ])
  const area = areaDaAba(aba)
  const contagens = new Map<string, number>()
  let semPasta = 0
  for (const r of rows ?? []) { if (r.pasta_id) contagens.set(r.pasta_id, Number(r.n)); else semPasta = Number(r.n) }
  const doArea = [...pastas.values()].filter((p) => p.area === area)
  // classificação (essencial/complementar/específica) das pastas-disciplina
  const classPorDisc = new Map<string, string | null>()
  if (cls) for (const d of cls) classPorDisc.set(d.id, d.classificacao ?? null)
  else {
    const discIds = [...new Set(doArea.map((p) => p.disciplinaId).filter(Boolean))] as string[]
    if (discIds.length) {
      try {
        const ds = (await fetchAllByIn<any>(discIds, (c) => svc.from('simulado_disciplinas').select('id, classificacao').eq('tenant_id', tenantId).in('id', c).order('id', { ascending: true }))) ?? []
        for (const d of ds) classPorDisc.set(d.id, d.classificacao ?? null)
      } catch { /* best-effort */ }
    }
  }
  const total = new Map<string, number>()
  for (const [id, n] of contagens) { let cur: string | null = id; let g = 0; while (cur && g++ < 40) { total.set(cur, (total.get(cur) ?? 0) + n); cur = pastas.get(cur)?.paiId ?? null } }
  const nos: NoPasta[] = doArea.map((p) => ({
    id: p.id, nome: p.nome, paiId: p.paiId && pastas.has(p.paiId) ? p.paiId : null, cor: p.cor ?? null, disciplinaId: p.disciplinaId ?? null,
    classificacao: p.disciplinaId ? (classPorDisc.get(p.disciplinaId) ?? null) : null, tipoMaterial: p.tipoProprio ?? null, restrito: !!p.restrito,
    proprios: contagens.get(p.id) ?? 0, total: total.get(p.id) ?? 0,
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
  const v: ArvoreBib = { nos, semPasta, categoria: aba === 'jurisclub' ? 'jurisclub' : 'conteudo' }
  cacheArvore.set(chave, { at: Date.now(), v })
  return v
}

// ── OPÇÕES DOS FILTROS DE METADADO (valores distintos da aba) ────────────────────
export async function opcoesFiltros(svc: SupabaseClient, tenantId: string, aba: TipoBib): Promise<OpcoesFiltroBib> {
  const chave = `${tenantId}|${aba}`
  const hit = fresco(cacheOpcoes, chave); if (hit) return hit
  return unico('opcoes|' + chave, () => montarOpcoes(svc, tenantId, aba, chave))
}
async function montarOpcoes(svc: SupabaseClient, tenantId: string, aba: TipoBib, chave: string): Promise<OpcoesFiltroBib> {
  const [pastas, oc] = await Promise.all([carregarPastasResolvidas(svc, tenantId), temColunaOculto(svc)])
  const f = filtroSql(aba, pastas, '', false, oc)
  if (!f) return {}
  f.params[0] = tenantId
  const simples = ['disciplina', 'assunto_especifico', 'informativo', 'ano', 'estado_origem'].map((k) => `SELECT '${k}' AS k, d.metadados->>'${k}' AS v FROM simulado_conteudo_documentos d WHERE ${f.where}`)
  const multi = ['tribunal', 'selos'].map((k) => `SELECT '${k}' AS k, trim(x) AS v FROM simulado_conteudo_documentos d, unnest(string_to_array(d.metadados->>'${k}', ',')) AS x WHERE ${f.where}`)
  const rows = await sqlQuery<{ k: string; v: string }>(
    `SELECT k, v FROM (${[...simples, ...multi].join(' UNION ALL ')}) t WHERE v IS NOT NULL AND v <> '' GROUP BY k, v ORDER BY k, v LIMIT 3000`, f.params)
  const out: OpcoesFiltroBib = {}
  for (const r of rows ?? []) { const k = r.k as keyof OpcoesFiltroBib; (out[k] ?? (out[k] = [])).push(r.v) }
  if (out.ano) out.ano.sort((a, b) => Number(b) - Number(a))
  cacheOpcoes.set(chave, { at: Date.now(), v: out })
  return out
}

// ── LISTA ────────────────────────────────────────────────────────────────────────
const ORDENS: Record<string, string> = {
  titulo: `d.titulo COLLATE "C"`, atualizado: 'd.atualizado_em', criado: 'd.criado_em', status: 'd.status', tipo: 'd.tipo_origem',
  paginas: 'v.paginas', acesso: `COALESCE(d.acesso_geral,'')`, pasta: 'd.pasta_id',
  disciplina: `d.metadados->>'disciplina'`, assunto_especifico: `d.metadados->>'assunto_especifico'`, tribunal: `d.metadados->>'tribunal'`,
  informativo: `d.metadados->>'informativo'`, ano: `NULLIF(d.metadados->>'ano','')::int`, estado_origem: `d.metadados->>'estado_origem'`, selos: `d.metadados->>'selos'`,
}

export async function listarGestao(svc: SupabaseClient, tenantId: string, e: EstadoBib): Promise<{ rows: LinhaMaterial[]; total: number; degradado: boolean }> {
  const [pastas, oc] = await Promise.all([carregarPastasResolvidas(svc, tenantId), temColunaOculto(svc)])
  const f = filtroSql(e.aba, pastas, '', false, oc)
  const off = (Math.max(1, e.page) - 1) * e.pp
  const degradar = async () => {
    const r = await listarMateriaisAba(svc, tenantId, e.aba, { q: e.q, pagina: e.page, porPagina: e.pp, soEscondidos: e.vis === 'escondidos', ord: e.sort === 'atualizado' ? 'recentes' : 'titulo' })
    return { rows: r.rows.map((x) => ({ ...x, pastaCaminho: caminho(pastas, x.pastaId) })), total: r.total, degradado: true }
  }
  if (!f) return degradar()
  f.params[0] = tenantId
  const P = (v: any) => { f.params.push(v); return `$${f.params.length}` }
  let w = f.where
  const busca = e.q.trim().slice(0, 80)
  if (busca) {
    const nq = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const pd = [...pastas.values()].filter((p) => p.disciplina && p.disciplina.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(nq)).map((p) => p.id)
    const like = P('%' + busca.replace(/[%_\\]/g, ' ') + '%')
    w += ` AND (d.titulo ILIKE ${like} OR d.pasta_id = ANY(${P(pd)}::uuid[]) OR concat_ws(' ', d.metadados->>'disciplina', d.metadados->>'assunto_especifico', d.metadados->>'tribunal', d.metadados->>'informativo', d.metadados->>'selos') ILIKE ${like})`
  }
  if (e.pasta === RAIZ) w += ' AND d.pasta_id IS NULL'
  else if (e.pasta && UUID.test(e.pasta) && pastas.has(e.pasta)) w += ` AND d.pasta_id = ANY(${P(e.sub ? subarvore(pastas, e.pasta) : [e.pasta])}::uuid[])`
  if (oc) { if (e.vis === 'escondidos') w += ' AND d.oculto = true'; else if (e.vis === 'visiveis') w += ' AND d.oculto = false' }
  else if (e.vis === 'escondidos') w += ' AND false'
  if (['publicado', 'rascunho', 'arquivado'].includes(e.status)) w += ` AND d.status = ${P(e.status)}`
  if (e.acesso === 'restrito') w += ` AND d.acesso_geral = 'restrito'`
  else if (e.acesso === 'todos') w += ` AND COALESCE(d.acesso_geral,'') <> 'restrito'`
  for (const k of META_KEYS) {
    const val = e.meta[k]; if (!val) continue
    if (val === VAZIO) { w += ` AND COALESCE(d.metadados->>'${k}','') = ''`; continue }
    w += MULTI.has(k)
      ? ` AND EXISTS (SELECT 1 FROM unnest(string_to_array(d.metadados->>'${k}', ',')) x WHERE lower(trim(x)) = lower(${P(val)}))`
      : ` AND lower(d.metadados->>'${k}') = lower(${P(val)})`
  }
  const col = ORDENS[e.sort] ?? ORDENS.titulo
  const dir = e.dir === 'desc' ? 'DESC' : 'ASC'
  const order = `${col} ${dir} NULLS LAST, d.titulo COLLATE "C" ASC, d.id`
  const velP = e.aba === 'pdfull' ? lerParamsMotor(svc, tenantId).then((p) => p.velPadrao).catch(() => PARAMS_PADRAO.velPadrao) : Promise.resolve(PARAMS_PADRAO.velPadrao)
  const colsDoc = `d.id, d.titulo, d.pasta_id, d.tipo_origem, d.status, ${oc ? 'd.oculto' : 'false AS oculto'}, d.acesso_geral, d.leitura_legproc, d.criado_em, d.atualizado_em, d.versao_atual_id, d.metadados`
  const extraSel = `(SELECT max(x.numero)::int FROM simulado_conteudo_versoes x WHERE x.documento_id = d.id) AS versao_n,
            ${e.aba === 'questoes' ? '(SELECT count(*)::int FROM simulado_conteudo_quiz_questoes q WHERE q.documento_id = d.id)' : '0'} AS nq`
  // Pagina PRIMEIRO (só a janela de linhas) e só então junta versões/contagens: o plano não varre todas as versões do tenant.
  // Ordenar por nº de páginas exige o join antes → mantém a forma antiga nesse caso.
  const sql = e.sort === 'paginas'
    ? `SELECT ${colsDoc}, v.paginas, ${extraSel}, count(*) OVER() AS total
       FROM simulado_conteudo_documentos d LEFT JOIN simulado_conteudo_versoes v ON v.id = d.versao_atual_id
      WHERE ${w} ORDER BY ${order} LIMIT ${Number(e.pp)} OFFSET ${Number(off)}`
    : `SELECT d.*, v.paginas, ${extraSel}
       FROM (SELECT ${colsDoc}, count(*) OVER() AS total FROM simulado_conteudo_documentos d WHERE ${w} ORDER BY ${order} LIMIT ${Number(e.pp)} OFFSET ${Number(off)}) d
       LEFT JOIN simulado_conteudo_versoes v ON v.id = d.versao_atual_id ORDER BY ${order}`
  const rows = await sqlQuery<any>(sql, f.params)
  if (rows === null) return degradar()
  let total = rows.length ? Number(rows[0].total) : 0
  if (!rows.length && off > 0) {
    const c = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM simulado_conteudo_documentos d WHERE ${w}`, f.params)
    total = Number(c?.[0]?.n ?? 0)
  }
  const vel = await velP
  const out: LinhaMaterial[] = rows.map((d) => {
    const p = d.pasta_id ? pastas.get(d.pasta_id) : null
    const pag: number | null = d.paginas ?? null
    return {
      id: d.id, titulo: d.titulo ?? 'Sem título', disciplina: p?.disciplina ?? null, pasta: p?.nome ?? null, tipoOrigem: d.tipo_origem ?? null,
      visivel: !d.oculto, paginas: pag, versao: d.versao_n ?? 1,
      tempoMin: e.aba === 'pdfull' && pag && pag > 0 ? Math.ceil((pag / vel) * 60 / 30) * 30 : e.aba === 'pdfull' ? 0 : null,
      qtdQuestoes: e.aba === 'questoes' ? Number(d.nq ?? 0) : null, atualizadoEm: d.atualizado_em ?? null,
      pastaId: d.pasta_id ?? null, pastaCaminho: caminho(pastas, d.pasta_id ?? null), status: d.status ?? 'publicado',
      restrito: String(d.acesso_geral) === 'restrito', leituraLegproc: !!d.leitura_legproc, criadoEm: d.criado_em ?? null,
      metadados: normalizarMetadados(d.metadados),
    }
  })
  return { rows: out, total, degradado: false }
}

/** Lê o estado (aba/busca/pasta/filtros/ordem/página) de uma query string — usado pela página e pela rota. */
export function estadoDeParams(sp: URLSearchParams): EstadoBib {
  const PP = [10, 14, 25, 50, 100]
  const aba = ehTipoBib(sp.get('aba')) ? (sp.get('aba') as TipoBib) : 'pdfull'
  const pp = PP.includes(Number(sp.get('pp'))) ? Number(sp.get('pp')) : 14
  const meta: Record<string, string> = {}
  for (const k of META_KEYS) { const v = sp.get(`m_${k}`); if (v) meta[k] = v.slice(0, 200) }
  const vis = sp.get('vis'); const ac = sp.get('acesso')
  return {
    aba, q: (sp.get('q') ?? '').trim().slice(0, 80), pasta: sp.get('pasta') || null, sub: sp.get('sub') !== '0',
    vis: vis === 'escondidos' || vis === 'visiveis' ? vis : 'todos', status: sp.get('status') ?? '',
    acesso: ac === 'restrito' || ac === 'todos' ? ac : '', sort: sp.get('sort') ?? 'titulo', dir: sp.get('dir') === 'desc' ? 'desc' : 'asc',
    page: Math.max(1, Number(sp.get('page')) || 1), pp, meta,
  }
}
