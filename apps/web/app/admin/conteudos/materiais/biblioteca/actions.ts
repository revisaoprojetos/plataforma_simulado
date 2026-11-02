'use server'

/**
 * Ações NOVAS do bloco Biblioteca do Estúdio de Conteúdo (construído POR FORA, em
 * /admin/conteudos/materiais/*). NÃO duplica o backend de produção: as telas reusam as
 * server actions de `app/admin/biblioteca/actions.ts` (listarArvore, criarPasta, upload,
 * publicarNovaVersao, etc.). Aqui ficam só as peças que FALTAVAM:
 *   - leitura paginada server-side (backend-first) das abas Aulas/Arquivos;
 *   - contagem de "aulas vinculadas" (vínculos) em lote;
 *   - reapontar os vínculos modo 'fixada' de um documento à versão atual (+ notificação por vínculo);
 *   - tags (etiquetas N:N) do documento — admin-only.
 *
 * Toda escrita passa por checkPermission('biblioteca:*') + registrarAudit. Isolamento manual por
 * tenant (service role bypassa RLS). Escritas tolerantes a coluna/tabela ausente (etiquetas: a
 * migração 20261031010000_conteudo_etiquetas.sql pode ainda não ter sido aplicada).
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { registrarAudit } from '@/lib/audit'
import { emitirEvento } from '@/lib/conteudo/outbox'
import { listarVinculosDoDocumento, desvincular as desvincularLib } from '@/lib/conteudo/vinculos'
import type { MaterialRow, EtiquetaConteudo, VinculoCliente, RotuloVinculo } from './tipos'

const T_DOC = 'simulado_conteudo_documentos'
const T_VINC = 'simulado_conteudo_vinculos'
const T_ETIQ = 'simulado_conteudo_etiquetas'
const T_DOC_ETIQ = 'simulado_conteudo_documento_etiquetas'

// tipo_origem considerados "arquivos complementares" (tudo que não é documento docx editável).
const TIPOS_ARQUIVO = ['pdf', 'pptx', 'xlsx', 'video', 'audio'] as const
const PER_PAGE_OK = [5, 10, 25, 50]
const SORT_OK = new Set(['titulo', 'criado_em', 'atualizado_em'])

type Guard =
  | { ok: false; error: string }
  | { ok: true; tenantId: string; atorId: string | null }

async function guard(perm: string): Promise<Guard> {
  if (!(await checkPermission(perm))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  return { ok: true, tenantId: access.tenantId, atorId: access.userId ?? null }
}

const faltaTabela = (msg?: string) =>
  !!msg && /does not exist|schema cache|relation .* does not exist|could not find the table/i.test(msg)

// ── Leitura paginada (backend-first: .range() + count:'exact' + filtro no banco) ───────────────
/** Lista materiais (documentos da Biblioteca) paginados — abas Aulas (todos) e Arquivos (office/mídia). */
export async function listarMateriais(input: {
  modo: 'aulas' | 'arquivos'
  q?: string
  tipos?: string[]
  page?: number
  perPage?: number
  sort?: string
  dir?: 'asc' | 'desc'
  /** Filtro "Situação do material": com = tem versão/arquivo configurado; sem = ainda sem arquivo. */
  situacao?: 'com' | 'sem'
  /** Filtro "Tag": só documentos com esta etiqueta (resolvida no banco pela tabela N:N). */
  etiquetaId?: string
  /** Uso interno do export: ignora paginação e traz até `limite` linhas (teto 5000). */
  limite?: number
}): Promise<{ ok: boolean; error?: string; rows: MaterialRow[]; total: number; vinculos: Record<string, number> }> {
  const g = await guard('biblioteca:view')
  if (!g.ok) return { ok: false, error: g.error, rows: [], total: 0, vinculos: {} }
  const svc = createAdminClient()

  const page = Math.max(1, Number(input.page ?? 1) || 1)
  const perPage = PER_PAGE_OK.includes(Number(input.perPage)) ? Number(input.perPage) : 10
  const sort = SORT_OK.has(input.sort ?? '') ? (input.sort as string) : 'atualizado_em'
  const asc = input.dir === 'asc'
  const q = (input.q ?? '').trim()

  // Modo 'arquivos' restringe a office/mídia; intersecta com o filtro de tipo da UI quando houver.
  let tipos = (input.tipos ?? []).filter(Boolean)
  if (input.modo === 'arquivos') {
    tipos = tipos.length ? tipos.filter((t) => (TIPOS_ARQUIVO as readonly string[]).includes(t)) : [...TIPOS_ARQUIVO]
  }

  let query = svc.from(T_DOC)
    .select('id, titulo, tipo_origem, pasta_id, versao_atual_id, criado_em, atualizado_em', { count: 'exact' })
    .eq('tenant_id', g.tenantId).eq('categoria', 'conteudo').eq('deletado', false)
  if (tipos.length) query = query.in('tipo_origem', tipos)
  if (input.situacao === 'com') query = query.not('versao_atual_id', 'is', null)
  else if (input.situacao === 'sem') query = query.is('versao_atual_id', null)
  if (q) query = query.ilike('titulo', `%${q}%`)
  if (input.etiquetaId) {
    try {
      const { data: joins } = await svc.from(T_DOC_ETIQ).select('documento_id').eq('tenant_id', g.tenantId).eq('etiqueta_id', input.etiquetaId).limit(800)
      const docIds = [...new Set((joins ?? []).map((j: any) => j.documento_id).filter(Boolean))]
      if (!docIds.length) return { ok: true, rows: [], total: 0, vinculos: {} }
      query = query.in('id', docIds)
    } catch { return { ok: true, rows: [], total: 0, vinculos: {} } }
  }
  const limite = input.limite ? Math.min(5000, Math.max(1, Number(input.limite))) : 0
  query = query.order(sort, { ascending: asc }).order('id', { ascending: true })
    .range(limite ? 0 : (page - 1) * perPage, limite ? limite - 1 : page * perPage - 1)

  const { data, count, error } = await query
  if (error) return { ok: false, error: error.message, rows: [], total: 0, vinculos: {} }
  const rows = (data ?? []) as MaterialRow[]
  const vinculos = await contarVinculosDocs(rows.map((r) => r.id))
  return { ok: true, rows, total: count ?? 0, vinculos }
}

