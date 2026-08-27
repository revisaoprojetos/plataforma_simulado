import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getGamConfig } from '@/lib/gamificacao'
import { resumoGamificacao, posicaoNaLiga, membrosDaLiga, xpPorDiaSemana, leaderboardLiga } from '@/lib/gamificacao/leitura'
import { EscudoLiga } from '@/components/aluno/escudo-liga'
import { LigaRankingFull } from '@/components/aluno/liga-ranking-full'
import { MascoteTour } from '@/components/mascote/mascote-tour'
import { cn } from '@/lib/utils'
import { Trophy, Crown, Check } from 'lucide-react'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => n.toLocaleString('pt-BR')

export default async function LigasPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const svc = createAdminClient()
  const config = await getGamConfig(svc, sessao.tenantId)

  if (!config?.ativo) {
    return (
      <div className="animate-page mx-auto max-w-lg py-16 text-center">
        <Trophy className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">Ligas em breve</h1>
        <p className="mt-1 text-muted-foreground">A competição por ligas ainda não está ativa nesta plataforma.</p>
      </div>
    )
  }

  const resumo = await resumoGamificacao(svc, sessao!.tenantId, sessao!.estudanteId, config)
  const ligasOrd = [...config.ligas].sort((a, b) => a.xp_min - b.xp_min)
  const liga = resumo?.liga ?? ligasOrd[0]
  const proxima = resumo?.proxima ?? null
  const xpTotal = resumo?.xpTotal ?? 0
  const n = ligasOrd.length

  const [posicao, membros, semana, podioBruto] = await Promise.all([
    resumo ? posicaoNaLiga(svc, sessao!.tenantId, liga.id, xpTotal) : Promise.resolve(1),
    membrosDaLiga(svc, sessao!.tenantId, liga.id),
    xpPorDiaSemana(svc, sessao!.tenantId, sessao!.estudanteId, config.timezone),
    leaderboardLiga(svc, sessao!.tenantId, liga.id, sessao!.estudanteId, 3),
  ])
  const totalNaLiga = Math.max(1, membros.size)
  const idxAtual = Math.max(0, ligasOrd.findIndex((l) => l.id === liga.id))

  // Progresso dentro do tier atual (piso da liga → piso da próxima).
  const piso = liga.xp_min
  const teto = proxima?.xp_min ?? Math.max(xpTotal, piso + 1)
  const pctTier = proxima ? Math.min(100, Math.max(0, Math.round(((xpTotal - piso) / Math.max(1, teto - piso)) * 100))) : 100
  const faltam = proxima ? Math.max(0, teto - xpTotal) : 0
  const baseSim = config.xp_regras?.simulado?.base || 0
  const simsFaltam = baseSim > 0 ? Math.ceil(faltam / baseSim) : 0

  // Avatares do pódio (tolerante a colunas ausentes).
  const podioIds = podioBruto.map((p) => p.estudanteId)
  const avatares = new Map<string, { avatar: string | null; cor: string | null }>()
  if (podioIds.length) {
    const rp = await svc.from('simulado_estudantes').select('id, avatar, perfil_avatar_cor').in('id', podioIds)
    const rows = rp.error ? (await svc.from('simulado_estudantes').select('id, avatar').in('id', podioIds)).data ?? [] : rp.data ?? []
    for (const r of rows as any[]) avatares.set(r.id, { avatar: r.avatar ?? null, cor: r.perfil_avatar_cor ?? null })
  }
  const maxDia = Math.max(1, ...semana.map((d) => d.xp))

  const HERO_BG = 'linear-gradient(135deg, color-mix(in oklab, var(--brand-primary, var(--primary)) 80%, #0b1020) 0%, #0b1226 92%)'
  const nodeAlc = 'color-mix(in oklab, var(--brand-primary, var(--primary)) 46%, #0b1020)'
  const nodeFut = 'color-mix(in oklab, var(--brand-primary, var(--primary)) 20%, #0b1020)'

  return (
    <div className="animate-page space-y-6">
      {/* ── BANNER (full-bleed no topo) ── */}
      <section data-tour="liga-escada" className="-mx-6 -mt-6 text-white shadow-sm" style={{ background: HERO_BG }}>
        <div className="px-6 pt-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex min-w-0 items-center gap-4 pl-4 sm:pl-12">
              <span className="relative flex h-16 w-16 shrink-0 items-center justify-center">
                <span className="animate-liga-pulse absolute inset-0 rounded-full border-2" style={{ borderColor: liga.cor }} />
                <span className="animate-liga-pulse absolute inset-0 rounded-full border-2" style={{ borderColor: liga.cor, animationDelay: '.9s' }} />
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/10" style={{ border: `2px solid color-mix(in oklab, ${liga.cor} 55%, #fff)` }}>
                  <EscudoLiga cor={liga.cor} nome={liga.nome} ativo fundo={false} className="h-11 w-11" />
                </span>
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">Sua liga atual</p>
                <h1 className="text-2xl font-bold leading-tight sm:text-[1.75rem]" style={{ color: `color-mix(in oklab, ${liga.cor} 55%, #fff)` }}>{liga.nome}</h1>
                <p className="mt-0.5 text-sm text-white/70">{posicao}º lugar entre {fmt(totalNaLiga)} alunos · {fmt(xpTotal)} XP acumulado</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-6 sm:gap-8">
              <HeroStat valor={fmt(resumo?.xpSemana ?? 0)} rotulo="XP esta semana" />
              {proxima && <HeroStat valor={fmt(faltam)} rotulo={`XP até ${proxima.nome}`} />}
              <HeroStat valor={fmt(resumo?.streakAtual ?? 0)} rotulo="dias de sequência" />
            </div>
          </div>

          {/* Trilha de ligas — emblemas reais do sistema, nós opacos (a linha não os atravessa) */}
          <div className="relative mt-8 pb-8">
            <div className="relative flex justify-between">
              {/* Segmentos ENTRE cada liga (nos vãos — não passam atrás dos ícones). Ligas já
                  passadas ficam 100% preenchidas; o segmento da liga atual enche conforme a
                  pontuação do aluno dentro do tier (pctTier). */}
              {Array.from({ length: Math.max(0, n - 1) }).map((_, i) => {
                const fill = i < idxAtual ? 100 : i === idxAtual ? pctTier : 0
                // Recuo maior nos vãos que tocam o nó ATUAL (que é maior) — para a linha não encostar nele.
                const loff = i === idxAtual ? 44 : 28
                const roff = i + 1 === idxAtual ? 44 : 28
                return (
                  <div key={i} className="pointer-events-none absolute top-[22px] z-0 h-[3px]"
                    style={{ left: `calc(${((i + 0.5) / n) * 100}% + ${loff}px)`, width: `calc(${(1 / n) * 100}% - ${loff + roff}px)` }}>
                    {/* linha-base BEM FINA (ligas não preenchidas / futuras) */}
                    <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 rounded-full bg-white/20" />
                    {/* preenchimento grosso: ligas já passadas (100%) + a atual conforme a pontuação */}
                    <div className="absolute left-0 top-0 h-full rounded-full bg-white/85 transition-all" style={{ width: `${fill}%` }} />
                  </div>
                )
              })}
              {ligasOrd.map((l, i) => {
                const atual = i === idxAtual
                const passou = i < idxAtual
                const alc = i <= idxAtual
                return (
                  <div key={l.id} className={cn('relative flex flex-col items-center gap-1.5 px-1', atual ? 'z-[2]' : 'z-[1]')} style={{ width: `${100 / n}%` }}>
                    {/* slot de altura fixa: mantém os rótulos alinhados enquanto o nó atual cresce/sobe */}
                    <div className="relative flex h-12 w-full items-center justify-center">
                      <span
                        className={cn('relative flex items-center justify-center rounded-full', atual ? 'h-16 w-16 -translate-y-2 border-[3px]' : 'h-12 w-12 border-2')}
                        style={{
                          background: alc ? nodeAlc : nodeFut,
                          borderColor: atual ? l.cor : alc ? `color-mix(in oklab, ${l.cor} 58%, #fff)` : `color-mix(in oklab, ${l.cor} 45%, #0b1020)`,
                        }}
                      >
                        {atual && <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-slate-900 shadow">Você</span>}
                        {passou && <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#141233]"><Check className="h-2.5 w-2.5 text-white" strokeWidth={3} /></span>}
                        <EscudoLiga cor={l.cor} nome={l.nome} ativo={alc} fundo={false} className={atual ? 'h-9 w-9' : 'h-7 w-7'} />
                        {atual && (
                          <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
                            <span className="animate-liga-shine absolute inset-y-0 left-0 w-1/3" style={{ background: 'linear-gradient(100deg, transparent 20%, rgba(255,255,255,.72) 50%, transparent 80%)' }} />
                          </span>
                        )}
                      </span>
                    </div>
                    <span className={cn('max-w-full truncate text-[11px] font-semibold', alc ? 'text-white' : 'text-white/45')}>{l.nome}</span>
                    {i > 0 && <span className="text-[9px] text-white/40">{fmt(l.xp_min)} XP</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── PÓDIO + SEMANA/PROGRESSO ── */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* Pódio */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4" style={{ color: liga.cor }} /> Pódio · {liga.nome}</h3>
            <span className="text-[11px] text-muted-foreground">por XP total</span>
          </div>
          {podioBruto.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Ninguém pontuou nesta liga ainda.</p>
          ) : (
            <div className="flex items-end justify-center gap-3 sm:gap-4">
              {[podioBruto[1], podioBruto[0], podioBruto[2]].map((p, col) =>
                p ? <PodioColuna key={p.estudanteId} item={p} av={avatares.get(p.estudanteId)} corLiga={liga.cor} altura={col === 1 ? 'h-24' : col === 0 ? 'h-16' : 'h-12'} /> : <div key={col} className="flex-1" />,
              )}
            </div>
          )}
        </div>

        {/* Semana + Rumo à próxima */}
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Sua semana <span className="font-normal text-muted-foreground">(XP/dia)</span></h3>
              <span className="text-xs font-semibold text-primary">{fmt(resumo?.xpSemana ?? 0)} XP</span>
            </div>
            <div className="flex h-24 items-stretch gap-1.5">
              {semana.map((d) => (
                <div key={d.dia} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div className="w-full rounded-md transition-all" title={`${d.label}: ${fmt(d.xp)} XP`}
                      style={{ height: `${Math.max(4, Math.round((d.xp / maxDia) * 100))}%`, background: d.hoje ? 'var(--brand-accent, var(--primary))' : d.xp > 0 ? 'var(--primary)' : 'var(--muted)', opacity: d.xp > 0 || d.hoje ? 1 : 0.6 }} />
                  </div>
                  <span className={cn('text-[9px]', d.hoje ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-2.5 flex items-center gap-2">
              {proxima ? <EscudoLiga cor={proxima.cor} nome={proxima.nome} className="h-7 w-7" /> : <Crown className="h-5 w-5 text-amber-500" />}
              <h3 className="text-sm font-semibold">{proxima ? `Rumo à ${proxima.nome}` : 'Liga máxima alcançada'}</h3>
              <span className="ml-auto text-sm font-bold tabular-nums" style={{ color: liga.cor }}>{pctTier}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-all" style={{ width: `${pctTier}%`, background: `linear-gradient(90deg, ${liga.cor}, ${proxima?.cor ?? liga.cor})` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {proxima ? (
                <><span className="font-semibold text-foreground">{fmt(xpTotal)} / {fmt(teto)} XP</span> — faltam {fmt(faltam)} XP{simsFaltam > 0 ? ` (~${simsFaltam} simulado${simsFaltam > 1 ? 's' : ''})` : ''}</>
              ) : (
                <>Você está no topo com <span className="font-semibold text-foreground">{fmt(xpTotal)} XP</span>. Continue somando pontos!</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ── RANKING ── */}
      <div data-tour="liga-ranking"><LigaRankingFull corLiga={liga.cor} /></div>

      <MascoteTour ativo />
    </div>
  )
}

function HeroStat({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold leading-none tabular-nums sm:text-[1.6rem]">{valor}</p>
      <p className="mt-1 text-[11px] text-white/55">{rotulo}</p>
    </div>
  )
}

function PodioColuna({ item, av, corLiga, altura }: { item: { estudanteId: string; nome: string; xp: number; posicao: number; eu: boolean }; av?: { avatar: string | null; cor: string | null }; corLiga: string; altura: string }) {
  const primeiro = item.posicao === 1
  const partes = item.nome.split(' ')
  const nomeCurto = partes[0] + (partes[1] ? ` ${partes[1][0]}.` : '')
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      {primeiro && <Crown className="mb-0.5 h-5 w-5 text-amber-400" fill="#fbbf24" />}
      <span className={cn('relative flex shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold uppercase text-white', primeiro ? 'h-14 w-14' : 'h-11 w-11', !av?.cor && 'bg-muted !text-foreground')}
        style={{ ...(av?.cor ? { background: av.cor } : {}), ...(primeiro ? { boxShadow: `0 0 0 2px ${corLiga}` } : {}) }}>
        {av?.avatar
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={av.avatar} alt="" className="h-full w-full object-contain object-[center_82%]" />
          : item.nome.slice(0, 1)}
      </span>
      <p className="mt-1.5 max-w-full truncate text-xs font-semibold">{nomeCurto}{item.eu ? ' (você)' : ''}</p>
      <p className="text-[11px] font-medium text-muted-foreground">{item.xp.toLocaleString('pt-BR')} XP</p>
      <div className={cn('mt-2 flex w-full items-start justify-center rounded-t-xl border border-b-0 pt-2 text-lg font-black tabular-nums', altura)}
        style={{ background: item.eu ? `color-mix(in oklab, ${corLiga} 14%, var(--muted))` : 'var(--muted)', borderColor: item.eu ? corLiga : 'var(--border)', color: item.eu ? corLiga : 'var(--muted-foreground)' }}>
        {item.posicao}º
      </div>
    </div>
  )
}
