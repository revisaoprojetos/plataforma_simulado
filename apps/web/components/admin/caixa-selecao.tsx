'use client'

/** Caixa de seleção arredondada com estado indeterminado — a MESMA dos desafios (banco-aulas-grid), extraída para reuso. */
export function CaixaSelecao({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label?: string }) {
  return (
    <input type="checkbox" checked={checked} onChange={onChange} aria-label={label}
      ref={(el) => { if (el) el.indeterminate = !!indeterminate }}
      className="relative h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-[6px] border-2 border-muted-foreground/30 bg-card transition-all hover:border-primary/60 checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary focus-visible:ring-2 focus-visible:ring-primary/40 after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-[11px] after:font-bold after:leading-none after:text-primary-foreground after:content-[''] checked:after:content-['✓'] indeterminate:after:content-['–']" />
  )
}
