import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { sqlQuery } from '@/lib/data/sql'
import { listarBaralhos } from '@/lib/flashcards/baralhos'
import { PARAMS_PADRAO } from '@/lib/cronograma/adaptativo/params'
import { lerParamsMotor } from '@/lib/cronograma/adaptativo/config-metas'
import type { LinhaMaterial, LinhaBaralho, LinhaSimulado, TipoBib } from './biblioteca-tipos'

// BIBLIOTECA (Plataforma Revisão) — loaders SÓ DE LEITURA. A página nunca calcula: tudo vem pronto daqui.
//
// Modelo real: o "tipo de material" (PDFull/PDFlash/PDFight/LegProc/Questões) é definido por SUBPASTA da Biblioteca
// (simulado_pastas.cronograma_tipo_material) e o documento HERDA o da subpasta-tipada mais próxima (mesma regra do
// Cronograma Adaptativo, lib/cronograma/adaptativo/conteudo-banco.ts). Sem subpasta tipada => PDFull (compat.).
// Paginação REAL: contagem head por fonte + .range() por fonte (concatenadas), nunca varre a tabela inteira.

const SEM_UUID = '00000000-0000-0000-0000-000000000000'
const CHUNK = 80
export const POR_PAGINA = [10, 14, 25, 50]
export const AVISO_OCULTO = 'Aplique a migration 20261026000000 (acesso v2) para controlar a visibilidade dos materiais.'

// A coluna simulado_conteudo_documentos.oculto vem da migration 20261026000000. Sondagem com cache de 60s: sem a coluna,
// as telas funcionam tratando tudo como visível e desligam o filtro/interruptor (nunca estouram 42703).
let _ocultoCache: { v: boolean; at: number } | null = null
let _ocultoVoo: Promise<boolean> | null = null
export async function temColunaOculto(svc: SupabaseClient): Promise<boolean> {
  if (_ocultoCache && Date.now() - _ocultoCache.at < 300_000) return _ocultoCache.v // a coluna não some: 5 min (era 60 s)
  _ocultoVoo ??= (async () => {
    const r = await sqlQuery<{ n: number }>(`select 1 as n from information_schema.columns where table_schema = 'public' and table_name = 'simulado_conteudo_documentos' and column_name = 'oculto'`)
    let v: boolean
    if (r) v = r.length > 0
    else { const { error } = await svc.from('simulado_conteudo_documentos').select('oculto').limit(1); v = !error }
    _ocultoCache = { v, at: Date.now() }
    return v
  })().finally(() => { _ocultoVoo = null })
  return _ocultoVoo
}

export interface PastaInfo { id: string; nome: string; paiId: string | null; tipo: string | null; disciplina: string | null; area: string; cor?: string | null; disciplinaId?: string | null; tipoProprio?: string | null; restrito?: boolean }

