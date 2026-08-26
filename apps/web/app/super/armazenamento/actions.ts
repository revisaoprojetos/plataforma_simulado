'use server'

import { isSuperAdmin, getAuthUser } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { getStorage } from '@/lib/storage'
import { categoriaDe, rotuloCategoria } from '@/lib/storage/canonico'
import { construirMapaReferencias, estaReferenciado } from '@/lib/storage/referencias'
import { garantirBucketBackup, backupObjeto, registrarBackup, prefixoData } from '@/lib/storage/backup'
import { analisarOrganizacao, aplicarMigracao, type RelatorioOrganizador } from '@/lib/storage/organizador'
import {
  recomputarTudo, lerUso, lerLimites, definirLimite, marcarErro,
  type EstadoUso, type ArquivoItem, type PaginaArquivos, type PreviewExclusao,
} from '@/lib/storage/uso'

const POR_PAGINA = 24
const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'bmp'])
function ehImagem(nome: string, mime: string | null): boolean {
  if (mime?.startsWith('image/')) return true
  return IMG_EXT.has((nome.split('.').pop() ?? '').toLowerCase())
}

/** Todas as linhas do catálogo de um bucket (paginado, teto 1000). */
async function catalogoDoBucket(svc: ReturnType<typeof createAdminClient>, bucket: string): Promise<any[]> {
  const all: any[] = []
  let off = 0
  while (true) {
    const { data, error } = await svc
      .from('simulado_arquivos')
      .select('id,nome,path,tamanho_bytes,tipo_mime,publico,tenant_id')
      .eq('bucket', bucket)
      .range(off, off + 999)
    if (error || !Array.isArray(data) || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    off += 1000
  }
  return all
}

// Server actions da área de Armazenamento (console super-admin). TODA action começa
// pelo guard isSuperAdmin() — a página é gated pelo layout, mas as actions são POST
// independentes e precisam checar por conta própria.

async function guard(): Promise<{ ok: true; userId: string | null } | { ok: false; error: string }> {
  if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }
  const u = await getAuthUser()
  return { ok: true, userId: u?.id ?? null }
}

export async function obterUsoAction(): Promise<{ ok: boolean; estado?: EstadoUso; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  return { ok: true, estado: await lerUso(createAdminClient()) }
}

/**
 * Recalcula uso + sincroniza catálogo. Inline (a base atual tem poucas centenas de
 * objetos). Se um dia crescer muito, dá pra trocar por disparo fire-and-forget ao
 * cron /api/cron/storage-reconcile (mesmo caminho de recompute).
 */
export async function recalcularUsoAction(): Promise<{ ok: boolean; estado?: EstadoUso; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  try {
    await recomputarTudo(svc)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao recalcular o armazenamento.'
    await marcarErro(svc, msg)
    return { ok: false, error: msg }
  }
  return { ok: true, estado: await lerUso(svc) }
}

export async function obterLimitesAction(): Promise<{ ok: boolean; limites?: Record<string, number | null>; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  return { ok: true, limites: await lerLimites(createAdminClient()) }
}

export async function definirLimiteAction(
  bucket: string,
  limiteBytes: number | null,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const r = await definirLimite(svc, bucket, limiteBytes, g.userId)
  if (!r.ok) return r
  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_storage_config',
    depois: { bucket, limite_bytes: limiteBytes },
    atorId: g.userId,
  })
  return { ok: true }
}

/** Lista (paginado) os arquivos de um bucket+categoria, com prévia e badge órfão/usado. */
export async function listarArquivosAction(
  bucket: string,
  categoria: string,
  pagina: number,
  busca?: string,
): Promise<{ ok: boolean; dados?: PaginaArquivos; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const rows = await catalogoDoBucket(svc, bucket)
  const termo = (busca ?? '').trim().toLowerCase()
  const filtradas = rows
    .filter((r) => categoriaDe(bucket, r.path) === categoria)
    .filter((r) => !termo || `${r.nome} ${r.path}`.toLowerCase().includes(termo))
    .sort((a, b) => Number(b.tamanho_bytes ?? 0) - Number(a.tamanho_bytes ?? 0))

  const total = filtradas.length
  const p = Math.max(0, pagina)
  const fatia = filtradas.slice(p * POR_PAGINA, p * POR_PAGINA + POR_PAGINA)

  const mapa = await construirMapaReferencias(svc)
  const storage = getStorage()
  const itens: ArquivoItem[] = await Promise.all(
    fatia.map(async (r) => {
      const publico = !!r.publico && bucket !== 'discursivas'
      let url: string | null = null
      try {
        url = publico ? storage.getPublicUrl(bucket, r.path) : await storage.getSignedUrl(bucket, r.path, 3600)
      } catch {
        url = null
      }
      return {
        id: r.id ?? null,
        bucket,
        path: r.path,
        nome: r.nome ?? r.path.split('/').pop() ?? r.path,
        tamanhoBytes: Number(r.tamanho_bytes ?? 0),
        tipoMime: r.tipo_mime ?? null,
        publico,
        url,
        ehImagem: ehImagem(r.nome ?? r.path, r.tipo_mime ?? null),
        referenciado: estaReferenciado(mapa, { bucket, path: r.path, catalogId: r.id ?? null }),
      }
    }),
  )

  return { ok: true, dados: { itens, total, pagina: p, porPagina: POR_PAGINA, categoriaLabel: rotuloCategoria(bucket, categoria) } }
}

