import 'server-only'
// PÁGINA DA CLASSIFICAÇÃO (área interna) — camada SERVIDOR. Cada aba tem o seu loader (a página só chama o da aba aberta).
// Backend-first: paginação .range()+count (ou SQL com count(*) OVER()), chunk 80 em .in(), fetchAll com .order() único,
// herança/uso/sugestão calculados AQUI. Tolerante a tabela/coluna ausente. Escritas reusam gestao-server/matriz-server (auditoria + caches).
import type { SupabaseClient } from '@supabase/supabase-js'
import { registrarAudit } from '@/lib/audit'
import { sqlQuery } from '@/lib/data/sql'
import { tabelaTiposAusente } from '@/lib/cronograma/tipos-conteudo-server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { carregarMatrizRegras, invalidarClassificacao, lerPorId, reordenarTipos, salvarRegrasLote, usoDasClassificacoes, type LinhaTipoGestao, type MatrizRegras, type PreviaRegra, type Resultado } from './gestao-server'
import { podeApagar } from './gestao'
import { colunaClassificacaoIdExiste } from './coluna-doc-server'
import { aplicarLote, contarPartes, contexto, sugerirParaDocumentos } from './matriz-server'
import { montarSqlMatriz, nomesCaminhoPasta, sugerirClassificacao } from './matriz'
import {
  MAX_LOTE_DETALHE, diffResumo, montarSqlDocsDaClasse, planoClonarRegras, slugComPartesDasMetas, trocarOrdem,
  type AcaoDetalhe, type CampoDiff, type OrigemDoc, type SortDocs,
} from './detalhe'

const T = 'simulado_conteudo_tipos'
const T_REGRAS = 'simulado_conteudo_regras_uso'
const T_DOC = 'simulado_conteudo_documentos'
const CHUNK = 80
type Svc = SupabaseClient
const falha = (status: 400 | 404 | 409 | 500 | 503, error: string) => ({ ok: false as const, status, error })

// ───────────── Cabeçalho (todas as abas) ─────────────
export interface DetalheClassificacao {
  tipo: LinhaTipoGestao
  /** vizinhos na ordem das listas (para subir/descer). */
  anteriorId: string | null
  proximoId: string | null
  /** outras classificações (para copiar regras / trocar). */
  outras: { id: string; nome: string; ativo: boolean }[]
  /** motivo pelo qual NÃO pode apagar (null = pode). */
  bloqueioApagar: string | null
  /** dá para criar partes a partir das metas (legproc/pdflash/pdfight). */
  atalhoPartes: boolean
}

export async function carregarDetalhe(svc: Svc, tenantId: string, id: string): Promise<DetalheClassificacao | null> {
  const [tipo, lista] = await Promise.all([
    lerPorId(svc, tenantId, id),
    fetchAll<{ id: string; nome: string | null; slug: string; ordem: number | null; ativo: boolean | null }>(() =>
      svc.from(T).select('id, nome, slug, ordem, ativo').eq('tenant_id', tenantId).order('ordem', { ascending: true }).order('id', { ascending: true }) as never).catch((e) => {
      if (tabelaTiposAusente(e)) return []
      throw e
    }),
  ])
  if (!tipo) return null
  tipo.uso = (await usoDasClassificacoes(tenantId, [tipo])).get(id) ?? null
  const ord = [...lista].sort((a, b) => (a.ordem ?? 100) - (b.ordem ?? 100) || a.slug.localeCompare(b.slug))
  const i = ord.findIndex((x) => x.id === id)
  const dec = podeApagar(tipo, tipo.uso)
  return {
    tipo,
    anteriorId: i > 0 ? ord[i - 1].id : null,
    proximoId: i >= 0 && i < ord.length - 1 ? ord[i + 1].id : null,
    outras: ord.filter((x) => x.id !== id).map((x) => ({ id: x.id, nome: x.nome || x.slug, ativo: x.ativo !== false })),
    bloqueioApagar: dec.ok ? null : dec.motivo,
    atalhoPartes: slugComPartesDasMetas(tipo.slug),
  }
}

