import { createAdminClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { NovaPlataformaBotao } from '@/components/super/nova-plataforma-botao'
import { PlataformaAcoes } from '@/components/super/plataforma-acoes'
import { SecaoHeader } from '@/components/admin/secao-header'
import { Building2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Gestão de plataformas — reaproveita os componentes do admin, mas vive no console isolado
// (o gate de super-admin fica no layout /super).
export default async function SuperPlataformasPage() {
  const svc = createAdminClient()
  const { data: tenants } = await svc
    .from('simulado_tenants')
    .select('id, nome, slug, plano, ativo, created_at')
    .order('created_at', { ascending: false })

  const ids = (tenants ?? []).map((t) => t.id)
  const { data: acessos } = ids.length
    ? await svc.from('simulado_tenant_acessos').select('tenant_id').in('tenant_id', ids)
    : { data: [] as { tenant_id: string }[] }
  const contagem: Record<string, number> = {}
  for (const a of acessos ?? []) contagem[a.tenant_id] = (contagem[a.tenant_id] ?? 0) + 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plataformas</h1>
          <p className="text-muted-foreground">
            Crie e gerencie as plataformas (tenants). Cada uma nasce isolada, com perfis, mensagens e um admin próprio.
          </p>
        </div>
        <NovaPlataformaBotao />
      </div>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
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
                <TableHead className="w-10 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!tenants || tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma plataforma cadastrada.</TableCell>
                </TableRow>
              ) : (
                tenants.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.nome}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{t.slug}</TableCell>
                    <TableCell className="text-sm capitalize">{t.plano}</TableCell>
                    <TableCell className="text-sm">{contagem[t.id] ?? 0}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${t.ativo ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                        {t.ativo ? 'Ativa' : 'Oculta'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <PlataformaAcoes id={t.id} nome={t.nome} ativo={t.ativo} />
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
