import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { rotulosDeMateriais } from '@/lib/admin-revisao/atualizacoes'
import { remember } from '@/lib/cache/relatorio-cache'
import type { TipoAtualizacao } from '@/lib/admin-revisao/biblioteca-tipos'
import {
  normalizarItens, type AtualizacaoAluno, type FiltroAtualizacoes, type LinhaAtualizacao, type StatusAtualizacao,
} from './atualizacoes-tipos'

// REGISTRO DE ATUALIZAÇÕES / PONTOS DE VERSÃO — leituras (server-only). Tudo paginado no servidor (.range + count).
// Escopos: documento · produto (une documentos do currículo via simulado_produto_modulo_itens + registros com produto_id) · global.
// Requer a migração 20261119010000 (colunas novas). Sem ela → `semTabela: true` (a tela mostra o aviso, nada quebra).

const T = 'simulado_conteudo_atualizacoes'
const SCHEMA_AUSENTE = /relation .* does not exist|could not find the table|schema cache|does not exist|column .* does not exist|could not find the .* column/i
export const AVISO_MIGRACAO_PONTOS = 'Aplique a migração 20261119010000 (Registro de atualizações) para usar o registro de versões.'
const COLS = 'id, lote_id, documento_id, versao_id, produto_id, tipo, rotulo, texto, itens, ocorrida_em, status, visivel_aluno, avisar_alunos, criado_em'
const SORT_COL: Record<string, string> = { ocorrida_em: 'ocorrida_em', rotulo: 'rotulo', tipo: 'tipo', status: 'status', criado_em: 'criado_em' }

const sanear = (q: string | undefined | null) => String(q ?? '').replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
const diaOk = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '')

/** Flag do tenant: o registro de versões é a FONTE de publicação (callback do OnlyOffice não move versao_atual_id). */
export async function registroVersoesAtivo(svc: SupabaseClient, tenantId: string): Promise<boolean> {
  try {
    const { data } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
    return (data as any)?.tema?.registro_versoes_ativo === true
  } catch { return false }
}

function mapLinha(r: any, rotulos: Map<string, string>): LinhaAtualizacao {
  return {
    id: r.id, loteId: r.lote_id ?? null, documentoId: r.documento_id, material: rotulos.get(r.documento_id) ?? 'Material',
    produtoId: r.produto_id ?? null, tipo: r.tipo as TipoAtualizacao, rotulo: r.rotulo ?? null, texto: r.texto ?? '',
    itens: normalizarItens(r.itens), ocorridaEm: r.ocorrida_em ?? r.criado_em, status: (r.status ?? 'publicado') as StatusAtualizacao,
    visivelAluno: r.visivel_aluno !== false, avisarAlunos: !!r.avisar_alunos, criadoEm: r.criado_em, versaoId: r.versao_id ?? null,
  }
}

/** Ids dos documentos (Biblioteca) do currículo de um produto. */
export async function documentosDoProduto(svc: SupabaseClient, tenantId: string, produtoId: string): Promise<string[]> {
  try {
    const rows = await fetchAll<any>(() => svc.from('simulado_produto_modulo_itens').select('id, ref_id')
      .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('tipo_ref', 'documento_biblioteca').eq('deletado', false)
      .not('ref_id', 'is', null).order('id', { ascending: true }) as any, 1000, 'produto_docs_atualizacoes')
    return [...new Set(rows.map((r) => r.ref_id as string))]
  } catch { return [] }
}

/**
 * Número da versão (simulado_conteudo_versoes.numero) para o selo "vN" na barra do leitor do aluno.
 * Versão é imutável → cacheada 1h pela chave com versaoId (uma consulta por PK, só na 1ª abertura). Sem dado → null (sem selo).
 */
export async function numeroDaVersao(svc: SupabaseClient, tenantId: string, versaoId: string | null | undefined): Promise<number | null> {
  if (!versaoId) return null
  try {
    const n = await remember<number>(`versao-numero:${tenantId}:${versaoId}`, 3600, async () => {
      const { data } = await svc.from('simulado_conteudo_versoes').select('numero').eq('tenant_id', tenantId).eq('id', versaoId).maybeSingle()
      return Number((data as any)?.numero) || 0
    })
    return n > 0 ? n : null
  } catch { return null }
}

