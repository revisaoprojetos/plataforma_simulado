import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MatriculasFilters } from '@/components/admin/matriculas-filters'
import { MatriculaActions } from '@/components/admin/matricula-actions'
import { PaginationControls } from '@/components/admin/pagination-controls'

const ITEMS_PER_PAGE = 30

interface PageProps {
  searchParams: Promise<{ page?: string; liberado?: string; estudante_id?: string }>
}

export default async function MatriculasPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Number(params.page ?? 1)
  const supabase = await createServiceClient()

  const offset = (page - 1) * ITEMS_PER_PAGE

  let query = supabase
    .from('matriculas')
    .select(
      'id, liberado, created_at, estudante_id, simulado_id, estudantes(nome, email), simulados(titulo)',
      { count: 'exact' },
    )
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
        <Button render={<Link href="/admin/matriculas/nova" />}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Matrícula
        </Button>
      </div>

      <MatriculasFilters />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listagem</CardTitle>
        </CardHeader>
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
