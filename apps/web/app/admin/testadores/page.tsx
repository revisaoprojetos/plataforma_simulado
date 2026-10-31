import { getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizarEmailsTestador } from '@/lib/sistema/testadores-globais'
import { TestadoresClient } from './testadores-client'

export const dynamic = 'force-dynamic'

export default async function TestadoresPage() {
  const access = await getCurrentAccess()
  let emails: string[] = []
  if (access.tenantId) {
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_tenants').select('t:tema->testadores_globais').eq('id', access.tenantId).maybeSingle()
    emails = normalizarEmailsTestador((data as { t?: unknown } | null)?.t)
  }
  const podeEditar = access.isAdmin || access.permissions.includes('configuracoes:manage')
  return <TestadoresClient emailsIniciais={emails} podeEditar={podeEditar} />
}