/** Seletor do dialog: documentos do currículo do produto (busca por título + paginação no banco). */
export async function listarDocumentosDoProduto(svc: SupabaseClient, tenantId: string, produtoId: string, q: string, page: number, pp = 20): Promise<{ rows: { id: string; titulo: string }[]; total: number }> {
  try {
    const p = Math.max(1, Math.floor(page) || 1)
    let b = svc.from('simulado_produto_modulo_itens').select('id, ref_id, titulo', { count: 'exact' })
      .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('tipo_ref', 'documento_biblioteca').eq('deletado', false).not('ref_id', 'is', null)
    const t = sanear(q); if (t) b = b.ilike('titulo', `%${t}%`)
    const { data, count } = await b.order('titulo', { ascending: true }).order('id', { ascending: true }).range((p - 1) * pp, p * pp - 1)
    const vistos = new Set<string>()
    const rows: { id: string; titulo: string }[] = []
    for (const r of (data ?? []) as any[]) { if (vistos.has(r.ref_id)) continue; vistos.add(r.ref_id); rows.push({ id: r.ref_id, titulo: r.titulo ?? 'Sem título' }) }
    return { rows, total: count ?? 0 }
  } catch { return { rows: [], total: 0 } }
}

type Escopo = { docUnico: string | null; docIds: string[] | null; produtoId: string | null }
interface Cand { id: string; ocorrida_em: string | null; criado_em: string; rotulo: string | null; tipo: string; status: string }

/** Página de ids ordenada/filtrada NO BANCO (docs grandes → candidatos leves por lote + fatia em memória só de ids). */
async function paginarIds(
  svc: SupabaseClient, tenantId: string, esc: Escopo, aplicar: (b: any) => any,
  sort: string, dir: 'asc' | 'desc', page: number, pp: number,
): Promise<{ ids: string[]; total: number }> {
  const col = SORT_COL[sort] ?? 'ocorrida_em'
  const asc = dir === 'asc'
  const off = (page - 1) * pp
  const base = (cols: string, count?: boolean) => aplicar(svc.from(T).select(cols, count ? { count: 'exact' } : undefined).eq('tenant_id', tenantId))

  if (esc.docUnico || (!esc.docIds && !esc.produtoId)) {
    let b = base('id', true)
    if (esc.docUnico) b = b.eq('documento_id', esc.docUnico)
    const { data, count, error } = await b.order(col, { ascending: asc }).order('id', { ascending: true }).range(off, off + pp - 1)
    if (error) throw error
    return { ids: ((data ?? []) as any[]).map((r) => r.id), total: count ?? 0 }
  }

  const cols = 'id, ocorrida_em, criado_em, rotulo, tipo, status'
  const porDoc = esc.docIds?.length
    ? await fetchAllByIn<Cand>(esc.docIds, (c) => base(cols).in('documento_id', c).order('id', { ascending: true }) as any, { rotulo: 'atualizacoes_por_docs', concorrencia: 4 })
    : []
  const porProduto = esc.produtoId
    ? await fetchAll<Cand>(() => base(cols).eq('produto_id', esc.produtoId!).order('id', { ascending: true }) as any, 1000, 'atualizacoes_por_produto')
    : []
  const mapa = new Map<string, Cand>()
  for (const c of [...porDoc, ...porProduto]) mapa.set(c.id, c)
  const lista = [...mapa.values()]
  const val = (c: Cand): string => String((col === 'ocorrida_em' ? c.ocorrida_em ?? c.criado_em : (c as any)[col]) ?? '')
  lista.sort((a, b) => { const r = val(a).localeCompare(val(b)); return (asc ? r : -r) || a.id.localeCompare(b.id) })
  return { ids: lista.slice(off, off + pp).map((c) => c.id), total: lista.length }
}

async function linhasPorIds(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<any[]> {
  if (!ids.length) return []
  const { data, error } = await svc.from(T).select(COLS).eq('tenant_id', tenantId).in('id', ids)
  if (error) throw error
  const ordem = new Map(ids.map((id, i) => [id, i]))
  return ((data ?? []) as any[]).sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0))
}

