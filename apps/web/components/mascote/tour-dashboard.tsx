'use client'

import { Fragment, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Flame, Zap, Gift, Crown, ArrowRight, Sparkles, Check } from 'lucide-react'
import { EscudoLiga } from '@/components/aluno/escudo-liga'
import { Mascote, type ReacaoMascote } from './mascote'

/** Texto em "máquina de escrever". */
function Maquina({ texto }: { texto: string }) {
  const [n, setN] = useState(0)
  useEffect(() => { setN(0); let x = 0; const id = setInterval(() => { x++; setN(x); if (x >= texto.length) clearInterval(id) }, 14); return () => clearInterval(id) }, [texto])
  return <>{texto.slice(0, n)}{n < texto.length && <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-primary align-middle" style={{ height: '1em' }} />}</>
}

// ── Visualizações ──

/** Nível: badge aparece + barra de XP enchendo com brilho. */
function VizNivel() {
  const [w, setW] = useState(0)
  useEffect(() => { const t = setTimeout(() => setW(74), 320); return () => clearTimeout(t) }, [])
  return (
    <div className="w-full">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] text-base font-extrabold tabular-nums" style={{ borderColor: 'var(--brand-primary, var(--primary))', color: 'var(--brand-primary, var(--primary))', animation: 'dash-pop .55s cubic-bezier(.34,1.56,.64,1) both' }}>9</span>
        <span className="text-sm font-semibold text-muted-foreground">Nível</span>
        <span className="ml-auto inline-flex items-center gap-0.5 text-sm font-bold text-primary" style={{ animation: 'dash-rise .5s ease-out .55s both' }}><Zap className="h-4 w-4" /> +XP</span>
      </div>
      <div className="h-3.5 overflow-hidden rounded-full" style={{ background: 'color-mix(in oklab, var(--brand-primary, var(--primary)) 16%, transparent)' }}>
        <div className="relative h-full rounded-full transition-[width] duration-[1300ms] ease-out" style={{ width: `${w}%`, background: 'var(--brand-primary, var(--primary))' }}>
          <span className="absolute inset-y-0 -inset-x-2" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent)', animation: 'dash-shimmer 1.5s ease-in-out 1s infinite' }} />
        </div>
      </div>
    </div>
  )
}

/** Sequência: a semana inteira acende e, ao completar, surge o baú. */
function VizSequencia() {
  const DIAS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
  const fimSemana = 0.2 + DIAS.length * 0.13
  return (
    <div className="flex items-center gap-1.5">
      {DIAS.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground/40">
            <Flame className="h-3.5 w-3.5" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full border border-orange-500 bg-gradient-to-b from-amber-400 to-orange-500 text-white shadow-[0_0_8px_rgba(249,115,22,.5)]" style={{ opacity: 0, animation: `dash-pop .45s ease-out ${0.2 + i * 0.13}s both` }}>
              <Flame className="h-3.5 w-3.5" fill="currentColor" />
            </span>
          </span>
          <span className="text-[8px] font-medium text-muted-foreground">{d}</span>
        </div>
      ))}
      <div className="ml-1 flex flex-col items-center gap-1" style={{ opacity: 0, animation: `dash-pop .55s cubic-bezier(.34,1.56,.64,1) ${fimSemana}s both` }}>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 text-white" style={{ background: 'linear-gradient(to bottom,#fde68a,#f59e0b)', borderColor: '#c07f08', boxShadow: '0 0 13px rgba(245,158,11,.6)' }}><Gift className="h-5 w-5" /></span>
        <span className="text-[8px] font-bold text-amber-600">Baú!</span>
      </div>
    </div>
  )
}

