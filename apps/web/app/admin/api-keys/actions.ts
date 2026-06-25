'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { createHash, randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'

export async function criarApiKey(data: {
  nome: string
  escopos: string[]
  expira_em?: string
}): Promise<{ ok: boolean; id?: string; key_completa?: string; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Não autenticado' }

    const rawKey = randomBytes(32).toString('hex')
    const keyHash = createHash('sha256').update(rawKey).digest('hex')
    const keyPrefix = rawKey.slice(0, 8)

    const { data: key, error } = await supabase
      .from('api_keys')
      .insert({
        nome: data.nome,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        escopos: data.escopos,
        expira_em: data.expira_em ?? null,
        criado_por: user.id,
      })
      .select('id')
      .single()

    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/api-keys')
    return { ok: true, id: key.id, key_completa: rawKey }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function revogarApiKey(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { error } = await supabase
      .from('api_keys')
      .update({ revogada: true })
      .eq('id', id)

    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/api-keys')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
