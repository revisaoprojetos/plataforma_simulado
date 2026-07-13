import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { Radio, Play, RotateCcw, Clock, CalendarClock, Hourglass, Infinity as InfinityIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconeBanco } from '@/lib/banco-visual'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null)

export default async function SimuladoDisponivelPage() {
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const estId = sessao!.estudanteId

  const [{ data: mats }, { data: acs }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id, expira_em').eq('estudante_id', estId),
  ])
  const expiraPorSim = new Map<string, string | null>()
  for (const a of (acs ?? []) as any[]) {
    const atual = expiraPorSim.get(a.simulado_id)
    if (!atual || (a.expira_em && new Date(a.expira_em) > new Date(atual))) expiraPorSim.set(a.simulado_id, a.expira_em ?? null)
  }
  const ids = [...new Set([...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id), ...(acs ?? []).map((a: any) => a.simulado_id)].filter(Boolean))]

  let sims: any[] = []
  const sessoesPorSim = new Map<string, any[]>()
  if (ids.length) {
    const [{ data: s }, { data: sess }] = await Promise.all([
      svc.from('simulado_simulados').select('id, titulo, modo_aplicacao, status, data_inicio, data_fim, embed_token, regras').in('id', ids).eq('deletado', false),
      svc.from('simulado_sessoes_prova').select('simulado_id, status').eq('estudante_id', estId).in('simulado_id', ids).eq('is_teste', false).eq('deletado', false),
    ])
    sims = s ?? []
    for (const x of (sess ?? []) as any[]) { const arr = sessoesPorSim.get(x.simulado_id) ?? []; arr.push(x); sessoesPorSim.set(x.simulado_id, arr) }
  }

  const visual = await resolverVisualSimulados(svc, sims.map((s) => ({ id: s.id, regras: s.regras })))

  const now = Date.now()
  const itens = sims.map((s) => {
    const sess = sessoesPorSim.get(s.id) ?? []
    const finalizadas = sess.filter((x) => x.status === 'finalizada').length
    const emAndamento = sess.some((x) => x.status !== 'finalizada')
    const regras = (s.regras as any) ?? {}
    const max = Number(regras.max_tentativas ?? regras.retentativas ?? 0)
    const ilimitado = s.modo_aplicacao === 'aberto' || !(max > 0)
    const restantes = ilimitado ? Infinity : Math.max(0, max - finalizadas)
    let statusLabel = 'Aberto', aoVivo = false, windowOk = true, quando: string | null = 'Sempre disponível', tom = 'sky'
    const modo = s.modo_aplicacao
    if (modo === 'janela_fixa') {
      const ini = s.data_inicio ? new Date(s.data_inicio).getTime() : null
      const fim = s.data_fim ? new Date(s.data_fim).getTime() : null
      if (ini && now < ini) { statusLabel = 'Agendado'; windowOk = false; quando = `Abre ${fmt(s.data_inicio)}`; tom = 'slate' }
      else if (fim && now > fim) { statusLabel = 'Encerrado'; windowOk = false; quando = `Encerrou ${fmt(s.data_fim)}`; tom = 'rose' }
      else { statusLabel = 'Ao vivo'; aoVivo = true; quando = fim ? `Encerra ${fmt(s.data_fim)}` : null; tom = 'emerald' }
    } else if (modo === 'prazo_relativo') {
      const exp = expiraPorSim.get(s.id)
      if (exp && now > new Date(exp).getTime()) { statusLabel = 'Prazo expirado'; windowOk = false; quando = `Expirou ${fmt(exp)}`; tom = 'rose' }
      else { statusLabel = 'Prazo'; quando = exp ? `Até ${fmt(exp)}` : 'Sem prazo definido'; tom = 'amber' }
    }
    const podeFazer = windowOk && s.status === 'publicado' && !!s.embed_token && (restantes > 0 || emAndamento)
    const refazer = finalizadas > 0 && restantes > 0
    return { ...s, finalizadas, restantes, emAndamento, statusLabel, aoVivo, quando, tom, podeFazer, refazer, vis: visual.get(s.id) ?? null }
  }).filter((i) => i.podeFazer || i.emAndamento || i.statusLabel === 'Agendado')

  // Seções: Agendados (janela fixa) em cima, Disponíveis no meio, Para refazer embaixo.
  const buckets: Record<string, any[]> = { agendados: [], disponiveis: [], refazer: [] }
  for (const i of itens) {
    const b = i.emAndamento
      ? (i.modo_aplicacao === 'janela_fixa' ? 'agendados' : 'disponiveis')
      : i.refazer ? 'refazer' : (i.modo_aplicacao === 'janela_fixa' ? 'agendados' : 'disponiveis')
    buckets[b].push(i)
  }
  buckets.agendados.sort((a, b) => Number(b.aoVivo) - Number(a.aoVivo))
  const SECOES = [
    { chave: 'agendados', titulo: 'Agendados', cor: 'bg-amber-500', vazio: 'Nenhum simulado agendado' },
    { chave: 'disponiveis', titulo: 'Disponíveis', cor: 'bg-emerald-500', vazio: 'Nenhum simulado disponível no momento' },
    { chave: 'refazer', titulo: 'Já concluídos', cor: 'bg-sky-500', vazio: 'Nenhum concluído ainda' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Simulados</h1>
        <p className="text-muted-foreground">Simulados liberados para você fazer agora — ao vivo, com prazo ou abertos.</p>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Radio className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhum simulado liberado no momento. Quando um for aberto (ou agendado), ele aparece aqui.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {SECOES.map((sec) => {
            const arr = buckets[sec.chave]
            return (
              <section key={sec.chave} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full', sec.cor)} />
                  <h2 className="font-semibold">{sec.titulo}</h2>
                  <span className="text-sm text-muted-foreground">({arr.length})</span>
                </div>
                {arr.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">{sec.vazio}</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {arr.map((s) => <CardSimulado key={s.id} s={s} />)}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

const ICON: Record<string, any> = { emerald: Radio, amber: Hourglass, sky: InfinityIcon, slate: CalendarClock, rose: Clock }

function CardSimulado({ s }: { s: any }) {
  const StatusIcon = ICON[s.tom] ?? Radio
  const cor = s.vis?.cor ?? '#6d28d9'
  const BancoIcon = iconeBanco(s.vis?.icone)
  const capa = s.vis?.capa
  return (
    <div className={cn('group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all', s.podeFazer && 'hover:-translate-y-1 hover:shadow-lg', s.aoVivo && 'ring-2 ring-emerald-500/50')}>
      {capa
        ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
      {!capa && <BancoIcon className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

      {s.podeFazer && <Link href={`/simulado/${s.embed_token}`} className="absolute inset-0 z-10" aria-label={s.titulo} />}

      <span className="pointer-events-none absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-white/20" style={{ background: cor }}><BancoIcon className="h-4 w-4" /></span>
      <span className={cn('pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur', s.aoVivo ? 'bg-emerald-500/90' : 'bg-black/45')}>
        {s.aoVivo
          ? <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>
          : <StatusIcon className="h-3.5 w-3.5" />}
        {s.statusLabel}
      </span>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
        {s.emAndamento && <span className="mb-1 inline-block rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">Em andamento</span>}
        <h3 className="line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{s.titulo}</h3>
        {s.quando && <p className="mt-1 flex items-center gap-1 text-xs text-white/80"><Clock className="h-3 w-3" /> {s.quando}</p>}
        {s.refazer && !s.emAndamento && <p className="text-[11px] text-white/70">Já feito {s.finalizadas}x{Number.isFinite(s.restantes) ? ` · ${s.restantes} restante(s)` : ''}</p>}
        {s.podeFazer ? (
          <span className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black shadow-sm">
            {s.emAndamento ? <><RotateCcw className="h-4 w-4" /> Continuar</> : s.refazer ? <><RotateCcw className="h-4 w-4" /> Refazer</> : <><Play className="h-4 w-4" /> Fazer agora</>}
          </span>
        ) : (
          <span className="mt-2 block rounded-lg bg-black/45 px-3 py-2 text-center text-xs text-white/80 backdrop-blur">{s.statusLabel === 'Agendado' ? 'Ainda não abriu' : 'Indisponível'}</span>
        )}
      </div>
    </div>
  )
}