/** Ligas: pódio subindo, com nome em cima e emblema GRANDE de cada liga. */
const PODIO = [
  { nome: 'Bronze', key: 'bronze', cor: '#a16207', h: 14 },
  { nome: 'Prata', key: 'prata', cor: '#94a3b8', h: 24 },
  { nome: 'Ouro', key: 'ouro', cor: '#f59e0b', h: 34 },
  { nome: 'Diamante', key: 'diamante', cor: '#0ea5e9', h: 44 },
  { nome: 'Ametista', key: 'ametista', cor: '#8b5cf6', h: 54 },
]
function VizLigas() {
  const passo = 0.5 // pilares sobem um de cada vez, devagar
  return (
    <div className="flex items-end justify-center gap-2.5">
      {PODIO.map((l, i) => (
        <div key={l.key} className="flex flex-col items-center justify-end gap-1" style={{ animation: `dash-rise .6s cubic-bezier(.34,1.56,.64,1) ${0.15 + i * passo}s both` }}>
          <span className="text-[9px] font-bold" style={{ color: l.cor }}>{l.nome}</span>
          <EscudoLiga cor={l.cor} nome={l.key} ativo={i === PODIO.length - 1} fundo={false} className="h-9 w-9" />
          <div className="w-6 origin-bottom rounded-t-sm" style={{ height: l.h, background: `linear-gradient(to bottom, color-mix(in oklab, ${l.cor} 65%, #fff), ${l.cor})`, animation: `dash-grow .6s ease-out ${0.15 + i * passo}s both` }} />
        </div>
      ))}
    </div>
  )
}

/** Cargos: exemplos de títulos subindo até o topo (o mais alto com coroa dourada). */
const CARGOS = [
  { nome: 'Iniciante', cor: '#94a3b8' },
  { nome: 'Júnior', cor: '#22c55e' },
  { nome: 'Pleno', cor: '#3b82f6' },
  { nome: 'Sênior', cor: '#8b5cf6' },
  { nome: 'Procurador', cor: '#f59e0b', topo: true },
]
function VizCargos() {
  const passo = 0.6 // um cargo de cada vez, bem devagar; a seta aparece logo depois
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {CARGOS.map((c, i) => (
        <Fragment key={c.nome}>
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white', c.topo && 'ring-2 ring-amber-300')} style={{ opacity: 0, background: c.cor, boxShadow: c.topo ? '0 0 12px rgba(245,158,11,.6)' : undefined, animation: `dash-pop .5s cubic-bezier(.34,1.56,.64,1) ${0.15 + i * passo}s both` }}>
            {c.topo && <Crown className="h-3.5 w-3.5" />}{c.nome}
          </span>
          {i < CARGOS.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/45" style={{ opacity: 0, animation: `dash-pop .45s ease-out ${0.15 + i * passo + 0.3}s both` }} />}
        </Fragment>
      ))}
    </div>
  )
}

type CardDef = { key: string; titulo: string; fala: string; desc: string; pose: ReacaoMascote; viz: React.ReactNode }

/** Capivara + balão, do lado do card ativo. `dir`=à direita do pop-up → balão/bico espelhados. */
function CapivaraBalao({ dir, card, sub }: { dir: boolean; card: CardDef; sub: number }) {
  return (
    <div className="flex flex-col items-center" style={{ width: 200 }}>
      <div key={sub} className={cn('relative -mt-10 mb-6 w-[184px] rounded-2xl border bg-card px-3.5 py-3 shadow-2xl motion-safe:animate-[mascote-balao_.35s_ease-out_both]', dir ? 'self-end -mr-14' : 'self-start -ml-14')}>
        <div className="text-xs font-bold text-primary">{card.titulo}</div>
        <p className="mt-0.5 text-sm leading-snug text-foreground"><Maquina key={sub} texto={card.fala} /></p>
        {/* bico suave inclinado apontando para a capivara (espelhado quando ela está à direita) */}
        <svg className={cn('pointer-events-none absolute top-full -mt-px overflow-visible', dir ? 'right-8' : 'left-8')} width="52" height="50" aria-hidden style={dir ? { transform: 'scaleX(-1)' } : undefined}>
          <path d="M0 0 Q 9 26, 36 46 Q 30 22, 24 0 Z" fill="var(--card)" />
          <path d="M0 1.5 Q 9 26, 36 46 Q 30 22, 24 1.5" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <Mascote key={`c${sub}`} reacao={card.pose} tamanho={140} entra flutua espelhar={dir} />
    </div>
  )
}

/**
 * Dashboard de novidades da gamificação: pop-up GRANDE com 4 visualizações animadas
 * (níveis, sequência+baú, ligas, cargos). A capivara fica FORA, sinalizando cada card com um
 * balão que explica passo a passo. `onConcluir` avança o tour; `onPular` encerra.
 */
