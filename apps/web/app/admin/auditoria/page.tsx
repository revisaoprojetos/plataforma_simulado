import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SecaoHeader } from '@/components/admin/secao-header'
import { ScrollText } from 'lucide-react'
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
    tipo?: string
    acao?: string
    entidade?: string
    data_inicio?: string
    data_fim?: string
  }>
}

// Acessos = entradas/saídas/bloqueios; Modificações = mutações de dados.
const ACESSO_OPS = ['LOGIN', 'LOGOUT', 'BLOQUEIO_AUTOMATICO']
const MODIFICACAO_OPS = ['INSERT', 'UPDATE', 'DELETE', 'LIBERAR', 'BLOQUEAR', 'ANULAR', 'RECORRIGIR']

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

const isUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/** Resumo humano de um evento de automação (integração/import/sync). `nomes` resolve id→nome. */
function resumoAutomacao(log: any, nomes: Map<string, string>): { origem: string; texto: string } {
  const d = (log.dados_novos ?? (log.detalhes as any)?.depois ?? {}) as any
  const alvo = isUuid(log.entidade_id) ? (nomes.get(log.entidade_id) ?? `${String(log.entidade_id).slice(0, 8)}…`) : null
  if (log.entidade === 'simulado_assinaturas') {
    const prov = d.provider ? String(d.provider) : 'integração'
    const acao = log.operacao === 'LIBERAR' ? 'liberou acesso' : 'cancelou acesso'
    return { origem: prov.charAt(0).toUpperCase() + prov.slice(1), texto: `${acao}${alvo ? ` de ${alvo}` : ''} — produto ${d.produto ?? '?'} (status ${d.status ?? '?'})` }
  }
  if (log.entidade === 'simulado_estudantes') {
    const canais = Array.isArray(d.curseduca_grupos) ? d.curseduca_grupos : []
    return { origem: 'Curseduca', texto: `Importação: ${d.novos ?? 0} novo(s) · ${d.jaExistiam ?? 0} já existia(m)${d.vinculados ? ` · ${d.vinculados} vinculado(s)` : ''}${d.removidos ? ` · ${d.removidos} removido(s)` : ''}${alvo ? ` → grupo ${alvo}` : ''}${canais.length ? ` · canais [${canais.join(', ')}]` : ''}` }
  }
  if (log.entidade === 'simulado_curseduca_sync') {
    return { origem: 'Sincronização', texto: `Sync automática ${d.ativo ? 'ligada' : 'desligada'}${d.intervaloMin ? ` · a cada ${d.intervaloMin} min` : ''}${d.grupos != null ? ` · ${d.grupos} grupo(s)` : ''}` }
  }
  return { origem: '—', texto: log.operacao }
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
    .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
    .order('criado_em', { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1)

  const tipo = params.tipo === 'acessos' ? 'acessos' : params.tipo === 'modificacoes' ? 'modificacoes' : params.tipo === 'automacoes' ? 'automacoes' : 'todos'
  const ehAuto = tipo === 'automacoes'
  if (tipo === 'acessos') query = query.in('operacao', ACESSO_OPS)
  else if (tipo === 'modificacoes') query = query.in('operacao', MODIFICACAO_OPS)
  else if (ehAuto) query = query.or('entidade.eq.simulado_assinaturas,entidade.eq.simulado_curseduca_sync,and(entidade.eq.simulado_estudantes,dados_novos->curseduca_grupos.not.is.null)')
  if (params.acao) query = query.eq('operacao', params.acao)
  if (params.entidade) query = query.ilike('entidade', `%${params.entidade}%`)
  if (params.data_inicio) query = query.gte('criado_em', params.data_inicio)
  if (params.data_fim) query = query.lte('criado_em', params.data_fim + 'T23:59:59Z')

  const { data: logs, count } = await query
  const totalPages = Math.ceil((count ?? 0) / ITEMS_PER_PAGE)

  // Automações: resolve os nomes (grupo destino / aluno) dos entidade_id da página.
  const nomes = new Map<string, string>()
  if (ehAuto && logs?.length) {
    const grupoIds = [...new Set(logs.filter((l) => l.entidade === 'simulado_estudantes' && isUuid(l.entidade_id)).map((l) => l.entidade_id as string))]
    const estIds = [...new Set(logs.filter((l) => l.entidade === 'simulado_assinaturas' && isUuid(l.entidade_id)).map((l) => l.entidade_id as string))]
    if (grupoIds.length) { const { data } = await supabase.from('simulado_grupos').select('id, nome').in('id', grupoIds); for (const g of data ?? []) nomes.set((g as any).id, (g as any).nome) }
    if (estIds.length) { const { data } = await supabase.from('simulado_estudantes').select('id, nome').in('id', estIds); for (const e of data ?? []) nomes.set((e as any).id, (e as any).nome) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {tipo === 'acessos' ? 'Auditoria · Acessos' : tipo === 'modificacoes' ? 'Auditoria · Modificações' : ehAuto ? 'Auditoria · Automações' : 'Auditoria'}
        </h1>
        <p className="text-muted-foreground">
          {tipo === 'acessos'
            ? 'Entradas, saídas e bloqueios automáticos'
            : tipo === 'modificacoes'
              ? 'Criações, edições, exclusões, liberações e anulações'
              : ehAuto
                ? 'Tudo que as integrações fizeram sozinhas: importações Curseduca, liberações/cancelamentos Guru e sincronizações'
                : 'Registro imutável de todas as ações'}{' '}
          — {count ?? 0} entradas
        </p>
      </div>

      <AuditoriaFilters />

      {ehAuto && (
        <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
          <SecaoHeader icon={ScrollText} titulo="Automações" subtitulo={`${count ?? 0} evento(s)`} />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>O que aconteceu</TableHead>
                    <TableHead className="w-[80px]">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!logs || logs.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhuma automação registrada ainda.</TableCell></TableRow>
                  ) : logs.map((log) => {
                    const r = resumoAutomacao(log, nomes)
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{format(new Date(log.criado_em), "dd/MM/yy 'às' HH:mm:ss", { locale: ptBR })}</TableCell>
                        <TableCell><Badge variant={log.operacao === 'BLOQUEAR' ? 'destructive' : 'default'}>{r.origem}</Badge></TableCell>
                        <TableCell className="text-sm">{r.texto}</TableCell>
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
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!ehAuto && (
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={ScrollText} titulo="Registros" subtitulo={`${count ?? 0} entrada(s)`} />
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
      )}

      <PaginationControls page={page} totalPages={totalPages} />
    </div>
  )
}
