import 'server-only'
// Matriz de classificação da Biblioteca (Fase 5) — camada SERVIDOR. A herança é calculada AQUI (heranca.ts + modelo
// origemTipoId), o render só exibe. Listagem paginada no banco (SQL direto com JOIN da versão atual; fallback PostgREST
// .range()+count só para filtros simples). Isolado por tenant (service role + .eq('tenant_id')). NÃO altera nenhum leitor
// do cronograma: grava só `classificacao_id`/`formato_leitura` do documento (NULL = herda, como hoje).
import type { createAdminClient } from '@/lib/supabase/server'
import { sqlQuery } from '@/lib/data/sql'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { descendentes } from '@/lib/admin/metas-pasta-heranca'
import { invalidarCachesPaginas } from '@/lib/conteudo/paginas-sync'
import { carregarCatalogoClassificacao, esquecerClassificacao } from './carregar'
import { diagnosticarDocumento } from '@/lib/conteudo/diagnostico-indice-server'
import {
  mapaHerancaPastas, resolverEfetiva, formatoEfetivo, conjuntosPastas, pastasDaDisciplina, montarSqlMatriz,
  sugerirClassificacao, nomesCaminhoPasta, filtroValido, FILTRO_EXIGE_SQL, SORTS_MATRIZ,
  type FiltroMatriz, type SortMatriz, type ItemCat, type PastaMatriz, type OrigemEfetiva,
} from './matriz'

type Svc = ReturnType<typeof createAdminClient>
const T_DOC = 'simulado_conteudo_documentos'
const T_VER = 'simulado_conteudo_versoes'
const T_PARTES = 'simulado_conteudo_partes'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_FORMATO = /^[a-z0-9][a-z0-9_-]{1,39}$/
const CHUNK = 80
const MAX_LOTE = 5000
export const AVISO_MIGRACOES = 'Aplique as migrations 16 e 17 (docs/sql-aplicar-twdr/16-conteudo-partes-classificacao.sql e 17-conteudo-tipos-modelo-base.sql).'

type Erro = { code?: string; message?: string } | null | undefined
/** Coluna/tabela da migration 16 ausente (42703 coluna, 42P01/PGRST205 tabela). */
export const migracaoAusente = (e: Erro) => !!e && /42703|42P01|PGRST204|PGRST205|does not exist|schema cache|classificacao_id|formato_leitura/i.test(`${e.code ?? ''} ${e.message ?? ''}`)

export interface FiltrosMatrizEntrada {
  filtro?: string
  q?: string
  pastaId?: string | null
  disciplinaId?: string | null
}

export interface LinhaMatrizClassificacao {
  id: string
  titulo: string
  status: string | null
  pastaId: string | null
  pastaNome: string | null
  classificacao: { id: string; slug: string; nome: string; cor: string | null } | null
  origem: OrigemEfetiva
  /** nome da pasta de onde a classificação foi herdada. */
  herdadaDe: string | null
  /** true = o que aparece é só o motor de hoje (pdfull), ainda sem classificação gravada. */
  comportamentoAtual: boolean
  pendente: boolean
  /** formato definido no documento (null = herda). */
  docFormato: string | null
  formato: string | null
  formatoOrigem: 'documento' | 'classificacao' | 'nenhum'
  disciplina: { id: string; nome: string } | null
  disciplinaHerdadaDe: string | null
  nPartes: number | null
  paginas: number | null
  statusConversao: string | null
  /** só preenchido com `indice: true`. 'erro' = leitura falhou. */
  indice: 'ok' | 'revisar' | 'critico' | 'erro' | null
}

export interface OpcaoPasta { id: string; nome: string; caminho: string }

export type MatrizClassificacao =
  | {
    ok: true
    linhas: LinhaMatrizClassificacao[]
    total: number
    catalogo: { id: string; slug: string; nome: string; cor: string | null; ativo: boolean }[]
    pastas: OpcaoPasta[]
    disciplinas: { id: string; nome: string }[]
    avisos: string[]
    /** colunas da migration 16 ausentes: tabela vazia + aviso. */
    migracaoPendente: boolean
    /** Sem SQL direto: filtros avançados indisponíveis. */
    semSql: boolean
  }
  | { ok: false; error: string }