/** Contagem de vínculos (aulas vinculadas) por documento, em lote. */
export async function contarVinculosDocs(docIds: string[]): Promise<Record<string, number>> {
  const g = await guard('biblioteca:view')
  if (!g.ok) return {}
  const ids = [...new Set(docIds.filter(Boolean))]
  if (!ids.length) return {}
  const svc = createAdminClient()
  const rows = await fetchAllByIn<{ documento_id: string }>(ids, (chunk) =>
    svc.from(T_VINC).select('documento_id').eq('tenant_id', g.tenantId).in('documento_id', chunk).order('id', { ascending: true }),
  )
  const map: Record<string, number> = {}
  for (const r of rows ?? []) map[r.documento_id] = (map[r.documento_id] ?? 0) + 1
  return map
}

/**
 * Primeiro vínculo ("onde o material é usado") por documento, em lote — alimenta a coluna
 * CONTEÚDO (Aulas) / VÍNCULO (Arquivos) e o painel de detalhe. Resolve o nome do alvo
 * (produto/simulado/pasta) best-effort. Backend-first (1 query de vínculos + 1 por tipo de alvo).
 */
export async function rotulosVinculosDocs(docIds: string[]): Promise<Record<string, RotuloVinculo>> {
  const g = await guard('biblioteca:view')
  if (!g.ok) return {}
  const ids = [...new Set(docIds.filter(Boolean))]
  if (!ids.length) return {}
  const svc = createAdminClient()
  const rows = await fetchAllByIn<{ documento_id: string; produto_tipo: string; produto_ref_id: string; ordem: number | null; id: string }>(
    ids,
    (chunk) => svc.from(T_VINC).select('documento_id, produto_tipo, produto_ref_id, ordem, id')
      .eq('tenant_id', g.tenantId).in('documento_id', chunk)
      .order('documento_id', { ascending: true }).order('ordem', { ascending: true }).order('id', { ascending: true }),
  )
  const primeiro = new Map<string, { produto_tipo: string; produto_ref_id: string }>()
  const total: Record<string, number> = {}
  for (const r of rows ?? []) {
    total[r.documento_id] = (total[r.documento_id] ?? 0) + 1
    if (!primeiro.has(r.documento_id)) primeiro.set(r.documento_id, { produto_tipo: r.produto_tipo, produto_ref_id: r.produto_ref_id })
  }
  const porTipo = new Map<string, Set<string>>()
  for (const v of primeiro.values()) { const s = porTipo.get(v.produto_tipo) ?? new Set(); s.add(v.produto_ref_id); porTipo.set(v.produto_tipo, s) }
  const nomes = new Map<string, string>()
  const resolver = async (tabela: string, col: string, tipo: string, alvoIds: string[]) => {
    try {
      const { data } = await svc.from(tabela).select(`id, ${col}`).eq('tenant_id', g.tenantId).in('id', alvoIds)
      for (const r of data ?? []) nomes.set(`${tipo}:${(r as any).id}`, String((r as any)[col] ?? ''))
    } catch { /* best-effort */ }
  }
  for (const [tipo, set] of porTipo) {
    const alvoIds = [...set]
    if (tipo === 'produto') await resolver('simulado_produtos', 'nome', tipo, alvoIds)
    else if (tipo === 'simulado') await resolver('simulado_simulados', 'titulo', tipo, alvoIds)
    else if (tipo === 'pasta') await resolver('simulado_pastas', 'nome', tipo, alvoIds)
  }
  const out: Record<string, RotuloVinculo> = {}
  for (const [docId, v] of primeiro) {
    out[docId] = {
      rotulo: nomes.get(`${v.produto_tipo}:${v.produto_ref_id}`) || `${v.produto_tipo} · ${String(v.produto_ref_id).slice(0, 8)}`,
      produto_tipo: v.produto_tipo, produto_ref_id: v.produto_ref_id, total: total[docId] ?? 1,
    }
  }
  return out
}

