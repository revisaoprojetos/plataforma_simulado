'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { createHash, randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'

// A tabela real é `simulado_api_keys` (prefixada). Já tem `tenant_id`.
const TABELA = 'simulado_api_keys'
const OBRIGATORIAS = new Set(['tenant_id', 'nome', 'key_hash', 'escopos'])

function colunaFaltante(msg: string): string | null {
  return (
    msg.match(/find the '([a-z_]+)' column/i)?.[1] ??
    msg.match(/'([a-z_]+)' column/i)?.[1] ??
    msg.match(/column "?([a-z_]+)"? .* does not exist/i)?.[1] ??
    null
  )
}

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

    const base: Record<string, unknown> = {
      tenant_id: tenantId,
      nome: data.nome,
      key_hash: keyHash,
      key_prefix: rawKey.slice(0, 8),
      escopos: data.escopos,
      expira_em: data.expira_em ?? null,
      criado_por: access.userId,
    }
    // Tolerante: se colunas opcionais (key_prefix/criado_por) ainda não foram migradas,
    // remove só a que faltar e reinsere.
    let ins = await supabase.from(TABELA).insert(base).select('id').single()
    for (let t = 0; t < 4 && ins.error; t++) {
      const col = colunaFaltante(ins.error.message)
      if (col && col in base && !OBRIGATORIAS.has(col)) { delete base[col]; ins = await supabase.from(TABELA).insert(base).select('id').single(); continue }
      break
    }
    if (ins.error) return { ok: false, error: ins.error.message }

    await registrarAudit({ operacao: 'INSERT', entidade: TABELA, entidadeId: ins.data.id, depois: { nome: data.nome, escopos: data.escopos } })
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
    // Só revoga chave DO próprio tenant (a coluna tenant_id existe na tabela).
    const { error } = await supabase.from(TABELA).update({ revogada: true }).eq('id', id).eq('tenant_id', tenantId)
    if (error) return { ok: false, error: error.message }
    await registrarAudit({ operacao: 'UPDATE', entidade: TABELA, entidadeId: id, depois: { revogada: true } })
    revalidatePath('/admin/api-keys')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
