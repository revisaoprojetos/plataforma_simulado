import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { iconeBanco } from '@/lib/banco-visual'
import { tipoDoSimulado } from '@/lib/simulado/tipo'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import { ArrowLeft, Trophy, Star, Target, Repeat, TrendingUp, TrendingDown, Minus, Clock, LayoutDashboard, ClipboardCheck, Users } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { montarRevisao } from '@/lib/simulado/revisao'
import { montarComparativo } from '@/lib/simulado/comparativo'
import { RevisaoQuestoes } from '@/components/simulado/revisao-questoes'
import { ComparativoTurma } from '@/components/simulado/comparativo-turma'

export const dynamic = 'force-dynamic'

const fmt = (d: string | null) => (d ? format(new Date(d), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—')
const fmtDur = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s` }
const notaTom = (n: number | null) => (n == null ? 'text-muted-foreground' : n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
const pctTom = (p: number) => (p >= 70 ? 'text-emerald-600 dark:text-emerald-400' : p >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')

export default async function EstudanteSimuladoPage({ params }: { params: Promise<{ id: string; simuladoId: string }> }) {
  const { id, simuladoId } = await params
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const [{ data: est }, { data: sim }] = await Promise.all([
    svc.from('simulado_estudantes').select('id, nome').eq('id', id).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').maybeSingle(),
    svc.from('simulado_simulados').select('id, titulo, status').eq('id', simuladoId).maybeSingle(),
  ])
  if (!est || !sim) notFound()

  // Tentativas (sessões finalizadas, exceto teste) em ordem cronológica.
  const { data: sessoes } = await svc
    .from('simulado_sessoes_prova')
    .select('id, tentativa_num, nota, posicao_ranking, iniciado_em, finalizado_em')
    .eq('estudante_id', id).eq('simulado_id', simuladoId).eq('is_teste', false).eq('status', 'finalizada').eq('deletado', false)
    .order('iniciado_em', { ascending: true })
  const sess = sessoes ?? []
  const sessIds = sess.map((s: any) => s.id)

  // Respostas de todas as sessões → acertos/total e por disciplina.
  const disc = new Map<string, string>()   // questao_id → disciplina
  const porSessao = new Map<string, { ac: number; tt: number; disc: Map<string, { ac: number; tt: number }> }>()
  let tipo: any = null
  if (sessIds.length) {
    const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', sessIds)
    const qIds = [...new Set((resp ?? []).map((r: any) => r.questao_id).filter(Boolean))]
    if (qIds.length) {
      const { data: qs } = await svc.from('simulado_questoes').select('id, tipo, disciplinas:simulado_disciplinas(nome)').in('id', qIds)
      for (const q of qs ?? []) disc.set((q as any).id, (q as any).disciplinas?.nome ?? 'Sem disciplina')
      tipo = tipoDoSimulado((qs ?? []).map((q: any) => q.tipo))
    }
    for (const r of resp ?? []) {
      const cur = porSessao.get((r as any).sessao_id) ?? { ac: 0, tt: 0, disc: new Map() }
      cur.tt++; if ((r as any).correta) cur.ac++
      const dn = disc.get((r as any).questao_id) ?? 'Sem disciplina'
      const dd = cur.disc.get(dn) ?? { ac: 0, tt: 0 }; dd.tt++; if ((r as any).correta) dd.ac++; cur.disc.set(dn, dd)
      porSessao.set((r as any).sessao_id, cur)
    }
  }

  // Banco (capa/cor/ícone) do simulado — mesma imagem do card do banco de questões.
  let visual = { cor: null as string | null, icone: null as string | null, capa: null as string | null, bancoId: null as string | null }
  {
    const { data: pq } = await svc.from('simulado_prova_questoes').select('questao_id').eq('simulado_id', simuladoId)
    const qIds = [...new Set((pq ?? []).map((r: any) => r.questao_id).filter(Boolean))]
    if (qIds.length) {
      const { data: qp } = await svc.from('simulado_questao_pasta').select('pasta_id').in('questao_id', qIds)
      const cont = new Map<string, number>()
      for (const r of qp ?? []) cont.set((r as any).pasta_id, (cont.get((r as any).pasta_id) ?? 0) + 1)
      const melhor = [...cont.entries()].sort((a, b) => b[1] - a[1])[0]
      if (melhor) {
        try {
          const { data: p } = await svc.from('simulado_pastas').select('id, cor, icone, capa_url').eq('id', melhor[0]).maybeSingle()
          if (p) visual = { cor: (p as any).cor ?? null, icone: (p as any).icone ?? null, capa: (p as any).capa_url ?? null, bancoId: (p as any).id }
        } catch { /* colunas podem não existir */ }
      }
    }
  }

  const tentativas = sess.map((s: any) => {
    const b = porSessao.get(s.id) ?? { ac: 0, tt: 0, disc: new Map() }
    const pct = b.tt > 0 ? Math.round((b.ac / b.tt) * 100) : 0
    const tempoMs = s.iniciado_em && s.finalizado_em ? new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime() : 0
    const porDisc = [...b.disc.entries()].map(([nome, v]) => ({ nome, ac: v.ac, tt: v.tt, pct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0 })).sort((a, b) => a.nome.localeCompare(b.nome))
    return { id: s.id, n: s.tentativa_num ?? 1, iniciado: s.iniciado_em, finalizado: s.finalizado_em, nota: s.nota != null ? Number(s.nota) : null, posicao: s.posicao_ranking ?? null, ac: b.ac, tt: b.tt, pct, tempoMs, porDisc }
  })

  const notas = tentativas.filter((t) => t.nota != null).map((t) => t.nota as number)
  const melhor = notas.length ? Math.max(...notas) : null
  const media = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null
  const primeira = tentativas[0], ultima = tentativas[tentativas.length - 1]
  const deltaNota = primeira?.nota != null && ultima?.nota != null ? Math.round((ultima.nota - primeira.nota) * 10) / 10 : null
  const deltaPct = primeira && ultima ? ultima.pct - primeira.pct : null

  // Melhoria por disciplina: 1ª vs última tentativa.
  const discEvol: { nome: string; ini: number; fim: number; delta: number }[] = []
  if (primeira && ultima && tentativas.length > 1) {
    const iniMap = new Map(primeira.porDisc.map((d) => [d.nome, d.pct]))
    for (const d of ultima.porDisc) { if (iniMap.has(d.nome)) { const ini = iniMap.get(d.nome)!; discEvol.push({ nome: d.nome, ini, fim: d.pct, delta: d.pct - ini }) } }
    discEvol.sort((a, b) => b.delta - a.delta)
  }
  const maxNotaBar = 10

  // Sessão representativa (melhor nota; desempate pela última) para revisão questão-a-questão.
  const melhorSess = tentativas.length
    ? [...tentativas].sort((a, b) => (Number(b.nota ?? -1) - Number(a.nota ?? -1)) || (new Date(b.finalizado ?? 0).getTime() - new Date(a.finalizado ?? 0).getTime()))[0]
    : null
  // Admin sempre vê o gabarito (revelar=true).
  const [revisao, comparativo] = await Promise.all([
    melhorSess ? montarRevisao(svc, simuladoId, melhorSess.id, true) : Promise.resolve([]),
    montarComparativo(svc, simuladoId, { minhaNota: melhorSess?.nota ?? null, minhaSessaoId: melhorSess?.id ?? null }),
  ])

  const Delta = ({ v, suf = '' }: { v: number | null; suf?: string }) => {
    if (v == null) return <span className="text-muted-foreground">—</span>
    const Icon = v > 0 ? TrendingUp : v < 0 ? TrendingDown : Minus
    const cor = v > 0 ? 'text-emerald-600 dark:text-emerald-400' : v < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
    return <span className={cn('inline-flex items-center gap-1 font-semibold tabular-nums', cor)}><Icon className="h-4 w-4" />{v > 0 ? '+' : ''}{v}{suf}</span>
  }
  const Icon = iconeBanco(visual.icone)
  const c = visual.cor ?? '#6d28d9'

  return (
    <div className="animate-page space-y-5">
      {/* HERO com o visual do banco */}
      <div className="overflow-hidden rounded-2xl border shadow-sm">
        <div className="relative flex flex-wrap items-center gap-4 p-5 text-white" style={visual.capa ? undefined : { background: `linear-gradient(120deg, ${c} 0%, #0f172a 130%)` }}>
          {visual.capa && <><img src={visual.capa} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-black/55" /></>}
          <Link href={`/admin/estudantes/${id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'relative z-10 shrink-0 text-white hover:bg-white/15 hover:text-white')}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/25" style={{ background: c }}><Icon className="h-7 w-7" /></span>
          <div className="relative z-10 min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-white/70">Desempenho de {est.nome}</p>
            <div className="flex items-center gap-2"><h1 className="truncate text-2xl font-bold">{sim.titulo}</h1><TipoSimuladoBadge tipo={tipo} /></div>
            <p className="text-sm text-white/80">{tentativas.length} tentativa(s)</p>
          </div>
          {visual.bancoId && <Link href={`/admin/banco-questoes/${visual.bancoId}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'relative z-10 ml-auto border-white/30 bg-white/10 text-white hover:bg-white/20')}>Abrir banco</Link>}
        </div>
      </div>

      <Tabs defaultValue="geral">
        <TabsList>
          <TabsTrigger value="geral"><LayoutDashboard className="h-4 w-4" /> Visão geral</TabsTrigger>
          <TabsTrigger value="questoes"><ClipboardCheck className="h-4 w-4" /> Questões</TabsTrigger>
          <TabsTrigger value="turma"><Users className="h-4 w-4" /> Comparativo</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-5 pt-1">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Repeat} label="Tentativas" value={String(tentativas.length)} />
        <Kpi icon={Trophy} label="Melhor nota" value={melhor != null ? melhor.toFixed(1) : '—'} tom={melhor != null ? notaTom(melhor) : undefined} />
        <Kpi icon={Star} label="Nota média" value={media != null ? media.toFixed(1) : '—'} tom={media != null ? notaTom(media) : undefined} />
        <Kpi icon={Target} label="Evolução (1ª→última)" value={<Delta v={deltaNota} />} />
      </div>

      {/* ANÁLISE DE MELHORIA */}
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Análise de melhoria</h2>
        {tentativas.length < 2 ? (
          <p className="text-sm text-muted-foreground">Só há {tentativas.length} tentativa. Faça mais tentativas deste simulado para ver a evolução.</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Evolução da nota por tentativa */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Nota por tentativa</p>
              <div className="flex items-end gap-2" style={{ height: 140 }}>
                {tentativas.map((t) => (
                  <div key={t.id} className="flex flex-1 flex-col items-center justify-end gap-1">
                    <span className={cn('text-xs font-bold tabular-nums', notaTom(t.nota))}>{t.nota != null ? t.nota.toFixed(1) : '—'}</span>
                    <div className="w-full max-w-[38px] overflow-hidden rounded-t-md bg-muted" style={{ height: `${Math.max(4, ((t.nota ?? 0) / maxNotaBar) * 110)}px` }}>
                      <div className="h-full w-full" style={{ background: c }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">#{t.n}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Acerto: 1ª <b>{primeira?.pct}%</b> → última <b>{ultima?.pct}%</b> <span className="ml-1"><Delta v={deltaPct} suf="%" /></span></p>
            </div>

            {/* Melhoria por disciplina */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Por disciplina (1ª → última)</p>
              {discEvol.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem disciplinas comparáveis entre as tentativas.</p>
              ) : (
                <div className="space-y-1.5">
                  {discEvol.map((d) => (
                    <div key={d.nome} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{d.nome}</span>
                      <span className="tabular-nums text-muted-foreground">{d.ini}% → {d.fim}%</span>
                      <span className="w-14 text-right"><Delta v={d.delta} suf="%" /></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* TENTATIVAS detalhadas */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Tentativas ({tentativas.length})</h2>
        {[...tentativas].reverse().map((t) => (
          <div key={t.id} className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-sm font-bold text-primary">Tentativa #{t.n}</span>
              <span className="text-xs text-muted-foreground">{fmt(t.iniciado)} → {fmt(t.finalizado)}</span>
              {t.tempoMs > 0 && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {fmtDur(t.tempoMs)}</span>}
              {t.posicao != null && <span className="text-xs text-muted-foreground">Ranking #{t.posicao}º</span>}
              <span className="ml-auto flex items-center gap-3">
                <span className={cn('text-sm font-semibold tabular-nums', pctTom(t.pct))}>{t.ac}/{t.tt} · {t.pct}%</span>
                <span className={cn('text-xl font-bold tabular-nums', notaTom(t.nota))}>{t.nota != null ? t.nota.toFixed(2) : '—'}</span>
              </span>
            </div>
            {t.porDisc.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {t.porDisc.map((d) => (
                  <div key={d.nome} className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate" title={d.nome}>{d.nome}</span>
                    <span className="shrink-0 tabular-nums"><b>{d.ac}</b><span className="text-muted-foreground">/{d.tt}</span></span>
                    <span className={cn('w-9 shrink-0 text-right text-xs font-semibold tabular-nums', pctTom(d.pct))}>{d.pct}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
        </TabsContent>

        {/* QUESTÕES */}
        <TabsContent value="questoes" className="pt-1">
          {melhorSess && <p className="mb-3 text-xs text-muted-foreground">Revisão da tentativa #{melhorSess.n} (melhor desempenho) — {melhorSess.ac}/{melhorSess.tt} acertos.</p>}
          <RevisaoQuestoes questoes={revisao} revelou />
        </TabsContent>

        {/* COMPARATIVO */}
        <TabsContent value="turma" className="pt-1">
          <ComparativoTurma c={comparativo} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, tom }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; tom?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('text-xl font-bold leading-tight', tom)}>{value}</p>
      </div>
    </div>
  )
}