/** Pastas das duas áreas (Biblioteca e JurisClub) com tipo de material e disciplina JÁ resolvidos pela herança. */
const _pastasCache = new Map<string, { at: number; v: Map<string, PastaInfo> }>()
const _pastasVoo = new Map<string, Promise<Map<string, PastaInfo>>>()
/** Limpa o cache (30 s) das pastas — chamado após criar/mover/renomear/excluir pasta pela tela de gestão. */
export function limparCachePastas(tenantId?: string) { if (tenantId) _pastasCache.delete(tenantId); else _pastasCache.clear() }
export async function carregarPastasResolvidas(svc: SupabaseClient, tenantId: string): Promise<Map<string, PastaInfo>> {
  const hit = _pastasCache.get(tenantId)
  if (hit && Date.now() - hit.at < 30_000) return hit.v
  // single-flight: página/árvore/opções/resumo pedem as pastas ao mesmo tempo — uma só ida ao banco para todos.
  let voo = _pastasVoo.get(tenantId)
  if (!voo) {
    voo = carregarPastasResolvidasSemCache(svc, tenantId).then((v) => { _pastasCache.set(tenantId, { at: Date.now(), v }); return v }).finally(() => _pastasVoo.delete(tenantId))
    _pastasVoo.set(tenantId, voo)
  }
  return voo
}
async function carregarPastasResolvidasSemCache(svc: SupabaseClient, tenantId: string): Promise<Map<string, PastaInfo>> {
  const sel = (cols: string) => () =>
    svc.from('simulado_pastas').select(cols).eq('tenant_id', tenantId).in('folder_area', ['conteudo', 'conteudo_jurisclub']).eq('is_folder', true).eq('deletado', false).order('id', { ascending: true })
  let rows: any[] = []
  // 1 ida (SQL direto). Sem DATABASE_URL / coluna ausente → cai no PostgREST abaixo.
  const viaSql = await sqlQuery<any>(`select id::text as id, nome, pai_id::text as pai_id, disciplina_id::text as disciplina_id, cronograma_tipo_material, folder_area, cor, acesso_geral
      from simulado_pastas where tenant_id = $1 and folder_area in ('conteudo','conteudo_jurisclub') and is_folder = true and deletado = false`, [tenantId])
  if (viaSql) rows = viaSql
  else try { rows = await fetchAll<any>(sel('id, nome, pai_id, disciplina_id, cronograma_tipo_material, folder_area, cor, acesso_geral')) }
  catch {
    try { rows = await fetchAll<any>(sel('id, nome, pai_id, disciplina_id, cronograma_tipo_material, folder_area')) }
    catch { try { rows = await fetchAll<any>(sel('id, nome, pai_id, disciplina_id, folder_area')) } catch { rows = [] } }
  }
  const cru = new Map<string, any>(rows.map((r) => [r.id, r]))
  const memo = new Map<string, PastaInfo>()
  const resolver = (id: string, prof = 0): PastaInfo | null => {
    const r = cru.get(id)
    if (!r) return null
    const m = memo.get(id)
    if (m) return m
    const pai = r.pai_id && prof < 40 ? resolver(r.pai_id, prof + 1) : null
    const info: PastaInfo = {
      id, nome: r.nome, paiId: r.pai_id ?? null, area: r.folder_area,
      tipo: r.cronograma_tipo_material ?? pai?.tipo ?? null,
      disciplina: r.disciplina_id ? r.nome : pai?.disciplina ?? null,
      cor: r.cor ?? null, disciplinaId: r.disciplina_id ?? null, tipoProprio: r.cronograma_tipo_material ?? null, restrito: String(r.acesso_geral) === 'restrito',
    }
    memo.set(id, info)
    return info
  }
  for (const id of cru.keys()) resolver(id)
  return memo
}

type Builder = any
type Fonte = (sel: string, head?: boolean) => Builder

const sanear = (q: string) => q.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function lotes<T>(a: T[], n = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n))
  return out
}

