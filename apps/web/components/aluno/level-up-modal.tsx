'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Zap, Medal, ArrowRight, Flame, Trophy, Sparkles } from 'lucide-react'
import { tituloParaNivel } from '@/lib/gamificacao/niveis'
import type { NivelCurva } from '@/lib/gamificacao/config'

export type GanhoXp = { icon: React.ReactNode; label: string; xp: number; cor?: string }
export type ConquistaUp = { icon: React.ReactNode; title: string; desc: string }

// Paleta ESCURA própria (independe do tema claro/escuro).
const A = 'var(--brand-primary, var(--primary))'
const ACC = 'var(--brand-accent, #f59e0b)'
const mix = (p: number, c: string) => `color-mix(in oklab, ${A} ${p}%, ${c})`
const amix = (p: number, c: string) => `color-mix(in oklab, ${ACC} ${p}%, ${c})`
const L1 = mix(28, 'white'), L2 = mix(52, 'white'), L3 = mix(72, 'white')
const D2 = mix(60, '#0a0a14'), D3 = mix(38, '#0a0a14'), D4 = mix(22, '#0a0a14')
const FG = '#f3f2fb', MUT = '#a7a6bd', SURF = 'rgba(255,255,255,0.045)', DIV = 'rgba(255,255,255,0.10)', TRACK = 'rgba(255,255,255,0.10)'
const R = 90, CIRC = 2 * Math.PI * R
// Paleta variada p/ os ícones de pontuação (fallback quando o ganho não traz cor própria).
const PALETA = ['#38bdf8', '#34d399', '#fbbf24', '#fb923c', '#a78bfa', '#22d3ee', '#f472b6', '#f87171']
// Posição (em %) da borda do anel a partir do topo → onde fica a "ponta" (bolinha branca).
const RINGTOP = 50 - (R / 118) * 50

type St = { level: number; fill: number; playing: boolean; done: boolean; pop: boolean; promoted: string | null; xpShown: number; xpTarget: number; burst: number }

/** Modal de subida de nível (v2): halo/órbita, anel de XP enchendo (com ponta branca) e desacelerando
 * no fim, impacto forte ao completar cada nível, e a área de informações compacta ao terminar. */
