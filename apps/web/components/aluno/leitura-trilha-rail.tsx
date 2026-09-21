'use client'

import { useState } from 'react'
import { Flame, Zap, Award, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GamRail } from '@/lib/aluno/trilhas'
import { progressoDesafio, DESAFIO_TIPOS, type DesafioModulo } from '@/lib/leitura/desafios'
import type { DesempenhoLeitura } from '@/lib/leitura/pontuacao'

const fmt = (n: number) => n.toLocaleString('pt-BR')

function Barra({ pct }: { pct: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-[var(--brand-primary,var(--primary))] transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card/75 p-4 shadow-sm backdrop-blur-md">
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

const IconBox = ({ children }: { children: React.ReactNode }) => (
  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--brand-primary,var(--primary))_16%,transparent)] text-[var(--brand-primary,var(--primary))]">{children}</span>
)

/**
 * Coluna de gamificação da trilha "Desafio de Lei Seca" — 4 cards limpos com NOSSOS dados:
 * Progresso da trilha, Ofensiva (streak), Nível (XP) e Próxima medalha (próximo desafio do módulo).
 * Sem fundo/painel externo: cada card tem seu próprio `bg-card` (legível sobre a imagem da trilha).
 */
// Dias 'YYYY-MM-DD' locais.
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export function LeituraTrilhaRail({ done, total, gam, desafios = [], desemp, dias = [] }: {
  done: number; total: number; gam: GamRail
  desafios?: DesafioModulo[]; desemp?: DesempenhoLeitura
  /** Dias (YYYY-MM-DD) em que o aluno teve atividade de leitura — base da Ofensiva/calendário. */
  dias?: string[]
}) {
  const { resumo } = gam
  const [calAberto, setCalAberto] = useState(false)
  const [mesOffset, setMesOffset] = useState(0)
  const [recolhido, setRecolhido] = useState(false) // recolhe/expande TODOS os cards da coluna
  const pctTrilha = total > 0 ? Math.round((done / total) * 100) : 0
  const restantes = Math.max(0, total - done)
  const nivelMax = gam.config.nivel_curva?.nivel_max ?? 30
  const noTopo = resumo.nivel >= nivelMax

  // Próxima medalha = próximo DESAFIO do módulo ainda não concluído (o mais perto de completar).
  const d = desemp ?? { acertos: 0, aulasConcluidas: 0, aulasGabaritadas: 0 }
  const proxDesafio = (desafios.filter((x) => x.ativo).map((x) => ({ x, prog: progressoDesafio(x, d) }))
    .filter((y) => y.prog < y.x.meta)
    .sort((a, b) => (b.prog / b.x.meta) - (a.prog / a.x.meta))[0]) ?? null
  const unidade = (t: DesafioModulo['tipo']) => DESAFIO_TIPOS.find((u) => u.v === t)?.unidade ?? ''
  const pctMedalha = proxDesafio ? Math.round((proxDesafio.prog / proxDesafio.x.meta) * 100) : 0

  // ── Ofensiva pelos DIAS de atividade de leitura (cada dia diferente que fez aula) ──
  const diasSet = new Set(dias)
  const hoje = new Date()
  const isoHoje = isoLocal(hoje)
  // Streak atual: dias consecutivos até hoje (ou ontem, para não zerar no meio do dia).
  let streakAtual = 0
  { const cur = new Date(hoje); if (!diasSet.has(isoLocal(cur))) cur.setDate(cur.getDate() - 1); while (diasSet.has(isoLocal(cur))) { streakAtual++; cur.setDate(cur.getDate() - 1) } }
  // Melhor sequência: maior corrida de dias consecutivos.
  let melhor = 0
  { let run = 0, prev = -1; for (const s of [...diasSet].sort()) { const t = new Date(`${s}T00:00:00`).getTime(); run = prev >= 0 && t - prev === 86_400_000 ? run + 1 : 1; if (run > melhor) melhor = run; prev = t } }
  // Semana atual (domingo → sábado).
  const inicioSem = new Date(hoje); inicioSem.setDate(hoje.getDate() - hoje.getDay())
  const semanaDias = Array.from({ length: 7 }, (_, i) => { const dd = new Date(inicioSem); dd.setDate(inicioSem.getDate() + i); return dd })
  // Calendário — mês navegável (0 = mês do sistema; setas mudam o offset).
  const refMes = new Date(hoje.getFullYear(), hoje.getMonth() + mesOffset, 1)
  const ano = refMes.getFullYear(), mes = refMes.getMonth()
  const blanks = new Date(ano, mes, 1).getDay()
  const numDias = new Date(ano, mes + 1, 0).getDate()
  const nomeMes = refMes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div className="tema-gam space-y-3">
      {/* Todos os cards ficam numa região que RECOLHE/EXPANDE com animação de altura (0fr↔1fr). */}
      <div className={cn('grid transition-[grid-template-rows] duration-500 ease-out', recolhido ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]')}>
        <div className={cn('overflow-hidden transition-opacity duration-300', recolhido ? 'opacity-0' : 'opacity-100')}>
          <div className="space-y-3">
      {/* Progresso da trilha */}
      <Card label="Progresso da trilha">
        <div className="flex items-end justify-between gap-2">
          <p className="leading-none"><span className="text-3xl font-bold tracking-tight">{done}</span> <span className="text-sm text-muted-foreground">/ {total} aula{total !== 1 ? 's' : ''}</span></p>
          <span className="text-sm font-semibold tabular-nums text-muted-foreground">{pctTrilha}%</span>
        </div>
        <div className="mt-2.5"><Barra pct={pctTrilha} /></div>
        <p className="mt-2 text-xs text-muted-foreground">{restantes === 0 ? 'Trilha concluída 🎉' : `Faltam ${restantes} aula${restantes !== 1 ? 's' : ''}`}</p>
      </Card>

      {/* Registro diário (dias de atividade de leitura) — expande para o calendário do mês. */}
      <Card label="Registro diário">
        <div className="flex items-center gap-3">
          <IconBox><Flame className="h-5 w-5" /></IconBox>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-tight">{streakAtual} dia{streakAtual !== 1 ? 's' : ''} seguido{streakAtual !== 1 ? 's' : ''}</p>
            <p className="text-xs text-muted-foreground">melhor sequência: {melhor}</p>
          </div>
          <button type="button" onClick={() => setCalAberto((v) => !v)} aria-label={calAberto ? 'Ver a semana' : 'Ver o mês'} aria-expanded={calAberto}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ChevronDown className={cn('h-4 w-4 transition-transform', calAberto && 'rotate-180')} />
          </button>
        </div>
        {/* Semana (recolhido) */}
        {!calAberto && (
          <div className="mt-3 flex justify-between gap-1.5 motion-safe:animate-in motion-safe:fade-in">
            {semanaDias.map((dd, i) => {
              const on = diasSet.has(isoLocal(dd)); const eHoje = isoLocal(dd) === isoHoje
              return (
                <span key={i} className={cn('flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold',
                  on ? 'bg-[var(--brand-primary,var(--primary))] text-primary-foreground' : 'border text-muted-foreground',
                  eHoje && !on && 'ring-2 ring-[var(--brand-primary,var(--primary))]/60')}>{DOW[dd.getDay()]}</span>
              )
            })}
          </div>
        )}
        {/* Calendário do mês — expande/recolhe com animação de altura; setas navegam os meses. */}
        <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', calAberto ? 'mt-3 grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className="overflow-hidden">
            <div className="mb-2 flex items-center justify-between gap-1">
              <button type="button" onClick={() => setMesOffset((o) => o - 1)} aria-label="Mês anterior" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronLeft className="h-4 w-4" /></button>
              <p className="text-xs font-semibold capitalize text-muted-foreground">{nomeMes}</p>
              <button type="button" onClick={() => setMesOffset((o) => o + 1)} aria-label="Próximo mês" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground">{DOW.map((l, i) => <span key={i}>{l}</span>)}</div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: blanks }).map((_, i) => <span key={`b${i}`} />)}
              {Array.from({ length: numDias }, (_, i) => i + 1).map((dia) => {
                const isod = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
                const on = diasSet.has(isod); const eHoje = isod === isoHoje
                return (
                  <span key={dia} className={cn('mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[11px]',
                    on ? 'bg-[var(--brand-primary,var(--primary))] font-bold text-primary-foreground' : 'text-foreground/70',
                    eHoje && !on && 'ring-1 ring-[var(--brand-primary,var(--primary))]/60')}>{dia}</span>
                )
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Nível (XP) */}
      <Card label="Nível">
        <div className="flex items-center gap-3">
          <IconBox><Zap className="h-5 w-5" /></IconBox>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">{fmt(resumo.xpTotal)} XP · Nível {resumo.nivel}</p>
            <p className="text-xs text-muted-foreground">{noTopo ? 'Nível máximo alcançado 🏆' : `faltam ${fmt(resumo.progresso.xpParaProximo)} XP para o nível ${resumo.nivel + 1}`}</p>
          </div>
        </div>
        <div className="mt-3"><Barra pct={noTopo ? 100 : resumo.progresso.pct} /></div>
      </Card>

      {/* Próxima medalha = próximo desafio do módulo */}
      {proxDesafio && (
        <Card label="Próxima medalha">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <IconBox><Award className="h-5 w-5" /></IconBox>
              <div className="min-w-0">
                <p className="truncate font-bold leading-tight">{proxDesafio.x.titulo}</p>
                <p className="text-xs text-muted-foreground">{proxDesafio.prog} de {proxDesafio.x.meta} {unidade(proxDesafio.x.tipo)}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i < Math.round((pctMedalha / 100) * 4) ? 'bg-[var(--brand-primary,var(--primary))]' : 'bg-muted-foreground/30')} />
              ))}
            </div>
          </div>
        </Card>
      )}
          </div>
        </div>
      </div>

      {/* Card BAIXO (mesma largura) para recolher/expandir todos os cards — seta ao centro que inverte. */}
      <button type="button" onClick={() => setRecolhido((v) => !v)} aria-expanded={!recolhido}
        aria-label={recolhido ? 'Expandir os cards' : 'Recolher os cards'} title={recolhido ? 'Expandir' : 'Recolher'}
        className="group flex w-full items-center justify-center rounded-2xl border bg-card/75 py-2 shadow-sm backdrop-blur-md transition-colors hover:bg-card">
        <ChevronUp className={cn('h-5 w-5 text-muted-foreground transition-transform duration-300 group-hover:text-foreground', recolhido && 'rotate-180')} />
      </button>
    </div>
  )
}
