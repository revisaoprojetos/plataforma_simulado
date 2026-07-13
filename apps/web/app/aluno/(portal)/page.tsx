import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { BookOpen, Star, ClipboardList, NotebookPen, ArrowRight, Sparkles, Trophy, Target, Play, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'

const notaTone = (n: number) => (n >= 7 ? 'text-emerald-600 dark:text-emerald-400' : n >= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')

export default async function AlunoHome() {
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const estId = sessao!.estudanteId

  const [{ count: favoritos }, { data: mats }, { data: acs }] = await Promise.all([
    svc.from('simulado_favoritos').select('*', { count: 'exact', head: true }).eq('estudante_id', estId),
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id').eq('estudante_id', estId),
  ])

  const ids = [...new Set([...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id), ...(acs ?? []).map((a: any) => a.simulado_id)].filter(Boolean))]

  let sims: any[] = []
  const sessoesPorSim = new Map<string, any[]>()
  const notas: number[] = []
  if (ids.length) {
    const [{ data: s }, { data: sess }] = await Promise.all([
      svc.from('simulado_simulados').select('id, titulo, status, embed_token, regras, data_fim').in('id', ids).eq('deletado', false),
      svc.from('simulado_sessoes_prova').select('simulado_id, status, nota').eq('estudante_id', estId).in('simulado_id', ids).eq('is_teste', false).eq('deletado', false),
    ])
    sims = s ?? []
    for (const x of (sess ?? []) as any[]) { const arr = sessoesPorSim.get(x.simulado_id) ?? []; arr.push(x); sessoesPorSim.set(x.simulado_id, arr) }
  }

  const simuladosFeitos: string[] = []
  const pendentes: any[] = []
  for (const s of sims) {
    const sess = sessoesPorSim.get(s.id) ?? []
    const finalizadas = sess.filter((x) => x.status === 'finalizada')
    if (finalizadas.length) {
      simuladosFeitos.push(s.id)
      // Só agrega notas de simulados cuja nota está liberada para o aluno.
      if (resolverLiberacoes(s.regras, s).notaLiberada) for (const f of finalizadas) if (f.nota != null) notas.push(Number(f.nota))
    }
    else pendentes.push({ ...s, emAndamento: sess.length > 0, podeFazer: s.status === 'publicado' && !!s.embed_token })
  }
  const notaMedia = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null
  const melhorNota = notas.length ? Math.max(...notas) : null
  const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))

  const atalhos = [
    { href: '/aluno/recomendado', icon: Sparkles, titulo: 'Recomendado', desc: 'Questões focadas nos seus pontos fracos' },
    { href: '/aluno/questoes', icon: BookOpen, titulo: 'Banco de questões', desc: 'Pratique questões avulsas com filtros' },
    { href: '/aluno/favoritos', icon: Star, titulo: 'Favoritos', desc: 'Questões que você marcou' },
    { href: '/aluno/cadernos', icon: NotebookPen, titulo: 'Cadernos', desc: 'Organize seus estudos' },
  ]

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
          <p className="mt-1 text-muted-foreground">Bem-vindo à sua área de estudos. {pendentes.length > 0 ? `Você tem ${pendentes.length} simulado(s) para fazer.` : 'Você está em dia com seus simulados.'}</p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi icon={ListChecks} label="Simulados feitos" value={simuladosFeitos.length} chip="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" tone="text-indigo-600 dark:text-indigo-400" />
            <Kpi icon={Star} label="Nota média" value={nota(notaMedia)} chip="bg-violet-500/15 text-violet-600 dark:text-violet-400" tone={notaMedia != null ? notaTone(notaMedia) : undefined} />
            <Kpi icon={Trophy} label="Melhor nota" value={nota(melhorNota)} chip="bg-amber-500/15 text-amber-600 dark:text-amber-400" tone={melhorNota != null ? notaTone(melhorNota) : undefined} />
            <Kpi icon={Star} label="Favoritos" value={favoritos ?? 0} chip="bg-sky-500/15 text-sky-600 dark:text-sky-400" tone="text-sky-600 dark:text-sky-400" />
          </div>
        </div>
      </div>

      {/* Simulados para fazer */}
      {pendentes.length > 0 && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Play className="h-4 w-4 text-primary" /> Simulados para fazer</h2>
            <Link href="/aluno/simulados" className="text-xs font-medium text-primary hover:underline">Ver todos</Link>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {pendentes.slice(0, 4).map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{s.emAndamento ? 'Em andamento' : 'Não iniciado'}</span>
                </span>
                {s.podeFazer && (
                  <Link href={`/simulado/${s.embed_token}`} className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90">{s.emAndamento ? 'Continuar' : 'Fazer'}</Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Atalhos */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
    </div>
  )
}
