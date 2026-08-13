'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Zap, Medal, ArrowRight, Flame } from 'lucide-react'
import { tituloParaNivel } from '@/lib/gamificacao/niveis'
import type { NivelCurva } from '@/lib/gamificacao/config'

export type GanhoXp = { icon: React.ReactNode; label: string; xp: number }
export type ConquistaUp = { icon: React.ReactNode; title: string; desc: string }

const A = 'var(--brand-primary, var(--primary))'
const mix = (pct: number, com: string) => `color-mix(in oklab, ${A} ${pct}%, ${com})`
const C100 = mix(30, 'white'), C200 = mix(55, 'white'), C300 = mix(70, 'white')
const C700 = mix(80, 'black'), C800 = mix(68, 'black'), C900 = mix(55, 'black')

type Confete = { left: string; size: string; color: string; radius: string; dur: string; delay: string }
type St = { level: number; fill: number; playing: boolean; done: boolean; badgePop: boolean; promoted: string | null; confetti: Confete[]; flash: boolean; shaking: boolean; xpShown: number; xpTarget: number }

/**
 * Animação de subida de nível (1 ou vários de uma vez): anel de XP enche por nível, confete/flash,
 * disco de nível, cargo novo, ganhos por origem, conquistas e totais. Porte fiel do mockup.
 */
