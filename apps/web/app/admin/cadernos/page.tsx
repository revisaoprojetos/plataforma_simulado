import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { CadernosClient } from '@/components/admin/cadernos-client'
import { ShieldAlert } from 'lucide-react'

function contarBlocos(config: any): number {
  if (config?.docsV2) {
    let n = 0
    for (const doc of Object.values(config.docsV2) as any[]) for (const p of doc?.pages ?? []) n += (p.blocks?.length ?? 0)
    return n
  }
  return (config?.blocos ?? []).length
}

export default async function CadernosAdminPage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('questoes:view')
  if (!pode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Cadernos de prova</h1>
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          <ShieldAlert className="h-4 w-4" /> Sem permissão.
        </div>
      </div>
    )
  }

  const svc = createAdminClient()
  const { data: cadernos } = await svc
    .from('simulado_cadernos_designer')
    .select('id, nome, config, atualizado_em')
    .eq('deletado', false)
    .eq('tenant_id', access.tenantId ?? '')
    .order('atualizado_em', { ascending: false })

  const lista = (cadernos ?? []).map((c: any) => ({ id: c.id, nome: c.nome, blocos: contarBlocos(c.config) }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cadernos de prova</h1>
        <p className="text-muted-foreground">Monte cadernos em blocos (estilo Gutenberg) com a identidade do simulado e gere o PDF.</p>
      </div>
      <CadernosClient cadernos={lista} />
    </div>
  )
}
