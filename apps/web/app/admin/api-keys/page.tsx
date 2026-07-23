import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { ApiKeysManager } from './api-keys-manager'

export const dynamic = 'force-dynamic'

async function getApiKeys(tenantId: string) {
  try {
    const supabase = await createServiceClient()
    // Só as chaves DO tenant; tolera bancos onde `tenant_id` ainda não existe na tabela.
    const sel = 'id, nome, key_prefix, escopos, ultimo_uso, expira_em, revogada, created_at'
    let r = await supabase.from('api_keys').select(sel).eq('tenant_id', tenantId).order('created_at', { ascending: false })
    if (r.error && /tenant_id|column/i.test(r.error.message)) {
      r = await supabase.from('api_keys').select(sel).order('created_at', { ascending: false })
    }
    return r.data ?? []
  } catch {
    return []
  }
}

export default async function ApiKeysPage() {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'api_keys:manage')) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
        <SemPermissao>Você não tem permissão para gerenciar API keys.</SemPermissao>
      </div>
    )
  }
  const keys = await getApiKeys(access.tenantId ?? '00000000-0000-0000-0000-000000000000')

  return <ApiKeysManager initialKeys={keys} />
}
