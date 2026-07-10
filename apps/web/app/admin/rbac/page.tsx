import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Card, CardContent } from '@/components/ui/card'
import { RbacMatrix } from '@/components/admin/rbac-matrix'
import { RbacPerfis, type PerfilCard } from '@/components/admin/rbac-perfis'
import { NovoPerfilForm } from '@/components/admin/novo-perfil-form'
import { SecaoHeader } from '@/components/admin/secao-header'
import { AlertTriangle, Shield, ChevronDown } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getRbacData(tenantId: string) {
  const supabase = await createServiceClient()
  try {
    const [rolesRes, permsRes, rpRes, acRes] = await Promise.all([
      supabase.from('simulado_roles').select('id, nome, descricao, is_sistema').or(`tenant_id.eq.${tenantId},is_sistema.eq.true`).order('is_sistema', { ascending: false }).order('nome'),
      supabase.from('simulado_permissions').select('id, resource, action').order('resource').order('action'),
      supabase.from('simulado_role_permissions').select('role_id, permission_id'),
      supabase.from('simulado_tenant_acessos').select('role').eq('tenant_id', tenantId).eq('ativo', true),
    ])
    if (rolesRes.error?.message?.includes('does not exist')) return null

    const matrix: Record<string, Set<string>> = {}
    for (const row of rpRes.data ?? []) {
      if (!matrix[row.role_id]) matrix[row.role_id] = new Set()
      matrix[row.role_id].add(row.permission_id)
    }
    const userCount: Record<string, number> = {}
    for (const a of acRes.data ?? []) { const r = (a as any).role; if (r) userCount[r] = (userCount[r] ?? 0) + 1 }

    return {
      roles: rolesRes.data ?? [],
      permissions: permsRes.data ?? [],
      matrix: Object.fromEntries(Object.entries(matrix).map(([k, v]) => [k, Array.from(v)])),
      userCount,
    }
  } catch {
    return null
  }
}

export default async function RbacPage({ searchParams }: { searchParams: Promise<{ perfil?: string }> }) {
  const tenantId = await getCurrentTenantId()
  const { perfil: destaqueId } = await searchParams

  if (!tenantId) {
    return <div className="space-y-6"><h1 className="text-2xl font-bold">RBAC</h1><p className="text-muted-foreground">Tenant não encontrado.</p></div>
  }

  const data = await getRbacData(tenantId)

  const byResource = data
    ? data.permissions.reduce<Record<string, typeof data.permissions>>((acc, p) => { (acc[p.resource] ??= []).push(p); return acc }, {})
    : {}

  const perfis: PerfilCard[] = (data?.roles ?? []).map((r: any) => ({
    id: r.id, nome: r.nome, descricao: r.descricao ?? null, is_sistema: !!r.is_sistema,
    permCount: (data?.matrix?.[r.id] ?? []).length,
    userCount: data?.userCount?.[r.nome] ?? 0,
  }))

  return (
    <div className="animate-page space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Controle de Acesso (RBAC)</h1>
        <p className="text-muted-foreground">Cada card é um perfil — clique para gerenciar os usuários; use “Editar permissões” para ajustar a matriz.</p>
      </div>

      {!data && (
        <div className="flex gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>As tabelas de RBAC ainda não foram criadas no banco. Execute a migration <code className="font-mono text-xs">20260625000003_add_rbac_tables.sql</code> no Supabase.</span>
        </div>
      )}

      {data && <RbacPerfis perfis={perfis} destaqueId={destaqueId ?? null} />}

      {data && (
        <details open={!!destaqueId} className="group rounded-2xl border bg-card [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Editar permissões (matriz perfis × permissões)</span>
            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t p-4">
            <NovoPerfilForm />
          </div>
          <Card className="overflow-hidden rounded-none border-0 border-t" style={{ ['--card-spacing' as any]: '0px' }}>
            <SecaoHeader icon={Shield} titulo="Matriz de Permissões" subtitulo="Cada coluna é um perfil, cada linha uma permissão — clique para ativar/desativar." />
            <CardContent className="p-0">
              <RbacMatrix roles={data.roles} permissions={data.permissions} byResource={byResource} initialMatrix={data.matrix} tenantId={tenantId} />
            </CardContent>
          </Card>
        </details>
      )}
    </div>
  )
}
