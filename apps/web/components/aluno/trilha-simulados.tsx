'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Check, Play, Star, Route, Zap, Trophy, CircleCheck, Download } from 'lucide-react'

export interface TrilhaNode {
  id: string
  titulo: string
  quando: string | null
  estado: 'concluido' | 'atual' | 'disponivel'
  acerto: number | null
  nota: number | null
  tentativas: number
  statusLabel: string
  questoes: number
  xp: number
  href: string | null
  acao: string
  capa: string | null
  capaBanner: string | null
  cadernoUrl: string | null
}
export interface Trilha {
  id: string
  nome: string
  cor: string | null
  total: number
  done: number
  trilhaXp: number
  nodes: TrilhaNode[]
}

const COR = 'var(--brand-primary, var(--primary))'

// Card de um simulado. No hover: a info desliza (animada) até a esquerda e as ações surgem à direita.
function NodeCard({ n, gamAtivo }: { n: TrilhaNode; gamAtivo: boolean }) {
  const infoRef = useRef<HTMLDivElement>(null)
  const [dx, setDx] = useState(0)
  const concluido = n.estado === 'concluido'
  const atual = n.estado === 'atual'
  const meta = [n.quando, n.questoes > 0 ? `${n.questoes} questões` : null].filter(Boolean).join(' · ')

  function enter() {
    const el = infoRef.current
    if (el) setDx(-Math.max(0, el.offsetLeft - 16)) // desloca a info até ~16px da borda esquerda
  }
  const leave = () => setDx(0)

  const img = n.capaBanner
  const txtSec = img ? 'text-white/85' : 'text-muted-foreground'

  return (
    <div onMouseEnter={enter} onMouseLeave={leave}
      className={cn('group relative mb-4 mr-8 flex h-40 flex-1 items-center overflow-hidden rounded-2xl border px-5 text-center shadow-sm transition-all duration-200 hover:shadow-md motion-safe:hover:scale-[1.02]',
        img ? 'text-white' : 'bg-card', atual && 'border-primary/40')}>
      {/* Fundo: banner comprido do banco (capa_url, mesmo tamanho do card de personalizar) + degradê */}
      {img && (
        <>
          <img src={img} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-black/10" />
        </>
      )}

      {/* Info — centralizada; desliza suavemente para a esquerda no hover (medido + translateX) */}
      <div ref={infoRef} className={cn('relative mx-auto inline-block max-w-full text-left align-middle transition-transform duration-300 ease-out will-change-transform', img && '[text-shadow:0_1px_3px_rgba(0,0,0,0.7)]')} style={{ transform: `translateX(${dx}px)` }}>
        {atual && <span className="mb-1.5 inline-block rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">Comece aqui</span>}
        <div className="font-semibold leading-snug">{n.titulo}</div>
        <div className={cn('mt-1 text-xs', txtSec)}>
          {concluido ? <span className="inline-flex items-center gap-1"><CircleCheck className="h-3.5 w-3.5" /> Concluído</span> : (meta || 'Disponível')}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {concluido && n.acerto != null && <span className={cn('inline-flex items-center gap-1 text-sm font-medium', img ? 'text-white' : 'text-primary')}><CircleCheck className="h-4 w-4" /> {n.acerto}% de acerto</span>}
          {!concluido && gamAtivo && n.xp > 0 && <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', img ? 'bg-white/15 text-white' : 'border border-primary/40 text-primary')}><Zap className="h-3.5 w-3.5" /> +{n.xp} XP</span>}
          {n.tentativas > 0 && <span className={cn('rounded-full px-2 py-0.5 text-[11px]', img ? 'bg-white/15 text-white/85' : 'bg-muted text-muted-foreground')}>{n.tentativas}x</span>}
        </div>
      </div>

      {/* Ações — surgem no hover deslizando da direita */}
      <div className={cn('absolute inset-y-0 right-0 flex items-center gap-2.5 pl-14 pr-4 opacity-0 translate-x-4 transition-all duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100',
        img ? 'bg-gradient-to-l from-black/90 via-black/80 to-transparent' : 'bg-gradient-to-l from-card via-card to-transparent')}>
        {n.href && (
          <Link href={n.href} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
            <Play className="h-5 w-5" /> {n.acao}
          </Link>
        )}
        {n.cadernoUrl && (
          <a href={n.cadernoUrl} target="_blank" rel="noopener noreferrer" title="Baixar caderno de questões" aria-label="Baixar caderno de questões"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <Download className="h-5 w-5" />
          </a>
        )}
      </div>
    </div>
  )
}

export function TrilhaSimulados({ trilhas, gamAtivo }: { trilhas: Trilha[]; gamAtivo: boolean }) {
  const [ativa, setAtiva] = useState(trilhas[0]?.id)
  const t = trilhas.find((x) => x.id === ativa) ?? trilhas[0]
  if (!t) return null
  const pct = t.total ? Math.round((t.done / t.total) * 100) : 0
  const rolar = t.nodes.length > 3

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight"><Route className="h-5 w-5 text-primary" /> Trilhas de simulados</h2>
        <p className="text-sm text-muted-foreground">Todos os simulados ficam disponíveis — faça na ordem que quiser.</p>
      </div>

      {trilhas.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {trilhas.map((tr) => (
            <button key={tr.id} type="button" onClick={() => setAtiva(tr.id)}
              className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                tr.id === t.id ? 'border-primary/40 bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {tr.nome}
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', tr.id === t.id ? 'bg-primary/20 text-primary' : 'bg-muted')}>{tr.done}/{tr.total}</span>
            </button>
          ))}
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span><span className="font-medium text-foreground">{t.nome}</span> · {t.done}/{t.total} concluídos</span>
          {gamAtivo && t.trilhaXp > 0 && <span>recompensa da trilha: <span className="font-semibold text-primary">+{t.trilhaXp} XP</span></span>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: COR }} />
        </div>
      </div>

      <div className="relative">
        <ol className={cn('min-w-0 space-y-0 py-1', rolar && 'max-h-[36rem] overflow-y-auto pr-1 [scrollbar-width:thin]')}>
          {t.nodes.map((n, i) => {
            const concluido = n.estado === 'concluido'
            const atual = n.estado === 'atual'
            return (
              <li key={n.id} className="flex gap-4">
                <div className="flex flex-col items-center pt-3">
                  <span className="relative flex shrink-0 items-center justify-center rounded-full border-4 shadow-sm"
                    style={{ width: 52, height: 52, ...(concluido ? { background: COR, borderColor: `color-mix(in oklab, ${COR} 70%, #000)`, color: '#fff' }
                      : atual ? { background: `color-mix(in oklab, ${COR} 16%, var(--card))`, borderColor: COR, color: COR }
                      : { background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
                    {atual && <span className="pointer-events-none absolute inset-[-5px] rounded-full border-2 opacity-60 motion-safe:animate-ping" style={{ borderColor: COR }} />}
                    {concluido ? <Check className="h-6 w-6" /> : atual ? <Star className="h-6 w-6" /> : <Play className="h-5 w-5" />}
                  </span>
                  {i < t.nodes.length - 1 && <span className="my-1 w-1 flex-1 rounded-full" style={{ minHeight: 24, background: concluido ? COR : 'var(--border)' }} />}
                </div>

                <NodeCard n={n} gamAtivo={gamAtivo} />
              </li>
            )
          })}

          <li className="flex items-center gap-4">
            <div className="flex w-[52px] justify-center">
              <span className="flex items-center justify-center rounded-full border-4" style={{ width: 48, height: 48, ...(t.done >= t.total ? { background: 'var(--brand-accent, #f59e0b)', borderColor: 'color-mix(in oklab, var(--brand-accent, #f59e0b) 70%, #000)', color: '#fff' } : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
                <Trophy className="h-5 w-5" />
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{t.done >= t.total ? 'Trilha concluída! 🎉' : `Conclua os ${t.total} para o troféu da trilha.`}</span>
          </li>
        </ol>
        {rolar && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-2xl bg-gradient-to-t from-background to-transparent" />}
      </div>
    </section>
  )
}