export function TourDashboard({ onConcluir, onPular, saindo = false }: { onConcluir: () => void; onPular: () => void; saindo?: boolean }) {
  const CARDS: CardDef[] = [
    { key: 'nivel', titulo: 'Níveis & XP', pose: 'satisfeita', desc: 'Ganhe XP e suba de nível a cada estudo.', viz: <VizNivel />, fala: 'Este é o seu NÍVEL! A cada simulado e prática você ganha XP e a barrinha enche até subir de nível. 🚀' },
    { key: 'sequencia', titulo: 'Sequência', pose: 'feliz', desc: 'Check-in diário — semana completa = baú!', viz: <VizSequencia />, fala: 'Faça seu CHECK-IN todo dia pra manter a chama acesa. Completou a semana? Ganha um baú! 🔥' },
    { key: 'ligas', titulo: 'Ligas', pose: 'balanca', desc: 'Escale as ligas acumulando XP.', viz: <VizLigas />, fala: 'Acumule XP e escale as LIGAS: Bronze, Prata, Ouro, Diamante... até a Ametista no topo! 🏆' },
    { key: 'cargos', titulo: 'Cargos', pose: 'ideia', desc: 'Novos títulos conforme você evolui.', viz: <VizCargos />, fala: 'E a cada faixa de nível você conquista um novo CARGO — do Iniciante até o mais alto! ⚖️' },
  ]
  const [sub, setSub] = useState(0)
  const card = CARDS[sub]
  const ultimo = sub >= CARDS.length - 1
  const dir = sub % 2 === 1 // cards da coluna DIREITA (sequência/cargos) → capivara à direita
  const baixo = sub >= 2 // cards de BAIXO (ligas/cargos) → capivara + balão um pouco mais baixos
  const avancar = () => { if (ultimo) onConcluir(); else setSub((s) => s + 1) }

  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl">
        {/* Capivara + balão FORA do pop-up, do lado do card ativo — mais para cima. */}
        <div className={cn('absolute top-1/2 z-[1] hidden lg:block', dir ? 'left-full ml-2' : 'right-full mr-2', baixo ? '-translate-y-[calc(50%-5rem)]' : '-translate-y-[calc(50%+0.5rem)]')}>
          <CapivaraBalao dir={dir} card={card} sub={sub} />
        </div>

        {/* Pop-up grande com os 4 cards; o ativo fica destacado. */}
        <div className={cn('rounded-3xl border bg-card p-5 shadow-2xl sm:p-6', saindo ? 'motion-safe:animate-[tour-out_.38s_ease-in_both]' : 'motion-safe:animate-[tour-in_.45s_cubic-bezier(.34,1.56,.64,1)_both]')}>
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span>
            <div>
              <div className="text-lg font-extrabold text-primary">O que há de novo</div>
              <p className="text-xs text-muted-foreground">O portal ficou gamificado — veja as novidades:</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CARDS.map((c, k) => {
              // Card só "acende" (renderiza a viz) quando a capivara chega nele — animação dispara ao revelar.
              const revelado = k <= sub
              return (
                <div key={c.key} className={cn('rounded-2xl border p-3.5 transition-all duration-300', k === sub ? 'border-primary/50 bg-primary/[0.05] shadow-md ring-2 ring-primary/25' : revelado ? 'bg-muted/15 opacity-55' : 'border-dashed bg-muted/10 opacity-45')}>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">{c.titulo}{k < sub && <Check className="h-3.5 w-3.5 text-emerald-500" />}</div>
                  <div className="flex min-h-[104px] items-center justify-center">{revelado ? c.viz : null}</div>
                  <p className="mt-1 min-h-[1.5em] text-[11px] leading-tight text-muted-foreground">{revelado ? c.desc : ''}</p>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              {CARDS.map((_, k) => <span key={k} className={cn('h-1.5 rounded-full transition-all', k === sub ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30')} />)}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onPular} className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">Pular</button>
              <button type="button" onClick={avancar} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
                {ultimo ? <>Continuar <ArrowRight className="h-4 w-4" /></> : <>Próximo <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
