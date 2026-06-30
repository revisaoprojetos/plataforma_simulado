import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Mail, Phone, IdCard, Calendar, FolderOpen, User, ListChecks, ClipboardList, FileText, FileCheck2 } from 'lucide-react'
import { SessaoAcoesMenu } from '@/components/admin/sessao-acoes-menu'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function fmt(d: string | null) {
  return d ? format(new Date(d), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'
}
function fmtData(d: string | null) {
  return d ? format(new Date(d), 'dd/MM/yyyy', { locale: ptBR }) : '—'
}

function iconeModalidade(nome: string) {
  const n = (nome ?? '').toLowerCase()
  if (n.includes('diagn')) return ClipboardList
  if (n.includes('discursiv')) return FileText
  if (n.includes('gabarito') || n.includes('objetiv')) return FileCheck2
  return ListChecks
}

const statusCfg: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  finalizada: { label: 'Finalizada', variant: 'default' },
  em_andamento: { label: 'Em andamento', variant: 'secondary' },
  aguardando: { label: 'Aguardando', variant: 'outline' },
}

export default async function EstudantePerfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const { data: est } = await svc
    .from('simulado_estudantes')
    .select('id, nome, email, cpf, telefone, data_nascimento, classificacao, matricula_externa, created_at')
    .eq('id', id)
    .eq('tenant_id', tenantId ?? '')
    .maybeSingle()
  if (!est) notFound()

  // Histórico de simulados (sessões) do aluno.
  const { data: sessoes } = await svc
    .from('simulado_sessoes_prova')
    .select('id, status, nota, posicao_ranking, iniciado_em, finalizado_em, tentativa_num, is_teste, simulado_id, simulados:simulado_simulados(titulo)')
    .eq('estudante_id', id)
    .eq('deletado', false)
    .order('iniciado_em', { ascending: false })

  // Acertos / total por sessão.
  const sessIds = (sessoes ?? []).map((s: any) => s.id)
  const acertos = new Map<string, number>()
  const totais = new Map<string, number>()
  if (sessIds.length) {
    const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, correta').in('sessao_id', sessIds)
    for (const r of resp ?? []) {
      const sid = (r as any).sessao_id
      totais.set(sid, (totais.get(sid) ?? 0) + 1)
      if ((r as any).correta) acertos.set(sid, (acertos.get(sid) ?? 0) + 1)
    }
  }

  // Bancos vinculados (tolerante caso a tabela não exista).
  let bancos: { id: string; nome: string }[] = []
  const { data: pe, error: peErr } = await svc.from('simulado_pasta_estudantes').select('pasta_id').eq('estudante_id', id)
  if (!peErr && pe?.length) {
    const ids = pe.map((p: any) => p.pasta_id)
    const { data } = await svc.from('simulado_pastas').select('id, nome').in('id', ids)
    bancos = (data ?? []) as any
  }

  const classLabel = est.classificacao === 'passaporte' ? 'Passaporte' : est.classificacao === 'normal' ? 'Normal' : (est.classificacao ?? '—')
  const reais = (sessoes ?? []).filter((s: any) => !s.is_teste)

  // Caderno (modelo) vinculado ao banco de cada simulado → para a coluna Ação.
  // simulado → questões (prova_questoes) → bancos (questao_pasta) → pastas.caderno_id.
  const simIds = [...new Set(reais.map((s: any) => s.simulado_id).filter(Boolean))] as string[]
  const cadernoPorSim = new Map<string, string>()
  const modsPorCad = new Map<string, { id: string; nome: string }[]>()
  if (simIds.length) {
    const { data: pq } = await svc.from('simulado_prova_questoes').select('simulado_id, questao_id').in('simulado_id', simIds)
    const qPorSim = new Map<string, string[]>()
    for (const r of pq ?? []) { const arr = qPorSim.get((r as any).simulado_id) ?? []; arr.push((r as any).questao_id); qPorSim.set((r as any).simulado_id, arr) }
    const allQ = [...new Set((pq ?? []).map((r: any) => r.questao_id))]
    if (allQ.length) {
      const { data: qp } = await svc.from('simulado_questao_pasta').select('questao_id, pasta_id').in('questao_id', allQ)
      const pastaIds = [...new Set((qp ?? []).map((r: any) => r.pasta_id))]
      const { data: pastas } = pastaIds.length ? await svc.from('simulado_pastas').select('id, caderno_id').in('id', pastaIds) : { data: [] as any[] }
      const cadernoDaPasta = new Map<string, string>((pastas ?? []).filter((p: any) => p.caderno_id).map((p: any) => [p.id, p.caderno_id]))
      const pastasPorQ = new Map<string, string[]>()
      for (const r of qp ?? []) { const arr = pastasPorQ.get((r as any).questao_id) ?? []; arr.push((r as any).pasta_id); pastasPorQ.set((r as any).questao_id, arr) }
      // para cada simulado, o banco (com caderno) que mais cobre suas questões.
      for (const [sim, qs] of qPorSim) {
        const cont = new Map<string, number>()
        for (const q of qs) for (const p of pastasPorQ.get(q) ?? []) if (cadernoDaPasta.has(p)) cont.set(p, (cont.get(p) ?? 0) + 1)
        const melhor = [...cont.entries()].sort((a, b) => b[1] - a[1])[0]
        if (melhor) cadernoPorSim.set(sim, cadernoDaPasta.get(melhor[0])!)
      }
      // modalidades dos cadernos encontrados.
      const cadIds = [...new Set([...cadernoPorSim.values()])]
      if (cadIds.length) {
        const { data: cads } = await svc.from('simulado_cadernos_designer').select('id, config').in('id', cadIds)
        for (const c of cads ?? []) modsPorCad.set((c as any).id, (c as any).config?.modalidadesV2 ?? [{ id: 'gabarito_objetivo', nome: 'Gabarito' }])
      }
    }
  }

  const Info = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate text-sm font-medium">{value}</p></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/estudantes" className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{est.nome}</h1>
            <p className="text-muted-foreground">{est.email}</p>
          </div>
        </div>
      </div>

      {/* Dados do aluno */}
      <Card>
        <CardHeader><CardTitle className="text-base">Informações</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info icon={Mail} label="E-mail" value={est.email ?? '—'} />
          <Info icon={Phone} label="Telefone" value={est.telefone ?? '—'} />
          <Info icon={IdCard} label="CPF" value={est.cpf ?? '—'} />
          <Info icon={Calendar} label="Nascimento" value={fmtData(est.data_nascimento)} />
          <Info icon={IdCard} label="Matrícula externa" value={est.matricula_externa ?? '—'} />
          <Info icon={User} label="Classificação" value={classLabel} />
          <Info icon={Calendar} label="Cadastrado em" value={fmtData(est.created_at)} />
        </CardContent>
      </Card>

      {/* Bancos vinculados */}
      <Card>
        <CardHeader><CardTitle className="text-base">Bancos vinculados ({bancos.length})</CardTitle></CardHeader>
        <CardContent>
          {bancos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Não vinculado a nenhum banco.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {bancos.map((b) => (
                <Link key={b.id} href={`/admin/banco-questoes/${b.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-sm hover:border-primary">
                  <FolderOpen className="h-3.5 w-3.5 text-primary" /> {b.nome}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico de simulados */}
      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de simulados ({reais.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {reais.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum simulado realizado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Simulado</TableHead>
                  <TableHead>Tentativa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Acertos</TableHead>
                  <TableHead className="text-center">Nota</TableHead>
                  <TableHead className="text-center">Posição</TableHead>
                  <TableHead>Finalizado em</TableHead>
                  <TableHead className="text-center">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reais.map((s: any) => {
                  const cfg = statusCfg[s.status] ?? { label: s.status, variant: 'outline' as const }
                  const ac = acertos.get(s.id) ?? 0
                  const tt = totais.get(s.id) ?? 0
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.simulados?.titulo ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.tentativa_num ?? 1}ª</TableCell>
                      <TableCell><Badge variant={cfg.variant}>{cfg.label}</Badge></TableCell>
                      <TableCell className="text-center text-sm">{tt > 0 ? `${ac}/${tt}` : '—'}</TableCell>
                      <TableCell className="text-center font-semibold">{s.nota != null ? Number(s.nota).toFixed(1) : '—'}</TableCell>
                      <TableCell className="text-center text-sm">{s.posicao_ranking ? `${s.posicao_ranking}º` : '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmt(s.finalizado_em)}</TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const cadId = cadernoPorSim.get(s.simulado_id) ?? null
                          const mods = cadId ? modsPorCad.get(cadId) ?? [] : []
                          return (
                            <div className="flex justify-center">
                              <SessaoAcoesMenu cadId={cadId} mods={mods} estudanteId={id} sessaoId={s.id} simuladoId={s.simulado_id} temResultado={tt > 0} />
                            </div>
                          )
                        })()}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
