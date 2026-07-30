import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Card, CardContent } from '@/components/ui/card'
import { SecaoHeader } from '@/components/admin/secao-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DownloadCloud, AlertTriangle, Users, FileDown } from 'lucide-react'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const VAZIO = '00000000-0000-0000-0000-000000000000'

export default async function CadernosBaixadosPage({ searchParams }: { searchParams: Promise<{ sim?: string }> }) {
  const { sim } = await searchParams
  const svc = createAdminClient()
  const tid = (await getCurrentTenantId()) ?? VAZIO

  // Downloads de caderno (tipo 'baixou' vem do /api/aluno/caderno-pdf e /api/pdf/gerar).
  const { data: evAll } = await svc
    .from('simulado_relatorio_eventos')
    .select('id, simulado_id, estudante_id, sessao_id, criado_em')
    .eq('tenant_id', tid).eq('tipo', 'baixou')
    .order('criado_em', { ascending: false, nullsFirst: false })
    .limit(1000)
  const eventos = evAll ?? []

  // Simulados com download → opções do filtro.
  const simIdsAll = [...new Set(eventos.map((e: any) => e.simulado_id).filter(Boolean))] as string[]
  const { data: simsAll } = simIdsAll.length
    ? await svc.from('simulado_simulados').select('id, titulo').in('id', simIdsAll)
    : { data: [] as { id: string; titulo: string }[] }
  const simTitulo = new Map((simsAll ?? []).map((s: any) => [s.id, s.titulo]))

  const filtrados = sim ? eventos.filter((e: any) => e.simulado_id === sim) : eventos

  // Início da sessão (para comparar com o horário do download) + nomes dos estudantes.
  const sessIds = [...new Set(filtrados.map((e: any) => e.sessao_id).filter(Boolean))] as string[]
  const { data: sess } = sessIds.length
    ? await svc.from('simulado_sessoes_prova').select('id, iniciado_em').in('id', sessIds)
    : { data: [] as { id: string; iniciado_em: string | null }[] }
  const inicioSessao = new Map((sess ?? []).map((s: any) => [s.id, s.iniciado_em]))

  const estIds = [...new Set(filtrados.map((e: any) => e.estudante_id).filter(Boolean))] as string[]
  const { data: ests } = estIds.length
    ? await svc.from('simulado_estudantes').select('id, nome, email').in('id', estIds)
    : { data: [] as { id: string; nome: string; email: string | null }[] }
  const estMap = new Map((ests ?? []).map((e: any) => [e.id, { nome: e.nome, email: e.email }]))

  const linhas = filtrados.map((e: any) => {
    const iniciou = e.sessao_id ? inicioSessao.get(e.sessao_id) ?? null : null
    // "Antes de iniciar": não havia sessão iniciada, ou o download veio antes do início.
    const antes = !iniciou || (!!e.criado_em && new Date(e.criado_em) < new Date(iniciou))
    return { id: e.id, simulado_id: e.simulado_id, estudante_id: e.estudante_id, criado_em: e.criado_em, iniciou, antes, est: estMap.get(e.estudante_id) as { nome: string; email: string | null } | undefined }
  })

  const antesCount = linhas.filter((l) => l.antes).length
  const alunosDistintos = new Set(linhas.map((l) => l.estudante_id).filter(Boolean)).size

  const kpis = [
    { label: 'Downloads de caderno', valor: linhas.length, icon: FileDown, tom: 'bg-primary/10 text-primary' },
    { label: 'Baixaram ANTES de iniciar', valor: antesCount, icon: AlertTriangle, tom: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
    { label: 'Estudantes distintos', valor: alunosDistintos, icon: Users, tom: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cadernos baixados</h1>
        <p className="text-muted-foreground">Quem baixou o caderno e se o download foi <b>antes</b> ou depois de iniciar a prova.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', k.tom)}><k.icon className="h-5 w-5" /></span>
            <div><p className="text-xs text-muted-foreground">{k.label}</p><p className="text-xl font-bold tabular-nums">{k.valor.toLocaleString('pt-BR')}</p></div>
          </div>
        ))}
      </div>

      {/* Filtro por simulado (form GET — sem JS) */}
      <form className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm">
        <label className="pl-1 text-sm text-muted-foreground">Simulado:</label>
        <select name="sim" defaultValue={sim ?? ''} className="h-9 min-w-[240px] flex-1 rounded-lg border bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring">
          <option value="">Todos os simulados</option>
          {simIdsAll.map((id) => <option key={id} value={id}>{simTitulo.get(id) ?? '—'}</option>)}
        </select>
        <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">Filtrar</button>
      </form>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={DownloadCloud} titulo="Downloads de caderno" subtitulo={`${linhas.length} download(s) · ${antesCount} antes de iniciar`} />
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full table-fixed text-sm [&_td]:py-2 [&_th]:h-9">
              <colgroup><col style={{ width: '28%' }} /><col style={{ width: '26%' }} /><col style={{ width: '17%' }} /><col style={{ width: '17%' }} /><col style={{ width: '12%' }} /></colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>Estudante</TableHead>
                  <TableHead>Simulado</TableHead>
                  <TableHead>Baixou em</TableHead>
                  <TableHead>Iniciou em</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum download de caderno registrado ainda.</TableCell></TableRow>
                ) : linhas.map((l) => (
                  <TableRow key={l.id} className={cn(l.antes && 'bg-amber-50/50 dark:bg-amber-950/10')}>
                    <TableCell className="truncate" title={l.est?.nome}>
                      <span className="font-medium">{l.est?.nome ?? '—'}</span>
                      {l.est?.email && <span className="block truncate text-xs text-muted-foreground">{l.est.email}</span>}
                    </TableCell>
                    <TableCell className="truncate text-sm" title={simTitulo.get(l.simulado_id) ?? undefined}>{simTitulo.get(l.simulado_id) ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatBrt(l.criado_em) ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{l.iniciou ? formatBrt(l.iniciou) : '—'}</TableCell>
                    <TableCell>
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium',
                        l.antes ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-muted text-muted-foreground')}>
                        {l.antes ? 'Antes de iniciar' : 'Após iniciar'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
