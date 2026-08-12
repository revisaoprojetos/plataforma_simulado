'use client'

import { ClipboardList, BookOpen, Award, Flame, Target, Gift, TrendingUp, Infinity as InfinityIcon } from 'lucide-react'
import type { MetricasGam } from '@/lib/gamificacao/metricas'

const fmt = (n: number) => n.toLocaleString('pt-BR')

function Stat({ icon: Icon, titulo, xp, detalhe, tone = 'primary' }: { icon: any; titulo: string; xp: string; detalhe: string; tone?: 'primary' | 'muted' }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}><Icon className="h-4 w-4" /></span>
        <span className="text-sm font-medium">{titulo}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{xp}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{detalhe}</div>
    </div>
  )
}

export function MetricasView({ m }: { m: MetricasGam }) {
  return (
    <div className="space-y-5">
      {/* Resumo: XP único + nível alcançável */}
      <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.08] to-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary"><TrendingUp className="h-3.5 w-3.5" /> Potencial do conteúdo atual</div>
            <div className="text-3xl font-bold tabular-nums">{fmt(m.xpUnicoTotal)} <span className="text-lg font-medium text-muted-foreground">XP únicos</span></div>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">Somando <strong>todos os simulados</strong> (gabarito 100%), <strong>o banco de questões</strong> (acertando cada uma 1×) e <strong>todas as conquistas</strong>. Não inclui fontes recorrentes (streak/missões).</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nível alcançável</div>
            <div className="text-3xl font-bold tabular-nums text-primary">{m.nivelAlcancavel}<span className="text-base font-medium text-muted-foreground"> / {m.nivelMax}</span></div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">só com XP único</div>
          </div>
        </div>
        <div className={`mt-3 rounded-lg border p-3 text-sm ${m.atingeMaxComUnico ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400' : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400'}`}>
          {m.atingeMaxComUnico
            ? <>O conteúdo atual já permite alcançar o <strong>nível máximo ({m.nivelMax})</strong>. XP para o nível máximo: {fmt(m.xpParaNivelMax)}.</>
            : <>Para o <strong>nível máximo ({m.nivelMax})</strong> são necessários {fmt(m.xpParaNivelMax)} XP. Faltam {fmt(Math.max(0, m.xpParaNivelMax - m.xpUnicoTotal))} XP — alcançáveis com as <strong>fontes recorrentes</strong> (streak, missões diárias).</>}
        </div>
      </div>

      {/* Fontes finitas (uma vez) */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Fontes de pontuação (uma vez)</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={ClipboardList} titulo="Simulados" xp={`${fmt(m.simulados.xp)} XP`} detalhe={`${fmt(m.simulados.qtd)} simulados · ${fmt(m.simulados.questoes)} questões (gabarito 100%)`} />
          <Stat icon={BookOpen} titulo="Banco de questões" xp={`${fmt(m.banco.xp)} XP`} detalhe={`${fmt(m.banco.questoes)} questões acertadas 1× (a prática é repetível)`} />
          <Stat icon={Award} titulo="Conquistas" xp={`${fmt(m.conquistas.xp)} XP`} detalhe={`${fmt(m.conquistas.qtd)} conquistas`} />
        </div>
      </div>

      {/* Fontes recorrentes */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><InfinityIcon className="h-4 w-4 text-muted-foreground" /> Fontes recorrentes (por tempo)</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={Flame} titulo="Streak (sequência)" xp={`até ${fmt(m.recorrentes.streakDiaMax)} XP/dia`} detalhe="cresce com a sequência, até o teto diário" tone="muted" />
          <Stat icon={Target} titulo="Missões diárias" xp={`${fmt(m.recorrentes.missoesDia)} XP/dia`} detalhe={`${fmt(m.recorrentes.missoesQtd)} missões por dia`} tone="muted" />
          <Stat icon={Gift} titulo="Baú de sequência" xp={`${fmt(m.recorrentes.chestXp)} XP`} detalhe={`a cada ${fmt(m.recorrentes.chestCadaN)} dias de sequência`} tone="muted" />
        </div>
      </div>
    </div>
  )
}