// ───────────── Aba: Regras de uso (só as desta classificação) ─────────────
export const carregarRegrasDaClassificacao = (svc: Svc, tenantId: string, id: string): Promise<MatrizRegras> =>
  carregarMatrizRegras(svc, tenantId, undefined, { soClassificacaoId: id })

// ───────────── Aba: Documentos ─────────────
export interface LinhaDocClasse {
  id: string; titulo: string; status: string | null; pastaId: string | null; pastaNome: string | null
  origem: 'definida' | 'herdada'; herdadaDe: string | null; paginas: number | null; nPartes: number | null
}
export interface ListaDocsClasse { linhas: LinhaDocClasse[]; total: number; semSql: boolean; erro?: string; migracaoPendente: boolean }
export interface FiltrosDocsClasse { q?: string; pastaId?: string; origem: OrigemDoc; sort: SortDocs; dir: 'asc' | 'desc'; page: number; pp: number }

/** Pastas (ids) cuja classificação efetiva é `id` — herança por pai_id calculada no servidor. */
async function pastasQueHerdam(svc: Svc, tenantId: string, id: string) {
  const ctx = await contexto(svc, tenantId)
  const ids: string[] = []
  for (const [pid, info] of ctx.mapa) if (info.classificacaoId === id) ids.push(pid)
  return { ctx, ids }
}

export async function listarDocumentosDaClasse(svc: Svc, tenantId: string, id: string, f: FiltrosDocsClasse): Promise<ListaDocsClasse> {
  if (!(await colunaClassificacaoIdExiste())) return { linhas: [], total: 0, semSql: false, migracaoPendente: true }
  const { ctx, ids: pastasHerdam } = await pastasQueHerdam(svc, tenantId, id)
  const offset = (Math.max(1, f.page) - 1) * f.pp
  type Bruta = { id: string; titulo: string | null; status: string | null; pasta_id: string | null; classificacao_id: string | null; paginas: number | null; total?: number }
  const sql = montarSqlDocsDaClasse({ tenantId, classificacaoId: id, pastasHerdam, origem: f.origem, q: f.q, pastaId: f.pastaId, sort: f.sort, dir: f.dir, limite: f.pp, offset })
  let brutas = await sqlQuery<Bruta>(sql.text, sql.params)
  let total = brutas ? (brutas[0] ? Number(brutas[0].total) : 0) : 0
  let semSql = false
  if (!brutas) {
    // Fallback PostgREST (.range()+count): só a origem "definida" (as herdadas dependem do conjunto de pastas).
    semSql = true
    if (f.origem !== 'definida') return { linhas: [], total: 0, semSql, migracaoPendente: false, erro: 'Sem acesso SQL direto: só a origem "Definida no documento" está disponível agora.' }
    let qb = (svc as any).from(T_DOC).select('id, titulo, status, pasta_id, classificacao_id, versao_atual_id', { count: 'exact' }).eq('tenant_id', tenantId).eq('deletado', false).eq('classificacao_id', id)
    const q = (f.q ?? '').trim().slice(0, 80)
    if (q) qb = qb.ilike('titulo', `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`)
    const { data, count, error } = await qb.order('titulo', { ascending: f.dir !== 'desc' }).order('id', { ascending: true }).range(offset, offset + f.pp - 1)
    if (error) return { linhas: [], total: 0, semSql, migracaoPendente: false, erro: error.message }
    brutas = ((data ?? []) as Bruta[]).map((d) => ({ ...d, paginas: null }))
    total = count ?? brutas.length
  }
  const partes = await contarPartes(svc, tenantId, brutas.map((b) => b.id))
  const linhas: LinhaDocClasse[] = brutas.map((b) => {
    const info = b.pasta_id ? ctx.mapa.get(b.pasta_id) : undefined
    const definida = b.classificacao_id === id
    return {
      id: b.id, titulo: b.titulo ?? '(sem título)', status: b.status, pastaId: b.pasta_id, pastaNome: b.pasta_id ? ctx.pastaPorId.get(b.pasta_id)?.nome ?? null : null,
      origem: definida ? 'definida' : 'herdada',
      herdadaDe: !definida && info?.origemClassificacaoPastaId ? ctx.pastaPorId.get(info.origemClassificacaoPastaId)?.nome ?? null : null,
      paginas: b.paginas ?? null, nPartes: partes ? partes.get(b.id) ?? 0 : null,
    }
  })
  return { linhas, total, semSql, migracaoPendente: false }
}

