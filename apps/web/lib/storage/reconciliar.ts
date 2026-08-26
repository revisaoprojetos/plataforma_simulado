import type { SupabaseClient } from '@supabase/supabase-js'
import type { ObjetoStorage } from './listar-buckets'
import { MAIN_TENANT, type MapaReferencias } from './referencias'
import { ehUuid } from './canonico'

// Sincroniza o catálogo `simulado_arquivos` com o inventário real dos buckets:
// insere os que faltam e remove os que sumiram (para o catálogo ser um espelho fiel,
// que é o que a visão de uso e o navegador leem). Porta a lógica de
// scripts/backfill-simulado-arquivos.mjs, mas recebe os objetos já listados (1 BFS só).

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf',
}
function mimeDe(nome: string): string {
  const e = (nome.split('.').pop() ?? '').toLowerCase()
  return MIME[e] ?? 'application/octet-stream'
}

export interface RegistroArquivo {
  tenant_id: string
  bucket: string
  path: string
  nome: string
  size: number
}

/** Resolve o tenant dono de um objeto a partir do bucket/path (e das referências). */
function resolverTenant(bucket: string, path: string, dono: (b: string) => string): string {
  const parts = path.split('/')
  const base = parts[parts.length - 1]
  if (bucket === 'pdfs') {
    if (parts[0] === 'materiais') return ehUuid(parts[1]) ? parts[1] : MAIN_TENANT
    if (ehUuid(parts[0])) return parts[0] // {tenant}/{jobId}.pdf gerado
    if (parts[0] === 'relatorios') return MAIN_TENANT
    return dono(base)
  }
  if (bucket === 'discursivas') {
    const p = parts[0] === 'discursivas' ? parts.slice(1) : parts // corrige prefixo duplo
    return ehUuid(p[0]) ? p[0] : MAIN_TENANT
  }
  // imagens (assets/ e subpastas por tipo não têm tenant no path) → dono via basename
  return dono(base)
}

/** Converte objetos do storage em registros de catálogo (com tenant resolvido). */
export function montarRegistros(objetos: ObjetoStorage[], mapa: MapaReferencias): RegistroArquivo[] {
  return objetos.map((o) => ({
    tenant_id: resolverTenant(o.bucket, o.path, mapa.donoDoBasename),
    bucket: o.bucket,
    path: o.path,
    nome: o.path.split('/').pop() ?? o.path,
    size: o.size,
  }))
}

export interface ResultadoReconcile {
  inseridos: number
  removidos: number
  jaExistentes: number
  erros: string[]
}

/**
 * Sincroniza o catálogo: insere registros novos e (opcional) remove os órfãos de catálogo
 * (linhas cujo objeto não existe mais no storage). A poda é por (bucket,path) — robusta a
 * eventual divergência de tenant. `bucketsEscaneados` = os buckets cobertos por `registros`.
 */
export async function sincronizarCatalogo(
  svc: SupabaseClient,
  registros: RegistroArquivo[],
  bucketsEscaneados: string[],
  opts?: { dryRun?: boolean; podar?: boolean },
): Promise<ResultadoReconcile> {
  const erros: string[] = []

  // Existentes (chave tenant|bucket|path) + índice por bucket→path (para poda).
  const existentes = new Set<string>()
  const catalogoPorBucketPath = new Map<string, string>() // `${bucket}|${path}` → id
  let off = 0
  while (true) {
    const { data, error } = await svc.from('simulado_arquivos').select('id,tenant_id,bucket,path').range(off, off + 999)
    if (error) { erros.push(`leitura catálogo: ${error.message}`); break }
    if (!Array.isArray(data) || data.length === 0) break
    for (const r of data as any[]) {
      existentes.add(`${r.tenant_id}|${r.bucket}|${r.path}`)
      catalogoPorBucketPath.set(`${r.bucket}|${r.path}`, r.id)
    }
    if (data.length < 1000) break
    off += 1000
  }

  const novos = registros.filter((r) => !existentes.has(`${r.tenant_id}|${r.bucket}|${r.path}`))
  const jaExistentes = registros.length - novos.length

  // Poda: ids no catálogo (dos buckets escaneados) cujo path não existe mais no storage.
  const pathsAtuais = new Set(registros.map((r) => `${r.bucket}|${r.path}`))
  const idsParaRemover: string[] = []
  if (opts?.podar) {
    for (const [chave, id] of catalogoPorBucketPath) {
      const bucket = chave.split('|')[0]
      if (bucketsEscaneados.includes(bucket) && !pathsAtuais.has(chave)) idsParaRemover.push(id)
    }
  }

  if (opts?.dryRun) {
    return { inseridos: novos.length, removidos: idsParaRemover.length, jaExistentes, erros: [...erros, '(dry-run)'] }
  }

  let inseridos = 0
  for (let i = 0; i < novos.length; i += 500) {
    const lote = novos.slice(i, i + 500).map((r) => ({
      tenant_id: r.tenant_id, nome: r.nome, tipo_mime: mimeDe(r.nome), tamanho_bytes: r.size,
      provider: 'supabase', bucket: r.bucket, path: r.path, publico: r.bucket !== 'discursivas', criado_por: null,
    }))
    const { error } = await svc.from('simulado_arquivos').insert(lote)
    if (error) erros.push(`insert lote ${i}: ${error.message}`)
    else inseridos += lote.length
  }

  let removidos = 0
  for (let i = 0; i < idsParaRemover.length; i += 500) {
    const lote = idsParaRemover.slice(i, i + 500)
    const { error } = await svc.from('simulado_arquivos').delete().in('id', lote)
    if (error) erros.push(`poda lote ${i}: ${error.message}`)
    else removidos += lote.length
  }

  return { inseridos, removidos, jaExistentes, erros }
}
