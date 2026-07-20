import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { NovoTenantForm } from '@/components/admin/novo-tenant-form'
import { SecaoHeader } from '@/components/admin/secao-header'
import { Building2, Plus } from 'lucide-react'
import { SemPermissao } from '@/components/ui/alert-box'

export default async function TenantsPage() {
  const access = await getCurrentAccess()
  const podeGerenciar = access.isAdmin || access.permissions.includes('tenants:manage')

  if (!podeGerenciar) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Plataformas</h1>
        <SemPermissao>Você não tem permissão para gerenciar plataformas.</SemPermissao>
      </div>
    )
  }

  const svc = createAdminClient()
  const { data: tenants } = await svc
    .from('simulado_tenants')
    .select('id, nome, slug, plano, ativo, created_at')
    .order('created_at', { ascending: false })

  // Conta usuários por tenant.
  const ids = (tenants ?? []).map((t) => t.id)
  const { data: acessos } = ids.length
    ? await svc.from('simulado_tenant_acessos').select('tenant_id').in('tenant_id', ids)
    : { data: [] as { tenant_id: string }[] }
  const contagem: Record<string, number> = {}
  for (const a of acessos ?? []) contagem[a.tenant_id] = (contagem[a.tenant_id] ?? 0) + 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plataformas</h1>
        <p className="text-muted-foreground">
          Crie e gerencie as plataformas (tenants). Cada uma nasce isolada, com perfis, mensagens e um admin próprio.
        </p>
      </div>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={Plus} titulo="Nova plataforma" subtitulo="Já recebe perfis de acesso, mensagens padrão e um admin inicial." />
        <CardContent className="px-4 py-4">
          <NovoTenantForm />
        </CardContent>
      </Card>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={Building2} titulo="Plataformas cadastradas" subtitulo={`${tenants?.length ?? 0} plataforma(s)`} />
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Subdomínio</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Usuários</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!tenants || tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Nenhuma plataforma cadastrada.
                  </TableCell>
                </TableRow>
              ) : (
                tenants.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.nome}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{t.slug}</TableCell>
                    <TableCell className="text-sm capitalize">{t.plano}</TableCell>
                    <TableCell className="text-sm">{contagem[t.id] ?? 0}</TableCell>
                    <TableCell>
                      {t.ativo ? (
                        <Badge variant="default">Ativa</Badge>
                      ) : (
                        <Badge variant="secondary">Inativa</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