/** Prévia da exclusão: quais dos ids estão referenciados no banco. */
export async function preverExclusaoAction(ids: string[]): Promise<{ ok: boolean; itens?: PreviewExclusao[]; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  if (!ids.length) return { ok: true, itens: [] }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_arquivos').select('id,bucket,path,nome,tamanho_bytes').in('id', ids)
  const mapa = await construirMapaReferencias(svc)
  const itens: PreviewExclusao[] = (data ?? []).map((r: any) => ({
    id: r.id,
    bucket: r.bucket,
    path: r.path,
    nome: r.nome ?? r.path.split('/').pop() ?? r.path,
    tamanhoBytes: Number(r.tamanho_bytes ?? 0),
    referenciado: estaReferenciado(mapa, { bucket: r.bucket, path: r.path, catalogId: r.id }),
  }))
  return { ok: true, itens }
}

/**
 * Exclui arquivos (single/bulk): recalcula referência FRESH, faz BACKUP dos bytes num
 * bucket privado e SÓ então remove do storage + apaga a linha do catálogo (FK cascateia).
 * Referenciados são PULADOS a menos que `confirmarReferenciados`. Nunca deleta sem backup.
 */
export async function excluirArquivosAction(
  ids: string[],
  opts?: { confirmarReferenciados?: boolean },
): Promise<{ ok: boolean; excluidos: number; pulados: { path: string; motivo: string }[]; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, excluidos: 0, pulados: [], error: g.error }
  if (!ids.length) return { ok: true, excluidos: 0, pulados: [] }

  const svc = createAdminClient()
  const { data: rows } = await svc.from('simulado_arquivos').select('id,bucket,path,nome,tamanho_bytes').in('id', ids)
  if (!rows?.length) return { ok: true, excluidos: 0, pulados: [] }

  const mapa = await construirMapaReferencias(svc)
  await garantirBucketBackup(svc)
  const prefixo = prefixoData()

  const pulados: { path: string; motivo: string }[] = []
  const excluidosPaths: string[] = []
  let excluidos = 0

  for (const r of rows as any[]) {
    const ref = estaReferenciado(mapa, { bucket: r.bucket, path: r.path, catalogId: r.id })
    if (ref && !opts?.confirmarReferenciados) {
      pulados.push({ path: r.path, motivo: 'referenciado' })
      continue
    }
    const bkp = await backupObjeto(svc, r.bucket, r.path, prefixo)
    if (!bkp) {
      pulados.push({ path: r.path, motivo: 'falha no backup' })
      continue
    }
    try {
      await getStorage().remove(r.bucket, r.path)
    } catch (e) {
      pulados.push({ path: r.path, motivo: e instanceof Error ? e.message : 'falha ao remover' })
      continue
    }
    await svc.from('simulado_arquivos').delete().eq('id', r.id) // FK (junções) cascateiam
    excluidos++
    excluidosPaths.push(`${r.bucket}/${r.path}`)
    await registrarAudit({
      operacao: 'DELETE',
      entidade: 'simulado_arquivos',
      entidadeId: r.id,
      antes: { bucket: r.bucket, path: r.path, tamanho_bytes: r.tamanho_bytes, backup: bkp },
      atorId: g.userId,
    })
  }

  if (excluidos > 0) {
    await registrarBackup(svc, 'delete', { prefixo, paths: excluidosPaths }, g.userId)
  }
  return { ok: true, excluidos, pulados }
}

/** Dry-run read-only: classifica todos os objetos (OK / MISPLACED / ORPHAN). */
export async function analisarOrganizacaoAction(): Promise<{ ok: boolean; relatorio?: RelatorioOrganizador; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  try {
    return { ok: true, relatorio: await analisarOrganizacao(createAdminClient()) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao analisar.' }
  }
}

/** Aplica a migração dos MISPLACED (copy → reescreve refs → verifica → apaga original). */
export async function aplicarMigracaoAction(
  itens: { bucket: string; de: string; para: string }[],
): Promise<{ ok: boolean; migrados?: number; falhas?: { path: string; motivo: string }[]; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  if (!itens.length) return { ok: true, migrados: 0, falhas: [] }
  const r = await aplicarMigracao(createAdminClient(), itens, g.userId)
  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_arquivos',
    depois: { migracao: itens.length, migrados: r.migrados, backupId: r.backupId },
    atorId: g.userId,
  })
  return { ok: true, migrados: r.migrados, falhas: r.falhas }
}

/** Limpa TODOS os órfãos (não-referenciados), com backup — reusa a exclusão segura. */
export async function limparOrfaosAction(): Promise<{ ok: boolean; excluidos?: number; pulados?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const rel = await analisarOrganizacao(svc)
  const orfaos = new Set(rel.itens.filter((i) => i.status === 'ORPHAN').map((i) => `${i.bucket}|${i.path}`))
  if (orfaos.size === 0) return { ok: true, excluidos: 0, pulados: 0 }

  // Resolve os ids de catálogo dos órfãos.
  const ids: string[] = []
  let off = 0
  while (true) {
    const { data, error } = await svc.from('simulado_arquivos').select('id,bucket,path').range(off, off + 999)
    if (error || !Array.isArray(data) || data.length === 0) break
    for (const r of data as any[]) if (orfaos.has(`${r.bucket}|${r.path}`)) ids.push(r.id)
    if (data.length < 1000) break
    off += 1000
  }
  if (!ids.length) return { ok: true, excluidos: 0, pulados: 0, error: 'Órfãos ainda não catalogados — rode "Recalcular" antes.' }

  const r = await excluirArquivosAction(ids, { confirmarReferenciados: false })
  return { ok: r.ok, excluidos: r.excluidos, pulados: r.pulados.length, error: r.error }
}