/** Ids dos documentos que casam com o filtro (até MAX_LOTE_DETALHE+1, para detectar excesso). */
async function idsDosDocumentos(svc: Svc, tenantId: string, id: string, f: { origem: OrigemDoc; q?: string; pastaId?: string }): Promise<{ ids: string[]; truncado: boolean } | { erro: string }> {
  const { ids: pastasHerdam } = await pastasQueHerdam(svc, tenantId, id)
  const ids: string[] = []
  for (let off = 0; off <= MAX_LOTE_DETALHE; off += 1000) {
    const sql = montarSqlDocsDaClasse({ tenantId, classificacaoId: id, pastasHerdam, origem: f.origem, q: f.q, pastaId: f.pastaId, limite: 1000, offset: off })
    const rows = await sqlQuery<{ id: string }>(sql.text, sql.params)
    if (!rows) return { erro: 'Esta operação sobre "todos" precisa de acesso SQL direto (indisponível agora). Selecione linhas na tabela.' }
    ids.push(...rows.map((r) => r.id))
    if (rows.length < 1000) return { ids, truncado: ids.length > MAX_LOTE_DETALHE }
  }
  return { ids, truncado: true }
}

// ───────────── Aba: Pastas e metas ─────────────
export interface LinhaPastaClasse { id: string; nome: string; caminho: string; origem: 'direta' | 'herdada'; herdadaDe: string | null; disciplina: string | null }
export interface ListaPastasClasse { linhas: LinhaPastaClasse[]; total: number }

export async function listarPastasDaClasse(svc: Svc, tenantId: string, id: string, f: { q?: string; sort: 'nome' | 'origem'; dir: 'asc' | 'desc'; page: number; pp: number }): Promise<ListaPastasClasse> {
  const { ctx, ids } = await pastasQueHerdam(svc, tenantId, id)
  const pastasSimples = new Map(ctx.pastas.map((p) => [p.id, { nome: p.nome, paiId: p.paiId }] as const))
  const q = (f.q ?? '').trim().toLowerCase()
  let linhas = ids.map((pid): LinhaPastaClasse => {
    const p = ctx.pastaPorId.get(pid)!, info = ctx.mapa.get(pid)!
    const direta = info.origemClassificacaoPastaId === pid
    return {
      id: pid, nome: p.nome, caminho: nomesCaminhoPasta(pid, pastasSimples).reverse().join(' / '), origem: direta ? 'direta' : 'herdada',
      herdadaDe: !direta && info.origemClassificacaoPastaId ? ctx.pastaPorId.get(info.origemClassificacaoPastaId)?.nome ?? null : null,
      disciplina: info.disciplinaId ? ctx.discPorId.get(info.disciplinaId)?.nome ?? null : null,
    }
  })
  if (q) linhas = linhas.filter((l) => l.caminho.toLowerCase().includes(q))
  const sgn = f.dir === 'desc' ? -1 : 1
  linhas.sort((a, b) => sgn * (f.sort === 'origem' ? a.origem.localeCompare(b.origem) || a.caminho.localeCompare(b.caminho, 'pt-BR') : a.caminho.localeCompare(b.caminho, 'pt-BR')) || a.id.localeCompare(b.id))
  const from = (Math.max(1, f.page) - 1) * f.pp
  return { linhas: linhas.slice(from, from + f.pp), total: linhas.length }
}

export interface LinhaMetaClasse { id: string; area: string; metaChave: string; docTitulo: string | null; documentoId: string | null }
export interface ListaMetasClasse { linhas: LinhaMetaClasse[]; total: number; indisponivel: boolean }

