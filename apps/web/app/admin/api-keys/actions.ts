'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { createHash, randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'

export async function criarApiKey(data: {
  nome: string
  escopos: string[]
  expira_em?: string
}): Promise<{ ok: boolean; id?: string; key_completa?: string; error?: string }> {
  try {
    const access = await getCurrentAccess()
    if (!accessCan(access, 'api_keys:manage')) return { ok: false, error: 'Sem permissão para gerenciar API keys.' }
    const tenantId = access.tenantId
    if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }

    const supabase = await createServiceClient()

    const rawKey = randomBytes(32).toString('hex')
    const keyHash = createHash('sha256').update(rawKey).digest('hex')
    const keyPrefix = rawKey.slice(0, 8)

    const base = {
      nome: data.nome,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      escopos: data.escopos,
      expira_em: data.expira_em ?? null,
      criado_por: access.userId,
    }
    // Escopa por tenant; tolera bancos onde a coluna `tenant_id` ainda não foi migrada.
    let ins = await supabase.from('api_keys').insert({ ...base, tenant_id: tenantId }).select('id').single()
    if (ins.error && /tenant_id|column/i.test(ins.error.message)) {
      ins = await supabase.from('api_keys').insert(base).select('id').single()
    }
    if (ins.error) return { ok: false, error: ins.error.message }

    await registrarAudit({ operacao: 'INSERT', entidade: 'api_keys', entidadeId: ins.data.id, depois: { nome: data.nome, escopos: data.escopos } })
    revalidatePath('/admin/api-keys')
    return { ok: true, id: ins.data.id, key_completa: rawKey }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function revogarApiKey(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const access = await getCurrentAccess()
    if (!accessCan(access, 'api_keys:manage')) return { ok: false, error: 'Sem permissão para gerenciar API keys.' }
    const tenantId = access.tenantId
    if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }

    const supabase = await createServiceClient()
    // Só revoga chave DO PRÓPRIO tenant; tolera coluna ausente (fallback por id).
    let upd = await supabase.from('api_keys').update({ revogada: true }).eq('id', id).eq('tenant_id', tenantId).select('id')
    if (upd.error && /tenant_id|column/i.test(upd.error.message)) {
      upd = await supabase.from('api_keys').update({ revogada: true }).eq('id', id).select('id')
    }
    if (upd.error) return { ok: false, error: upd.error.message }
    await registrarAudit({ operacao: 'UPDATE', entidade: 'api_keys', entidadeId: id, depois: { revogada: true } })
    revalidatePath('/admin/api-keys')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
