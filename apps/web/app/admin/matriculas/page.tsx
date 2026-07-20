import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, GraduationCap } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MatriculasFilters } from '@/components/admin/matriculas-filters'
import { MatriculaActions } from '@/components/admin/matricula-actions'
import { PaginationControls } from '@/components/admin/pagination-controls'
import { ExportMatriculasButton } from '@/components/admin/export-matriculas-button'
import { SecaoHeader } from '@/components/admin/secao-header'

const ITEMS_PER_PAGE = 30

interface PageProps {
  searchParams: Promise<{ page?: string; liberado?: string; estudante_id?: string }>
}

export default async function MatriculasPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Number(params.page ?? 1)
  const supabase = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  const offset = (page - 1) * ITEMS_PER_PAGE

  let query = supabase
    .from('simulado_matriculas')
    .select(
      'id, liberado, created_at, estudante_id, simulado_id, estudantes:simulado_estudantes(nome, email), simulados:simulado_simulados(titulo)',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
    .order('created_at', { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1)

  if (params.liberado === 'true') query = query.eq('liberado', true)
  if (params.liberado === 'false') query = query.eq('liberado', false)
  if (params.estudante_id) query = query.eq('estudante_id', params.estudante_id)

  const { data: matriculas, count } = await query
  const totalPages = Math.ceil((count ?? 0) / ITEMS_PER_PAGE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Matrículas</h1>
          <p className="text-muted-foreground">
            {count ?? 0} matrículas registradas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMatriculasButton filtros={{ liberado: params.liberado, estudante_id: params.estudante_id }} />
          <Link href="/admin/matriculas/nova" className={buttonVariants()}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Matrícula
          </Link>
        </div>
      </div>

      <MatriculasFilters />

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={GraduationCap} titulo="Matrículas" subtitulo={`${count ?? 0} registrada(s)`} />
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estudante</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Simulado</TableHead>
                <TableHead>Acesso</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!matriculas || matriculas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhuma matrícula encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                matriculas.map((m) => {
                  const estudante = m.estudantes as { nome?: string; email?: string } | null
                  const simulado = m.simulados as { titulo?: string } | null
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{estudante?.nome ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{estudante?.email ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {simulado?.titulo ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.liberado ? 'default' : 'secondary'}>
                          {m.liberado ? 'Liberado' : 'Bloqueado'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(m.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <MatriculaActions matriculaId={m.id} liberado={m.liberado} />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PaginationControls page={page} totalPages={totalPages} />
    </div>
  )
}