export async function listarMetasDaClasse(svc: Svc, tenantId: string, id: string, f: { q?: string; dir: 'asc' | 'desc'; page: number; pp: number }): Promise<ListaMetasClasse> {
  const from = (Math.max(1, f.page) - 1) * f.pp
  let qb = (svc as any).from('simulado_conteudo_selecao_meta').select('id, area, meta_chave, doc_titulo, documento_id', { count: 'exact' }).eq('tenant_id', tenantId).eq('classificacao_id', id)
  const q = (f.q ?? '').replace(/[,()%*\\]/g, ' ').trim().slice(0, 60)
  if (q) qb = qb.or(`meta_chave.ilike.%${q}%,doc_titulo.ilike.%${q}%`)
  const { data, count, error } = await qb.order('area', { ascending: f.dir !== 'desc' }).order('id', { ascending: true }).range(from, from + f.pp - 1)
  if (error) {
    if (tabelaTiposAusente(error)) return { linhas: [], total: 0, indisponivel: true }
    throw error
  }
  type R = { id: string; area: string; meta_chave: string; doc_titulo: string | null; documento_id: string | null }
  return { linhas: ((data ?? []) as R[]).map((r) => ({ id: r.id, area: r.area, metaChave: r.meta_chave, docTitulo: r.doc_titulo, documentoId: r.documento_id })), total: count ?? 0, indisponivel: false }
}

// ───────────── Aba: Partes ─────────────
export interface ResumoPartes {
  documentos: number; docsComPartes: number; partesAtivas: number
  topo: { id: string; titulo: string; partes: number }[]
  indisponivel: boolean
}

export async function resumoPartesDaClasse(svc: Svc, tenantId: string, id: string): Promise<ResumoPartes> {
  const { ids: pastasHerdam } = await pastasQueHerdam(svc, tenantId, id)
  const cond = 'd.tenant_id = $1 AND d.deletado = false AND (d.classificacao_id = $2::uuid OR (d.classificacao_id IS NULL AND d.pasta_id = ANY($3::uuid[])))'
  const params = [tenantId, id, pastasHerdam]
  const [tot, partes, topo] = await Promise.all([
    sqlQuery<{ n: number }>(`SELECT count(*)::int AS n FROM simulado_conteudo_documentos d WHERE ${cond}`, params),
    sqlQuery<{ docs: number; partes: number }>(
      `SELECT count(DISTINCT p.documento_id)::int AS docs, count(*)::int AS partes FROM simulado_conteudo_partes p JOIN simulado_conteudo_documentos d ON d.id = p.documento_id
        WHERE p.tenant_id = $1 AND p.arquivada = false AND ${cond}`, params),
    sqlQuery<{ id: string; titulo: string; partes: number }>(
      `SELECT d.id::text AS id, d.titulo, count(*)::int AS partes FROM simulado_conteudo_partes p JOIN simulado_conteudo_documentos d ON d.id = p.documento_id
        WHERE p.tenant_id = $1 AND p.arquivada = false AND ${cond} GROUP BY d.id, d.titulo ORDER BY count(*) DESC, d.titulo ASC, d.id ASC LIMIT 10`, params),
  ])
  if (!tot || !partes || !topo) return { documentos: 0, docsComPartes: 0, partesAtivas: 0, topo: [], indisponivel: true }
  return { documentos: Number(tot[0]?.n ?? 0), docsComPartes: Number(partes[0]?.docs ?? 0), partesAtivas: Number(partes[0]?.partes ?? 0), topo, indisponivel: false }
}

// ───────────── Aba: Pendências (sugestão por regra de título/pasta) ─────────────
export interface LinhaPendencia { id: string; titulo: string; pastaNome: string | null; motivo: 'titulo' | 'pasta'; evidencia: string }
export interface ListaPendencias { linhas: LinhaPendencia[]; total: number; truncado: boolean; semSql: boolean; semRegra: boolean }

const MAX_VARREDURA = 5000