interface PastaRow { id: string; nome: string; pai_id: string | null; disciplina_id: string | null; cronograma_tipo_material?: string | null }

async function lerPastasTodas(svc: Svc, tenantId: string): Promise<PastaMatriz[]> {
  const ler = (cols: string) => fetchAll<PastaRow>(() =>
    (svc as any).from('simulado_pastas').select(cols).eq('tenant_id', tenantId).eq('deletado', false).order('id', { ascending: true }))
  let rows: PastaRow[]
  try { rows = await ler('id, nome, pai_id, disciplina_id, cronograma_tipo_material') }
  catch { rows = await ler('id, nome, pai_id, disciplina_id') }
  return rows.map((p) => ({ id: p.id, nome: p.nome, paiId: p.pai_id, disciplinaId: p.disciplina_id, tipoMaterial: p.cronograma_tipo_material ?? null }))
}

async function lerDisciplinas(svc: Svc, tenantId: string): Promise<{ id: string; nome: string }[]> {
  try {
    return await fetchAll<{ id: string; nome: string }>(() =>
      (svc as any).from('simulado_disciplinas').select('id, nome').eq('tenant_id', tenantId).order('id', { ascending: true }))
  } catch { return [] }
}

/** Contexto comum (catálogo + pastas + herança) — 1 leitura de cada, reaproveitado por listagem/sugestão/lote. */
async function contexto(svc: Svc, tenantId: string) {
  const [cls, pastas, disciplinas] = await Promise.all([carregarCatalogoClassificacao(svc, tenantId), lerPastasTodas(svc, tenantId), lerDisciplinas(svc, tenantId)])
  const catalogo: ItemCat[] = cls.map((c) => ({ id: c.id, slug: c.slug, nome: c.nome, cor: c.cor, ativo: c.ativo, formatoLeitura: c.exibicao.formato_leitura }))
  const mapa = mapaHerancaPastas(pastas, catalogo)
  const pastaPorId = new Map(pastas.map((p) => [p.id, p] as const))
  return { catalogo, pastas, pastaPorId, mapa, disciplinas, discPorId: new Map(disciplinas.map((d) => [d.id, d] as const)) }
}

async function colunasDisponiveis(svc: Svc, tenantId: string): Promise<boolean> {
  const { error } = await (svc as any).from(T_DOC).select('id, classificacao_id, formato_leitura').eq('tenant_id', tenantId).limit(1)
  return !error
}

function caminhoPasta(id: string, porId: ReadonlyMap<string, PastaMatriz>): string {
  const nomes = nomesCaminhoPasta(id, new Map([...porId].map(([k, p]) => [k, { nome: p.nome, paiId: p.paiId }] as const)))
  return nomes.reverse().join(' / ')
}

interface LinhaBruta {
  id: string; titulo: string | null; status: string | null; pasta_id: string | null; classificacao_id: string | null
  formato_leitura: string | null; versao_atual_id: string | null; paginas?: number | null; status_conversao?: string | null; total?: number
}

type Contexto = Awaited<ReturnType<typeof contexto>>

/** Restrição de pastas (subárvore da pasta e/ou disciplina efetiva). null = sem restrição. */
function restricaoPastas(ctx: Contexto, f: FiltrosMatrizEntrada): string[] | null {
  let ids: string[] | null = null
  if (f.pastaId && UUID.test(f.pastaId)) ids = [f.pastaId, ...descendentes(ctx.pastas.map((p) => ({ id: p.id, paiId: p.paiId })), f.pastaId)]
  if (f.disciplinaId && UUID.test(f.disciplinaId)) ids = pastasDaDisciplina(ctx.mapa, f.disciplinaId, ids)
  return ids
}

