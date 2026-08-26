import { createAdminClient } from '@/lib/supabase/server'
import { lerUso, lerLimites, resumoPorTenant } from '@/lib/storage/uso'
import { ArmazenamentoClient } from './armazenamento-client'

// Layout /super já garante isSuperAdmin(); aqui só carregamos o snapshot em cache.
export const dynamic = 'force-dynamic'

export default async function ArmazenamentoPage() {
  const svc = createAdminClient()
  const [estado, limites, porTenant] = await Promise.all([lerUso(svc), lerLimites(svc), resumoPorTenant(svc).catch(() => [])])
  return <ArmazenamentoClient estadoInicial={estado} limitesIniciais={limites} porTenantInicial={porTenant} />
}
