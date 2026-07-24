import { cn } from '@/lib/utils'

/** Selo de classificação: "Vitalício" (passaporte premium), "Passaporte" (plano pago) ou "Estudante". */
export function ClassificacaoBadge({ classificacao, className }: { classificacao?: string | null; className?: string }) {
  const vitalicio = classificacao === 'vitalicio'
  const passaporte = classificacao === 'passaporte'
  return (
    <span
      title={vitalicio ? 'Passaporte Vitalício (premium — para sempre)' : passaporte ? 'Aluno com plano pago' : 'Aluno padrão'}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide',
        vitalicio
          ? 'border-amber-500 bg-amber-500 text-white'
          : passaporte
            ? 'border-purple-500 bg-purple-500 text-white'
            : 'border-slate-400 bg-slate-400 text-white dark:border-slate-500 dark:bg-slate-500',
        className,
      )}
    >
      {vitalicio ? 'Vitalício' : passaporte ? 'Passaporte' : 'Estudante'}
    </span>
  )
}
