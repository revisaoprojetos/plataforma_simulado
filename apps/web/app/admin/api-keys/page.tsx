import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'
import { SemPermissao } from '@/components/ui/alert-box'
import { AbasLinha } from '@/components/ui/abas-linha'
import { ApiKeysManager } from './api-keys-manager'
import { AbaUso } from './aba-uso'

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

export default async function ApiKeysPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const aba = sp.aba === 'uso' ? 'uso' : 'chaves'
  const access = await getCurrentAccess()
  if (!accessCan(access, 'api_keys:manage')) {
    return (
      <div className="space-y-4">
        <CabecalhoArea eyebrow="Integrações" titulo="API Keys" semBarraSetor />
        <SemPermissao>Você não tem permissão para gerenciar API keys.</SemPermissao>
      </div>
    )
  }
  const tenantId = access.tenantId ?? '00000000-0000-0000-0000-000000000000'
  const abas = [{ id: 'chaves', label: 'Chaves' }, { id: 'uso', label: 'Uso' }]

  return (
    <div className="space-y-6">
      <CabecalhoArea
        eyebrow="Integrações"
        titulo="API Keys"
        abas={<AbasLinha ativo={aba} itens={abas.map((t) => ({ key: t.id, label: t.label, href: t.id === 'chaves' ? '/admin/api-keys' : '/admin/api-keys?aba=uso' }))} />}
      />
      {aba === 'uso' ? <AbaUso tenantId={tenantId} sp={sp} /> : <ApiKeysManager initialKeys={await getApiKeys(tenantId)} />}
    </div>
  )
}
