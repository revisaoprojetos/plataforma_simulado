import { cn } from '@/lib/utils'

/** Selo que indica se o aluno é "Passaporte" (pagou o plano) ou "Estudante" (padrão). */
export function ClassificacaoBadge({ classificacao, className }: { classificacao?: string | null; className?: string }) {
  const passaporte = classificacao === 'passaporte'
  return (
    <span
      title={passaporte ? 'Aluno com plano pago' : 'Aluno padrão'}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide',
        passaporte
          ? 'border-purple-500 bg-purple-500 text-white'
          : 'border-slate-400 bg-slate-400 text-white dark:border-slate-500 dark:bg-slate-500',
        className,
      )}
    >
      {passaporte ? 'Passaporte' : 'Estudante'}
    </span>
  )
}
