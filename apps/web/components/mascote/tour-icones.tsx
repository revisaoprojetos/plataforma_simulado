'use client'

import { Star, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Mini-dashboard (passo do tour) com os 3 estados dos ícones da trilha:
 * roxo pulsando = em andamento (estrela), check verde = concluído, check dourado = gabaritou.
 * Os cards sobem de baixo p/ cima, um atrás do outro (esquerda → direita).
 */
const CARDS = [
  { cor: 'var(--brand-primary, var(--primary))', pulsa: true, titulo: 'Em andamento', desc: 'Roxo pulsando — é o simulado atual.', icone: <Star className="h-5 w-5" fill="currentColor" /> },
  { cor: '#10b981', titulo: 'Concluído', desc: 'Verde com check — já terminado.', icone: <Check className="h-5 w-5" strokeWidth={3} /> },
  { cor: '#e0a107', ouro: true, titulo: 'Nota máxima', desc: 'Check dourado — você gabaritou! 🏆', icone: <Check className="h-5 w-5" strokeWidth={3.25} /> },
]

export function TourIcones() {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {CARDS.map((c, i) => <Estado key={c.titulo} {...c} delay={0.12 + i * 0.28} />)}
    </div>
  )
}

function Estado({ cor, pulsa, ouro, titulo, desc, icone, delay = 0 }: { cor: string; pulsa?: boolean; ouro?: boolean; titulo: string; desc: string; icone: React.ReactNode; delay?: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl border bg-card px-2 py-3 text-center" style={{ animation: `ic-rise .5s cubic-bezier(.34,1.56,.64,1) ${delay}s both` }}>
      <span
        className={cn('flex h-12 w-12 items-center justify-center rounded-full border-[4px]', pulsa && 'motion-safe:animate-[ic-pulse_1.6s_ease-in-out_infinite]')}
        style={{ color: cor, borderColor: cor, background: `color-mix(in oklab, ${cor} 16%, transparent)`, boxShadow: ouro ? `0 0 12px color-mix(in oklab, ${cor} 55%, transparent)` : undefined }}
      >
        {icone}
      </span>
      <div className="text-[11px] font-bold" style={{ color: cor }}>{titulo}</div>
      <p className="text-[10px] leading-tight text-muted-foreground">{desc}</p>
    </div>
  )
}
