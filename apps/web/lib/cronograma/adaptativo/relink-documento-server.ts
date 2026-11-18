import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { docIdDaChave, type AssinaturaAS } from './remap-as'
import { calcularRelinks, normalizarTituloDoc, type DocAntigo, type DocCandidato, type ResultadoRelinks } from './relink-documento'

// Camada SERVER do relink por nome (regras: relink-documento.ts). Tudo best-effort e tolerante às colunas da migração
// 20261125020000 (doc_titulo*, doc_pasta_id): sem elas só se usa o que a própria tabela de documentos informa.

const T_DOC = 'simulado_conteudo_documentos'
const T_PM = 'simulado_cronograma_adaptativo_plano_meta'
const T_DEF = 'simulado_cronograma_adaptativo_meta_def'
const T_PASTA = 'simulado_pastas'

export type InfoDoc = DocAntigo & Partial<DocCandidato> & { status?: string | null }

async function emLotes<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error?: unknown }>, tam = 80): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += tam) {
    const { data } = await run(ids.slice(i, i + tam))
    if (data) out.push(...data)
  }
  return out
}

/** Dados de documentos (inclusive DELETADOS) por id: título/pasta/pasta-pai/status/deletado/criado_em. Cabe em ~1 query por 80 ids + 1 de pastas. */
export async function carregarInfoDocs(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<Map<string, InfoDoc>> {
  const mapa = new Map<string, InfoDoc>()
  const uniq = [...new Set(ids.filter(Boolean))]
  if (!uniq.length) return mapa
  type Row = { id: string; titulo: string; pasta_id: string | null; status: string | null; deletado: boolean | null; deletado_em: string | null; criado_em: string | null }
  const rows = await emLotes<Row>(uniq, (chunk) => svc.from(T_DOC).select('id, titulo, pasta_id, status, deletado, deletado_em, criado_em').eq('tenant_id', tenantId).in('id', chunk))
  const pastaIds = [...new Set(rows.map((r) => r.pasta_id).filter(Boolean) as string[])]
  const pais = new Map<string, string | null>()
  for (const p of await emLotes<{ id: string; pai_id: string | null }>(pastaIds, (chunk) => svc.from(T_PASTA).select('id, pai_id').eq('tenant_id', tenantId).in('id', chunk))) pais.set(p.id, p.pai_id)
  for (const r of rows) {
    mapa.set(r.id, {
      id: r.id, titulo: r.titulo, titulo_norm: normalizarTituloDoc(r.titulo), pasta_id: r.pasta_id, pasta_pai_id: r.pasta_id ? pais.get(r.pasta_id) ?? null : null,
      deletado: !!r.deletado, deletado_em: r.deletado_em, status: r.status, publicado: !r.deletado && r.status === 'publicado', criado_em: r.criado_em,
    })
  }
  return mapa
}

/** Snapshot gravado nas metas (documento já PURGADO da Biblioteca): { documento_id → título/pasta }. Colunas ausentes → vazio. */
async function snapshotsGravados(svc: SupabaseClient, tenantId: string, ids: string[], planoId?: string): Promise<Map<string, { titulo: string; titulo_norm: string; pasta_id: string | null }>> {
  const out = new Map<string, { titulo: string; titulo_norm: string; pasta_id: string | null }>()
  if (!ids.length) return out
  for (const [tabela, filtro] of [[T_PM, planoId], [T_DEF, undefined]] as const) {
    try {
      type R = { documento_id: string; doc_titulo: string | null; doc_titulo_norm: string | null; doc_pasta_id: string | null }
      const rows = await emLotes<R>(ids.filter((i) => !out.has(i)), (chunk) => {
        let q = svc.from(tabela).select('documento_id, doc_titulo, doc_titulo_norm, doc_pasta_id').eq('tenant_id', tenantId).in('documento_id', chunk).not('doc_titulo', 'is', null)
        if (filtro) q = q.eq('plano_id', filtro)
        return q.limit(1000)
      })
      for (const r of rows) if (r.doc_titulo && !out.has(r.documento_id)) out.set(r.documento_id, { titulo: r.doc_titulo, titulo_norm: r.doc_titulo_norm || normalizarTituloDoc(r.doc_titulo), pasta_id: r.doc_pasta_id })
    } catch { /* colunas ausentes */ }
  }
  return out
}

/**
 * Relinks seguros entre a assinatura ANTIGA do plano e a ATUAL do AS. Nunca lança (falha → sem relinks).
 * Só considera como "antigo" quem está nas chaves antigas e some das novas; "candidato" = chave nova que não existia.
 */
export async function resolverRelinks(svc: SupabaseClient, tenantId: string, antiga: AssinaturaAS, nova: AssinaturaAS, planoId?: string): Promise<ResultadoRelinks & { docs: Map<string, InfoDoc> }> {
  const vazio = { relinks: [], ambiguos: [], indisponiveis: [], docs: new Map<string, InfoDoc>() }
  try {
    const nS = new Set(nova.chaves), aS = new Set(antiga.chaves)
    const sumiram = antiga.chaves.filter((k) => !nS.has(k)).map(docIdDaChave).filter(Boolean) as string[]
    const chegaram = nova.chaves.filter((k) => !aS.has(k)).map(docIdDaChave).filter(Boolean) as string[]
    if (!sumiram.length || !chegaram.length) return vazio // nada a relinkar
    const docs = await carregarInfoDocs(svc, tenantId, [...sumiram, ...chegaram])
    const faltam = sumiram.filter((i) => !docs.has(i)) // purgados: usa o título gravado na meta (snapshot)
    if (faltam.length) {
      const snaps = await snapshotsGravados(svc, tenantId, faltam, planoId)
      const paisSnap = await emLotes<{ id: string; pai_id: string | null }>([...new Set([...snaps.values()].map((s) => s.pasta_id).filter(Boolean) as string[])], (c) => svc.from(T_PASTA).select('id, pai_id').eq('tenant_id', tenantId).in('id', c))
      const pai = new Map(paisSnap.map((p) => [p.id, p.pai_id]))
      for (const [id, s] of snaps) docs.set(id, { id, titulo: s.titulo, titulo_norm: s.titulo_norm, pasta_id: s.pasta_id, pasta_pai_id: s.pasta_id ? pai.get(s.pasta_id) ?? null : null, deletado: true, deletado_em: null })
    }
    return { ...calcularRelinks(antiga, nova, docs), docs }
  } catch { return vazio }
}

export interface TituloOrfa { titulo: string | null; disciplina: string | null; docId: string | null; deletado: boolean | null }

/**
 * Título/disciplina de aulas órfãs (cfg.orfas), p/ mostrar 'Material indisponível — <título>'. Fontes, em ordem: o próprio documento
 * (mesmo deletado — fica na lixeira por 30 dias), a linha do espelho (plano_meta.aula_key → título/disciplina), o snapshot gravado.
 */
export async function titulosDeOrfas(svc: SupabaseClient, tenantId: string, planoId: string, chaves: string[]): Promise<Map<string, TituloOrfa>> {
  const out = new Map<string, TituloOrfa>()
  try {
    const docIds = chaves.map((k) => docIdDaChave(k)).filter(Boolean) as string[]
    const docs = await carregarInfoDocs(svc, tenantId, docIds)
    const semDoc = chaves.filter((k) => { const d = docIdDaChave(k); return !d || !docs.has(d) })
    const porKey = new Map<string, { titulo: string | null; disciplina: string | null }>()
    if (semDoc.length) {
      try {
        type R = { aula_key: string; titulo: string | null; disciplina: string | null; doc_titulo?: string | null }
        const rows = await emLotes<R>(semDoc, (c) => svc.from(T_PM).select('aula_key, titulo, disciplina').eq('tenant_id', tenantId).eq('plano_id', planoId).in('aula_key', c).limit(1000))
        for (const r of rows) if (!porKey.has(r.aula_key)) porKey.set(r.aula_key, { titulo: r.titulo, disciplina: r.disciplina })
      } catch { /* sem espelho */ }
    }
    for (const k of chaves) {
      const id = docIdDaChave(k); const d = id ? docs.get(id) : null
      const p = porKey.get(k)
      out.set(k, { titulo: d?.titulo ?? p?.titulo ?? null, disciplina: p?.disciplina ?? null, docId: id, deletado: d ? !!d.deletado : id ? true : null })
    }
  } catch { /* best-effort */ }
  return out
}
