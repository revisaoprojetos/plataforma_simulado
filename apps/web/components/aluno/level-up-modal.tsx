'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Zap, Medal, ArrowRight, Flame, Trophy, Sparkles } from 'lucide-react'
import { tituloParaNivel } from '@/lib/gamificacao/niveis'
import type { NivelCurva } from '@/lib/gamificacao/config'

export type GanhoXp = { icon: React.ReactNode; label: string; xp: number }
export type ConquistaUp = { icon: React.ReactNode; title: string; desc: string }

// Paleta ESCURA própria (independe do tema claro/escuro).
const A = 'var(--brand-primary, var(--primary))'
const mix = (p: number, c: string) => `color-mix(in oklab, ${A} ${p}%, ${c})`
const L1 = mix(28, 'white'), L2 = mix(52, 'white'), L3 = mix(72, 'white')
const D2 = mix(60, '#0a0a14'), D3 = mix(38, '#0a0a14'), D4 = mix(22, '#0a0a14')
const FG = '#f3f2fb', MUT = '#a7a6bd', SURF = 'rgba(255,255,255,0.045)', DIV = 'rgba(255,255,255,0.10)', TRACK = 'rgba(255,255,255,0.10)'
const R = 90, CIRC = 2 * Math.PI * R

type St = { level: number; fill: number; playing: boolean; done: boolean; pop: boolean; promoted: string | null; xpShown: number; xpTarget: number; burst: number }

/** Modal de subida de nível (v2): órbita/halo pulsando, anel de XP enchendo por nível, disco
 * com número saltando, rajada de partículas contida, cargo, ganhos e totais. Suporta multi-nível. */
