'use client'

import { useEffect, useRef, useState } from 'react'
import type { ResumoGamificacao } from '@/lib/gamificacao/leitura'
import type { ProgressoNivel } from '@/lib/gamificacao/niveis'

const fmt = (n: number) => n.toLocaleString('pt-BR')

/** Card de nível (saudação + número do nível + barra de XP). Ao receber o evento
 * `nivel:encher` (disparado pela celebração de fim de simulado), a barra enche de
 * `de.pct` até `para.pct` — com efeito de "subiu de nível" quando muda o nível. */
export function NivelCard({ nome, resumo }: { nome: string; resumo: ResumoGamificacao }) {
  const p = resumo.progresso
  const barRef = useRef<HTMLDivElement>(null)
  const [nivel, setNivel] = useState(p.nivel)
  const [titulo, setTitulo] = useState(p.titulo)
  const [cargoFx, setCargoFx] = useState(false)
  const [cargoKey, setCargoKey] = useState(0)
  const [shards, setShards] = useState<{ sx: string; sy: string; fall: string; r1: string; r2: string; d: string; w: number; h: number }[]>([])

  useEffect(() => {
    const onCargo = (e: Event) => {
      const { titulo: t } = (e as CustomEvent<{ titulo: string }>).detail
      if (t) setTitulo(t)
      // Casca: MUITOS estilhaços estourando p/ fora e depois caindo devagar (só liberam após a carga).
      setShards(Array.from({ length: 26 }, (_, i) => {
        const a = (i / 26) * Math.PI * 2 + (Math.random() - 0.5) * 0.6
        const dist = 34 + Math.random() * 52
        return {
          sx: `${(Math.cos(a) * dist).toFixed(0)}px`,
          sy: `${(Math.sin(a) * dist * 0.5 - 12).toFixed(0)}px`, // viés p/ cima → depois cai
          fall: `${(150 + Math.random() * 150).toFixed(0)}px`,
          r1: `${(Math.random() * 160 - 80).toFixed(0)}deg`,
          r2: `${(Math.random() * 400 - 200).toFixed(0)}deg`,
          d: (0.7 + Math.random() * 0.35).toFixed(2),
          w: 4 + Math.round(Math.random() * 4),
          h: 3 + Math.round(Math.random() * 3),
        }
      }))
      setCargoKey((k) => k + 1)
      setCargoFx(true)
      setTimeout(() => setCargoFx(false), 3200)
    }
    window.addEventListener('nivel:cargo', onCargo)
    return () => window.removeEventListener('nivel:cargo', onCargo)
  }, [])

  useEffect(() => {
    const onEncher = (e: Event) => {
      const { de, para } = (e as CustomEvent<{ de: ProgressoNivel; para: ProgressoNivel }>).detail
      const bar = barRef.current
      if (!bar || !de || !para) return
      const snap = (pct: number) => { bar.style.transition = 'none'; bar.style.width = `${pct}%`; void bar.offsetWidth }
      const anima = (pct: number, ms: number) => { bar.style.transition = `width ${ms}ms cubic-bezier(.35,0,.25,1)`; bar.style.width = `${pct}%` }

      snap(de.pct)
      // pequeno atraso p/ os pontinhos começarem a chegar antes de a barra encher (fica sincronizado).
      if (de.nivel === para.nivel) {
        setTimeout(() => anima(para.pct, 2000), 500)
      } else {
        // Subiu de nível: enche até 100, reseta e enche até o novo pct; troca o número no meio.
        setTimeout(() => anima(100, 1200), 500)
        setTimeout(() => {
          setNivel(para.nivel); setTitulo(para.titulo)
          snap(0); requestAnimationFrame(() => anima(para.pct, 1200))
        }, 1750)
      }
    }
    window.addEventListener('nivel:encher', onEncher)
    return () => window.removeEventListener('nivel:encher', onEncher)
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand-accent)', boxShadow: '0 0 10px 1px color-mix(in oklab, var(--brand-accent) 60%, transparent)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand-accent)' }}>Sua área de estudos</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[2rem]">Olá, {nome.split(' ')[0]} 👋</h1>
        <p className="mt-1 text-muted-foreground">
          {p.xpParaProximo > 0
            ? <>Continue sua trilha — faltam <span className="font-semibold text-foreground">{fmt(p.xpParaProximo)} XP</span> para o próximo nível.</>
            : <>Você chegou ao nível máximo. Mandou muito bem! 🎉</>}
        </p>
      </div>

      <div className="relative rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-5 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 text-xl font-bold tabular-nums transition-transform"
            style={{ borderColor: 'var(--brand-primary, var(--primary))', color: 'var(--brand-primary, var(--primary))', animation: cargoFx ? 'nc-pulse 1.1s ease-out' : undefined }}>
            {nivel}
          </span>
          <div className="relative text-center text-sm" style={cargoFx ? { animation: 'nc-line-shake .9s ease-in-out' } : undefined}>
            <span className="font-semibold">Nível {nivel}{titulo ? ' · ' : ''}</span>
            {titulo && (
              <span className="font-semibold" style={{ color: cargoFx ? 'var(--brand-accent, var(--primary))' : undefined, textShadow: cargoFx ? '0 0 13px color-mix(in oklab, var(--brand-accent, var(--primary)) 60%, transparent)' : undefined, transition: 'color .5s ease, text-shadow .5s ease' }}>{titulo}</span>
            )}
            <span className="ml-2 text-xs text-muted-foreground tabular-nums">{fmt(p.xpNoNivel)} / {fmt(p.xpDoNivel)} XP</span>

            {/* Canalizando → casca estoura e cai devagar (só ao trocar de cargo). */}
            {cargoFx && (
              <span key={`fx${cargoKey}`} className="pointer-events-none absolute inset-0 z-10 block">
                {/* carga de energia (charge) crescendo antes de estourar */}
                <span className="absolute left-1/2 top-1/2 h-8 w-8 rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in oklab, var(--brand-accent, var(--primary)) 75%, transparent), transparent 70%)', filter: 'blur(2px)', animation: 'nc-charge .9s ease-in both' }} />
                {/* rachadura (estoura ao fim da carga) */}
                <span className="absolute left-1/2 top-1/2 h-[2px] w-[76%]" style={{ transformOrigin: 'center', background: 'linear-gradient(90deg, transparent, #fff, transparent)', animation: 'nc-crack .5s ease-out .82s both' }} />
                {/* brilho passando pela linha */}
                <span className="absolute inset-y-0 -inset-x-3 overflow-hidden">
                  <span className="absolute inset-y-0 w-1/3" style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,.6), transparent)', animation: 'nc-sweep .85s ease-out .85s both' }} />
                </span>
                {/* estilhaços da casca — estouram e caem devagar */}
                {shards.map((s, i) => (
                  <span key={i} className="absolute left-1/2 top-1/2 rounded-[1px]" style={{ width: s.w, height: s.h, marginLeft: -s.w / 2, marginTop: -s.h / 2, background: 'var(--brand-accent, var(--primary))', boxShadow: '0 0 6px color-mix(in oklab, var(--brand-accent, var(--primary)) 55%, transparent)', ['--sx' as any]: s.sx, ['--sy' as any]: s.sy, ['--fall' as any]: s.fall, ['--r1' as any]: s.r1, ['--r2' as any]: s.r2, animation: `nc-fall 2.1s cubic-bezier(.3,.4,.5,1) ${s.d}s both` }} />
                ))}
              </span>
            )}
          </div>
          {/* alvo das partículas de XP = a própria barra */}
          <div data-nivel-alvo className="h-2.5 w-full max-w-md overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ background: 'color-mix(in oklab, var(--brand-primary, var(--primary)) 16%, transparent)' }}>
            <div ref={barRef} className="h-full rounded-full transition-all duration-700" style={{ width: `${p.pct}%`, background: 'var(--brand-primary, var(--primary))' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
