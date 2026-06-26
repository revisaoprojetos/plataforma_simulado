import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Upload } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const classificacaoConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  passaporte: { label: 'Passaporte', variant: 'default' },
  normal: { label: 'Normal', variant: 'secondary' },
}

export default async function EstudantesPage() {
  const supabase = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  const { data: estudantes } = await supabase
    .from('simulado_estudantes')
    .select('id, nome, email, cpf, telefone, classificacao, matricula_externa, created_at')
    .eq('tenant_id', tenantId ?? '')
    .order('created_at', { ascending: false })
    .limit(100)

  function formatDate(date: string | null) {
    if (!date) return '—'
    return format(new Date(date), 'dd/MM/yyyy', { locale: ptBR })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estudantes</h1>
          <p className="text-muted-foreground">
            {estudantes?.length ?? 0} estudantes cadastrados
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Importar CSV
          </Button>
          <Link href="/admin/estudantes/novo" className={buttonVariants()}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Estudante
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listagem</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Classificação</TableHead>
                <TableHead>Cadastrado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!estudantes || estudantes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum estudante cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                estudantes.map((e) => {
                  const classCfg = classificacaoConfig[e.classificacao ?? ''] ?? { label: e.classificacao ?? '—', variant: 'outline' as const }

                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.nome}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {e.email}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {e.cpf ?? '—'}
                      </TableCell>
                      <TableCell>
                        {e.classificacao ? (
                          <Badge variant={classCfg.variant}>{classCfg.label}</Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(e.created_at)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
