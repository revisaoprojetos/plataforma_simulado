import type { SupabaseClient } from '@supabase/supabase-js'
import { getStorage } from '@/lib/storage'

// Backup de segurança antes de QUALQUER deleção (o Supabase Storage não tem lixeira →
// deleção é irreversível). Copiamos os bytes para um bucket PRIVADO `storage-backups`
// (nunca disco local: o servidor é efêmero) e registramos um manifesto em
// simulado_storage_backups para auditoria/reversão.

export const BUCKET_BACKUP = 'storage-backups'

// Provider-aware: usa o storage ATIVO (Supabase ou S3/Hetzner). No S3 o bucket físico é `${S3_BUCKET_PREFIX}storage-backups`.
// O parâmetro `svc` é mantido só por compatibilidade com os chamadores (o backup não usa mais Supabase Storage direto).
export async function garantirBucketBackup(_svc?: SupabaseClient): Promise<void> {
  try {
    await getStorage().garantirBucket?.(BUCKET_BACKUP)
  } catch {
    /* já existe / sem permissão: backupObjeto falha e NADA é deletado */
  }
}

/** Prefixo de data para agrupar os backups (yyyy-mm-dd). */
export function prefixoData(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Baixa o objeto do storage e o copia para o bucket de backup. Retorna o path do backup
 * ou null se falhar (nesse caso o chamador NÃO deve deletar o original).
 */
export async function backupObjeto(
  _svc: SupabaseClient | null | undefined,
  bucket: string,
  path: string,
  prefixo: string,
): Promise<string | null> {
  try {
    const st = getStorage()
    const buf = await st.download(bucket, path)
    if (!buf) return null
    const destino = `${prefixo}/${bucket}/${path}`
    await st.upload({ bucket: BUCKET_BACKUP, path: destino, data: buf, contentType: 'application/octet-stream', upsert: true, publico: false })
    return destino
  } catch {
    return null
  }
}

/** Registra um manifesto de backup (para trilha/reversão). Best-effort. */
export async function registrarBackup(
  svc: SupabaseClient,
  tipo: 'migracao' | 'orfaos' | 'delete',
  dados: Record<string, unknown>,
  userId: string | null,
): Promise<string | null> {
  try {
    const { data } = await svc
      .from('simulado_storage_backups')
      .insert({ tipo, dados, criado_por: userId, criado_em: new Date().toISOString() })
      .select('id')
      .single()
    return data?.id ?? null
  } catch {
    return null
  }
}
