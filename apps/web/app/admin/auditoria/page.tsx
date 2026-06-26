import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AuditoriaFilters } from '@/components/admin/auditoria-filters'
import { AuditoriaDiff } from '@/components/admin/auditoria-diff'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PaginationControls } from '@/components/admin/pagination-controls'

const ITEMS_PER_PAGE = 30

interface PageProps {
  searchParams: Promise<{
    page?: string
    acao?: string
    entidade?: string
    data_inicio?: string
    data_fim?: string
  }>
}

const acaoVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  INSERT: 'default',
  UPDATE: 'secondary',
  DELETE: 'destructive',
  LOGIN: 'outline',
  LOGOUT: 'outline',
  ANULAR: 'destructive',
  RECORRIGIR: 'secondary',
  LIBERAR: 'default',
}

export default async function AuditoriaPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Number(params.page ?? 1)
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()

  const offset = (page - 1) * ITEMS_PER_PAGE

  let query = supabase
    .from('simulado_audit_logs')
    .select('id, ator_tipo, ator_id, operacao, entidade, entidade_id, dados_anteriores, dados_novos, detalhes, ip, user_agent, criado_em', { count: 'exact' })
    .eq('tenant_id', tenantId ?? '')
    .order('criado_em', { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1)

  if (params.acao) query = query.eq('operacao', params.acao)
  if (params.entidade) query = query.ilike('entidade', `%${params.entidade}%`)
  if (params.data_inicio) query = query.gte('criado_em', params.data_inicio)
  if (params.data_fim) query = query.lte('criado_em', params.data_fim + 'T23:59:59Z')

  const { data: logs, count } = await query
  const totalPages = Math.ceil((count ?? 0) / ITEMS_PER_PAGE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auditoria</h1>
        <p className="text-muted-foreground">
          Registro imutável de todas as ações — {count ?? 0} entradas
        </p>
      </div>

      <AuditoriaFilters />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registros</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Ator</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead className="w-[80px]">Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!logs || logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum registro encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.criado_em), "dd/MM/yy 'às' HH:mm:ss", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={acaoVariant[log.operacao] ?? 'outline'}>
                          {log.operacao}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.entidade}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="font-medium">{log.ator_tipo}</span>
                        {log.ator_id && (
                          <span className="ml-1 font-mono opacity-60">
                            {String(log.ator_id).slice(0, 8)}…
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.ip ? String(log.ip) : '—'}
                      </TableCell>
                      <TableCell>
                        {(log.dados_anteriores || log.dados_novos || log.detalhes) && (
                          <AuditoriaDiff
                            antes={(log.dados_anteriores as Record<string, unknown> | null) ?? ((log.detalhes as Record<string, unknown>)?.antes as Record<string, unknown> | null)}
                            depois={(log.dados_novos as Record<string, unknown> | null) ?? ((log.detalhes as Record<string, unknown>)?.depois as Record<string, unknown> | null)}
                            raw={(log.detalhes as Record<string, unknown>) ?? {}}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PaginationControls page={page} totalPages={totalPages} />
    </div>
  )
}
