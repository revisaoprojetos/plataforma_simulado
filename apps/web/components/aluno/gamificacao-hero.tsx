import { Flame, Zap, Trophy, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { ResumoGamificacao } from '@/lib/gamificacao/leitura'

function fmt(n: number) { return n.toLocaleString('pt-BR') }

/**
 * Hero de gamificação do aluno: anel de nível + barra de XP, badge de liga, chama de streak
 * e XP da semana/mês. Componente de exibição puro (server-rendered).
 */
export function GamificacaoHero({ nome, resumo }: { nome: string; resumo: ResumoGamificacao }) {
  const { progresso, liga, proxima, streakAtual, xpTotal, xpSemana, xpMes } = resumo
  const raio = 34
  const circ = 2 * Math.PI * raio
  const dash = circ * (progresso.pct / 100)

  return (
    <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-card to-muted/30 shadow-sm">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
        {/* Nível: anel + XP */}
        <div className="flex items-center gap-4">
          <div className="relative h-[84px] w-[84px] shrink-0">
            <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
              <circle cx="42" cy="42" r={raio} fill="none" stroke="color-mix(in oklab, var(--muted-foreground) 22%, transparent)" strokeWidth="7" />
              <circle cx="42" cy="42" r={raio} fill="none" stroke="var(--brand-primary, var(--primary))" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} className="transition-all duration-700" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nível</span>
              <span className="text-2xl font-bold leading-none tabular-nums">{progresso.nivel}</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--brand-accent, var(--primary))' }}>
              <Zap className="h-3.5 w-3.5" /> {fmt(xpTotal)} XP total
            </div>
            <h2 className="truncate text-lg font-bold tracking-tight">Continue firme, {nome.split(' ')[0]}!</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Faltam <span className="font-semibold text-foreground">{fmt(progresso.xpParaProximo)} XP</span> para o nível {progresso.nivel + 1}.
            </p>
            <div className="mt-2 h-2 w-48 max-w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progresso.pct}%`, background: 'var(--brand-primary, var(--primary))' }} />
            </div>
          </div>
        </div>

        {/* Métricas: streak + liga + semana */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Metrica icon={<Flame className="h-4 w-4 text-orange-500" />} valor={`${streakAtual}`} label={streakAtual === 1 ? 'dia' : 'dias'} sub="sequência" />
          <Link href="/aluno/ligas" className="group">
            <Metrica
              icon={<Trophy className="h-4 w-4" style={{ color: liga.cor }} />}
              valor={liga.nome}
              label={proxima ? `+${fmt(Math.max(0, proxima.xp_min - xpTotal))} p/ ${proxima.nome}` : 'topo'}
              sub={<span className="inline-flex items-center gap-0.5 group-hover:text-foreground">liga <ChevronRight className="h-3 w-3" /></span>}
            />
          </Link>
          <Metrica icon={<Zap className="h-4 w-4" style={{ color: 'var(--brand-accent, var(--primary))' }} />} valor={fmt(xpSemana)} label="XP" sub="esta semana" tituloExtra={`Mês: ${fmt(xpMes)} XP`} />
        </div>
      </div>
    </div>
  )
}

function Metrica({ icon, valor, label, sub, tituloExtra }: { icon: React.ReactNode; valor: string; label: React.ReactNode; sub: React.ReactNode; tituloExtra?: string }) {
  return (
    <div className="rounded-xl border bg-card/60 p-2.5 text-center transition-colors hover:border-primary/40" title={tituloExtra}>
      <div className="mb-1 flex justify-center">{icon}</div>
      <div className="truncate text-base font-bold leading-tight tabular-nums">{valor}</div>
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground/70">{sub}</div>
    </div>
  )
}
