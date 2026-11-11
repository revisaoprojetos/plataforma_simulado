'use client'

// Seletor de cor por TOKEN (nunca hex, nunca picker livre). Guarda o NOME do token; o valor resolve pela CSS var do tenant/tema.
import { Check, X } from 'lucide-react'
import { ROTULO_TOKEN, corCss, type TokenCor } from '@/lib/produtos/pagina/tokens'
import { cx } from './util'

const GRUPOS: { titulo: string; tokens: TokenCor[] }[] = [
  { titulo: 'Marca', tokens: ['produto', 'produto-2', 'primary', 'secondary', 'accent', 'brand-accent'] },
  { titulo: 'Neutras', tokens: ['foreground', 'background', 'card', 'muted', 'muted-foreground', 'border'] },
  { titulo: 'Texto sobre cor', tokens: ['primary-foreground', 'secondary-foreground', 'accent-foreground'] },
  { titulo: 'Paleta e alerta', tokens: ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'destructive'] },
]

export function SeletorCor({ value, onChange, cores, padraoRotulo = 'Automático' }: {
  value: TokenCor | undefined
  onChange: (t: TokenCor | undefined) => void
  cores: { cor: string; cor2: string }
  padraoRotulo?: string
}) {
  return (
    <div className="space-y-2.5">
      <button type="button" onClick={() => onChange(undefined)}
        className={cx('flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors', !value ? 'border-primary bg-primary/5 font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/50')}>
        <span className="flex h-4 w-4 items-center justify-center rounded border border-dashed"><X className="h-3 w-3" /></span>
        {padraoRotulo}
      </button>
      {GRUPOS.map((g) => (
        <div key={g.titulo}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.titulo}</div>
          <div className="flex flex-wrap gap-1.5">
            {g.tokens.map((t) => {
              const sel = value === t
              return (
                <button key={t} type="button" onClick={() => onChange(t)} title={ROTULO_TOKEN[t]} aria-label={ROTULO_TOKEN[t]} aria-pressed={sel}
                  className={cx('relative flex h-8 w-8 items-center justify-center rounded-lg border transition-transform hover:scale-105', sel && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}
                  style={{ background: corCss(t, cores) }}>
                  {sel && <Check className="h-3.5 w-3.5 text-background mix-blend-difference" />}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div className="text-[11px] text-muted-foreground">{value ? ROTULO_TOKEN[value] : 'Sem cor definida: usa o padrão do tema.'}</div>
    </div>
  )
}
