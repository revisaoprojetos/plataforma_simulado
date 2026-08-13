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
        setTimeout(() => anima(para.pct, 1400), 350)
      } else {
        // Subiu de nível: enche até 100, reseta e enche até o novo pct; troca o número no meio.
        setTimeout(() => anima(100, 800), 350)
        setTimeout(() => {
          setNivel(para.nivel); setTitulo(para.titulo)
          snap(0); requestAnimationFrame(() => anima(para.pct, 950))
        }, 1200)
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

      <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-5 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 text-xl font-bold tabular-nums transition-transform"
            style={{ borderColor: 'var(--brand-primary, var(--primary))', color: 'var(--brand-primary, var(--primary))' }}>
            {nivel}
          </span>
          <div className="text-center text-sm">
            <span className="font-semibold">Nível {nivel}{titulo ? ` · ${titulo}` : ''}</span>
            <span className="ml-2 text-xs text-muted-foreground tabular-nums">{fmt(p.xpNoNivel)} / {fmt(p.xpDoNivel)} XP</span>
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
