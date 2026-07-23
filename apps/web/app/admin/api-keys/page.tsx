import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { ApiKeysManager } from './api-keys-manager'

export const dynamic = 'force-dynamic'

async function getApiKeys(tenantId: string) {
  try {
    const supabase = await createServiceClient()
    // Tabela real: simulado_api_keys (com tenant_id). Select tolerante às colunas ainda
    // não migradas (key_prefix/created_at).
    const full = 'id, nome, key_prefix, escopos, ultimo_uso, expira_em, revogada, created_at'
    const base = 'id, nome, escopos, ultimo_uso, expira_em, revogada'
    let res: { data: any[] | null; error: unknown } = await supabase.from('simulado_api_keys').select(full).eq('tenant_id', tenantId).order('created_at', { ascending: false })
    if (res.error) {
      res = await supabase.from('simulado_api_keys').select(base).eq('tenant_id', tenantId)
    }
    return res.data ?? []
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
