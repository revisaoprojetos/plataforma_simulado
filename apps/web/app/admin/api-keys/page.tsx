import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { cn } from '@/lib/utils'
import Link from 'next/link'
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
        <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
        <SemPermissao>Você não tem permissão para gerenciar API keys.</SemPermissao>
      </div>
    )
  }
  const tenantId = access.tenantId ?? '00000000-0000-0000-0000-000000000000'
  const abas = [{ id: 'chaves', label: 'Chaves' }, { id: 'uso', label: 'Uso' }]

  return (
    <div className="space-y-6">
      <EstudioHeader eyebrow="Integrações" titulo="API Keys" semAbas />
      <div className="flex items-center gap-x-7 border-b">
        {abas.map((t) => (
          <Link key={t.id} href={t.id === 'chaves' ? '/admin/api-keys' : '/admin/api-keys?aba=uso'}
            className={cn('-mb-px border-b-2 pb-2.5 pt-1 text-[14px] tracking-[-0.01em] transition-colors',
              aba === t.id ? 'border-primary font-extrabold text-foreground' : 'border-transparent font-semibold text-muted-foreground hover:text-foreground')}>
            {t.label}
          </Link>
        ))}
      </div>
      {aba === 'uso' ? <AbaUso tenantId={tenantId} sp={sp} /> : <ApiKeysManager initialKeys={await getApiKeys(tenantId)} />}
    </div>
  )
}
