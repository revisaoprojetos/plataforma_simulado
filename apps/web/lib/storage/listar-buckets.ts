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