/** Datas de criação das pastas (para o painel de detalhe) — em lote, tolerante. */
export async function timestampsPastas(ids: string[]): Promise<Record<string, string | null>> {
  const g = await guard('biblioteca:view')
  if (!g.ok) return {}
  const uniq = [...new Set(ids.filter(Boolean))]
  if (!uniq.length) return {}
  const svc = createAdminClient()
  const out: Record<string, string | null> = {}
  try {
    const rows = await fetchAllByIn<{ id: string; created_at: string | null }>(uniq, (chunk) =>
      svc.from('simulado_pastas').select('id, created_at').eq('tenant_id', g.tenantId).in('id', chunk).order('id', { ascending: true }),
    )
    for (const r of rows ?? []) out[r.id] = r.created_at ?? null
  } catch { /* best-effort */ }
  return out
}

// ── Substituir arquivo: reapontar vínculos 'fixada' à versão atual (+ notificação por vínculo) ──
/**
 * Após publicar uma nova versão, os vínculos modo 'ultima' já apontam para a versão atual
 * automaticamente (resolvido em lib/conteudo/vinculos). Os vínculos modo 'fixada' ficam presos
 * à versão aprovada. Esta ação em LOTE os reaponta à versão atual do documento e emite uma
 * notificação por vínculo. Imutável/auditado.
 */
export async function reapontarVinculosFixados(
  documentoId: string,
  versaoId?: string | null,
): Promise<{ ok: boolean; error?: string; atualizados?: number }> {
  const g = await guard('biblioteca:publicar')
  if (!g.ok) return g
  if (!documentoId) return { ok: false, error: 'Documento ausente.' }
  const svc = createAdminClient()

  const { data: doc } = await svc.from(T_DOC)
    .select('id, versao_atual_id').eq('tenant_id', g.tenantId).eq('id', documentoId).eq('deletado', false).maybeSingle()
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  const alvo = (versaoId || (doc as any).versao_atual_id) as string | null
  if (!alvo) return { ok: false, error: 'Publique uma versão atual antes de reapontar os vínculos fixados.' }

  const { data: fixos, error: eSel } = await svc.from(T_VINC)
    .select('id, versao_fixada_id').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('modo', 'fixada')
  if (eSel) return { ok: false, error: eSel.message }
  const lista = (fixos ?? []) as { id: string; versao_fixada_id: string | null }[]
  if (!lista.length) return { ok: true, atualizados: 0 }

  let n = 0
  for (const v of lista) {
    if (v.versao_fixada_id === alvo) continue
    const { error } = await svc.from(T_VINC).update({ versao_fixada_id: alvo }).eq('tenant_id', g.tenantId).eq('id', v.id)
    if (error) continue
    n++
    await emitirEvento(svc, g.tenantId, 'documento.atualizado', { documento_id: documentoId, vinculo: v.id, versao_fixada_id: alvo }).catch(() => {})
  }
  await registrarAudit({
    operacao: 'LIBERAR', entidade: T_VINC, entidadeId: documentoId,
    depois: { reapontados_fixada: n, versao: alvo }, atorId: g.atorId, tenantId: g.tenantId,
  }).catch(() => {})
  return { ok: true, atualizados: n }
}