async function consultarBruto(
  svc: Svc, tenantId: string, ctx: Contexto, f: FiltrosMatrizEntrada,
  pg: { limite: number; offset: number; sort?: SortMatriz; dir?: 'asc' | 'desc' },
): Promise<{ linhas: LinhaBruta[]; total: number; semSql: boolean } | { erro: string }> {
  const filtro: FiltroMatriz = filtroValido(f.filtro)
  const pastaIds = restricaoPastas(ctx, f)
  if (pastaIds && pastaIds.length === 0) return { linhas: [], total: 0, semSql: false }
  const { comClasse } = conjuntosPastas(ctx.mapa)
  const sql = montarSqlMatriz({ tenantId, filtro, q: f.q, pastaIds, comClasse, sort: pg.sort, dir: pg.dir, limite: pg.limite, offset: pg.offset })
  const rows = await sqlQuery<LinhaBruta>(sql.text, sql.params as unknown[])
  if (rows) return { linhas: rows, total: rows[0] ? Number(rows[0].total) : (pg.offset > 0 ? -1 : 0), semSql: false }

  // Fallback PostgREST (.range()+count): só filtros que não dependem da versão/conjuntos de pastas.
  if (FILTRO_EXIGE_SQL.has(filtro)) return { erro: 'Este filtro precisa de acesso SQL direto ao banco (indisponível agora). Use "Todos", "Definida" ou "Sem pasta".' }
  if (pastaIds && pastaIds.length > CHUNK) return { erro: 'Pasta/disciplina com muitas subpastas exige acesso SQL direto (indisponível agora).' }
  let qb = (svc as any).from(T_DOC).select('id, titulo, status, pasta_id, classificacao_id, formato_leitura, versao_atual_id', { count: 'exact' }).eq('tenant_id', tenantId).eq('deletado', false)
  if (filtro === 'definida') qb = qb.not('classificacao_id', 'is', null)
  if (filtro === 'sem_pasta') qb = qb.is('pasta_id', null)
  const q = (f.q ?? '').trim().slice(0, 80)
  if (q) qb = qb.ilike('titulo', `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`)
  if (pastaIds) qb = qb.in('pasta_id', pastaIds)
  const { data, count, error } = await qb.order('titulo', { ascending: pg.dir !== 'desc' }).order('id', { ascending: true }).range(pg.offset, pg.offset + pg.limite - 1)
  if (error) return { erro: error.message }
  const linhas = (data ?? []) as LinhaBruta[]
  const vids = [...new Set(linhas.map((l) => l.versao_atual_id).filter(Boolean) as string[])]
  const vers = new Map<string, { paginas: number | null; status_conversao: string | null }>()
  for (let i = 0; i < vids.length; i += CHUNK) {
    const { data: vs } = await (svc as any).from(T_VER).select('id, paginas, status_conversao').in('id', vids.slice(i, i + CHUNK))
    for (const v of (vs ?? []) as { id: string; paginas: number | null; status_conversao: string | null }[]) vers.set(v.id, v)
  }
  for (const l of linhas) { const v = l.versao_atual_id ? vers.get(l.versao_atual_id) : undefined; l.paginas = v?.paginas ?? null; l.status_conversao = v?.status_conversao ?? null }
  return { linhas, total: count ?? linhas.length, semSql: true }
}

async function contarPartes(svc: Svc, tenantId: string, ids: string[]): Promise<Map<string, number> | null> {
  if (ids.length === 0) return new Map()
  const out = new Map<string, number>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await (svc as any).from(T_PARTES).select('documento_id').eq('tenant_id', tenantId).eq('arquivada', false).in('documento_id', ids.slice(i, i + CHUNK))
    if (error) return null // tabela ausente (migration 16): sem contagem
    for (const r of (data ?? []) as { documento_id: string }[]) out.set(r.documento_id, (out.get(r.documento_id) ?? 0) + 1)
  }
  return out
}

async function indicesDe(svc: Svc, tenantId: string, ids: string[]): Promise<Map<string, LinhaMatrizClassificacao['indice']>> {
  const out = new Map<string, LinhaMatrizClassificacao['indice']>()
  let prox = 0
  const worker = async () => {
    while (prox < ids.length) {
      const id = ids[prox++]
      try {
        const r = await diagnosticarDocumento(svc, tenantId, id)
        out.set(id, r.ok ? r.diagnostico.severidade : 'erro')
      } catch { out.set(id, 'erro') }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker))
  return out
}

