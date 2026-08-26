import type { SupabaseClient } from '@supabase/supabase-js'
import { descobrirBuckets, bfsBucket, type ObjetoStorage } from './listar-buckets'
import { categoriaDe, rotuloCategoria, CATEGORIAS } from './canonico'
import { construirMapaReferencias } from './referencias'
import { montarRegistros, sincronizarCatalogo } from './reconciliar'

// Cálculo do "usado" (real, somando os arquivos) + breakdown por bucket/categoria, e o
// snapshot em cache (single-row simulado_storage_uso). Uma única passada de BFS alimenta
// tanto o snapshot quanto o reconcile do catálogo (recomputarTudo).

export interface CategoriaUso { chave: string; label: string; bytes: number; arquivos: number }
export interface BucketUso {
  bucket: string
  publico: boolean
  totalBytes: number
  arquivos: number
  limiteBytes: number | null
  categorias: CategoriaUso[]
}
export interface UsoSnapshot {
  calculadoEm: string
  totalBytes: number
  totalArquivos: number
  limiteGlobalBytes: number | null
  buckets: BucketUso[]
}

export interface EstadoUso {
  snapshot: UsoSnapshot | null
  status: 'vazio' | 'pendente' | 'ok' | 'erro'
  calculadoEm: string | null
  erro: string | null
}

// Tipos do navegador de arquivos (Fase 1/2).
export interface ArquivoItem {
  id: string | null
  bucket: string
  path: string
  nome: string
  tamanhoBytes: number
  tipoMime: string | null
  publico: boolean
  url: string | null
  ehImagem: boolean
  referenciado: boolean
}
export interface PaginaArquivos {
  itens: ArquivoItem[]
  total: number
  pagina: number
  porPagina: number
  categoriaLabel: string
}
export interface PreviewExclusao {
  id: string
  bucket: string
  path: string
  nome: string
  tamanhoBytes: number
  referenciado: boolean
}

/** Lê os limites configurados: { '*': globalBytes|null, [bucket]: bytes|null }. */
export async function lerLimites(svc: SupabaseClient): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {}
  try {
    const { data } = await svc.from('simulado_storage_config').select('bucket,limite_bytes')
    for (const r of (data ?? []) as any[]) out[r.bucket] = r.limite_bytes === null ? null : Number(r.limite_bytes)
  } catch { /* tabela ausente */ }
  return out
}

