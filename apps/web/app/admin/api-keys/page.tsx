import { createServiceClient } from '@/lib/supabase/server'
import { ApiKeysManager } from './api-keys-manager'

async function getApiKeys() {
  try {
    const supabase = await createServiceClient()
    const { data } = await supabase
      .from('api_keys')
      .select('id, nome, key_prefix, escopos, ultimo_uso, expira_em, revogada, created_at')
      .order('created_at', { ascending: false })

    return data ?? []
  } catch {
    return []
  }
}

export default async function ApiKeysPage() {
  const keys = await getApiKeys()

  return <ApiKeysManager initialKeys={keys} />
}