/** Documentos SEM classificação (nem própria, nem herdada) que a regra de sugestão associa a esta classificação. */
async function pendenciasCompletas(svc: Svc, tenantId: string, cls: { id: string; slug: string }): Promise<{ linhas: LinhaPendencia[]; truncado: boolean; semSql: boolean }> {
  const ctx = await contexto(svc, tenantId)
  const disponiveis = new Set(ctx.catalogo.filter((c) => c.ativo !== false).map((c) => c.slug))
  const pastasSimples = new Map(ctx.pastas.map((p) => [p.id, { nome: p.nome, paiId: p.paiId }] as const))
  const comClasse = [...ctx.mapa].filter(([, i]) => i.classificacaoId).map(([pid]) => pid)
  const linhas: LinhaPendencia[] = []
  for (let off = 0; off < MAX_VARREDURA; off += 1000) {
    const sql = montarSqlMatriz({ tenantId, filtro: 'sem_classificacao', comClasse, limite: 1000, offset: off })
    const rows = await sqlQuery<{ id: string; titulo: string | null; pasta_id: string | null }>(sql.text, sql.params as unknown[])
    if (!rows) return { linhas: [], truncado: false, semSql: true }
    for (const d of rows) {
      const s = sugerirClassificacao({ titulo: d.titulo ?? '', nomesPasta: nomesCaminhoPasta(d.pasta_id, pastasSimples), disponiveis })
      if (s && s.slug === cls.slug) linhas.push({ id: d.id, titulo: d.titulo ?? '(sem título)', pastaNome: d.pasta_id ? ctx.pastaPorId.get(d.pasta_id)?.nome ?? null : null, motivo: s.motivo, evidencia: s.evidencia })
    }
    if (rows.length < 1000) return { linhas, truncado: false, semSql: false }
  }
  return { linhas, truncado: true, semSql: false }
}

export async function listarPendenciasDaClasse(svc: Svc, tenantId: string, cls: { id: string; slug: string }, f: { page: number; pp: number }): Promise<ListaPendencias> {
  const r = await pendenciasCompletas(svc, tenantId, cls)
  const from = (Math.max(1, f.page) - 1) * f.pp
  // classificações personalizadas não têm regra de sugestão (as regras cobrem PDFull/PDFight/PDFlash/LegProc/JurisClub).
  const semRegra = !['pdfull', 'pdfight', 'pdflash', 'legproc', 'jurisclub'].includes(cls.slug)
  return { linhas: r.linhas.slice(from, from + f.pp), total: r.linhas.length, truncado: r.truncado, semSql: r.semSql, semRegra }
}

// ───────────── Aba: Histórico ─────────────
export interface LinhaHistorico {
  id: string; criadoEm: string; operacao: string; entidade: string; escopo: string; ator: string | null; alteracoes: CampoDiff[]
}
export interface ListaHistorico { linhas: LinhaHistorico[]; total: number; indisponivel: boolean }
const ESCOPO: Record<string, string> = { [T]: 'Classificação', [T_REGRAS]: 'Regras de uso', [T_DOC]: 'Documentos' }