/** Grava/atualiza o limite de um bucket (ou '*' global). */
export async function definirLimite(
  svc: SupabaseClient,
  bucket: string,
  limiteBytes: number | null,
  userId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await svc
    .from('simulado_storage_config')
    .upsert(
      { bucket, limite_bytes: limiteBytes, atualizado_em: new Date().toISOString(), atualizado_por: userId },
      { onConflict: 'bucket' },
    )
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Snapshot de uso a partir de objetos já listados. */
export function snapshotDeObjetos(
  objetosPorBucket: { bucket: string; publico: boolean; objetos: ObjetoStorage[] }[],
  limites: Record<string, number | null>,
): UsoSnapshot {
  const buckets: BucketUso[] = objetosPorBucket.map(({ bucket, publico, objetos }) => {
    const catMap = new Map<string, CategoriaUso>()
    // Semeia as categorias conhecidas (para aparecerem com 0 mesmo vazias).
    for (const c of CATEGORIAS[bucket] ?? []) catMap.set(c.chave, { chave: c.chave, label: c.label, bytes: 0, arquivos: 0 })
    let totalBytes = 0
    for (const o of objetos) {
      const chave = categoriaDe(bucket, o.path)
      const cur = catMap.get(chave) ?? { chave, label: rotuloCategoria(bucket, chave), bytes: 0, arquivos: 0 }
      cur.bytes += o.size
      cur.arquivos += 1
      catMap.set(chave, cur)
      totalBytes += o.size
    }
    const categorias = [...catMap.values()].sort((a, b) => b.bytes - a.bytes)
    return {
      bucket,
      publico,
      totalBytes,
      arquivos: objetos.length,
      limiteBytes: limites[bucket] ?? null,
      categorias,
    }
  })
  const totalBytes = buckets.reduce((s, b) => s + b.totalBytes, 0)
  const totalArquivos = buckets.reduce((s, b) => s + b.arquivos, 0)
  return {
    calculadoEm: new Date().toISOString(),
    totalBytes,
    totalArquivos,
    limiteGlobalBytes: limites['*'] ?? null,
    buckets: buckets.sort((a, b) => b.totalBytes - a.totalBytes),
  }
}

export async function lerUso(svc: SupabaseClient): Promise<EstadoUso> {
  try {
    const { data } = await svc.from('simulado_storage_uso').select('snapshot,status,calculado_em,erro').eq('id', 1).maybeSingle()
    if (!data) return { snapshot: null, status: 'vazio', calculadoEm: null, erro: null }
    const snap = data.snapshot && Object.keys(data.snapshot).length ? (data.snapshot as UsoSnapshot) : null
    return { snapshot: snap, status: (data.status as EstadoUso['status']) ?? 'vazio', calculadoEm: data.calculado_em ?? null, erro: data.erro ?? null }
  } catch {
    return { snapshot: null, status: 'vazio', calculadoEm: null, erro: null }
  }
}

async function gravarUso(svc: SupabaseClient, patch: Record<string, unknown>): Promise<void> {
  try {
    await svc.from('simulado_storage_uso').upsert({ id: 1, ...patch }, { onConflict: 'id' })
  } catch { /* tabela ausente — best-effort */ }
}

export async function marcarPendente(svc: SupabaseClient): Promise<void> {
  await gravarUso(svc, { status: 'pendente' })
}

export async function marcarErro(svc: SupabaseClient, erro: string): Promise<void> {
  await gravarUso(svc, { status: 'erro', erro: erro.slice(0, 500) })
}

/**
 * UMA passada de BFS que: (1) calcula o snapshot de uso e (2) sincroniza o catálogo
 * `simulado_arquivos` (insere faltantes + poda sumidos). Usado pelo cron e pelo fallback inline.
 */
export async function recomputarTudo(svc: SupabaseClient): Promise<{ snapshot: UsoSnapshot; reconcile: Awaited<ReturnType<typeof sincronizarCatalogo>> }> {
  const buckets = await descobrirBuckets(svc)
  const limites = await lerLimites(svc)
  const mapa = await construirMapaReferencias(svc)

  const objetosPorBucket: { bucket: string; publico: boolean; objetos: ObjetoStorage[] }[] = []
  const todos: ObjetoStorage[] = []
  for (const b of buckets) {
    const objetos = await bfsBucket(svc, b.nome)
    objetosPorBucket.push({ bucket: b.nome, publico: b.publico, objetos })
    todos.push(...objetos)
  }

  const snapshot = snapshotDeObjetos(objetosPorBucket, limites)
  const registros = montarRegistros(todos, mapa)
  const reconcile = await sincronizarCatalogo(svc, registros, buckets.map((b) => b.nome), { podar: true })

  await gravarUso(svc, { snapshot, status: 'ok', calculado_em: snapshot.calculadoEm, erro: null })
  return { snapshot, reconcile }
}

/** Total de objetos (rápido) — decide scan inline vs. cron. */
export async function totalObjetos(svc: SupabaseClient): Promise<number> {
  const buckets = await descobrirBuckets(svc)
  let n = 0
  for (const b of buckets) n += (await bfsBucket(svc, b.nome)).length
  return n
}

/** Linhas do catálogo de UM tenant (paginado). */
async function catalogoDoTenant(svc: SupabaseClient, tenantId: string): Promise<any[]> {
  const all: any[] = []
  let off = 0
  while (true) {
    const { data, error } = await svc
      .from('simulado_arquivos')
      .select('bucket,path,tamanho_bytes,tipo_mime,publico')
      .eq('tenant_id', tenantId)
      .range(off, off + 999)
    if (error || !Array.isArray(data) || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    off += 1000
  }
  return all
}

/** Uso de UMA plataforma, derivado do catálogo (sem limite por tenant — buckets são compartilhados). */
export async function usoPorTenant(svc: SupabaseClient, tenantId: string): Promise<UsoSnapshot> {
  const rows = await catalogoDoTenant(svc, tenantId)
  const porBucket = new Map<string, { publico: boolean; objetos: ObjetoStorage[] }>()
  for (const r of rows) {
    const g = porBucket.get(r.bucket) ?? { publico: r.publico ?? r.bucket !== 'discursivas', objetos: [] as ObjetoStorage[] }
    g.objetos.push({ bucket: r.bucket, path: r.path, size: Number(r.tamanho_bytes ?? 0), updatedAt: null, mime: r.tipo_mime ?? null })
    porBucket.set(r.bucket, g)
  }
  const arr = [...porBucket.entries()].map(([bucket, v]) => ({ bucket, publico: v.publico, objetos: v.objetos }))
  return snapshotDeObjetos(arr, {})
}

/** Resumo por plataforma: total + nº de arquivos por tenant (para a visão global). */
export async function resumoPorTenant(svc: SupabaseClient): Promise<{ tenantId: string; nome: string; totalBytes: number; arquivos: number }[]> {
  // Soma por tenant, paginando o catálogo.
  const acc = new Map<string, { totalBytes: number; arquivos: number }>()
  let off = 0
  while (true) {
    const { data, error } = await svc.from('simulado_arquivos').select('tenant_id,tamanho_bytes').range(off, off + 999)
    if (error || !Array.isArray(data) || data.length === 0) break
    for (const r of data as any[]) {
      const t = (r.tenant_id as string) || '—'
      const cur = acc.get(t) ?? { totalBytes: 0, arquivos: 0 }
      cur.totalBytes += Number(r.tamanho_bytes ?? 0)
      cur.arquivos += 1
      acc.set(t, cur)
    }
    if (data.length < 1000) break
    off += 1000
  }
  const ids = [...acc.keys()].filter((x) => x !== '—')
  const nomes = new Map<string, string>()
  if (ids.length) {
    try {
      const { data } = await svc.from('simulado_tenants').select('id,nome').in('id', ids)
      for (const t of (data ?? []) as any[]) nomes.set(t.id, t.nome)
    } catch { /* tolerante */ }
  }
  return [...acc.entries()]
    .map(([tenantId, v]) => ({ tenantId, nome: nomes.get(tenantId) ?? (tenantId === '—' ? 'Sem plataforma' : tenantId.slice(0, 8)), ...v }))
    .sort((a, b) => b.totalBytes - a.totalBytes)
}