export interface ParamsListagem extends FiltrosMatrizEntrada {
  page?: number
  pp?: number
  sort?: string
  dir?: string
  /** calcula a coluna Índice (leitura extra por documento; desligado por padrão). */
  indice?: boolean
}

/** Página da matriz: filtros/ordenação/paginação no banco; herança e demais colunas calculadas aqui. */
export async function listarMatrizClassificacao(svc: Svc, tenantId: string, p: ParamsListagem): Promise<MatrizClassificacao> {
  const pp = Math.min(100, Math.max(5, Math.floor(p.pp ?? 25) || 25))
  const page = Math.max(1, Math.floor(p.page ?? 1) || 1)
  const avisos: string[] = []
  const [colunasOk, ctx] = await Promise.all([colunasDisponiveis(svc, tenantId), contexto(svc, tenantId)])
  const opcoes = {
    catalogo: ctx.catalogo.map((c) => ({ id: c.id, slug: c.slug, nome: c.nome, cor: c.cor ?? null, ativo: c.ativo !== false })),
    pastas: ctx.pastas.map((x) => ({ id: x.id, nome: x.nome, caminho: caminhoPasta(x.id, ctx.pastaPorId) })).sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt-BR')),
    disciplinas: ctx.disciplinas.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  }
  if (!colunasOk) {
    return { ok: true, linhas: [], total: 0, ...opcoes, migracaoPendente: true, semSql: false, avisos: [`Colunas de classificação do documento ausentes. ${AVISO_MIGRACOES}`] }
  }
  if (ctx.catalogo.length === 0) avisos.push(`Catálogo de classificações vazio (modelo-base não semeado). ${AVISO_MIGRACOES}`)

  const sort = (SORTS_MATRIZ as readonly string[]).includes(p.sort ?? '') ? (p.sort as SortMatriz) : 'titulo'
  const r = await consultarBruto(svc, tenantId, ctx, p, { limite: pp, offset: (page - 1) * pp, sort, dir: p.dir === 'desc' ? 'desc' : 'asc' })
  if ('erro' in r) return { ok: false, error: r.erro }
  let { linhas: brutas, total } = r
  if (total < 0) total = 0
  if (r.semSql) avisos.push('Sem acesso SQL direto: páginas, conversão e filtros avançados ficam limitados.')

  const ids = brutas.map((l) => l.id)
  const [partes, indices] = await Promise.all([contarPartes(svc, tenantId, ids), p.indice ? indicesDe(svc, tenantId, ids) : Promise.resolve(new Map())])
  const legado = ctx.catalogo.find((c) => c.slug === 'pdfull') ?? null
  const linhas: LinhaMatrizClassificacao[] = brutas.map((b) => {
    const ef = resolverEfetiva({ docClassId: b.classificacao_id, pastaId: b.pasta_id, mapa: ctx.mapa, catalogo: ctx.catalogo, fallbackLegado: legado })
    const fe = formatoEfetivo(b.formato_leitura, ef)
    const info = b.pasta_id ? ctx.mapa.get(b.pasta_id) : undefined
    const disc = info?.disciplinaId ? ctx.discPorId.get(info.disciplinaId) ?? null : null
    const pasta = b.pasta_id ? ctx.pastaPorId.get(b.pasta_id) : undefined
    return {
      id: b.id, titulo: b.titulo ?? '(sem título)', status: b.status, pastaId: b.pasta_id, pastaNome: pasta?.nome ?? null,
      classificacao: ef.classificacao ? { id: ef.classificacao.id, slug: ef.classificacao.slug, nome: ef.classificacao.nome, cor: ef.classificacao.cor ?? null } : null,
      origem: ef.origem,
      herdadaDe: ef.pastaOrigemId ? ctx.pastaPorId.get(ef.pastaOrigemId)?.nome ?? null : null,
      comportamentoAtual: ef.comportamentoAtual, pendente: ef.pendente,
      docFormato: b.formato_leitura, formato: fe.formato, formatoOrigem: fe.origem,
      disciplina: disc,
      disciplinaHerdadaDe: info?.origemDisciplinaPastaId && info.origemDisciplinaPastaId !== b.pasta_id ? ctx.pastaPorId.get(info.origemDisciplinaPastaId)?.nome ?? null : null,
      nPartes: partes ? partes.get(b.id) ?? 0 : null,
      paginas: b.paginas ?? null, statusConversao: b.status_conversao ?? null,
      indice: p.indice ? (indices.get(b.id) ?? null) : null,
    }
  })
  return { ok: true, linhas, total, ...opcoes, avisos, migracaoPendente: false, semSql: r.semSql }
}

