import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
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
import { Plus, Pencil } from 'lucide-react'
import { QuestoesFilters } from '@/components/admin/questoes-filters'
import { PaginationControls } from '@/components/admin/pagination-controls'

const ITEMS_PER_PAGE = 20

interface PageProps {
  searchParams: Promise<{
    page?: string
    q?: string
    disciplina?: string
    status?: string
  }>
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ativa: { label: 'Ativa', variant: 'default' },
  rascunho: { label: 'Rascunho', variant: 'outline' },
  arquivada: { label: 'Arquivada', variant: 'secondary' },
}

export default async function QuestoesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Number(params.page ?? 1)
  const q = params.q ?? ''
  const status = params.status ?? ''

  const supabase = await createServiceClient()

  let query = supabase
    .from('questoes')
    .select('id, enunciado, status, tipo, disciplina, area, dificuldade', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1)

  if (q) {
    query = query.ilike('enunciado', `%${q}%`)
  }
  if (status) {
    query = query.eq('status', status)
  }

  const { data: questoes, count } = await query
  const totalPages = Math.ceil((count ?? 0) / ITEMS_PER_PAGE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Questões</h1>
          <p className="text-muted-foreground">
            {count ?? 0} questões cadastradas
          </p>
        </div>
        <Button render={<Link href="/admin/questoes/nova" />}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Questão
        </Button>
      </div>

      <QuestoesFilters />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listagem</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">ID</TableHead>
                <TableHead>Enunciado</TableHead>
                <TableHead>Disciplina</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!questoes || questoes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma questão encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                questoes.map((q) => {
                  const cfg = statusConfig[q.status ?? 'ativa'] ?? statusConfig.ativa
                  const enunciado = q.enunciado ?? ''
                  const preview = enunciado.length > 80
                    ? enunciado.slice(0, 80) + '…'
                    : enunciado

                  return (
                    <TableRow key={q.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {q.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-sm line-clamp-2">{preview}</p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {q.disciplina ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {q.area ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {q.tipo ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" render={<Link href={`/admin/questoes/${q.id}/editar`} />}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
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
