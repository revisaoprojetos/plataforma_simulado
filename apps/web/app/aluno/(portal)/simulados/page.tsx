import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { ClipboardList, Trophy, CheckCircle2, ArrowRight, Lock, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconeBanco } from '@/lib/banco-visual'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'

const notaTone = (n: number) => (n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
const modoLabel = (m: string) => (m === 'janela_fixa' ? 'Agendado' : m === 'prazo_relativo' ? 'Prazo' : 'Aberto')

export default async function MeusSimuladosPage() {
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const estId = sessao!.estudanteId

  // Simulados atribuídos: matrícula (liberada) + acesso avulso. O passaporte NÃO enxerga
  // tudo automaticamente — recebe matrícula via grupo "Passaporte" vinculado ao banco.
  const [{ data: mats }, { data: acs }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id').eq('estudante_id', estId),
  ])
  const ids = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
  ].filter(Boolean))]

  let simulados: any[] = []
  const sessoesPorSim = new Map<string, any[]>()
  if (ids.length) {
    const [{ data: sims }, { data: sess }] = await Promise.all([
      svc.from('simulado_simulados').select('id, titulo, modo_aplicacao, status, data_inicio, data_fim, embed_token, regras').in('id', ids).eq('deletado', false),
      svc.from('simulado_sessoes_prova').select('id, simulado_id, status, nota, finalizado_em, tentativa_num').eq('estudante_id', estId).in('simulado_id', ids).eq('is_teste', false).eq('deletado', false),
    ])
    simulados = sims ?? []
    for (const s of (sess ?? []) as any[]) { const arr = sessoesPorSim.get(s.simulado_id) ?? []; arr.push(s); sessoesPorSim.set(s.simulado_id, arr) }
  }

  const visual = await resolverVisualSimulados(svc, simulados.map((s: any) => ({ id: s.id, regras: s.regras })))

  // Classifica cada simulado.
  const itens = simulados.map((s) => {
    const sess = sessoesPorSim.get(s.id) ?? []
    const finalizadas = sess.filter((x) => x.status === 'finalizada')
    const emAndamento = sess.some((x) => x.status !== 'finalizada')
    const notas = finalizadas.map((x) => (x.nota != null ? Number(x.nota) : null)).filter((n): n is number => n != null)
    const melhor = notas.length ? Math.max(...notas) : null
    const concluido = finalizadas.length > 0
    const { notaLiberada } = resolverLiberacoes(s.regras, s)
    return { ...s, concluido, emAndamento, tentativas: finalizadas.length, melhor, notaLiberada, vis: visual.get(s.id) ?? null }
  })

  const disponiveis = itens.filter((i) => !i.concluido)
  const concluidos = itens.filter((i) => i.concluido)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meus simulados</h1>
        <p className="text-muted-foreground">Simulados liberados para você fazer e seus concluídos — com notas e resultados.</p>
      </div>

      {/* Disponíveis para fazer */}
      {disponiveis.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Play className="h-4 w-4 text-primary" /> Para fazer ({disponiveis.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {disponiveis.map((s) => {
              const cor = s.vis?.cor ?? '#6d28d9'
              const BancoIcon = iconeBanco(s.vis?.icone)
              const capa = s.vis?.capa
              const podeFazer = s.status === 'publicado' && !!s.embed_token
              return (
                <div key={s.id} className={cn('group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all', podeFazer && 'hover:-translate-y-1 hover:shadow-lg')}>
                  {capa
                    ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
                  {!capa && <BancoIcon className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
                  {podeFazer && <Link href={`/simulado/${s.embed_token}`} className="absolute inset-0 z-10" aria-label={s.titulo} />}
                  <span className="pointer-events-none absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-white/20" style={{ background: cor }}><BancoIcon className="h-4 w-4" /></span>
                  {s.emAndamento && <span className="pointer-events-none absolute right-3 top-3 z-20 rounded-lg bg-amber-500/90 px-2 py-1 text-[10px] font-semibold uppercase text-white backdrop-blur">Em andamento</span>}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
                    <h3 className="line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{s.titulo}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">{modoLabel(s.modo_aplicacao)}</span>
                      {podeFazer
                        ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white">{s.emAndamento ? 'Continuar' : 'Fazer agora'} <ArrowRight className="h-3 w-3" /></span>
                        : <span className="rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur">Indisponível</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {concluidos.length === 0 && disponiveis.length === 0 && (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">Você ainda não concluiu nenhum simulado. Veja os disponíveis em <Link href="/aluno/simulado" className="font-medium text-primary hover:underline">Simulado</Link>.</p>
        </div>
      )}

      {/* Concluídos */}
      {concluidos.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Concluídos ({concluidos.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {concluidos.map((s) => {
              const cor = s.vis?.cor ?? '#6d28d9'
              const BancoIcon = iconeBanco(s.vis?.icone)
              const capa = s.vis?.capa
              return (
                <div key={s.id} className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
                  {capa
                    ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
                  {!capa && <BancoIcon className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

                  <Link href={`/aluno/simulados/${s.id}`} className="absolute inset-0 z-10" aria-label={s.titulo} />

                  <span className="pointer-events-none absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-white/20" style={{ background: cor }}><BancoIcon className="h-4 w-4" /></span>
                  {s.notaLiberada ? (
                    <span className="pointer-events-none absolute right-3 top-3 z-20 rounded-lg bg-black/45 px-2 py-1 text-right backdrop-blur">
                      <span className={cn('block text-lg font-bold leading-none tabular-nums text-white', s.melhor != null && notaTone(s.melhor))}>{s.melhor != null ? s.melhor.toFixed(1).replace('.', ',') : '—'}</span>
                      <span className="block text-[9px] uppercase tracking-wide text-white/70">nota</span>
                    </span>
                  ) : (
                    <span className="pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-lg bg-black/45 px-2 py-1 text-[10px] font-medium text-white/80 backdrop-blur" title="A nota será liberada pelo professor"><Lock className="h-3 w-3" /> Nota</span>
                  )}

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
                    <span className="mb-1 inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/85 backdrop-blur"><CheckCircle2 className="h-3 w-3" /> Concluído</span>
                    <h3 className="line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{s.titulo}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur"><Trophy className="h-3 w-3" /> {s.tentativas}x</span>
                      <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">{modoLabel(s.modo_aplicacao)}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white">Ver resultado <ArrowRight className="h-3 w-3" /></span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