// ── Vínculos do documento (wrappers client → lib server-only) ──────────────────────────────────
/** Lista os vínculos ("aulas vinculadas") de um documento, com um rótulo best-effort por alvo. */
export async function listarVinculosDocumento(documentoId: string): Promise<{ ok: boolean; error?: string; vinculos: VinculoCliente[] }> {
  const g = await guard('biblioteca:view')
  if (!g.ok) return { ok: false, error: g.error, vinculos: [] }
  const vincs = await listarVinculosDoDocumento(documentoId)
  const svc = createAdminClient()

  // Rótulo best-effort por tipo de alvo (produto/simulado/pasta). "aula" não é entidade real → ref curto.
  const porTipo = new Map<string, Set<string>>()
  for (const v of vincs) { const s = porTipo.get(v.produto_tipo) ?? new Set(); s.add(v.produto_ref_id); porTipo.set(v.produto_tipo, s) }
  const nomes = new Map<string, string>() // `${tipo}:${ref}` → nome
  const resolver = async (tabela: string, col: string, tipo: string, ids: string[]) => {
    try {
      const { data } = await svc.from(tabela).select(`id, ${col}`).eq('tenant_id', g.tenantId).in('id', ids)
      for (const r of data ?? []) nomes.set(`${tipo}:${(r as any).id}`, String((r as any)[col] ?? ''))
    } catch { /* best-effort */ }
  }
  for (const [tipo, set] of porTipo) {
    const ids = [...set]
    if (tipo === 'produto') await resolver('simulado_produtos', 'nome', tipo, ids)
    else if (tipo === 'simulado') await resolver('simulado_simulados', 'titulo', tipo, ids)
    else if (tipo === 'pasta') await resolver('simulado_pastas', 'nome', tipo, ids)
  }
  const vinculos: VinculoCliente[] = vincs.map((v) => ({
    id: v.id, produto_tipo: v.produto_tipo, produto_ref_id: v.produto_ref_id,
    modo: v.modo, versao_fixada_id: v.versao_fixada_id,
    rotulo: nomes.get(`${v.produto_tipo}:${v.produto_ref_id}`) || `${v.produto_tipo} · ${String(v.produto_ref_id).slice(0, 8)}`,
  }))
  return { ok: true, vinculos }
}

