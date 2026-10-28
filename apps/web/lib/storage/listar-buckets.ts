import type { SupabaseClient } from '@supabase/supabase-js'

// Listagem recursiva (BFS) de buckets do Supabase Storage. Base da visão de uso e do
// reconcile. Regras aprendidas em auditorias anteriores (ver scripts/limpar-orfaos-storage.mjs):
//  - Pastas voltam como entradas com id===null / metadata==null → recursa nelas.
//  - NUNCA filtrar por `x.id && x.metadata` (perde arquivos recém-criados com metadata nula).
//  - Paginar 1000/1000 (a API trunca em 1000).
//  - Existência de objeto é verificada via .list(), NUNCA por HEAD na URL (o CDN devolve 200
//    cacheado mesmo sem o objeto).

export interface ObjetoStorage {
  bucket: string
  path: string
  size: number
  updatedAt: string | null
  mime: string | null
}

/** Descobre TODOS os buckets do projeto (auto: novas "barras" aparecem sozinhas). */
export async function descobrirBuckets(svc: SupabaseClient): Promise<{ id: string; nome: string; publico: boolean }[]> {
  const { data, error } = await svc.storage.listBuckets()
  if (error || !Array.isArray(data)) return []
  return data.map((b: any) => ({ id: b.id ?? b.name, nome: b.name ?? b.id, publico: !!b.public }))
}

async function listarPrefixo(svc: SupabaseClient, bucket: string, prefix: string): Promise<any[]> {
  const out: any[] = []
  let off = 0
  while (true) {
    const { data, error } = await svc.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } })
    if (error || !Array.isArray(data) || data.length === 0) break
    out.push(...data)
    if (data.length < 1000) break
    off += 1000
  }
  return out
}

/** Lista TODOS os objetos (arquivos, não pastas) de um bucket, recursivamente. */
export async function bfsBucket(svc: SupabaseClient, bucket: string): Promise<ObjetoStorage[]> {
  const objetos: ObjetoStorage[] = []
  const fila: string[] = ['']
  const vistos = new Set<string>()
  while (fila.length) {
    const pre = fila.shift() as string
    if (vistos.has(pre)) continue
    vistos.add(pre)
    for (const it of await listarPrefixo(svc, bucket, pre)) {
      const nome = it.name as string
      if (!nome || nome === '.emptyFolderPlaceholder') continue
      const full = pre ? `${pre}/${nome}` : nome
      if (it.id === null || it.metadata == null) {
        fila.push(full) // pasta → recursa
      } else {
        objetos.push({
          bucket,
          path: full,
          size: Number(it.metadata?.size ?? 0),
          updatedAt: it.updated_at ?? it.created_at ?? null,
          mime: it.metadata?.mimetype ?? null,
        })
      }
    }
  }
  return objetos
}

/** Conta rápida do total de objetos de um bucket (para decidir scan inline vs. cron). */
export async function contarObjetos(svc: SupabaseClient, bucket: string): Promise<number> {
  return (await bfsBucket(svc, bucket)).length
}

// ─── Listagem PROVIDER-AWARE (supabase | s3) ──────────────────────────────────────────────────────────
// O reconcile/uso precisa listar o storage ATIVO: se o provider for s3, listar o Supabase apagaria do
// catálogo os arquivos que estão no S3 (prune cego). Estas funções brançam por STORAGE_PROVIDER. Para s3
// usamos ListBuckets/ListObjectsV2 (SDK via especificador indireto → tsc verde sem resolver o pacote).
const providerAtivo = () => (process.env.STORAGE_PROVIDER ?? 'supabase').toLowerCase()
const prefixoS3 = () => process.env.S3_BUCKET_PREFIX ?? ''
const logicoDeFisico = (f: string) => { const p = prefixoS3(); return p && f.startsWith(p) ? f.slice(p.length) : f }
const fisicoDeLogico = (l: string) => { const p = prefixoS3(); return p && !l.startsWith(p) ? p + l : l }

async function s3() {
  const mod: any = await import('@aws-sdk/client-s3')
  const client = new mod.S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '' },
  })
  return { client, mod }
}

/** Buckets do S3 do projeto (filtra pelo S3_BUCKET_PREFIX e devolve o nome LÓGICO). */
export async function descobrirBucketsS3(): Promise<{ id: string; nome: string; publico: boolean }[]> {
  const { client, mod } = await s3()
  const out = await client.send(new mod.ListBucketsCommand({}))
  const p = prefixoS3()
  return (out.Buckets ?? [])
    .map((b: any) => b.Name as string)
    .filter((n: string) => !!n && (!p || n.startsWith(p)))
    .map((n: string) => ({ id: n, nome: logicoDeFisico(n), publico: true }))
}

/** Lista TODOS os objetos de um bucket (nome LÓGICO) no S3, paginando por ContinuationToken. */
export async function bfsBucketS3(bucketLogico: string): Promise<ObjetoStorage[]> {
  const { client, mod } = await s3()
  const Bucket = fisicoDeLogico(bucketLogico)
  const objetos: ObjetoStorage[] = []
  let token: string | undefined
  do {
    const out: any = await client.send(new mod.ListObjectsV2Command({ Bucket, ContinuationToken: token, MaxKeys: 1000 }))
    for (const o of (out.Contents ?? [])) {
      const key = o.Key as string
      if (!key || key.endsWith('/')) continue
      objetos.push({ bucket: bucketLogico, path: key, size: Number(o.Size ?? 0), updatedAt: o.LastModified ? new Date(o.LastModified).toISOString() : null, mime: null })
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (token)
  return objetos
}

/** Buckets do storage ATIVO (supabase ou s3). */
export async function descobrirBucketsAtivo(svc: SupabaseClient) {
  return providerAtivo() === 's3' ? descobrirBucketsS3() : descobrirBuckets(svc)
}

/** Objetos de um bucket no storage ATIVO (supabase ou s3). */
export async function bfsBucketAtivo(svc: SupabaseClient, bucketLogico: string): Promise<ObjetoStorage[]> {
  return providerAtivo() === 's3' ? bfsBucketS3(bucketLogico) : bfsBucket(svc, bucketLogico)
}
