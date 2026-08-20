import { Plug } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { statusConfigIA } from './actions'
import { TranscricaoTabs } from './transcricao-tabs'

export const dynamic = 'force-dynamic'
const ZERO = '00000000-0000-0000-0000-000000000000'

/** Chaves de API por tenant, em duas direções (abas): a IA que o sistema USA + as APIs de fora. */
async function getApiKeys(tenantId: string) {
  try {
    const supabase = await createServiceClient()
    const full = 'id, nome, key_prefix, escopos, ultimo_uso, expira_em, revogada, created_at'
    const base = 'id, nome, escopos, ultimo_uso, expira_em, revogada'
    let res: { data: any[] | null; error: unknown } = await supabase.from('simulado_api_keys').select(full).eq('tenant_id', tenantId).order('created_at', { ascending: false })
    if (res.error) res = await supabase.from('simulado_api_keys').select(base).eq('tenant_id', tenantId)
    return (res.data ?? []) as any[]
  } catch { return [] }
}

export default async function TranscricaoIAPage() {
  const access = await getCurrentAccess()
  const podeIA = access.isAdmin || accessCan(access, 'configuracoes:manage') || accessCan(access, 'configuracoes:view')
  if (!podeIA) return <SemPermissao />

  const podeApiKeys = access.isAdmin || accessCan(access, 'api_keys:manage')
  const [inicial, apiKeys] = await Promise.all([
    statusConfigIA(),
    podeApiKeys ? getApiKeys(access.tenantId ?? ZERO) : Promise.resolve([] as any[]),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Plug className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chaves de API</h1>
          <p className="text-muted-foreground">Duas direções: a <b>IA que o sistema usa</b> para transcrever (chave de saída) e as <b>APIs de fora</b> — chaves de acesso para sistemas externos (entrada).</p>
        </div>
      </div>
      <TranscricaoTabs inicial={inicial} apiKeys={apiKeys} podeApiKeys={podeApiKeys} />
    </div>
  )
}