export function LevelUpModal({ from, to, curva, gains, unlocked, xpGanho, totalXp, streak, badgesLabel, onClose }: {
  from: number; to: number; curva: NivelCurva; gains: GanhoXp[]; unlocked: ConquistaUp[]
  xpGanho: number; totalXp: number; streak: number; badgesLabel: string; onClose: () => void
}) {
  const [st, setSt] = useState<St>({ level: from, fill: 0, playing: true, done: false, pop: false, promoted: null, xpShown: 0, xpTarget: 0, burst: 0 })
  const timers = useRef<any[]>([])
  const xpInt = useRef<any>(null)
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms))
  const cargo = (lvl: number) => tituloParaNivel(lvl, curva.titulos)
  const sessionXp = gains.length ? gains.reduce((a, g) => a + g.xp, 0) : xpGanho
  const span = Math.max(1, to - from)
  const multi = span > 1

  useEffect(() => {
    xpInt.current = setInterval(() => setSt((s) => (s.xpShown >= s.xpTarget ? s : { ...s, xpShown: Math.min(s.xpTarget, s.xpShown + Math.max(1, Math.ceil((s.xpTarget - s.xpShown) * 0.12))) })), 40)
    const step = (lvl: number) => {
      setSt((s) => ({ ...s, fill: 100, xpTarget: Math.round(sessionXp * ((lvl - from + 1) / span)) }))
      later(() => {
        const next = lvl + 1
        const promoveu = cargo(next) !== cargo(lvl)
        setSt((s) => ({ ...s, level: next, fill: 0, pop: true, burst: s.burst + 1, promoted: promoveu ? cargo(next) : s.promoted }))
        later(() => setSt((s) => ({ ...s, pop: false })), 420)
        if (next < to) later(() => step(next), multi ? 340 : 460)
        else later(() => setSt((s) => ({ ...s, playing: false, done: true, fill: 100, xpTarget: sessionXp })), 120)
      }, multi ? 720 : 1000)
    }
    later(() => step(from), 450)
    return () => { timers.current.forEach(clearTimeout); clearInterval(xpInt.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (typeof document === 'undefined') return null
  const dash = `${((st.fill / 100) * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`
  const steps: { n: number; passou: boolean }[] = []
  for (let l = from; l <= to; l++) steps.push({ n: l, passou: st.level >= l })

  return createPortal(
    <div className="fixed inset-0 z-[200] flex overflow-auto" style={{ background: 'radial-gradient(circle at 50% 34%, #1a1730 0%, #0b0912 62%)', color: FG, animation: 'lu-in .3s ease both' }}>
      {/* Fundo: auroras + estrelas (contidas) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute rounded-full blur-3xl" style={{ left: '18%', top: '10%', width: 520, height: 520, background: mix(45, 'transparent'), opacity: 0.5, animation: 'lu-aurora1 14s ease-in-out infinite' }} />
        <div className="absolute rounded-full blur-3xl" style={{ right: '12%', top: '30%', width: 460, height: 460, background: mix(35, 'transparent'), opacity: 0.4, animation: 'lu-aurora2 18s ease-in-out infinite' }} />
        {Array.from({ length: 34 }).map((_, i) => (
          <div key={`s${i}`} className="absolute rounded-full" style={{ left: `${(rand(i, 'x') * 100).toFixed(1)}%`, top: `${(rand(i, 'y') * 100).toFixed(1)}%`, width: 2 + (i % 2), height: 2 + (i % 2), background: '#fff', animation: `lu-twinkle ${2.5 + (i % 4)}s ease-in-out ${(i * 0.17).toFixed(1)}s infinite` }} />
        ))}
      </div>

      <div className="relative z-[1] m-auto flex flex-col items-center gap-5 px-6 py-10 text-center">
        {/* Kicker */}
        <div className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.28em]" style={{ color: L3, animation: 'lu-rise .5s ease both' }}>
          <span className="h-px w-10" style={{ background: `linear-gradient(90deg, transparent, ${A})` }} />
          {st.done ? 'Parabéns' : 'Subindo de nível'}
          <span className="h-px w-10" style={{ background: `linear-gradient(90deg, ${A}, transparent)` }} />
        </div>

        {/* Badge */}
        <div className="relative" style={{ width: 236, height: 236 }}>
          {/* halo pulsante */}
          <div className="absolute rounded-full blur-2xl" style={{ inset: 10, background: `radial-gradient(circle, ${mix(55, 'transparent')}, transparent 70%)`, animation: 'lu-halo 2.6s ease-in-out infinite' }} />
          {/* órbita de acento girando */}
          <div className="absolute rounded-full" style={{ inset: 0, background: `conic-gradient(from 0deg, transparent 0deg, ${mix(60, 'transparent')} 40deg, transparent 90deg, transparent 180deg, ${mix(40, 'transparent')} 220deg, transparent 270deg)`, WebkitMaskImage: 'radial-gradient(circle, transparent 62%, black 64%, black 72%, transparent 74%)', maskImage: 'radial-gradient(circle, transparent 62%, black 64%, black 72%, transparent 74%)', animation: 'lu-spin 8s linear infinite' }} />
          <div className="absolute rounded-full" style={{ inset: 6, border: `1px dashed ${DIV}`, animation: 'lu-spin 30s linear infinite reverse' }} />
          {/* pulsos ao subir */}
          {st.pop && <div key={`p${st.burst}`} className="pointer-events-none absolute rounded-full" style={{ inset: 18, border: `3px solid ${L2}`, animation: 'lu-ringpulse .7s ease-out both' }} />}
          {/* anel de XP */}
          <svg viewBox="0 0 236 236" className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="118" cy="118" r={R} fill="none" stroke={TRACK} strokeWidth="8" />
            <circle cx="118" cy="118" r={R} fill="none" stroke={A} strokeWidth="8" strokeLinecap="round" strokeDasharray={dash}
              style={{ transition: `stroke-dasharray ${multi ? '.68s' : '.95s'} cubic-bezier(.05,.75,.15,1)`, filter: `drop-shadow(0 0 8px ${mix(50, 'transparent')})` }} />
          </svg>
          {/* rajada de partículas (contida no badge) */}
          {st.pop && (
            <div key={`b${st.burst}`} className="pointer-events-none absolute inset-0">
              {Array.from({ length: 16 }).map((_, i) => {
                const ang = (i / 16) * Math.PI * 2, dist = 92 + (i % 3) * 16
                return <span key={i} className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full" style={{ marginLeft: -4, marginTop: -4, background: i % 2 ? L2 : A, ['--bx' as any]: `${(Math.cos(ang) * dist).toFixed(0)}px`, ['--by' as any]: `${(Math.sin(ang) * dist).toFixed(0)}px`, animation: 'lu-burst .7s ease-out both' }} />
              })}
            </div>
          )}
          {/* "+1 nível" flutuando */}
          {st.pop && <div key={`f${st.burst}`} className="pointer-events-none absolute left-1/2 top-2 z-[3] whitespace-nowrap text-sm font-bold" style={{ color: L2, textShadow: `0 0 12px ${mix(60, 'transparent')}`, animation: 'lu-float .9s ease-out both' }}>+1 nível</div>}
          {/* disco */}
          <div className="absolute flex flex-col items-center justify-center rounded-full" style={{ inset: 30, background: `radial-gradient(circle at 50% 26%, ${D3}, ${D2} 72%)`, border: `2px solid ${mix(55, 'transparent')}`, boxShadow: `inset 0 2px 10px rgba(255,255,255,0.10), 0 12px 34px -8px ${mix(50, 'black')}`, transform: st.pop ? undefined : undefined, animation: st.pop ? 'lu-pop .42s cubic-bezier(.34,1.56,.64,1)' : 'none' }}>
            <span className="text-[11px] uppercase tracking-[0.18em]" style={{ color: L3 }}>Nível</span>
            <span key={st.level} className="text-[68px] font-black leading-none tabular-nums" style={{ color: FG, animation: 'lu-numpop .42s cubic-bezier(.34,1.56,.64,1) both' }}>{st.level}</span>
            <span className="min-h-[15px] text-[11px]" style={{ color: L3 }}>{cargo(st.level)}</span>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center">
              {i > 0 && <div className="h-[3px] w-9 rounded transition-colors duration-500" style={{ background: s.passou ? A : DIV }} />}
              <div className="grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold transition-all duration-500" style={{ background: s.passou ? mix(30, 'transparent') : 'transparent', border: `1.5px solid ${s.passou ? A : DIV}`, color: s.passou ? L1 : MUT, boxShadow: s.passou ? `0 0 12px ${mix(45, 'transparent')}` : 'none' }}>{s.n}</div>
            </div>
          ))}
        </div>

        {/* Contador de XP */}
        <div className="flex min-h-[30px] items-center gap-2 text-[24px] font-black" style={{ color: L2 }}>
          <Zap className="h-5 w-5" style={{ color: L3 }} />+{st.xpShown.toLocaleString('pt-BR')} XP
        </div>

        {st.done && (
          <div className="flex flex-col items-center gap-3">
            <h2 className="m-0 bg-clip-text text-[26px] font-black text-transparent" style={{ backgroundImage: `linear-gradient(100deg, ${FG} 42%, ${L2} 50%, ${FG} 58%)`, backgroundSize: '220% 100%', WebkitBackgroundClip: 'text', animation: 'lu-rise .5s ease both, lu-shimmer 3.2s linear .8s infinite' }}>
              {span === 1 ? `Você alcançou o nível ${to}!` : `Você subiu ${span} níveis de uma vez!`}
            </h2>
            <div className="text-sm" style={{ color: MUT, animation: 'lu-rise .5s ease .08s both' }}>
              {span === 1 ? 'Continue assim para manter o ritmo' : `Do nível ${from} ao ${to} de uma vez`}
            </div>

            {st.promoted && (
              <div className="flex w-full max-w-[460px] items-center justify-center gap-3 rounded-xl border px-5 py-3.5" style={{ background: D4, borderColor: mix(45, 'transparent'), boxShadow: `0 0 30px -10px ${mix(50, 'transparent')}`, animation: 'lu-rise .5s ease .16s both' }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: mix(28, 'transparent'), color: L2 }}><Medal className="h-5 w-5" /></span>
                <div className="text-left">
                  <div className="text-[10.5px] uppercase tracking-[0.16em]" style={{ color: L3 }}>Novo cargo</div>
                  <div className="whitespace-nowrap text-lg font-bold" style={{ color: L1 }}>{st.promoted}</div>
                </div>
              </div>
            )}

            {gains.length > 0 && (
              <div className="flex w-[360px] max-w-[88vw] flex-col gap-1.5">
                {gains.map((g, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[13px]" style={{ background: SURF, borderColor: DIV, animation: `lu-rise .45s ease ${(0.22 + i * 0.06).toFixed(2)}s both` }}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: mix(20, 'transparent'), color: L3 }}>{g.icon}</span>
                    <span className="flex-1 text-left" style={{ color: '#cfced9' }}>{g.label}</span>
                    <span className="whitespace-nowrap font-semibold" style={{ color: L2 }}>+{g.xp} XP</span>
                  </div>
                ))}
              </div>
            )}

            {unlocked.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2.5" style={{ animation: 'lu-rise .5s ease .32s both' }}>
                {unlocked.map((u, i) => (
                  <div key={i} title={u.desc} className="flex items-center gap-2.5 rounded-xl border px-3.5 py-2" style={{ background: D4, borderColor: mix(40, 'transparent') }}>
                    <span style={{ color: L3 }}>{u.icon}</span>
                    <div className="text-left">
                      <div className="text-[9.5px] uppercase tracking-[0.12em]" style={{ color: L3 }}>Conquista</div>
                      <div className="whitespace-nowrap text-[13px]" style={{ color: L1 }}>{u.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs" style={{ color: MUT, animation: 'lu-rise .5s ease .38s both' }}>
              <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" style={{ color: L3 }} />{totalXp.toLocaleString('pt-BR')} XP acumulado</span>
              <span className="inline-flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" style={{ color: L3 }} />{badgesLabel} conquistas</span>
              <span className="inline-flex items-center gap-1.5"><Flame className="h-3.5 w-3.5" style={{ color: L3 }} />{streak} dias</span>
            </div>

            <button type="button" onClick={onClose} className="mt-1 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition hover:brightness-110"
              style={{ background: `linear-gradient(135deg, ${A}, ${mix(78, 'black')})`, boxShadow: `0 10px 30px -8px ${mix(55, 'transparent')}`, animation: 'lu-rise .5s ease .44s both' }}>
              <Sparkles className="h-4 w-4" /> Continuar estudando <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
        {st.playing && <div className="text-[12px] uppercase tracking-[0.14em]" style={{ color: MUT }}>Ganhando XP…</div>}
      </div>
    </div>,
    document.body,
  )
}

function rand(i: number, s: string): number {
  let h = 2166136261 ^ i
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619)
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  return ((h >>> 0) % 10000) / 10000
}
