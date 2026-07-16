import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { BookOpen, Star, NotebookPen, ArrowRight, Sparkles, Trophy, Play, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { iconeBanco } from '@/lib/banco-visual'

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

  // Capa/cor/ícone (do banco de origem) para os cards de "Simulados para fazer".
  const visual = await resolverVisualSimulados(svc, pendentes.map((s: any) => ({ id: s.id, regras: s.regras })))

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

      {/* Simulados para fazer — abaixo dos atalhos, com capa e clique direto p/ a prova */}
      {pendentes.length > 0 && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Play className="h-4 w-4 text-primary" /> Simulados para fazer</h2>
            <Link href="/aluno/simulado" className="text-xs font-medium text-primary hover:underline">Ver todos</Link>
          </div>
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendentes.slice(0, 6).map((s) => {
              const vis = visual.get(s.id)
              const cor = vis?.cor ?? '#6d28d9'
              const Icon = iconeBanco(vis?.icone)
              const capa = vis?.capa
              return (
                <div key={s.id} className="group relative h-32 overflow-hidden rounded-xl border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                  {capa
                    ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
                  {!capa && <Icon className="absolute -right-4 -top-4 h-24 w-24 text-white/10" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />
                  {/* Clique no card inteiro → direto para a prova */}
                  {s.podeFazer && <Link href={`/simulado/${s.embed_token}`} className="absolute inset-0 z-10" aria-label={s.titulo} />}
                  <span className="pointer-events-none absolute left-2.5 top-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-lg text-white ring-1 ring-white/20" style={{ background: cor }}><Icon className="h-4 w-4" /></span>
                  <span className="pointer-events-none absolute right-2.5 top-2.5 z-20 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">{s.emAndamento ? 'Em andamento' : 'Não iniciado'}</span>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
                    <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{s.titulo}</h3>
                    {s.podeFazer && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-white">{s.emAndamento ? 'Continuar' : 'Fazer agora'} <ArrowRight className="h-3 w-3" /></span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
