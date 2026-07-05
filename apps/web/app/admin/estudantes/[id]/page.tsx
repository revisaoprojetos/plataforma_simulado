import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { ArrowLeft, Mail, Phone, IdCard, Calendar, FolderOpen, User, ListChecks, ClipboardList, FileText, FileCheck2, Star, Trophy, Target, GraduationCap, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HistoricoEstudante, type SessaoRow } from '@/components/admin/historico-estudante'
import { EditarEstudanteButton } from '@/components/admin/editar-estudante-button'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'
import type { GrupoBanco } from '@/app/admin/banco-questoes/actions'
import { mesclarModalidades } from '@/lib/caderno-designer/types'
import { tipoDoSimulado, filtrarModsPorTipo, type TipoSimulado } from '@/lib/simulado/tipo'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function fmt(d: string | null) {
  return d ? format(new Date(d), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'
}
function fmtData(d: string | null) {
  return d ? format(new Date(d), 'dd/MM/yyyy', { locale: ptBR }) : '—'
}
function fmtDur(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`
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
  let respAll: { sessao_id: string; questao_id: string; correta: boolean }[] = []
  if (sessIds.length) {
    const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', sessIds)
    respAll = (resp ?? []) as any
    for (const r of respAll) {
      totais.set(r.sessao_id, (totais.get(r.sessao_id) ?? 0) + 1)
      if (r.correta) acertos.set(r.sessao_id, (acertos.get(r.sessao_id) ?? 0) + 1)
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
  const tipoSimPorSim = new Map<string, TipoSimulado | null>()  // objetiva/discursiva/mista
  const pastaPorSim = new Map<string, string>()                 // banco que mais cobre o simulado
  const gruposPorPasta = new Map<string, GrupoBanco[]>()        // grupos de disciplinas por banco
  if (simIds.length) {
    const { data: pq } = await svc.from('simulado_prova_questoes').select('simulado_id, questao_id').in('simulado_id', simIds)
    const qPorSim = new Map<string, string[]>()
    for (const r of pq ?? []) { const arr = qPorSim.get((r as any).simulado_id) ?? []; arr.push((r as any).questao_id); qPorSim.set((r as any).simulado_id, arr) }
    const allQ = [...new Set((pq ?? []).map((r: any) => r.questao_id))]
    if (allQ.length) {
      // Tipo de cada questão → tipo de cada simulado (para o selo e o filtro de cadernos).
      const tipoDeQ = new Map<string, string>()
      const { data: qTipos } = await svc.from('simulado_questoes').select('id, tipo').in('id', allQ)
      for (const q of qTipos ?? []) tipoDeQ.set((q as any).id, (q as any).tipo)
      for (const [sim, qs] of qPorSim) tipoSimPorSim.set(sim, tipoDoSimulado(qs.map((q) => tipoDeQ.get(q))))
      const { data: qp } = await svc.from('simulado_questao_pasta').select('questao_id, pasta_id').in('questao_id', allQ)
      const pastaIds = [...new Set((qp ?? []).map((r: any) => r.pasta_id))]
      const { data: pastas } = pastaIds.length ? await svc.from('simulado_pastas').select('id, caderno_id').in('id', pastaIds) : { data: [] as any[] }
      const cadernoDaPasta = new Map<string, string>((pastas ?? []).filter((p: any) => p.caderno_id).map((p: any) => [p.id, p.caderno_id]))
      const pastasPorQ = new Map<string, string[]>()
      for (const r of qp ?? []) { const arr = pastasPorQ.get((r as any).questao_id) ?? []; arr.push((r as any).pasta_id); pastasPorQ.set((r as any).questao_id, arr) }
      // para cada simulado: o banco (com caderno) e o banco (qualquer) que mais cobrem suas questões.
      for (const [sim, qs] of qPorSim) {
        const contCad = new Map<string, number>(), contAny = new Map<string, number>()
        for (const q of qs) for (const p of pastasPorQ.get(q) ?? []) {
          contAny.set(p, (contAny.get(p) ?? 0) + 1)
          if (cadernoDaPasta.has(p)) contCad.set(p, (contCad.get(p) ?? 0) + 1)
        }
        const melhorCad = [...contCad.entries()].sort((a, b) => b[1] - a[1])[0]
        if (melhorCad) cadernoPorSim.set(sim, cadernoDaPasta.get(melhorCad[0])!)
        const melhorAny = [...contAny.entries()].sort((a, b) => b[1] - a[1])[0]
        if (melhorAny) pastaPorSim.set(sim, melhorAny[0])
      }
      // modalidades dos cadernos encontrados.
      const cadIds = [...new Set([...cadernoPorSim.values()])]
      if (cadIds.length) {
        const { data: cads } = await svc.from('simulado_cadernos_designer').select('id, config').in('id', cadIds)
        for (const c of cads ?? []) modsPorCad.set((c as any).id, mesclarModalidades((c as any).config?.modalidadesV2))
      }
      // grupos de disciplinas das pastas usadas (tolerante: coluna pode não existir).
      const pastasUsadas = [...new Set([...pastaPorSim.values()])]
      if (pastasUsadas.length) {
        const { data: gRows, error: gErr } = await svc.from('simulado_pastas').select('id, grupos').in('id', pastasUsadas)
        if (!gErr) for (const p of gRows ?? []) if (Array.isArray((p as any).grupos)) gruposPorPasta.set((p as any).id, (p as any).grupos)
      }
    }
  }

  // ── Métricas do histórico (funções de resumo) ──
  const notas = reais.filter((s: any) => s.nota != null).map((s: any) => Number(s.nota))
  const notaMedia = notas.length ? notas.reduce((a: number, b: number) => a + b, 0) / notas.length : null
  const melhorNota = notas.length ? Math.max(...notas) : null
  let somaAc = 0, somaTt = 0
  for (const s of reais) { const tt = totais.get(s.id) ?? 0; if (tt > 0) { somaAc += acertos.get(s.id) ?? 0; somaTt += tt } }
  const acertoMedio = somaTt > 0 ? Math.round((somaAc / somaTt) * 100) : null

  // ── Breakdown por disciplina + tempo, por sessão (detalhe expansível) ──
  const discPorQ = new Map<string, string>()
  const qIds = [...new Set(respAll.map((r) => r.questao_id).filter(Boolean))]
  if (qIds.length) {
    const { data: qs } = await svc.from('simulado_questoes').select('id, disciplinas:simulado_disciplinas(nome)').in('id', qIds)
    for (const q of qs ?? []) discPorQ.set((q as any).id, (q as any).disciplinas?.nome ?? 'Sem disciplina')
  }
  const discPorSessao = new Map<string, Map<string, { ac: number; tt: number }>>()
  for (const r of respAll) {
    const nome = discPorQ.get(r.questao_id) ?? 'Sem disciplina'
    let m = discPorSessao.get(r.sessao_id); if (!m) { m = new Map(); discPorSessao.set(r.sessao_id, m) }
    const cur = m.get(nome) ?? { ac: 0, tt: 0 }; cur.tt++; if (r.correta) cur.ac++; m.set(nome, cur)
  }

  const rows: SessaoRow[] = reais.map((s: any) => {
    const ac = acertos.get(s.id) ?? 0, tt = totais.get(s.id) ?? 0
    const cfg = statusCfg[s.status] ?? { label: s.status, variant: 'outline' as const }
    const tempoMs = s.iniciado_em && s.finalizado_em ? new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime() : 0
    const discMap = discPorSessao.get(s.id) ?? new Map<string, { ac: number; tt: number }>()
    const porDisciplina = [...discMap.entries()].map(([nome, v]: [string, { ac: number; tt: number }]) => ({ nome, ac: v.ac, tt: v.tt })).sort((a, b) => a.nome.localeCompare(b.nome))
    // Grupos: soma os acertos das disciplinas de cada grupo do banco do simulado.
    const grupos = pastaPorSim.get(s.simulado_id) ? gruposPorPasta.get(pastaPorSim.get(s.simulado_id)!) ?? [] : []
    const porGrupo = grupos.map((g) => {
      let gac = 0, gtt = 0
      for (const d of g.disciplinas) { const v = discMap.get(d); if (v) { gac += v.ac; gtt += v.tt } }
      return { nome: g.nome, ac: gac, tt: gtt }
    }).filter((g) => g.tt > 0)
    const cadId = cadernoPorSim.get(s.simulado_id) ?? null
    const tipoS = tipoSimPorSim.get(s.simulado_id) ?? null
    return {
      id: s.id, titulo: s.simulados?.titulo ?? '—', statusLabel: cfg.label, statusVariant: cfg.variant,
      iniciado: fmt(s.iniciado_em), finalizado: fmt(s.finalizado_em), ac, tt,
      nota: s.nota != null ? Number(s.nota) : null, posicao: s.posicao_ranking ?? null, tentativa: s.tentativa_num ?? 1,
      tempoLabel: tempoMs ? fmtDur(tempoMs) : '—', mediaLabel: tempoMs && tt ? fmtDur(Math.round(tempoMs / tt)) : '—',
      porGrupo, porDisciplina, cadId, mods: cadId ? filtrarModsPorTipo(modsPorCad.get(cadId) ?? [], tipoS) : [], simuladoId: s.simulado_id, temResultado: tt > 0, tipo: tipoS,
    }
  })

  const iniciais = (est.nome ?? '?').split(' ').filter(Boolean).slice(0, 2).map((n: string) => n[0]?.toUpperCase()).join('')
  const notaTone = (n: number) => n >= 7 ? 'text-emerald-600 dark:text-emerald-400' : n >= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'

  const Info = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-3.5 w-3.5" /></span>
      <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="truncate text-sm font-medium">{value}</p></div>
    </div>
  )
  const Stat = ({ icon: Icon, label, value, tone }: { icon: any; label: string; value: React.ReactNode; tone?: string }) => (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('text-xl font-bold leading-tight', tone)}>{value}</p>
      </div>
    </div>
  )

  return (
    <div className="animate-page space-y-5">
      {/* HERO */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5">
          <Link href="/admin/estudantes" className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'shrink-0')}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-sm">
            {iniciais || <User className="h-7 w-7" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight">{est.nome}</h1>
              <ClassificacaoBadge classificacao={est.classificacao} className="text-[11px]" />
            </div>
            <p className="truncate text-muted-foreground">{est.email}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="gap-1"><GraduationCap className="h-3 w-3" /> {classLabel}</Badge>
              {est.cpf && <Badge variant="outline" className="gap-1"><IdCard className="h-3 w-3" /> {est.cpf}</Badge>}
              <span className="text-xs text-muted-foreground">Cadastrado em {fmtData(est.created_at)}</span>
            </div>
          </div>
          <div className="ml-auto shrink-0">
            <EditarEstudanteButton estudante={{ id: est.id, nome: est.nome, email: est.email, cpf: est.cpf, telefone: est.telefone, data_nascimento: est.data_nascimento, classificacao: est.classificacao, matricula_externa: est.matricula_externa, created_at: est.created_at }} />
          </div>
        </div>
      </div>

      {/* MÉTRICAS */}
      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={ListChecks} label="Simulados feitos" value={reais.length} />
        <Stat icon={Star} label="Nota média" value={notaMedia != null ? notaMedia.toFixed(1) : '—'} tone={notaMedia != null ? notaTone(notaMedia) : undefined} />
        <Stat icon={Trophy} label="Melhor nota" value={melhorNota != null ? melhorNota.toFixed(1) : '—'} tone={melhorNota != null ? notaTone(melhorNota) : undefined} />
        <Stat icon={Target} label="Acerto médio" value={acertoMedio != null ? `${acertoMedio}%` : '—'} />
      </div>

      {/* INFO + BANCOS */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Informações</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Info icon={Mail} label="E-mail" value={est.email ?? '—'} />
            <Info icon={Phone} label="Telefone" value={est.telefone ?? '—'} />
            <Info icon={IdCard} label="CPF" value={est.cpf ?? '—'} />
            <Info icon={Calendar} label="Nascimento" value={fmtData(est.data_nascimento)} />
            <Info icon={Hash} label="Matrícula externa" value={est.matricula_externa ?? '—'} />
            <Info icon={GraduationCap} label="Classificação" value={classLabel} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Bancos vinculados ({bancos.length})</CardTitle></CardHeader>
          <CardContent>
            {bancos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Não vinculado a nenhum banco.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {bancos.map((b) => (
                  <Link key={b.id} href={`/admin/banco-questoes/${b.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-sm transition-colors hover:border-primary hover:bg-primary/5">
                    <FolderOpen className="h-3.5 w-3.5 text-primary" /> {b.nome}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* HISTÓRICO (client: busca + rolagem + expandir) */}
      <HistoricoEstudante rows={rows} estudanteId={id} estudanteNome={est.nome} />
    </div>
  )
}
