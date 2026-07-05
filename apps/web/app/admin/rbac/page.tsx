import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Card, CardContent } from '@/components/ui/card'
import { RbacMatrix } from '@/components/admin/rbac-matrix'
import { NovoPerfilForm } from '@/components/admin/novo-perfil-form'
import { SecaoHeader } from '@/components/admin/secao-header'
import { AlertTriangle, UserCog, Shield } from 'lucide-react'

async function getRbacData(tenantId: string) {
  const supabase = await createServiceClient()

  try {
    const [rolesRes, permsRes, rpRes] = await Promise.all([
      supabase
        .from('simulado_roles')
        .select('id, nome, descricao, is_sistema')
        .or(`tenant_id.eq.${tenantId},is_sistema.eq.true`)
        .order('is_sistema', { ascending: false })
        .order('nome'),
      supabase
        .from('simulado_permissions')
        .select('id, resource, action')
        .order('resource')
        .order('action'),
      supabase.from('simulado_role_permissions').select('role_id, permission_id'),
    ])

    // If tables don't exist, Supabase returns an error code
    if (rolesRes.error?.message?.includes('does not exist')) {
      return null
    }

    const matrix: Record<string, Set<string>> = {}
    for (const row of rpRes.data ?? []) {
      if (!matrix[row.role_id]) matrix[row.role_id] = new Set()
      matrix[row.role_id].add(row.permission_id)
    }

    return {
      roles: rolesRes.data ?? [],
      permissions: permsRes.data ?? [],
      matrix: Object.fromEntries(
        Object.entries(matrix).map(([k, v]) => [k, Array.from(v)]),
      ),
    }
  } catch {
    return null
  }
}

export default async function RbacPage() {
  const tenantId = await getCurrentTenantId()

  if (!tenantId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">RBAC</h1>
        <p className="text-muted-foreground">Tenant não encontrado.</p>
      </div>
    )
  }
  const tenant = { id: tenantId }

  const data = await getRbacData(tenant.id)

  const byResource = data
    ? data.permissions.reduce<Record<string, typeof data.permissions>>(
        (acc, p) => {
          if (!acc[p.resource]) acc[p.resource] = []
          acc[p.resource].push(p)
          return acc
        },
        {},
      )
    : {}

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Controle de Acesso (RBAC)</h1>
        <p className="text-muted-foreground">
          Gerencie permissões por perfil. Marque os módulos que cada perfil pode acessar.
        </p>
      </div>

      {!data && (
        <div className="flex gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            As tabelas de RBAC ainda não foram criadas no banco. Execute a migration{' '}
            <code className="font-mono text-xs">20260625000003_add_rbac_tables.sql</code> no Supabase.
          </span>
        </div>
      )}

      {data && (
        <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
          <SecaoHeader icon={UserCog} titulo="Perfis" subtitulo="Crie perfis e ajuste as permissões na matriz abaixo." />
          <CardContent className="px-4 py-4">
            <NovoPerfilForm />
          </CardContent>
        </Card>
      )}

      {data && (
        <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
          <SecaoHeader icon={Shield} titulo="Matriz de Permissões" subtitulo="Cada coluna é um perfil, cada linha uma permissão — clique para ativar/desativar." />
          <CardContent className="p-0">
            <RbacMatrix
              roles={data.roles}
              permissions={data.permissions}
              byResource={byResource}
              initialMatrix={data.matrix}
              tenantId={tenant.id}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
