'use client'

import { useState } from 'react'
import { Target, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DiagItem = { id: string; nome: string; pct: number; acertos: number; total: number }

const faixa = (p: number) => (p >= 70 ? 'bom' : p >= 50 ? 'medio' : 'fraco')
const BAR: Record<string, string> = { bom: 'bg-emerald-500', medio: 'bg-amber-500', fraco: 'bg-rose-500' }
const TXT: Record<string, string> = {
  bom: 'text-emerald-600 dark:text-emerald-400',
  medio: 'text-amber-600 dark:text-amber-400',
  fraco: 'text-rose-600 dark:text-rose-400',
}

/**
 * Card "Seu diagnóstico por matéria": começa RECOLHIDO e, ao abrir, o corpo cresce suave, cada
 * linha aparece escalonada (stagger) e as barras crescem de 0 até o percentual lentamente.
 */
export function DiagnosticoCard({ diagnostico }: { diagnostico: DiagItem[] }) {
  const [aberto, setAberto] = useState(false)
  if (diagnostico.length === 0) return null

  const somaAcertos = diagnostico.reduce((a, d) => a + d.acertos, 0)
  const somaTotal = diagnostico.reduce((a, d) => a + d.total, 0)
  const media = somaTotal ? Math.round((somaAcertos / somaTotal) * 100) : 0
  const aReforcar = diagnostico.filter((d) => d.pct < 70).length

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Cabeçalho clicável (recolher/expandir) */}
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Target className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Seu diagnóstico por matéria</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {diagnostico.length} {diagnostico.length === 1 ? 'matéria' : 'matérias'} · média <span className={cn('font-semibold', TXT[faixa(media)])}>{media}%</span>
            {aReforcar > 0 && <> · <span className="font-medium text-foreground">{aReforcar}</span> para reforçar</>}
          </p>
        </div>
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300', aberto && 'rotate-180')} />
      </button>

      {/* Corpo animado: grid-rows 0fr→1fr cresce a altura suavemente sem saber o tamanho. */}
      <div className={cn('grid transition-[grid-template-rows] duration-500 ease-out', aberto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="space-y-3 border-t px-4 pb-4 pt-3.5">
            {diagnostico.map((d, i) => {
              const fx = faixa(d.pct)
              return (
                <div key={d.id}
                  className={cn('transition-all duration-500 ease-out', aberto ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')}
                  style={{ transitionDelay: aberto ? `${i * 55}ms` : '0ms' }}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium" title={d.nome}>{d.nome}</span>
                    <span className="shrink-0 tabular-nums">
                      <span className={cn('font-semibold', TXT[fx])}>{d.pct}%</span>{' '}
                      <span className="text-xs text-muted-foreground">({d.acertos}/{d.total})</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', BAR[fx])}
                      style={{
                        width: aberto ? `${d.pct}%` : '0%',
                        transitionProperty: 'width',
                        transitionDuration: '900ms',
                        transitionTimingFunction: 'cubic-bezier(.2,.7,.2,1)',
                        transitionDelay: aberto ? `${i * 55 + 120}ms` : '0ms',
                      }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
