import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Eye } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { SimuladosFilters } from '@/components/admin/simulados-filters'

interface PageProps {
  searchParams: Promise<{
    status?: string
  }>
}

const statusConfig: Record<string, { label: string; class: string }> = {
  rascunho: { label: 'Rascunho', class: 'bg-muted text-muted-foreground' },
  publicado: { label: 'Publicado', class: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  encerrado: { label: 'Encerrado', class: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  ativo: { label: 'Ativo', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
}

export default async function SimuladosPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createServiceClient()

  let query = supabase
    .from('simulados')
    .select('id, titulo, status, data_inicio, data_fim, duracao_minutos, tipo, created_at')
    .order('created_at', { ascending: false })

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status)
  }

  const { data: simulados } = await query

  function formatDate(date: string | null) {
    if (!date) return '—'
    return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulados</h1>
          <p className="text-muted-foreground">
            {simulados?.length ?? 0} simulados cadastrados
          </p>
        </div>
        <Button render={<Link href="/admin/simulados/novo" />}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Simulado
        </Button>
      </div>

      <SimuladosFilters />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listagem</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!simulados || simulados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum simulado encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                simulados.map((s) => {
                  const statusCfg = statusConfig[s.status ?? 'rascunho'] ?? statusConfig.rascunho

                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.titulo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">
                        {s.tipo ?? '—'}
                      </TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.class}`}>
                          {statusCfg.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(s.data_inicio)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(s.data_fim)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" render={<Link href={`/admin/simulados/${s.id}`} />}>
                          <Eye className="h-3.5 w-3.5" />
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
    </div>
  )
}