export function LevelUpModal({ from, to, curva, gains, unlocked, xpGanho, totalXp, streak, badgesLabel, logo, onClose }: {
  from: number; to: number; curva: NivelCurva; gains: GanhoXp[]; unlocked: ConquistaUp[]
  xpGanho: number; totalXp: number; streak: number; badgesLabel: string; logo?: string | null; onClose: () => void
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
        later(() => setSt((s) => ({ ...s, pop: false })), 460)
        if (next < to) later(() => step(next), multi ? 380 : 520)
        else later(() => setSt((s) => ({ ...s, playing: false, done: true, fill: 100, xpTarget: sessionXp })), 160)
      }, multi ? 1000 : 1450)
    }
    later(() => step(from), 450)
    return () => { timers.current.forEach(clearTimeout); clearInterval(xpInt.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (typeof document === 'undefined') return null
  const done = st.done
  const bs = done ? 150 : 232          // badge menor no fim (compacta a página)
  const numFont = done ? 40 : 66
  const dash = `${((st.fill / 100) * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`
  // Enche desacelerando bastante no fim; reset (fill=0) é instantâneo (sem "voltar").
  const fillTrans = st.fill === 0 ? 'none' : `${multi ? '.95s' : '1.35s'} cubic-bezier(.1,.94,.04,1)`
  const steps: { n: number; passou: boolean }[] = []
  for (let l = from; l <= to; l++) steps.push({ n: l, passou: st.level >= l })

  return createPortal(
    <div className="fixed inset-0 z-[200] flex overflow-hidden" style={{ background: 'radial-gradient(circle at 50% 34%, #1a1730 0%, #0b0912 62%)', color: FG, animation: 'lu-in .3s ease both' }}>
      {/* Fundo: auroras + estrelas (contidas) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* logo grande do tenant (Aparência) como marca-d'água de fundo */}
        {logo && <img src={logo} alt="" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none" style={{ width: 'min(80vw, 900px)', maxHeight: '78vh', objectFit: 'contain', opacity: 0.08, filter: 'grayscale(1) brightness(1.7)', animation: 'lu-halo 8s ease-in-out infinite' }} />}
        <div className="absolute rounded-full blur-3xl" style={{ left: '18%', top: '10%', width: 520, height: 520, background: mix(45, 'transparent'), opacity: 0.5, animation: 'lu-aurora1 14s ease-in-out infinite' }} />
        <div className="absolute rounded-full blur-3xl" style={{ right: '12%', top: '30%', width: 460, height: 460, background: mix(35, 'transparent'), opacity: 0.4, animation: 'lu-aurora2 18s ease-in-out infinite' }} />
        {Array.from({ length: 34 }).map((_, i) => (
          <div key={`s${i}`} className="absolute rounded-full" style={{ left: `${(rand(i, 'x') * 100).toFixed(1)}%`, top: `${(rand(i, 'y') * 100).toFixed(1)}%`, width: 2 + (i % 2), height: 2 + (i % 2), background: '#fff', animation: `lu-twinkle ${2.5 + (i % 4)}s ease-in-out ${(i * 0.17).toFixed(1)}s infinite` }} />
        ))}
      </div>

      {/* Flash de tela no impacto de cada nível */}
      {st.pop && <div key={`sf${st.burst}`} className="pointer-events-none absolute inset-0 z-[2]" style={{ background: `radial-gradient(circle at 50% 32%, ${mix(60, 'transparent')} 0%, transparent 46%)`, animation: 'lu-flash .5s ease-out both' }} />}

      <div className={`relative z-[1] m-auto flex flex-col items-center px-6 text-center ${done ? 'gap-2.5 py-6' : 'gap-5 py-10'}`}>
        {/* Kicker */}
        <div className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.28em]" style={{ color: L3, animation: 'lu-rise .5s ease both' }}>
          <span className="h-px w-10" style={{ background: `linear-gradient(90deg, transparent, ${A})` }} />
          {done ? 'Parabéns' : 'Subindo de nível'}
          <span className="h-px w-10" style={{ background: `linear-gradient(90deg, ${A}, transparent)` }} />
        </div>

        {/* Badge */}
        <div className="relative transition-all duration-500" style={{ width: bs, height: bs, animation: st.pop ? 'lu-shake .42s ease-in-out' : undefined }}>
          {/* halo pulsante */}
          <div className="absolute rounded-full blur-2xl" style={{ inset: '4%', background: `radial-gradient(circle, ${mix(55, 'transparent')}, transparent 70%)`, animation: 'lu-halo 2.6s ease-in-out infinite' }} />
          {/* órbita de acento girando */}
          <div className="absolute rounded-full" style={{ inset: 0, background: `conic-gradient(from 0deg, transparent 0deg, ${mix(60, 'transparent')} 40deg, transparent 90deg, transparent 180deg, ${mix(40, 'transparent')} 220deg, transparent 270deg)`, WebkitMaskImage: 'radial-gradient(circle, transparent 62%, black 64%, black 72%, transparent 74%)', maskImage: 'radial-gradient(circle, transparent 62%, black 64%, black 72%, transparent 74%)', animation: 'lu-spin 8s linear infinite' }} />
          <div className="absolute rounded-full" style={{ inset: '3%', border: `1px dashed ${DIV}`, animation: 'lu-spin 30s linear infinite reverse' }} />
          {/* IMPACTO ao completar: flash + pulso */}
          {st.pop && <div key={`fl${st.burst}`} className="pointer-events-none absolute rounded-full" style={{ inset: '-14%', background: `radial-gradient(circle, ${mix(75, 'transparent')} 0%, transparent 62%)`, animation: 'lu-flash .5s ease-out both' }} />}
          {st.pop && <div key={`p${st.burst}`} className="pointer-events-none absolute rounded-full" style={{ inset: '6%', border: `3px solid ${L2}`, animation: 'lu-ringpulse .75s ease-out both' }} />}
          {st.pop && <div key={`p2${st.burst}`} className="pointer-events-none absolute rounded-full" style={{ inset: '6%', border: `2px solid ${mix(55, 'transparent')}`, animation: 'lu-ringpulse .95s ease-out .1s both' }} />}
          {/* anel de XP */}
          <svg viewBox="0 0 236 236" className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="118" cy="118" r={R} fill="none" stroke={TRACK} strokeWidth="8" />
            <circle cx="118" cy="118" r={R} fill="none" stroke={A} strokeWidth="8" strokeLinecap="round" strokeDasharray={dash}
              style={{ transition: `stroke-dasharray ${fillTrans}`, filter: `drop-shadow(0 0 8px ${mix(50, 'transparent')})` }} />
          </svg>
          {/* ponta branca (progresso do anel) — orbita conforme o fill; some ao terminar */}
          {!done && (
            <div className="absolute inset-0" style={{ transform: `rotate(${(st.fill / 100) * 360}deg)`, transition: st.fill === 0 ? 'none' : `transform ${fillTrans}` }}>
              <div className="absolute left-1/2 rounded-full" style={{ top: `${RINGTOP}%`, width: 13, height: 13, marginLeft: -6.5, marginTop: -6.5, background: '#fff', boxShadow: `0 0 10px 2px rgba(255,255,255,.9), 0 0 18px ${mix(55, 'transparent')}` }} />
            </div>
          )}
          {/* rajada de partículas (contida) */}
          {st.pop && (
            <div key={`b${st.burst}`} className="pointer-events-none absolute inset-0">
              {Array.from({ length: 24 }).map((_, i) => {
                const ang = (i / 24) * Math.PI * 2, dist = 104 + (i % 3) * 26
                return <span key={i} className="absolute left-1/2 top-1/2 rounded-full" style={{ width: 8, height: 8, marginLeft: -4, marginTop: -4, background: i % 2 ? L2 : A, boxShadow: `0 0 8px ${mix(50, 'transparent')}`, ['--bx' as any]: `${(Math.cos(ang) * dist).toFixed(0)}px`, ['--by' as any]: `${(Math.sin(ang) * dist).toFixed(0)}px`, animation: 'lu-burst .8s ease-out both' }} />
              })}
            </div>
          )}
          {/* "+1 nível" flutuando */}
          {st.pop && <div key={`f${st.burst}`} className="pointer-events-none absolute left-1/2 top-1 z-[3] whitespace-nowrap text-sm font-bold" style={{ color: L2, textShadow: `0 0 12px ${mix(60, 'transparent')}`, animation: 'lu-float .95s ease-out both' }}>+1 nível</div>}
          {/* disco */}
          <div className="absolute flex flex-col items-center justify-center rounded-full" style={{ inset: '13%', background: `radial-gradient(circle at 50% 26%, ${D3}, ${D2} 72%)`, border: `2px solid ${mix(55, 'transparent')}`, boxShadow: `inset 0 2px 10px rgba(255,255,255,0.10), 0 12px 34px -8px ${mix(50, 'black')}`, animation: st.pop ? 'lu-impact .5s cubic-bezier(.34,1.56,.64,1)' : 'none' }}>
            {!done && <span className="text-[11px] uppercase tracking-[0.18em]" style={{ color: L3 }}>Nível</span>}
            <span key={st.level} className="font-black leading-none tabular-nums" style={{ fontSize: numFont, color: FG, animation: 'lu-numpop .42s cubic-bezier(.34,1.56,.64,1) both' }}>{st.level}</span>
            <span className="min-h-[13px] text-[10.5px]" style={{ color: L3 }}>{cargo(st.level)}</span>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center">
              {i > 0 && <div className={`${done ? 'w-7' : 'w-9'} h-[3px] rounded transition-colors duration-500`} style={{ background: s.passou ? A : DIV }} />}
              <div className={`grid ${done ? 'h-7 w-7 text-[12px]' : 'h-8 w-8 text-[13px]'} place-items-center rounded-full font-bold transition-all duration-500`} style={{ background: s.passou ? mix(30, 'transparent') : 'transparent', border: `1.5px solid ${s.passou ? A : DIV}`, color: s.passou ? L1 : MUT, boxShadow: s.passou ? `0 0 12px ${mix(45, 'transparent')}` : 'none' }}>{s.n}</div>
            </div>
          ))}
        </div>

        {/* Contador de XP */}
        <div className={`flex items-center gap-2 font-black ${done ? 'text-[19px]' : 'min-h-[30px] text-[24px]'}`} style={{ color: L2 }}>
          <Zap className={done ? 'h-4 w-4' : 'h-5 w-5'} style={{ color: '#fbbf24' }} />+{st.xpShown.toLocaleString('pt-BR')} XP
        </div>

        {done && (
          <div className="flex flex-col items-center gap-2.5">
            <h2 className="m-0 bg-clip-text text-[21px] font-black text-transparent" style={{ backgroundImage: `linear-gradient(100deg, ${FG} 42%, ${L2} 50%, ${FG} 58%)`, backgroundSize: '220% 100%', WebkitBackgroundClip: 'text', animation: 'lu-rise .45s ease both, lu-shimmer 3.2s linear .8s infinite' }}>
              {span === 1 ? `Você alcançou o nível ${to}!` : `Você subiu ${span} níveis de uma vez!`}
            </h2>
            <div className="text-[13px]" style={{ color: MUT, animation: 'lu-rise .45s ease .08s both' }}>
              {span === 1 ? 'Continue assim para manter o ritmo' : `Do nível ${from} ao ${to} de uma vez`}
            </div>

            {st.promoted && (
              <div className="relative w-full max-w-[440px]" style={{ animation: 'lu-rise .45s ease .16s both', WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 16%, #000 84%, transparent 100%)', maskImage: 'linear-gradient(90deg, transparent 0%, #000 16%, #000 84%, transparent 100%)' }}>
                {/* corpo amarelo (fade nas pontas via máscara do wrapper) — texto branco */}
                <div className="flex items-center justify-center gap-2.5 px-6 py-3.5" style={{ background: `linear-gradient(135deg, ${amix(82, '#120d05')}, ${amix(54, '#120d05')})` }}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-md" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}><Medal className="h-4 w-4" /></span>
                  <div className="text-left" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85">Novo cargo</div>
                    <div className="whitespace-nowrap text-base font-bold text-white">{st.promoted}</div>
                  </div>
                </div>
                {/* costura pontilhada quadrada (topo p/ um lado, base p/ o outro) — branca, animada via translateX */}
                <div className="absolute inset-x-4 top-[4px] h-[3px] overflow-hidden">
                  <div className="absolute inset-y-0 -left-3 right-0" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.78) 0 3px, transparent 3px)', backgroundSize: '12px 100%', backgroundRepeat: 'repeat-x', animation: 'lu-marchx 1s linear infinite' }} />
                </div>
                <div className="absolute inset-x-4 bottom-[4px] h-[3px] overflow-hidden">
                  <div className="absolute inset-y-0 -left-3 right-0" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.78) 0 3px, transparent 3px)', backgroundSize: '12px 100%', backgroundRepeat: 'repeat-x', animation: 'lu-marchx 1s linear infinite reverse' }} />
                </div>
              </div>
            )}

            {gains.length > 0 && (
              <div className="flex w-[340px] max-w-[88vw] flex-col gap-1.5">
                {gains.map((g, i) => {
                  const cor = g.cor ?? PALETA[i % PALETA.length]
                  return (
                    <div key={i} className="flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-[12.5px]" style={{ background: SURF, borderColor: DIV, animation: `lu-rise .4s ease ${(0.2 + i * 0.05).toFixed(2)}s both` }}>
                      <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: `color-mix(in oklab, ${cor} 20%, transparent)`, color: cor }}>{g.icon}</span>
                      <span className="flex-1 text-left" style={{ color: '#cfced9' }}>{g.label}</span>
                      <span className="whitespace-nowrap font-semibold" style={{ color: cor }}>+{g.xp} XP</span>
                    </div>
                  )
                })}
              </div>
            )}

            {unlocked.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2" style={{ animation: 'lu-rise .45s ease .3s both' }}>
                {unlocked.map((u, i) => (
                  <div key={i} title={u.desc} className="flex items-center gap-2 rounded-lg border px-3 py-1.5" style={{ background: D4, borderColor: mix(40, 'transparent') }}>
                    <span style={{ color: L3 }}>{u.icon}</span>
                    <div className="text-left">
                      <div className="text-[9px] uppercase tracking-[0.12em]" style={{ color: L3 }}>Conquista</div>
                      <div className="whitespace-nowrap text-[12.5px]" style={{ color: L1 }}>{u.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11.5px]" style={{ color: MUT, animation: 'lu-rise .45s ease .36s both' }}>
              <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" style={{ color: '#fbbf24' }} />{totalXp.toLocaleString('pt-BR')} XP acumulado</span>
              <span className="inline-flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" style={{ color: '#f59e0b' }} />{badgesLabel} conquistas</span>
              <span className="inline-flex items-center gap-1.5"><Flame className="h-3.5 w-3.5" style={{ color: '#fb923c' }} />{streak} dias</span>
            </div>

            <button type="button" onClick={onClose} className="mt-0.5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
              style={{ background: `linear-gradient(135deg, ${A}, ${mix(78, 'black')})`, boxShadow: `0 10px 30px -8px ${mix(55, 'transparent')}`, animation: 'lu-rise .45s ease .42s both' }}>
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
