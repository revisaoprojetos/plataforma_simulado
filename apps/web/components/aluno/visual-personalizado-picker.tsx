'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PERSONALIZADO_CORES, PERSONALIZADO_ICONES, ICONES_LISTA, iconePersonalizado } from '@/lib/personalizado-visual'

/**
 * Seletor de APARÊNCIA da capa (frente) do simulado personalizado: cor + ícone, com prévia ao vivo
 * do pôster. Usado no criador (wizard) e no editor (área interna).
 */
export function VisualPersonalizadoPicker({ cor, icone, onChange, titulo = 'Aparência do card' }: {
  cor: string
  icone: string
  onChange: (v: { cor: string; icone: string }) => void
  titulo?: string | null
}) {
  const Icone = iconePersonalizado(icone)
  return (
    <div className="space-y-2.5">
      {titulo && <span className="block text-sm font-medium">{titulo}</span>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Prévia da capa (mesmo desenho do card da lista) */}
        <div className="relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-xl border shadow-sm ring-1 ring-black/5">
          <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />
          <Icone className="absolute -right-3 -top-3 h-20 w-20 text-white/10" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 opacity-50" style={{ background: `linear-gradient(to top, ${cor}, transparent)` }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-black/45 px-1 py-0.5 text-[7px] font-semibold uppercase tracking-wide text-white/85 backdrop-blur"><Icone className="h-2 w-2" /> Prévia</span>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Cor</span>
            <div className="flex flex-wrap gap-2">
              {PERSONALIZADO_CORES.map((c) => (
                <button key={c} type="button" onClick={() => onChange({ cor: c, icone })} aria-label={`Cor ${c}`}
                  className={cn('flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-background transition',
                    cor === c ? 'ring-foreground' : 'ring-transparent hover:ring-border')}
                  style={{ background: c }}>
                  {cor === c && <Check className="h-3.5 w-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Ícone</span>
            <div className="flex flex-wrap gap-1.5">
              {ICONES_LISTA.map((k) => {
                const I = PERSONALIZADO_ICONES[k]
                const on = icone === k
                return (
                  <button key={k} type="button" onClick={() => onChange({ cor, icone: k })} aria-label={k}
                    className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition',
                      on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:border-foreground/20 hover:text-foreground')}>
                    <I className="h-4 w-4" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