/** Ids dos documentos que casam com o filtro (para "Selecionar todos (N)"), em páginas de 1000, até MAX_LOTE. */
export async function idsDoFiltro(svc: Svc, tenantId: string, f: FiltrosMatrizEntrada): Promise<{ ok: true; ids: string[]; truncado: boolean } | { ok: false; error: string }> {
  const ctx = await contexto(svc, tenantId)
  const ids: string[] = []
  for (let off = 0; off < MAX_LOTE; off += 1000) {
    const r = await consultarBruto(svc, tenantId, ctx, f, { limite: 1000, offset: off })
    if ('erro' in r) return { ok: false, error: r.erro }
    ids.push(...r.linhas.map((l) => l.id))
    if (r.linhas.length < 1000) return { ok: true, ids, truncado: false }
  }
  return { ok: true, ids, truncado: true }
}

export type FalhaLote = { ok: false; codigo: 'invalido' | 'migracao' | 'erro'; error: string }

export interface PedidoLote {
  ids: string[]
  /** presente = grava (null limpa → volta a herdar). Ausente = não mexe. */
  classificacaoId?: string | null
  formatoLeitura?: string | null
}

/** Define/limpa classificacao_id e formato_leitura em lote (chunks de 80), com auditoria e invalidação de caches. */
export async function aplicarLote(
  svc: Svc, tenantId: string, atorId: string | null, pedido: PedidoLote,
): Promise<{ ok: true; alterados: number; ignorados: number } | FalhaLote> {
  const temC = pedido.classificacaoId !== undefined
  const temF = pedido.formatoLeitura !== undefined
  if (!temC && !temF) return { ok: false, codigo: 'invalido', error: 'Nada a alterar: informe classificacaoId e/ou formatoLeitura.' }
  const ids = [...new Set(pedido.ids.filter((i) => UUID.test(i)))]
  if (ids.length === 0) return { ok: false, codigo: 'invalido', error: 'Nenhum documento válido selecionado.' }
  if (ids.length > MAX_LOTE) return { ok: false, codigo: 'invalido', error: `Máximo de ${MAX_LOTE} documentos por operação.` }
  if (temC && pedido.classificacaoId !== null) {
    if (!UUID.test(pedido.classificacaoId as string)) return { ok: false, codigo: 'invalido', error: 'Classificação inválida.' }
    const cat = await carregarCatalogoClassificacao(svc, tenantId)
    const alvo = cat.find((c) => c.id === pedido.classificacaoId)
    if (!alvo) return { ok: false, codigo: cat.length === 0 ? 'migracao' : 'invalido', error: cat.length === 0 ? `Catálogo de classificações vazio. ${AVISO_MIGRACOES}` : 'Classificação não encontrada neste tenant.' }
    if (!alvo.ativo) return { ok: false, codigo: 'invalido', error: 'Classificação desativada.' }
  }
  if (temF && pedido.formatoLeitura !== null && !SLUG_FORMATO.test(String(pedido.formatoLeitura))) {
    return { ok: false, codigo: 'invalido', error: 'Formato de leitura inválido (use um slug: letras minúsculas, números, - ou _).' }
  }
  const patch: Record<string, unknown> = {}
  if (temC) patch.classificacao_id = pedido.classificacaoId
  if (temF) patch.formato_leitura = pedido.formatoLeitura

  let alterados = 0
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { data: antes, error: e1 } = await (svc as any).from(T_DOC).select('id, classificacao_id, formato_leitura').eq('tenant_id', tenantId).eq('deletado', false).in('id', chunk)
    if (e1) return migracaoAusente(e1) ? { ok: false, codigo: 'migracao', error: `Colunas de classificação ausentes. ${AVISO_MIGRACOES}` } : { ok: false, codigo: 'erro', error: e1.message }
    const validos = ((antes ?? []) as { id: string; classificacao_id: string | null; formato_leitura: string | null }[])
    if (validos.length === 0) continue
    const { error: e2 } = await (svc as any).from(T_DOC).update(patch).eq('tenant_id', tenantId).eq('deletado', false).in('id', validos.map((v) => v.id))
    if (e2) return migracaoAusente(e2) ? { ok: false, codigo: 'migracao', error: `Colunas de classificação ausentes. ${AVISO_MIGRACOES}` } : { ok: false, codigo: 'erro', error: e2.message }
    alterados += validos.length
    await registrarAudit({
      operacao: 'UPDATE', entidade: T_DOC, tenantId, atorId, metodo: 'PATCH',
      antes: { documentos: validos.map((v) => ({ id: v.id, classificacao_id: v.classificacao_id, formato_leitura: v.formato_leitura })) },
      depois: { ...patch, documentos: validos.map((v) => v.id), origem: 'matriz-classificacao' },
    }).catch(() => {})
  }
  await Promise.all([esquecerClassificacao(tenantId), invalidarCachesPaginas(tenantId)]).catch(() => {})
  return { ok: true, alterados, ignorados: ids.length - alterados }
}

