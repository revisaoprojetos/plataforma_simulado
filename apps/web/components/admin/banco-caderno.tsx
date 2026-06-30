import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { BancoCadernoClient } from '@/components/admin/banco-caderno-client'
import { AlertTriangle } from 'lucide-react'

export async function BancoCaderno({ bancoId }: { bancoId: string }) {
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const { data: banco, error } = await svc
    .from('simulado_pastas')
    .select('caderno_id')
    .eq('id', bancoId)
    .eq('tenant_id', tenantId ?? '')
    .maybeSingle()
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Recurso indisponível: rode o SQL pendente (coluna <code>simulado_pastas.caderno_id</code>) no Supabase e recarregue.
      </div>
    )
  }

  const { data: cadernos } = await svc
    .from('simulado_cadernos_designer')
    .select('id, nome, descricao')
    .eq('tenant_id', tenantId ?? '')
    .order('nome')

  return <BancoCadernoClient bancoId={bancoId} cadernoAtualId={(banco?.caderno_id as string) ?? null} cadernos={(cadernos ?? []) as any} />
}