/** Remove um vínculo (desvincular). Auditado. */
export async function removerVinculoDocumento(vinculoId: string, documentoId?: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('biblioteca:update')
  if (!g.ok) return g
  const r = await desvincularLib(vinculoId)
  if (!r.ok) return { ok: false, error: r.erro }
  await registrarAudit({ operacao: 'DELETE', entidade: T_VINC, entidadeId: documentoId ?? vinculoId, depois: { vinculo: vinculoId }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  return { ok: true }
}

// ── Tags (etiquetas N:N) do documento — admin-only ─────────────────────────────────────────────
/** Catálogo de etiquetas do tenant (para "usadas recentemente"/autocomplete). Tolerante. */
export async function listarEtiquetasConteudo(): Promise<EtiquetaConteudo[]> {
  const g = await guard('biblioteca:view')
  if (!g.ok) return []
  const svc = createAdminClient()
  try {
    const { data } = await svc.from(T_ETIQ).select('id, nome, cor').eq('tenant_id', g.tenantId).order('nome', { ascending: true })
    return (data ?? []) as EtiquetaConteudo[]
  } catch { return [] }
}

/** Etiquetas vinculadas a um documento. Tolerante (tabela pode não existir ainda). */
export async function etiquetasDoDocumento(documentoId: string): Promise<EtiquetaConteudo[]> {
  const g = await guard('biblioteca:view')
  if (!g.ok || !documentoId) return []
  const svc = createAdminClient()
  try {
    const { data: joins } = await svc.from(T_DOC_ETIQ).select('etiqueta_id').eq('tenant_id', g.tenantId).eq('documento_id', documentoId)
    const ids = [...new Set((joins ?? []).map((j: any) => j.etiqueta_id).filter(Boolean))]
    if (!ids.length) return []
    const { data: tags } = await svc.from(T_ETIQ).select('id, nome, cor').eq('tenant_id', g.tenantId).in('id', ids).order('nome', { ascending: true })
    return (tags ?? []) as EtiquetaConteudo[]
  } catch { return [] }
}

/**
 * Define EXATAMENTE as etiquetas do documento a partir de uma lista de nomes (get-or-create por
 * tenant, dedupe case-insensitive). Adiciona/remove vínculos para casar com a lista. Auditado.
 */
export async function salvarEtiquetasDocumento(
  documentoId: string,
  nomes: string[],
): Promise<{ ok: boolean; error?: string; etiquetas?: EtiquetaConteudo[] }> {
  const g = await guard('biblioteca:update')
  if (!g.ok) return g
  if (!documentoId) return { ok: false, error: 'Documento ausente.' }
  const svc = createAdminClient()

  // Normaliza: trim, remove vazios, dedupe case-insensitive (mantém a 1ª grafia).
  const vistos = new Map<string, string>()
  for (const raw of nomes ?? []) {
    const nome = (raw ?? '').trim().slice(0, 60)
    if (nome && !vistos.has(nome.toLowerCase())) vistos.set(nome.toLowerCase(), nome)
  }
  const desejadas = [...vistos.values()]

  try {
    // Confirma que o documento é do tenant.
    const { data: doc } = await svc.from(T_DOC).select('id').eq('tenant_id', g.tenantId).eq('id', documentoId).eq('deletado', false).maybeSingle()
    if (!doc) return { ok: false, error: 'Documento não encontrado.' }

    // get-or-create de cada etiqueta.
    const idsDesejados: EtiquetaConteudo[] = []
    for (const nome of desejadas) {
      const { data: existente } = await svc.from(T_ETIQ).select('id, nome, cor').eq('tenant_id', g.tenantId).ilike('nome', nome).limit(1).maybeSingle()
      if (existente) { idsDesejados.push(existente as EtiquetaConteudo); continue }
      const { data: nova, error: eNova } = await svc.from(T_ETIQ).insert({ tenant_id: g.tenantId, nome }).select('id, nome, cor').single()
      if (eNova || !nova) {
        if (faltaTabela(eNova?.message)) return { ok: false, error: 'Rode a migração das etiquetas de conteúdo (20261031010000).' }
        return { ok: false, error: eNova?.message || 'Falha ao criar etiqueta.' }
      }
      idsDesejados.push(nova as EtiquetaConteudo)
    }

    // Diferença contra os vínculos atuais.
    const { data: atuaisJoin } = await svc.from(T_DOC_ETIQ).select('etiqueta_id').eq('tenant_id', g.tenantId).eq('documento_id', documentoId)
    const atuais = new Set((atuaisJoin ?? []).map((j: any) => j.etiqueta_id).filter(Boolean))
    const desejadosSet = new Set(idsDesejados.map((e) => e.id))
    const adicionar = idsDesejados.filter((e) => !atuais.has(e.id))
    const remover = [...atuais].filter((id) => !desejadosSet.has(id))

    if (adicionar.length) {
      const { error: eAdd } = await svc.from(T_DOC_ETIQ).insert(adicionar.map((e) => ({ tenant_id: g.tenantId, documento_id: documentoId, etiqueta_id: e.id })))
      if (eAdd && !/duplicate key|unique/i.test(eAdd.message)) return { ok: false, error: eAdd.message }
    }
    if (remover.length) {
      await svc.from(T_DOC_ETIQ).delete().eq('tenant_id', g.tenantId).eq('documento_id', documentoId).in('etiqueta_id', remover)
    }

    await registrarAudit({
      operacao: 'UPDATE', entidade: T_DOC, entidadeId: documentoId,
      depois: { etiquetas: desejadas }, atorId: g.atorId, tenantId: g.tenantId,
    }).catch(() => {})
    return { ok: true, etiquetas: idsDesejados }
  } catch (e) {
    const msg = (e as Error)?.message
    if (faltaTabela(msg)) return { ok: false, error: 'Rode a migração das etiquetas de conteúdo (20261031010000).' }
    return { ok: false, error: msg || 'Falha ao salvar etiquetas.' }
  }
}