export function LevelUpModal({ from, to, curva, gains, unlocked, xpGanho, totalXp, streak, badgesLabel, onClose }: {
  from: number
  to: number
  curva: NivelCurva
  gains: GanhoXp[]
  unlocked: ConquistaUp[]
  xpGanho: number
  totalXp: number
  streak: number
  badgesLabel: string
  onClose: () => void
}) {
  const [st, setSt] = useState<St>({ level: from, fill: 0, playing: true, done: false, badgePop: false, promoted: null, confetti: [], flash: false, shaking: false, xpShown: 0, xpTarget: 0 })
  const timers = useRef<any[]>([])
  const xpInt = useRef<any>(null)
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms))
  const cargo = (lvl: number) => tituloParaNivel(lvl, curva.titulos)
  const sessionXp = gains.length ? gains.reduce((a, g) => a + g.xp, 0) : xpGanho
  const span = Math.max(1, to - from)
  const multi = span > 1

  useEffect(() => {
    xpInt.current = setInterval(() => {
      setSt((s) => (s.xpShown >= s.xpTarget ? s : { ...s, xpShown: Math.min(s.xpTarget, s.xpShown + Math.max(1, Math.ceil((s.xpTarget - s.xpShown) * 0.14))) }))
    }, 50)
    const step = (lvl: number) => {
      setSt((s) => ({ ...s, fill: 100, xpTarget: Math.round(sessionXp * ((lvl - from + 1) / span)) }))
      later(() => {
        const next = lvl + 1
        const promoveu = cargo(next) !== cargo(lvl)
        setSt((s) => ({ ...s, level: next, fill: 0, badgePop: true, promoted: promoveu ? cargo(next) : s.promoted, flash: true, shaking: true, confetti: s.confetti.concat(makeConfetti(14)) }))
        later(() => setSt((s) => ({ ...s, badgePop: false, flash: false, shaking: false })), 340)
        if (next < to) later(() => step(next), multi ? 300 : 400)
        else later(() => setSt((s) => ({ ...s, playing: false, done: true, fill: 100, xpTarget: sessionXp, confetti: s.confetti.concat(makeConfetti(70)) })), 60)
      }, multi ? 780 : 1050)
    }
    later(() => step(from), 400)
    return () => { timers.current.forEach(clearTimeout); clearInterval(xpInt.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (typeof document === 'undefined') return null
  const dash = `${((st.fill / 100) * 603).toFixed(0)} 603`
  const stepsArr: { label: number; hasLine: boolean; lineColor: string; bg: string; border: string; color: string }[] = []
  for (let l = from; l <= to; l++) {
    const passou = st.level >= l
    stepsArr.push({ label: l, hasLine: l > from, lineColor: passou ? C700 : 'var(--border)', bg: passou ? C800 : 'transparent', border: passou ? C700 : 'var(--border)', color: passou ? C100 : 'var(--muted-foreground)' })
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex overflow-auto" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      {/* Backdrop: glow + raios */}
      <div className="pointer-events-none fixed inset-0" style={{ background: `radial-gradient(circle at 50% 40%, ${C900} 0%, transparent 52%)`, animation: 'lvl-glow 3.2s ease-in-out infinite' }} />
      <div className="pointer-events-none fixed" style={{ left: '50%', top: '40%', width: 960, height: 960, margin: '-480px 0 0 -480px', background: `repeating-conic-gradient(from 0deg, transparent 0deg 26deg, ${mix(32, 'transparent')} 26deg 30deg)`, WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 60%)', maskImage: 'radial-gradient(circle, black 0%, transparent 60%)', animation: 'lvl-spin 46s linear infinite' }} />

      {/* Confete */}
      {st.confetti.map((c, i) => (
        <div key={i} className="pointer-events-none fixed top-0" style={{ left: c.left, width: c.size, height: c.size, background: c.color, borderRadius: c.radius, animation: `lvl-confetti ${c.dur} linear ${c.delay} both` }} />
      ))}
      {/* Flash */}
      {st.flash && <div className="pointer-events-none fixed inset-0 z-[4]" style={{ background: `radial-gradient(circle at 50% 42%, ${C800} 0%, transparent 60%)`, animation: 'lvl-flash .35s ease-out both' }} />}

      <div className="relative m-auto flex flex-col items-center py-8">
        <div className="relative flex flex-col items-center gap-4 px-6 text-center" style={{ animation: st.shaking ? 'lvl-shake .34s ease-in-out' : 'none' }}>
          <div className="flex items-center gap-3 text-[12px] uppercase tracking-[0.24em]" style={{ color: C300 }}>
            <span className="h-px w-11" style={{ background: `linear-gradient(90deg, transparent, ${A})` }} />
            {st.done ? 'Parabéns' : 'Subindo de nível'}
            <span className="h-px w-11" style={{ background: `linear-gradient(90deg, ${A}, transparent)` }} />
          </div>

          {/* Badge cluster */}
          <div className="relative transition-transform duration-300" style={{ width: 230, height: 230, transform: `scale(${st.badgePop ? 1.28 : 1})`, transitionTimingFunction: 'cubic-bezier(.34,1.56,.64,1)' }}>
            <div className="absolute inset-0 rounded-full" style={{ border: `1px dashed ${C800}`, animation: 'lvl-spin 24s linear infinite' }} />
            <div className="absolute rounded-full" style={{ inset: 8, border: '1px dashed var(--border)', animation: 'lvl-spin-rev 34s linear infinite' }} />
            {/* XP ring */}
            <svg viewBox="0 0 230 230" className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="115" cy="115" r="96" fill="none" stroke="var(--muted)" strokeWidth="9" />
              <circle cx="115" cy="115" r="96" fill="none" stroke={A} strokeWidth="9" strokeLinecap="round" strokeDasharray={dash}
                style={{ transition: `stroke-dasharray ${multi ? '.72s' : '1s'} cubic-bezier(.05,.75,.15,1)`, filter: st.fill >= 100 ? `drop-shadow(0 0 12px ${C700})` : 'none' }} />
            </svg>
            {/* bursts + float ao subir */}
            {st.badgePop && (
              <>
                <div className="pointer-events-none absolute rounded-full" style={{ inset: 14, border: `3px solid ${C300}`, animation: 'lvl-ringburst .5s ease-out both' }} />
                <div className="pointer-events-none absolute left-1/2 top-[-6px] z-[3] whitespace-nowrap text-[16px] font-bold" style={{ color: C200, textShadow: `0 0 12px ${C800}`, animation: 'lvl-floatup .9s ease-out both' }}>+1 nível</div>
              </>
            )}
            {/* disco */}
            <div className="absolute flex flex-col items-center justify-center rounded-full shadow-lg" style={{ inset: 32, background: `radial-gradient(circle at 50% 30%, ${C800}, ${C900} 70%)`, border: `2px solid ${C700}` }}>
              <span className="text-[11px] uppercase tracking-[0.16em]" style={{ color: C300 }}>Nível</span>
              <span className="text-[74px] font-extrabold leading-none tabular-nums" style={{ color: C100, animation: st.badgePop ? 'lvl-numpop .4s cubic-bezier(.34,1.56,.64,1) both' : 'none' }}>{st.level}</span>
              <span className="min-h-[14px] text-[11px]" style={{ color: C300 }}>{cargo(st.level)}</span>
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center">
            {stepsArr.map((s, i) => (
              <div key={i} className="flex items-center">
                {s.hasLine && <div className="h-0.5 w-[34px] transition-colors duration-500" style={{ background: s.lineColor }} />}
                <div className="grid h-[30px] w-[30px] place-items-center rounded-full text-[12.5px] font-bold transition-all duration-500" style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Contador de XP */}
          <div className="flex min-h-[30px] items-center gap-2 text-[22px] font-extrabold" style={{ color: C200 }}>
            <Zap className="h-5 w-5" style={{ color: C300 }} />+{st.xpShown.toLocaleString('pt-BR')} XP
          </div>

          {st.done && (
            <div className="flex flex-col items-center gap-3">
              <h2 className="m-0 bg-clip-text text-2xl font-extrabold text-transparent" style={{ backgroundImage: `linear-gradient(100deg, var(--foreground) 40%, ${C200} 50%, var(--foreground) 60%)`, backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', animation: 'lvl-rise .5s ease both, lvl-shimmer 3s linear 1s infinite' }}>
                {span === 1 ? `Você alcançou o nível ${to}!` : `Você subiu ${span} níveis de uma vez!`}
              </h2>
              <div className="text-sm" style={{ color: 'var(--muted-foreground)', animation: 'lvl-rise .5s ease .1s both' }}>
                {span === 1 ? 'Continue para manter a sequência' : `Do nível ${from} ao ${to}`}
              </div>

              {st.promoted && (
                <div className="flex w-screen max-w-[640px] origin-center items-center justify-center gap-3 py-3.5 shadow-md" style={{ background: C900, animation: 'lvl-band .55s cubic-bezier(.2,.8,.2,1) .2s both' }}>
                  <Medal className="h-6 w-6" style={{ color: C200 }} />
                  <div className="text-left">
                    <div className="text-[10.5px] uppercase tracking-[0.14em]" style={{ color: C300 }}>Novo cargo</div>
                    <div className="whitespace-nowrap text-lg font-bold" style={{ color: C100 }}>{st.promoted}</div>
                  </div>
                </div>
              )}

              {gains.length > 0 && (
                <div className="flex w-[340px] max-w-[86vw] flex-col gap-1.5" style={{ animation: 'lvl-rise .5s ease .25s both' }}>
                  {gains.map((g, i) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px]" style={{ background: 'color-mix(in oklab, var(--card) 75%, transparent)', borderColor: 'var(--border)' }}>
                      <span className="w-[18px] text-center" style={{ color: C300 }}>{g.icon}</span>
                      <span className="flex-1 text-left text-muted-foreground">{g.label}</span>
                      <span className="whitespace-nowrap font-medium" style={{ color: C200 }}>+{g.xp} XP</span>
                    </div>
                  ))}
                </div>
              )}

              {unlocked.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2.5" style={{ animation: 'lvl-rise .5s ease .3s both' }}>
                  {unlocked.map((u, i) => (
                    <div key={i} title={u.desc} className="flex items-center gap-2.5 rounded-lg border px-3.5 py-2" style={{ background: C900, borderColor: C700 }}>
                      <span style={{ color: C300 }}>{u.icon}</span>
                      <div className="text-left">
                        <div className="text-[9.5px] uppercase tracking-[0.12em]" style={{ color: C300 }}>Conquista</div>
                        <div className="whitespace-nowrap text-[13px]" style={{ color: C100 }}>{u.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-4 text-xs" style={{ color: 'var(--muted-foreground)', animation: 'lvl-rise .5s ease .35s both' }}>
                <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" style={{ color: C300 }} />{totalXp.toLocaleString('pt-BR')} XP acumulado</span>
                <span className="inline-flex items-center gap-1.5"><Medal className="h-3.5 w-3.5" style={{ color: C300 }} />{badgesLabel} conquistas</span>
                <span className="inline-flex items-center gap-1.5"><Flame className="h-3.5 w-3.5" style={{ color: C300 }} />{streak} dias</span>
              </div>

              <button type="button" onClick={onClose} className="mt-1 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ background: A, animation: 'lvl-rise .5s ease .4s both' }}>
                Continuar estudando <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
          {st.playing && <div className="text-[13px] uppercase tracking-[0.1em]" style={{ color: 'var(--muted-foreground)' }}>Ganhando XP…</div>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function makeConfetti(count: number): Confete[] {
  const ramp = [A, C300, C700, C200, 'var(--muted-foreground)']
  return Array.from({ length: count }, (_, i) => ({
    left: (rand(i, 'l') * 100).toFixed(1) + '%',
    size: (5 + rand(i, 's') * 8).toFixed(0) + 'px',
    color: ramp[i % ramp.length],
    radius: i % 3 === 0 ? '50%' : '2px',
    dur: (2.2 + rand(i, 'd') * 2).toFixed(1) + 's',
    delay: (rand(i, 'y') * 0.7).toFixed(2) + 's',
  }))
}
function rand(i: number, s: string): number {
  let h = 2166136261 ^ i
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619)
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  return ((h >>> 0) % 10000) / 10000
}
