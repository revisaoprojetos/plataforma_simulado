import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Upload } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ExcluirEstudanteButton } from '@/components/admin/excluir-estudante-button'
import { SecaoHeader } from '@/components/admin/secao-header'
import { GraduationCap } from 'lucide-react'

export default async function EstudantesPage() {
  const supabase = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  const { data: estudantes } = await supabase
    .from('simulado_estudantes')
    .select('id, nome, email, cpf, telefone, classificacao, matricula_externa, created_at')
    .eq('deletado', false)
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

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={GraduationCap} titulo="Estudantes" subtitulo={`${estudantes?.length ?? 0} cadastrado(s)`} />
        <CardContent className="p-0">
          <div className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Classificação</TableHead>
                <TableHead>Cadastrado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!estudantes || estudantes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum estudante cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                estudantes.map((e) => {
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">
                        <Link href={`/admin/estudantes/${e.id}`} className="text-primary hover:underline">
                          {e.nome}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {e.email}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {e.cpf ?? '—'}
                      </TableCell>
                      <TableCell>
                        <ClassificacaoBadge classificacao={e.classificacao} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(e.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ExcluirEstudanteButton id={e.id} nome={e.nome} />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