export interface SugestaoDoc {
  id: string; titulo: string; slug: string; classificacaoId: string; classificacaoNome: string
  motivo: 'titulo' | 'pasta'; evidencia: string
}

/** SUGERE (não grava) classificação para documentos sem tipo (nem próprio, nem herdado da pasta). */
export async function sugerirParaDocumentos(svc: Svc, tenantId: string, idsEntrada: string[]): Promise<
  { ok: true; sugestoes: SugestaoDoc[]; semSugestao: number; jaClassificados: number } | FalhaLote
> {
  const ids = [...new Set(idsEntrada.filter((i) => UUID.test(i)))].slice(0, MAX_LOTE)
  if (ids.length === 0) return { ok: false, codigo: 'invalido', error: 'Nenhum documento válido selecionado.' }
  const ctx = await contexto(svc, tenantId)
  if (ctx.catalogo.length === 0) return { ok: false, codigo: 'migracao', error: `Catálogo de classificações vazio. ${AVISO_MIGRACOES}` }
  const porSlug = new Map(ctx.catalogo.filter((c) => c.ativo !== false).map((c) => [c.slug, c] as const))
  const disponiveis = new Set(porSlug.keys())
  const pastasSimples = new Map(ctx.pastas.map((p) => [p.id, { nome: p.nome, paiId: p.paiId }] as const))
  const sugestoes: SugestaoDoc[] = []; let semSugestao = 0; let jaClassificados = 0
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await (svc as any).from(T_DOC).select('id, titulo, pasta_id, classificacao_id').eq('tenant_id', tenantId).eq('deletado', false).in('id', ids.slice(i, i + CHUNK))
    if (error) return migracaoAusente(error) ? { ok: false, codigo: 'migracao', error: `Colunas de classificação ausentes. ${AVISO_MIGRACOES}` } : { ok: false, codigo: 'erro', error: error.message }
    for (const d of (data ?? []) as { id: string; titulo: string | null; pasta_id: string | null; classificacao_id: string | null }[]) {
      const ef = resolverEfetiva({ docClassId: d.classificacao_id, pastaId: d.pasta_id, mapa: ctx.mapa, catalogo: ctx.catalogo })
      if (!ef.pendente) { jaClassificados++; continue }
      const s = sugerirClassificacao({ titulo: d.titulo ?? '', nomesPasta: nomesCaminhoPasta(d.pasta_id, pastasSimples), disponiveis })
      const alvo = s ? porSlug.get(s.slug) : undefined
      if (!s || !alvo) { semSugestao++; continue }
      sugestoes.push({ id: d.id, titulo: d.titulo ?? '(sem título)', slug: s.slug, classificacaoId: alvo.id, classificacaoNome: alvo.nome, motivo: s.motivo, evidencia: s.evidencia })
    }
  }
  return { ok: true, sugestoes, semSugestao, jaClassificados }
}
