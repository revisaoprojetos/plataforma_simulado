import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { carregarDesafioDetalheAluno } from '@/lib/leitura/aluno-desafio-detalhe'
import { iconeBanco } from '@/lib/banco-visual'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, BookOpen, Scale, CheckCircle2, ListChecks, Flame, Trophy, CalendarDays, Clock, Award, Target,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const fmtDia = (d: string) => { const [y, m, dd] = d.split('-'); return dd && m && y ? `${dd}/${m}/${y}` : d }
const fmtDur = (s: number | null) => {
  if (!s || s <= 0) return '—'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export default async function EstudanteDesafioPage({ params }: { params: Promise<{ id: string; moduloId: string }> }) {
  const { id, moduloId } = await params
  const tenantId = await getCurrentTenantId()
  const TID = tenantId ?? '00000000-0000-0000-0000-000000000000'
  const svc = createAdminClient()

  const [{ data: est }, det] = await Promise.all([
    svc.from('simulado_estudantes').select('id, nome, avatar, perfil_avatar_cor').eq('id', id).eq('tenant_id', TID).maybeSingle(),
    carregarDesafioDetalheAluno(TID, id, moduloId),
  ])
  if (!est || !det) notFound()

  const { modulo, resumo, aulas, dias, registros } = det
  const juris = modulo.area === 'jurisprudencia'
  const AreaIcon = juris ? Scale : BookOpen
  const Icon = iconeBanco(modulo.icone)
  const cor = modulo.cor ?? '#6d28d9'
  const voltar = `/admin/estudantes/${id}?tab=historico`

  const Kpi = ({ icon: I, label, value, tone, chip }: { icon: any; label: string; value: React.ReactNode; tone?: string; chip: string }) => (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', chip)}><I className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className={cn('text-xl font-extrabold leading-none tracking-tight tabular-nums', tone)}>{value}</p>
          <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="animate-page space-y-5">
      <Link href={voltar} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar ao perfil</Link>

      {/* HERO do módulo */}
      <div className="relative overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="relative flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-2xl border">
            {modulo.capa
              ? <img src={modulo.capa} alt="" className="absolute inset-0 h-full w-full object-cover" />
              : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
            {!modulo.capa && <Icon className="absolute -right-3 -top-3 h-20 w-20 text-white/10" />}
          </div>
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary"><AreaIcon className="h-3 w-3" /> {juris ? 'Jurisprudência' : 'Lei Seca'}</span>
            <h1 className="mt-1 truncate text-2xl font-bold tracking-tight sm:text-3xl">{modulo.nome}</h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">Relatório do desafio · <span className="font-medium text-foreground">{est.nome}</span></p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi icon={CheckCircle2} label="Aulas concluídas" value={resumo.aulasConcluidas} chip="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" tone="text-emerald-600 dark:text-emerald-400" />
        <Kpi icon={Award} label="Gabaritadas" value={resumo.aulasGabaritadas} chip="bg-amber-500/15 text-amber-600 dark:text-amber-400" tone="text-amber-600 dark:text-amber-400" />
        <Kpi icon={Target} label="Acertos" value={resumo.acertos} chip="bg-sky-500/15 text-sky-600 dark:text-sky-400" tone="text-sky-600 dark:text-sky-400" />
        <Kpi icon={ListChecks} label="Respostas" value={resumo.totalRespondidas} chip="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" tone="text-indigo-600 dark:text-indigo-400" />
        <Kpi icon={Flame} label="Sequência atual" value={resumo.streakAtual} chip="bg-rose-500/15 text-rose-600 dark:text-rose-400" tone="text-rose-600 dark:text-rose-400" />
        <Kpi icon={Trophy} label="Maior sequência" value={resumo.streakMaior} chip="bg-violet-500/15 text-violet-600 dark:text-violet-400" tone="text-violet-600 dark:text-violet-400" />
      </div>

      {/* AULAS FEITAS */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-primary" /> Aulas feitas</h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Aula</th>
                <th className="px-4 py-2.5 text-center">Quiz</th>
                <th className="px-4 py-2.5 text-center">Acertos</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Tempo de leitura</th>
                <th className="px-4 py-2.5">Lida em</th>
                <th className="px-4 py-2.5">Última resposta</th>
              </tr>
            </thead>
            <tbody>
              {aulas.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhuma aula com atividade.</td></tr>
              ) : aulas.map((a) => (
                <tr key={a.documentoId} className="border-t">
                  <td className="px-4 py-2.5 font-medium">{a.titulo}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-muted-foreground">{a.respondidas}/{a.quizTotal}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-muted-foreground">{a.acertos}</td>
                  <td className="px-4 py-2.5">
                    {a.gabaritada
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"><Award className="h-3 w-3" /> Gabaritada</span>
                      : a.concluida
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Concluída</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">Em andamento</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDur(a.tempoSeg)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.lidaEm ? formatBrt(a.lidaEm) : '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.ultimaResposta ? formatBrt(a.ultimaResposta) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SEQUÊNCIA / DIAS */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-primary" /> Sequência &amp; dias</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 font-medium text-rose-600 dark:text-rose-400"><Flame className="h-3.5 w-3.5" /> Atual: {resumo.streakAtual} dia(s)</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 font-medium text-violet-600 dark:text-violet-400"><Trophy className="h-3.5 w-3.5" /> Maior: {resumo.streakMaior} dia(s)</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> {resumo.diasAtivos} dia(s) ativos</span>
        </div>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2.5">Dia</th><th className="px-4 py-2.5">Conta na sequência?</th></tr>
            </thead>
            <tbody>
              {dias.length === 0 ? (
                <tr><td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">Nenhum dia com atividade.</td></tr>
              ) : dias.map((d) => (
                <tr key={d.dia} className="border-t">
                  <td className="px-4 py-2.5 font-medium tabular-nums">{fmtDia(d.dia)}</td>
                  <td className="px-4 py-2.5">
                    {d.origem === 'ajuste-remove'
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">Desconsiderado (ajuste)</span>
                      : d.origem === 'ajuste-add'
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-400">Conta (ajuste manual)</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Conta</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* REGISTROS DE HORÁRIO */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-primary" /> Registros de horário</h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2.5">Data e hora</th><th className="px-4 py-2.5">Tipo</th><th className="px-4 py-2.5">Aula</th><th className="px-4 py-2.5">Dia creditado</th><th className="px-4 py-2.5 text-right">XP</th></tr>
            </thead>
            <tbody>
              {registros.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum registro.</td></tr>
              ) : registros.map((r, i) => (
                <tr key={`${r.quando}:${i}`} className="border-t">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatBrt(r.quando)}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                      r.tipo === 'Quiz' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                      {r.tipo === 'Quiz' ? <ListChecks className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />} {r.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.aula ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">{r.dia ? fmtDia(r.dia) : '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{r.xp != null ? `+${r.xp}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {registros.length >= 200 && <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">Mostrando os 200 registros mais recentes.</div>}
        </div>
      </section>
    </div>
  )
}