/** Fontes (consultas) de documentos de cada aba. Cada fonte é uma consulta base já filtrada; a busca é aplicada aqui. */
function fontesDocs(svc: SupabaseClient, tenantId: string, tipo: TipoBib, pastas: Map<string, PastaInfo>, q: string, soEscondidos = false, ord: 'titulo' | 'recentes' = 'titulo', oc = true): Fonte[] {
  if (soEscondidos && !oc) return []
  const busca = sanear(q)
  const nq = norm(busca)
  const pastasDisc = busca ? [...pastas.values()].filter((p) => p.disciplina && norm(p.disciplina).includes(nq)).map((p) => p.id).slice(0, CHUNK) : []
  const base = (categoria: string, sel: string, head?: boolean): Builder => {
    let b = svc.from('simulado_conteudo_documentos').select(sel, head ? { count: 'exact', head: true } : { count: 'exact' })
      .eq('tenant_id', tenantId).eq('deletado', false).eq('categoria', categoria)
    if (soEscondidos) b = b.eq('oculto', true)
    if (busca) b = b.or(pastasDisc.length ? `titulo.ilike.%${busca}%,pasta_id.in.(${pastasDisc.join(',')})` : `titulo.ilike.%${busca}%`)
    return b
  }
  const ordenar = (b: Builder) => (ord === 'recentes' ? b.order('atualizado_em', { ascending: false }) : b.order('titulo', { ascending: true })).order('id', { ascending: true })
  const pastasTipo = (t: string | null, area = 'conteudo') =>
    [...pastas.values()].filter((p) => p.area === area && (t === null ? p.tipo == null : p.tipo === t)).sort((a, b) => (a.disciplina ?? '').localeCompare(b.disciplina ?? '', 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })).map((p) => p.id)

  if (tipo === 'jurisclub') return [(sel, head) => ordenar(base('jurisclub', sel, head).neq('tipo_origem', 'video').neq('tipo_origem', 'audio'))]

  if (tipo === 'questoes') {
    const f: Fonte[] = [(sel, head) => ordenar(base('conteudo', sel, head).eq('tipo_origem', 'questoes'))]
    for (const c of lotes(pastasTipo('questoes'))) f.push((sel, head) => ordenar(base('conteudo', sel, head).neq('tipo_origem', 'questoes').in('pasta_id', c)))
    return f
  }

  const naoMidia = (b: Builder) => b.not('tipo_origem', 'in', '(video,audio,questoes)')
  const f: Fonte[] = []
  if (tipo === 'pdfull') {
    // PDFull = subpastas marcadas PDFull + docs SEM tipo (compat.: pasta sem subpasta-tipada e raiz da Biblioteca).
    for (const c of lotes([...pastasTipo('pdfull'), ...pastasTipo(null)])) f.push((sel, head) => ordenar(naoMidia(base('conteudo', sel, head).in('pasta_id', c))))
    f.push((sel, head) => ordenar(naoMidia(base('conteudo', sel, head).is('pasta_id', null))))
    return f
  }
  for (const c of lotes(pastasTipo(tipo))) f.push((sel, head) => ordenar(naoMidia(base('conteudo', sel, head).in('pasta_id', c))))
  return f
}

async function contarFontes(fontes: Fonte[]): Promise<number[]> {
  return Promise.all(fontes.map(async (f) => {
    try { const { count, error } = await f('id', true); return error ? 0 : (count ?? 0) } catch { return 0 }
  }))
}

/** Concatena as fontes e devolve só a janela [off, off+lim). Uma contagem head + 1..n `.range()` pequenos. */
async function janelaFontes<T>(fontes: Fonte[], sel: string, off: number, lim: number): Promise<{ total: number; rows: T[] }> {
  const contagens = await contarFontes(fontes)
  const total = contagens.reduce((s, n) => s + n, 0)
  const rows: T[] = []
  let ini = 0
  for (let i = 0; i < fontes.length && rows.length < lim; i++) {
    const n = contagens[i]
    const fim = ini + n
    if (n > 0 && off < fim) {
      const de = Math.max(0, off - ini)
      const ate = Math.min(n - 1, de + (lim - rows.length) - 1)
      const { data } = await fontes[i](sel).range(de, ate)
      rows.push(...((data ?? []) as T[]))
      off += ate - de + 1
    }
    ini = fim
  }
  return { total, rows }
}