/** Lista admin (documento / produto / global) com busca, filtros (tipo, status, período) e ordenação — tudo no servidor. */
export async function listarAtualizacoes(svc: SupabaseClient, tenantId: string, f: FiltroAtualizacoes): Promise<{ rows: LinhaAtualizacao[]; total: number; semTabela: boolean }> {
  const page = Math.max(1, Math.floor(f.page ?? 1) || 1)
  const pp = Math.min(50, Math.max(5, Math.floor(f.pp ?? 10) || 10))
  const q = sanear(f.q), de = diaOk(f.de), ate = diaOk(f.ate)
  const aplicar = (b: any) => {
    b = b.eq('deletado', false)
    if (q) b = b.or(`texto.ilike.%${q}%,rotulo.ilike.%${q}%`)
    if (f.tipo) b = b.eq('tipo', f.tipo)
    if (f.status) b = b.eq('status', f.status)
    if (de) b = b.gte('ocorrida_em', `${de}T00:00:00-03:00`)
    if (ate) b = b.lte('ocorrida_em', `${ate}T23:59:59.999-03:00`)
    return b
  }
  try {
    const esc: Escopo = f.documentoId
      ? { docUnico: f.documentoId, docIds: null, produtoId: null }
      : f.produtoId
        ? { docUnico: null, docIds: await documentosDoProduto(svc, tenantId, f.produtoId), produtoId: f.produtoId }
        : { docUnico: null, docIds: null, produtoId: null }
    const { ids, total } = await paginarIds(svc, tenantId, esc, aplicar, f.sort ?? 'ocorrida_em', f.dir === 'asc' ? 'asc' : 'desc', page, pp)
    const brutos = await linhasPorIds(svc, tenantId, ids)
    const rotulos = await rotulosDeMateriais(svc, tenantId, brutos.map((r) => r.documento_id))
    return { rows: brutos.map((r) => mapLinha(r, rotulos)), total, semTabela: false }
  } catch (e: any) {
    return { rows: [], total: 0, semTabela: SCHEMA_AUSENTE.test(String(e?.message ?? '')) }
  }
}

/** ALUNO: registros publicados e visíveis de um conjunto de documentos (já validados pelo gate de acesso do chamador). */
export async function atualizacoesParaAluno(
  svc: SupabaseClient, tenantId: string, o: { docIds: string[]; produtoId?: string | null; page: number; pp: number },
): Promise<{ rows: AtualizacaoAluno[]; total: number }> {
  const page = Math.max(1, Math.floor(o.page) || 1)
  const pp = Math.min(30, Math.max(1, Math.floor(o.pp) || 10))
  const aplicar = (b: any) => b.eq('deletado', false).eq('status', 'publicado').eq('visivel_aluno', true)
  try {
    if (!o.docIds.length) return { rows: [], total: 0 }
    // Produto: só registros dos documentos que o aluno enxerga NESTE produto (docIds já vem do currículo); o filtro por
    // `produto_id` não é usado aqui para nunca vazar registro de documento sem acesso.
    // 1 documento (aba "Atualizações" do leitor) → paginação direta no banco (.range + count), sem candidatos em memória.
    const esc: Escopo = o.docIds.length === 1 ? { docUnico: o.docIds[0], docIds: null, produtoId: null } : { docUnico: null, docIds: o.docIds, produtoId: null }
    const { ids, total } = await paginarIds(svc, tenantId, esc, aplicar, 'ocorrida_em', 'desc', page, pp)
    const brutos = await linhasPorIds(svc, tenantId, ids)
    const rotulos = await rotulosDeMateriais(svc, tenantId, brutos.map((r) => r.documento_id))
    const prodIds = [...new Set(brutos.map((r) => r.produto_id).filter(Boolean))] as string[]
    const nomes = new Map<string, string>()
    if (prodIds.length) {
      const { data } = await svc.from('simulado_produtos').select('id, nome').eq('tenant_id', tenantId).in('id', prodIds.slice(0, 80))
      for (const p of (data ?? []) as any[]) nomes.set(p.id, p.nome)
    }
    return {
      total,
      rows: brutos.map((r) => ({
        id: r.id, documentoId: r.documento_id, material: (rotulos.get(r.documento_id) ?? 'Material').replace(/^.*? · /, ''),
        produtoId: o.produtoId ?? r.produto_id ?? null, produtoNome: nomes.get(r.produto_id) ?? null,
        tipo: r.tipo, rotulo: r.rotulo ?? null, texto: r.texto ?? '', itens: normalizarItens(r.itens), ocorridaEm: r.ocorrida_em ?? r.criado_em,
      })),
    }
  } catch { return { rows: [], total: 0 } }
}