export async function listarHistoricoDaClasse(svc: Svc, tenantId: string, id: string, f: { op?: string; escopo?: string; page: number; pp: number }): Promise<ListaHistorico> {
  const from = (Math.max(1, f.page) - 1) * f.pp
  let qb = (svc as any).from('simulado_audit_logs')
    .select('id, criado_em, operacao, entidade, ator_id, ator_tipo, dados_anteriores, dados_novos', { count: 'exact' }).eq('tenant_id', tenantId)
    .or(`entidade_id.eq.${id},and(entidade.eq.${T_DOC},dados_novos->>classificacao_id.eq.${id})`)
  if (f.op && ['INSERT', 'UPDATE', 'DELETE'].includes(f.op)) qb = qb.eq('operacao', f.op)
  if (f.escopo && ESCOPO[f.escopo]) qb = qb.eq('entidade', f.escopo)
  const { data, count, error } = await qb.order('criado_em', { ascending: false }).order('id', { ascending: false }).range(from, from + f.pp - 1)
  if (error) {
    if (tabelaTiposAusente(error)) return { linhas: [], total: 0, indisponivel: true }
    throw error
  }
  type R = { id: string; criado_em: string; operacao: string; entidade: string | null; ator_id: string | null; ator_tipo: string | null; dados_anteriores: unknown; dados_novos: unknown }
  return {
    linhas: ((data ?? []) as R[]).map((r) => ({
      id: r.id, criadoEm: r.criado_em, operacao: r.operacao, entidade: r.entidade ?? '', escopo: ESCOPO[r.entidade ?? ''] ?? (r.entidade ?? '—'),
      ator: r.ator_tipo === 'sistema' ? 'Sistema' : r.ator_id ? r.ator_id.slice(0, 8) : null,
      alteracoes: diffResumo(r.dados_anteriores, r.dados_novos),
    })),
    total: count ?? 0, indisponivel: false,
  }
}

// ───────────── Ações ─────────────
const auditar = (tenantId: string, atorId: string | null, id: string, depois: object) =>
  registrarAudit({ operacao: 'UPDATE', entidade: T, entidadeId: id, tenantId, atorId, depois: depois as never }).catch(() => {})

