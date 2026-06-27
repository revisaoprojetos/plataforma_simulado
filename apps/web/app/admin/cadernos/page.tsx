import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { NovoCadernoForm } from '@/components/admin/novo-caderno-form'
import { ShieldAlert, NotebookPen, Pencil, Printer } from 'lucide-react'

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
    .eq('tenant_id', access.tenantId ?? '')
    .order('atualizado_em', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cadernos de prova</h1>
        <p className="text-muted-foreground">Monte cadernos imprimíveis com questões e textos, e gere o PDF.</p>
      </div>

      <NovoCadernoForm />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadernos ({cadernos?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!cadernos || cadernos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <NotebookPen className="h-8 w-8" />
              <p className="text-sm">Nenhum caderno ainda.</p>
            </div>
          ) : (
            cadernos.map((c: any) => {
              const blocos = (c.config?.blocos ?? []).length
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">{blocos} bloco(s)</p>
                  </div>
                  <Link href={`/admin/cadernos/${c.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                  </Link>
                  <Link href={`/imprimir/caderno/${c.id}`} target="_blank" className={buttonVariants({ size: 'sm' })}>
                    <Printer className="mr-1 h-3.5 w-3.5" /> Imprimir
                  </Link>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
