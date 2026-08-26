import type { SupabaseClient } from '@supabase/supabase-js'

// Backup de segurança antes de QUALQUER deleção (o Supabase Storage não tem lixeira →
// deleção é irreversível). Copiamos os bytes para um bucket PRIVADO `storage-backups`
// (nunca disco local: o servidor é efêmero) e registramos um manifesto em
// simulado_storage_backups para auditoria/reversão.

export const BUCKET_BACKUP = 'storage-backups'

export async function garantirBucketBackup(svc: SupabaseClient): Promise<void> {
  try {
    await svc.storage.createBucket(BUCKET_BACKUP, { public: false })
  } catch {
    /* já existe */
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
  svc: SupabaseClient,
  bucket: string,
  path: string,
  prefixo: string,
): Promise<string | null> {
  try {
    const { data, error } = await svc.storage.from(bucket).download(path)
    if (error || !data) return null
    const buf = new Uint8Array(await data.arrayBuffer())
    const destino = `${prefixo}/${bucket}/${path}`
    const { error: upErr } = await svc.storage
      .from(BUCKET_BACKUP)
      .upload(destino, buf, { upsert: true, contentType: (data as any).type || 'application/octet-stream' })
    if (upErr) return null
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