// ── Caminho SQL (preferido): UMA consulta com ORDENAÇÃO GLOBAL + count(*) OVER() — sem concatenar fontes por pasta.
// Retorna null quando o SQL direto não está disponível (o chamador cai no caminho PostgREST por fontes, acima).
function ordemPastas(pastas: Map<string, PastaInfo>, t: string | null, area = 'conteudo'): string[] {
  return [...pastas.values()].filter((p) => p.area === area && (t === null ? p.tipo == null : p.tipo === t)).map((p) => p.id)
}
export function filtroSql(tipo: TipoBib, pastas: Map<string, PastaInfo>, q: string, soEsc: boolean, oc: boolean): { where: string; params: any[] } | null {
  const params: any[] = []
  const P = (v: any) => { params.push(v); return `$${params.length}` }
  const busca = q.trim().slice(0, 80)
  const nq = norm(busca)
  const pastasDisc = busca ? [...pastas.values()].filter((p) => p.disciplina && norm(p.disciplina).includes(nq)).map((p) => p.id) : []
  let w = `d.tenant_id = ${P('__tenant__')} AND d.deletado = false`
  const naoMidia = `COALESCE(d.tipo_origem,'') NOT IN ('video','audio','questoes')`
  if (tipo === 'jurisclub') w += ` AND d.categoria = 'jurisclub' AND COALESCE(d.tipo_origem,'') NOT IN ('video','audio')`
  else if (tipo === 'questoes') w += ` AND d.categoria = 'conteudo' AND (d.tipo_origem = 'questoes' OR d.pasta_id = ANY(${P(ordemPastas(pastas, 'questoes'))}::uuid[]))`
  else if (tipo === 'legproc') w += ` AND d.categoria = 'conteudo' AND ${naoMidia} AND (d.leitura_legproc = true OR d.pasta_id = ANY(${P(ordemPastas(pastas, 'legproc'))}::uuid[]))`
  else if (tipo === 'pdfull') w += ` AND d.categoria = 'conteudo' AND ${naoMidia} AND COALESCE(d.leitura_legproc,false) = false AND (d.pasta_id IS NULL OR d.pasta_id = ANY(${P([...ordemPastas(pastas, 'pdfull'), ...ordemPastas(pastas, null)])}::uuid[]))`
  else if (tipo === 'pdflash' || tipo === 'pdfight') w += ` AND d.categoria = 'conteudo' AND ${naoMidia} AND COALESCE(d.leitura_legproc,false) = false AND d.pasta_id = ANY(${P(ordemPastas(pastas, tipo))}::uuid[])`
  else return null
  if (soEsc) w += oc ? ' AND d.oculto = true' : ' AND false'
  if (busca) w += ` AND (d.titulo ILIKE ${P('%' + busca.replace(/[%_]/g, ' ') + '%')} OR d.pasta_id = ANY(${P(pastasDisc)}::uuid[]))`
  return { where: w, params }
}
async function docsSql(tenantId: string, tipo: TipoBib, pastas: Map<string, PastaInfo>, q: string, soEsc: boolean, ord: 'titulo' | 'recentes', off: number, lim: number, oc: boolean): Promise<{ total: number; rows: any[] } | null> {
  const f = filtroSql(tipo, pastas, q, soEsc, oc); if (!f) return null
  f.params[0] = tenantId
  const orderBy = ord === 'recentes' ? 'd.atualizado_em DESC, d.id' : `d.titulo COLLATE "C" ASC, d.id`
  const rows = await sqlQuery<any>(
    `SELECT d.id, d.titulo, d.pasta_id, d.tipo_origem, ${oc ? 'd.oculto' : 'false AS oculto'}, d.atualizado_em, d.versao_atual_id, count(*) OVER() AS total
       FROM simulado_conteudo_documentos d WHERE ${f.where} ORDER BY ${orderBy} LIMIT ${Number(lim)} OFFSET ${Number(off)}`, f.params)
  if (rows === null) return null
  return { total: rows.length ? Number(rows[0].total) : (off === 0 ? 0 : -1), rows }
}
async function contarSql(tenantId: string, tipo: TipoBib, pastas: Map<string, PastaInfo>, soEsc: boolean, oc: boolean): Promise<number | null> {
  const f = filtroSql(tipo, pastas, '', soEsc, oc); if (!f) return null
  f.params[0] = tenantId
  const r = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM simulado_conteudo_documentos d WHERE ${f.where}`, f.params)
  return r === null ? null : Number(r[0]?.n ?? 0)
}

const SEL_DOC = 'id, titulo, pasta_id, tipo_origem, oculto, atualizado_em, versao_atual_id'
const SEL_DOC_SEM_OCULTO = 'id, titulo, pasta_id, tipo_origem, atualizado_em, versao_atual_id'

/** Linhas de uma aba de documentos (PDFull/PDFlash/PDFight/LegProc/Questões/JurisClub), já enriquecidas. */
export async function listarMateriaisAba(
  svc: SupabaseClient, tenantId: string, tipo: TipoBib, opts: { q: string; pagina: number; porPagina: number; soEscondidos?: boolean; ord?: 'titulo' | 'recentes' },
): Promise<{ rows: LinhaMaterial[]; total: number }> {
  const [pastas, oc] = await Promise.all([carregarPastasResolvidas(svc, tenantId), temColunaOculto(svc)])
  const off = (Math.max(1, opts.pagina) - 1) * opts.porPagina
  let janela: { total: number; rows: any[] }
  const viaSql = await docsSql(tenantId, tipo, pastas, opts.q, !!opts.soEscondidos, opts.ord ?? 'titulo', off, opts.porPagina, oc)
  if (viaSql && viaSql.total >= 0) janela = viaSql
  else try { janela = await janelaFontes<any>(fontesDocs(svc, tenantId, tipo, pastas, opts.q, !!opts.soEscondidos, opts.ord ?? 'titulo', oc), oc ? SEL_DOC : SEL_DOC_SEM_OCULTO, off, opts.porPagina) }
  catch { return { rows: [], total: 0 } }
  const docIds = janela.rows.map((d) => d.id as string)

  // Versões (nº e páginas) e nº de questões: só dos documentos DESTA página (≤ 50 ids).
  const [vers, quiz, vel] = await Promise.all([
    docIds.length ? svc.from('simulado_conteudo_versoes').select('id, documento_id, numero, paginas').eq('tenant_id', tenantId).in('documento_id', docIds).limit(1000) : Promise.resolve({ data: [] as any[] }),
    tipo === 'questoes' && docIds.length ? svc.from('simulado_conteudo_quiz_questoes').select('documento_id').eq('tenant_id', tenantId).in('documento_id', docIds).limit(5000) : Promise.resolve({ data: [] as any[] }),
    tipo === 'pdfull' ? lerParamsMotor(svc, tenantId).then((p) => p.velPadrao).catch(() => PARAMS_PADRAO.velPadrao) : Promise.resolve(PARAMS_PADRAO.velPadrao),
  ])
  const maxVer = new Map<string, number>()
  const pagAtual = new Map<string, number | null>()
  const porVersaoId = new Map<string, number | null>()
  for (const v of (vers.data ?? []) as any[]) {
    maxVer.set(v.documento_id, Math.max(maxVer.get(v.documento_id) ?? 0, v.numero ?? 0))
    porVersaoId.set(v.id, v.paginas ?? null)
  }
  const nq = new Map<string, number>()
  for (const r of (quiz.data ?? []) as any[]) nq.set(r.documento_id, (nq.get(r.documento_id) ?? 0) + 1)

  const rows: LinhaMaterial[] = janela.rows.map((d) => {
    const p = d.pasta_id ? pastas.get(d.pasta_id) : null
    const pag = d.versao_atual_id ? (porVersaoId.get(d.versao_atual_id) ?? null) : null
    pagAtual.set(d.id, pag)
    const blocoMin = 30
    return {
      id: d.id, titulo: d.titulo ?? 'Sem título', disciplina: p?.disciplina ?? null, pasta: p?.nome ?? null,
      tipoOrigem: d.tipo_origem ?? null, visivel: !d.oculto, paginas: pag, versao: maxVer.get(d.id) ?? 1,
      tempoMin: tipo === 'pdfull' && pag && pag > 0 ? Math.ceil((pag / vel) * 60 / blocoMin) * blocoMin : tipo === 'pdfull' ? 0 : null,
      qtdQuestoes: tipo === 'questoes' ? (nq.get(d.id) ?? 0) : null,
      atualizadoEm: d.atualizado_em ?? null, pastaId: d.pasta_id ?? null, pastaCaminho: null, status: 'publicado', restrito: false, leituraLegproc: false, criadoEm: null, metadados: {},
    }
  })
  return { rows, total: janela.total }
}

export async function listarBaralhosAba(svc: SupabaseClient, tenantId: string, opts: { q: string; pagina: number; porPagina: number }): Promise<{ rows: LinhaBaralho[]; total: number; aviso?: string }> {
  try {
    const r = await listarBaralhos(svc, tenantId, { q: opts.q, page: opts.pagina, perPage: opts.porPagina, sort: 'nome', dir: 'asc' })
    return { total: r.total, rows: r.rows.map((b: any) => ({ id: b.id, nome: b.nome, cartoes: b.cartoes, status: b.status, alcance: b.alcance })) }
  } catch { return { rows: [], total: 0, aviso: 'Aplique a migração dos baralhos (20261031050000).' } }
}

export async function listarSimuladosAba(svc: SupabaseClient, tenantId: string, opts: { q: string; pagina: number; porPagina: number }): Promise<{ rows: LinhaSimulado[]; total: number }> {
  const off = (Math.max(1, opts.pagina) - 1) * opts.porPagina
  let b = svc.from('simulado_simulados').select('id, titulo, status, modo_aplicacao, data_inicio, tempo_limite_min', { count: 'exact' })
    .eq('tenant_id', tenantId).eq('deletado', false).is('owner_estudante_id', null)
  const q = sanear(opts.q)
  if (q) b = b.ilike('titulo', `%${q}%`)
  const { data, count, error } = await b.order('created_at', { ascending: false }).order('id', { ascending: true }).range(off, off + opts.porPagina - 1)
  if (error) return { rows: [], total: 0 }
  const sims = (data ?? []) as any[]
  // nº de questões de TODOS os simulados da página numa só consulta (antes: 1 contagem por simulado = N+1).
  const porSim = new Map<string, number>()
  if (sims.length) {
    const ids = sims.map((s) => s.id as string)
    const r = await sqlQuery<{ simulado_id: string; n: number }>('select simulado_id::text as simulado_id, count(*)::int as n from simulado_prova_questoes where tenant_id = $1 and simulado_id = any($2::uuid[]) group by 1', [tenantId, ids])
    if (r) for (const x of r) porSim.set(x.simulado_id, Number(x.n))
    else await Promise.all(ids.map(async (id) => { const { count: n } = await svc.from('simulado_prova_questoes').select('simulado_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('simulado_id', id); porSim.set(id, n ?? 0) }))
  }
  const qtds = sims.map((s) => porSim.get(s.id) ?? 0)
  return {
    total: count ?? 0,
    rows: sims.map((s, i) => ({ id: s.id, titulo: s.titulo, status: s.status, modo: s.modo_aplicacao ?? null, questoes: qtds[i], duracaoMin: s.tempo_limite_min ?? null, inicio: s.data_inicio ?? null })),
  }
}

/** Contagem por aba + KPIs (escondidos e problemas reportados). UMA consulta SQL (count ... FILTER) para as 6 abas de documentos x (todos | escondidos)
 *  + baralhos + simulados + reportes — antes eram 12 consultas disputando um pool de 5 conexões. */
type ResumoBase = { porTipo: Record<TipoBib, number>; total: number; pdfs: number; escondidos: number; reportesAbertos: number; temOculto: boolean }
const TIPOS_DOC: TipoBib[] = ['pdfull', 'pdflash', 'pdfight', 'legproc', 'questoes', 'jurisclub']
async function resumoSql(tenantId: string, pastas: Map<string, PastaInfo>, oc: boolean, comExtras: boolean): Promise<{ docs: Record<string, number>; esc: Record<string, number>; fc: number; sim: number; rep: number } | null> {
  // espelha filtroSql() (mesmas regras por aba) com parâmetros fixos: $2 questoes, $3 legproc, $4 pdfull(+sem tipo), $5 pdflash, $6 pdfight
  const naoMidia = `COALESCE(d.tipo_origem,'') NOT IN ('video','audio','questoes')`
  const cond: Record<string, string> = {
    jurisclub: `d.categoria = 'jurisclub' AND COALESCE(d.tipo_origem,'') NOT IN ('video','audio')`,
    questoes: `d.categoria = 'conteudo' AND (d.tipo_origem = 'questoes' OR d.pasta_id = ANY($2::uuid[]))`,
    legproc: `d.categoria = 'conteudo' AND ${naoMidia} AND (d.leitura_legproc = true OR d.pasta_id = ANY($3::uuid[]))`,
    pdfull: `d.categoria = 'conteudo' AND ${naoMidia} AND COALESCE(d.leitura_legproc,false) = false AND (d.pasta_id IS NULL OR d.pasta_id = ANY($4::uuid[]))`,
    pdflash: `d.categoria = 'conteudo' AND ${naoMidia} AND COALESCE(d.leitura_legproc,false) = false AND d.pasta_id = ANY($5::uuid[])`,
    pdfight: `d.categoria = 'conteudo' AND ${naoMidia} AND COALESCE(d.leitura_legproc,false) = false AND d.pasta_id = ANY($6::uuid[])`,
  }
  const esc = oc ? 'd.oculto = true' : 'false'
  const cols = TIPOS_DOC.flatMap((t) => [`count(*) FILTER (WHERE ${cond[t]})::int AS ${t}`, `count(*) FILTER (WHERE (${cond[t]}) AND ${esc})::int AS e_${t}`]).join(', ')
  const extras = comExtras
    ? `, (select count(*)::int from simulado_flashcard_baralhos where tenant_id = $1 and deletado = false) AS fc,
        (select count(*)::int from simulado_simulados where tenant_id = $1 and deletado = false and owner_estudante_id is null) AS sim,
        (select count(*)::int from simulado_material_reportes where tenant_id = $1 and status = 'aberto') AS rep`
    : ''
  const r = await sqlQuery<any>(`SELECT ${cols}${extras} FROM simulado_conteudo_documentos d WHERE d.tenant_id = $1 AND d.deletado = false`,
    [tenantId, ordemPastas(pastas, 'questoes'), ordemPastas(pastas, 'legproc'), [...ordemPastas(pastas, 'pdfull'), ...ordemPastas(pastas, null)], ordemPastas(pastas, 'pdflash'), ordemPastas(pastas, 'pdfight')])
  if (!r?.[0]) return null
  const x = r[0]
  return { docs: Object.fromEntries(TIPOS_DOC.map((t) => [t, Number(x[t] ?? 0)])), esc: Object.fromEntries(TIPOS_DOC.map((t) => [t, Number(x['e_' + t] ?? 0)])), fc: Number(x.fc ?? 0), sim: Number(x.sim ?? 0), rep: Number(x.rep ?? 0) }
}
export async function resumoBiblioteca(svc: SupabaseClient, tenantId: string): Promise<ResumoBase> {
  const [pastas, oc] = await Promise.all([carregarPastasResolvidas(svc, tenantId), temColunaOculto(svc)])
  const monta = (docs: Record<string, number>, esc: Record<string, number>, fc: number, sim: number, rep: number): ResumoBase => {
    const porTipo = { ...docs, flashcards: fc, simulados: sim } as Record<TipoBib, number>
    return { porTipo, total: Object.values(porTipo).reduce((s, n) => s + n, 0), pdfs: porTipo.pdfull + porTipo.pdflash + porTipo.pdfight, escondidos: Object.values(esc).reduce((s, n) => s + n, 0), reportesAbertos: rep, temOculto: oc }
  }
  // 1) tudo numa ida; 2) se alguma tabela auxiliar não existe: só documentos por SQL + o resto por PostgREST, em paralelo
  const tudo = await resumoSql(tenantId, pastas, oc, true)
  if (tudo) return monta(tudo.docs, tudo.esc, tudo.fc, tudo.sim, tudo.rep)
  const [docsSql, fc, sim, rep] = await Promise.all([
    resumoSql(tenantId, pastas, oc, false),
    svc.from('simulado_flashcard_baralhos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('deletado', false),
    svc.from('simulado_simulados').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('deletado', false).is('owner_estudante_id', null),
    svc.from('simulado_material_reportes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'aberto'),
  ])
  let docs = docsSql?.docs, esc = docsSql?.esc
  if (!docs || !esc) {
    const somar = async (soEsc: boolean) => {
      const out = await Promise.all(TIPOS_DOC.map(async (t) => (await contarSql(tenantId, t, pastas, soEsc, oc)) ?? (await contarFontes(fontesDocs(svc, tenantId, t, pastas, '', soEsc, 'titulo', oc))).reduce((s, n) => s + n, 0)))
      return Object.fromEntries(TIPOS_DOC.map((t, i) => [t, out[i]])) as Record<string, number>
    }
    ;[docs, esc] = await Promise.all([somar(false), somar(true)])
  }
  return monta(docs, esc, fc.error ? 0 : (fc.count ?? 0), sim.error ? 0 : (sim.count ?? 0), rep.error ? 0 : (rep.count ?? 0))
}

export { SEM_UUID, janelaFontes, sanear }