export async function executarAcaoDetalhe(svc: Svc, tenantId: string, atorId: string | null, id: string, a: AcaoDetalhe):
  Promise<Resultado<{ alterados?: number; ignorados?: number; previa?: PreviaRegra[]; aplicadas?: number; removidas?: number; sugeridos?: number }>> {
  const atual = await lerPorId(svc, tenantId, id)
  if (!atual) return falha(404, 'Classificação não encontrada.')

  if (a.acao === 'mover') {
    const lista = await fetchAll<{ id: string; slug: string; ordem: number | null }>(() =>
      svc.from(T).select('id, slug, ordem').eq('tenant_id', tenantId).order('ordem', { ascending: true }).order('id', { ascending: true }) as never)
    const ord = lista.map((x) => ({ id: x.id, slug: x.slug, ordem: x.ordem ?? 100 })).sort((x, y) => x.ordem - y.ordem || x.slug.localeCompare(y.slug))
    const itens = trocarOrdem(ord, id, a.delta)
    if (!itens.length) return falha(400, a.delta < 0 ? 'Já é a primeira.' : 'Já é a última.')
    const r = await reordenarTipos(svc, tenantId, atorId, itens)
    return r.ok ? { ok: true, alterados: r.alterados } : r
  }

  if (a.acao === 'clonar-regras') {
    if (a.origemId === id) return falha(400, 'Escolha outra classificação como origem.')
    const origem = await lerPorId(svc, tenantId, a.origemId)
    if (!origem) return falha(404, 'Classificação de origem não encontrada.')
    let rows: { area: string; classificacao_id: string; regras: unknown }[]
    try {
      rows = await fetchAll(() => svc.from(T_REGRAS).select('area, classificacao_id, regras').eq('tenant_id', tenantId).in('classificacao_id', [id, a.origemId]).order('id', { ascending: true }) as never)
    } catch (e) {
      if (tabelaTiposAusente(e as { code?: string; message?: string })) return falha(503, 'A tabela de regras de uso ainda não existe (migration 17).')
      throw e
    }
    const por = (cid: string) => Object.fromEntries(rows.filter((r) => r.classificacao_id === cid).map((r) => [r.area, r.regras]))
    const alteracoes = planoClonarRegras(id, por(a.origemId), por(id), a.modo, a.areas)
    if (!alteracoes.length) return falha(400, 'Nada a copiar: a origem não define regras (ou o destino já as tem, no modo "preencher").')
    const r = await salvarRegrasLote(svc, tenantId, atorId, alteracoes, { dryRun: a.dryRun })
    if (!r.ok) return r
    if (!a.dryRun) await auditar(tenantId, atorId, id, { acao: 'clonar-regras', origem: origem.slug, modo: a.modo })
    return { ok: true, previa: r.previa, aplicadas: r.aplicadas, removidas: r.removidas }
  }

  if (a.acao === 'remover-docs' || a.acao === 'trocar-docs') {
    if (!!a.ids === !!a.filtro) return falha(400, 'Informe ids OU filtro.')
    let ids = a.ids ?? []
    if (a.filtro) {
      const r = await idsDosDocumentos(svc, tenantId, id, { origem: a.acao === 'remover-docs' ? 'definida' : a.filtro.origem, q: a.filtro.q, pastaId: a.filtro.pastaId })
      if ('erro' in r) return falha(503, r.erro)
      if (r.truncado) return falha(400, `Mais de ${MAX_LOTE_DETALHE} documentos no filtro: refine o filtro e repita.`)
      ids = r.ids
    }
    if (a.acao === 'remover-docs') {
      // só documentos com a classificação PRÓPRIA (os herdados não têm o que remover — saem trocando a da pasta).
      const proprios: string[] = []
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await (svc as any).from(T_DOC).select('id').eq('tenant_id', tenantId).eq('deletado', false).eq('classificacao_id', id).in('id', ids.slice(i, i + CHUNK))
        if (error) return falha(500, error.message)
        proprios.push(...((data ?? []) as { id: string }[]).map((d) => d.id))
      }
      if (!proprios.length) return falha(400, 'Nenhum dos documentos tem esta classificação definida diretamente (os herdados vêm da pasta).')
      const r = await aplicarLote(svc, tenantId, atorId, { ids: proprios, classificacaoId: null })
      if (!r.ok) return falha(r.codigo === 'migracao' ? 503 : r.codigo === 'invalido' ? 400 : 500, r.error)
      await auditar(tenantId, atorId, id, { acao: 'remover-docs', documentos: r.alterados })
      return { ok: true, alterados: r.alterados, ignorados: ids.length - proprios.length }
    }
    if (a.para === id) return falha(400, 'Escolha outra classificação.')
    const r = await aplicarLote(svc, tenantId, atorId, { ids, classificacaoId: a.para })
    if (!r.ok) return falha(r.codigo === 'migracao' ? 503 : r.codigo === 'invalido' ? 400 : 500, r.error)
    await auditar(tenantId, atorId, id, { acao: 'trocar-docs', para: a.para, documentos: r.alterados })
    return { ok: true, alterados: r.alterados, ignorados: r.ignorados }
  }

  // aplicar-pendencias: classifica (nesta) os documentos que a regra de sugestão associa a ela — recalculado no servidor.
  const p = await pendenciasCompletas(svc, tenantId, { id, slug: atual.slug })
  if (p.semSql) return falha(503, 'Sem acesso SQL direto: não foi possível calcular as pendências agora.')
  let alvo = p.linhas.map((l) => l.id)
  if (a.ids) { const sel = new Set(a.ids); alvo = alvo.filter((x) => sel.has(x)) }
  if (!alvo.length) return falha(400, 'Nenhuma pendência (ou já foram resolvidas).')
  if (alvo.length > MAX_LOTE_DETALHE) alvo = alvo.slice(0, MAX_LOTE_DETALHE)
  const conf = await sugerirParaDocumentos(svc, tenantId, alvo) // reconfere cada documento (ainda sem tipo e ainda sugerido a esta)
  const ok = conf.ok ? conf.sugestoes.filter((s) => s.classificacaoId === id).map((s) => s.id) : []
  if (!ok.length) return falha(400, 'Nenhum documento confere mais com a sugestão.')
  const r = await aplicarLote(svc, tenantId, atorId, { ids: ok, classificacaoId: id })
  if (!r.ok) return falha(r.codigo === 'migracao' ? 503 : r.codigo === 'invalido' ? 400 : 500, r.error)
  await auditar(tenantId, atorId, id, { acao: 'aplicar-pendencias', documentos: r.alterados })
  await invalidarClassificacao(tenantId)
  return { ok: true, alterados: r.alterados, sugeridos: alvo.length }
}
