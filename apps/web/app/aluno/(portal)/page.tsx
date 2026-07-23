import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { BookOpen, Star, NotebookPen, ArrowRight, Sparkles, Trophy, Play, ListChecks, Radio, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { montarItensSimulado } from '@/lib/aluno/simulado-item'
import { CardSimulado } from '@/components/aluno/card-simulado'
import { OCULTAR_ALUNO_EXTRAS, ROTAS_ALUNO_OCULTAS } from '@/lib/flags'

const notaTone = (n: number) => (n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')

export default async function AlunoHome() {
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const estId = sessao!.estudanteId

  const [{ count: favoritos }, { data: mats }, { data: acs }, { data: sessAll }] = await Promise.all([
    svc.from('simulado_favoritos').select('*', { count: 'exact', head: true }).eq('estudante_id', estId),
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id, expira_em').eq('estudante_id', estId),
    // Sessões dela (independem do acesso ATUAL): garantem que simulados JÁ FEITOS contem nos
    // KPIs e não sumam se a matrícula/acesso mudou depois de concluir (histórico não some).
    svc.from('simulado_sessoes_prova').select('simulado_id, status, nota').eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false),
  ])

  const ids = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
    ...(sessAll ?? []).map((s: any) => s.simulado_id),
  ].filter(Boolean))]
  const expiraPorSim = new Map<string, string | null>()
  for (const a of (acs ?? []) as any[]) {
    const atual = expiraPorSim.get(a.simulado_id)
    if (!atual || (a.expira_em && new Date(a.expira_em) > new Date(atual))) expiraPorSim.set(a.simulado_id, a.expira_em ?? null)
  }

  let sims: any[] = []
  const sessoesPorSim = new Map<string, any[]>()
  const notas: number[] = []
  if (ids.length) {
    const { data: s } = await svc.from('simulado_simulados').select('id, titulo, status, embed_token, regras, modo_aplicacao, data_inicio, data_fim, created_at').in('id', ids).eq('deletado', false)
    sims = s ?? []
    for (const x of (sessAll ?? []) as any[]) { const arr = sessoesPorSim.get(x.simulado_id) ?? []; arr.push(x); sessoesPorSim.set(x.simulado_id, arr) }
  }

  const simuladosFeitos: string[] = []
  for (const s of sims) {
    const finalizadas = (sessoesPorSim.get(s.id) ?? []).filter((x) => x.status === 'finalizada')
    if (finalizadas.length) {
      simuladosFeitos.push(s.id)
      // Só agrega notas de simulados cuja nota está liberada para o aluno.
      if (resolverLiberacoes(s.regras, s).notaLiberada) for (const f of finalizadas) if (f.nota != null) notas.push(Number(f.nota))
    }
  }
  const notaMedia = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null
  const melhorNota = notas.length ? Math.max(...notas) : null
  const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))

  // Simulados disponíveis (mesmos cards da área "Simulados"): capa + estado + fita "novo".
  // Aqui na home mostramos só os que o aluno AINDA NÃO FEZ (sem sessão finalizada);
  // os já feitos — mesmo que permitam retentativa — ficam em "Ver todos".
  const feitosSet = new Set(simuladosFeitos)
  const visual = await resolverVisualSimulados(svc, sims.map((s: any) => ({ id: s.id, regras: s.regras })))
  const disponiveis = montarItensSimulado(sims, sessoesPorSim, expiraPorSim, visual)
    .filter((i) => i.podeFazer || i.emAndamento || i.statusLabel === 'Agendado')
    .filter((i) => !feitosSet.has(i.id))

  const atalhos = [
    { href: '/aluno/recomendado', icon: Sparkles, titulo: 'Recomendado', desc: 'Questões focadas nos seus pontos fracos' },
    { href: '/aluno/simulado', icon: Radio, titulo: 'Simulados', desc: 'Faça os simulados liberados para você' },
    { href: '/aluno/simulados', icon: ClipboardList, titulo: 'Meus Simulados', desc: 'Seus resultados e simulados concluídos' },
    { href: '/aluno/questoes', icon: BookOpen, titulo: 'Banco de questões', desc: 'Pratique questões avulsas com filtros' },
    { href: '/aluno/favoritos', icon: Star, titulo: 'Favoritos', desc: 'Questões que você marcou' },
    { href: '/aluno/cadernos', icon: NotebookPen, titulo: 'Cadernos', desc: 'Organize seus estudos' },
  ].filter((a) => !(OCULTAR_ALUNO_EXTRAS && ROTAS_ALUNO_OCULTAS.includes(a.href)))

  const Kpi = ({ icon: Icon, label, value, tone, chip }: { icon: any; label: string; value: React.ReactNode; tone?: string; chip: string }) => (
    <div className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', chip)}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className={cn('text-2xl font-extrabold leading-none tabular-nums', tone)}>{value}</p>
          <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="animate-page space-y-5">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative p-5 sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Olá, {sessao!.nome.split(' ')[0]} 👋</h1>
          <p className="mt-1 text-muted-foreground">Bem-vindo à sua área de estudos. {disponiveis.length > 0 ? `Você tem ${disponiveis.length} simulado(s) disponível(is).` : 'Você está em dia com seus simulados.'}</p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi icon={ListChecks} label="Simulados feitos" value={simuladosFeitos.length} chip="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" tone="text-indigo-600 dark:text-indigo-400" />
            <Kpi icon={Star} label="Nota média" value={nota(notaMedia)} chip="bg-violet-500/15 text-violet-600 dark:text-violet-400" tone={notaMedia != null ? notaTone(notaMedia) : undefined} />
            <Kpi icon={Trophy} label="Melhor nota" value={nota(melhorNota)} chip="bg-amber-500/15 text-amber-600 dark:text-amber-400" tone={melhorNota != null ? notaTone(melhorNota) : undefined} />
            <Kpi icon={Star} label="Favoritos" value={favoritos ?? 0} chip="bg-sky-500/15 text-sky-600 dark:text-sky-400" tone="text-sky-600 dark:text-sky-400" />
          </div>
        </div>
      </div>

      {/* Atalhos */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {atalhos.map((a) => (
          <Link key={a.href} href={a.href}>
            <div className="group h-full rounded-2xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><a.icon className="h-5 w-5" /></span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-2">
                <div className="font-medium">{a.titulo}</div>
                <div className="text-xs text-muted-foreground">{a.desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Simulados disponíveis — abaixo dos atalhos, mesmos cards da área "Simulados" */}
      {disponiveis.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Play className="h-4 w-4 text-primary" /> Simulados disponíveis</h2>
            <Link href="/aluno/simulado" className="text-xs font-medium text-primary hover:underline">Ver todos</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {disponiveis.slice(0, 10).map((s) => <CardSimulado key={s.id} s={s} />)}
          </div>
        </section>
      )}
    </div>
  )
}
