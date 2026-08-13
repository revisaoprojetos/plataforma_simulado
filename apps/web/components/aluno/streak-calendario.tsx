import { Flame } from 'lucide-react'
import type { DiaAtivo } from '@/lib/gamificacao/leitura'

/** Calendário da semana com a chama nos dias ativos (sequência). */
export function StreakCalendario({ dias, streak }: { dias: DiaAtivo[]; streak: number }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Flame className="h-4 w-4 text-orange-500" /> Sequência</h3>
        <span className="rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-semibold text-orange-600 dark:text-orange-400">{streak} {streak === 1 ? 'dia' : 'dias'}</span>
      </div>
      <div className="flex justify-between gap-1">
        {dias.map((d) => (
          <div key={d.dia} className="flex flex-1 flex-col items-center gap-1.5">
            <span className={`text-[10px] font-medium uppercase ${d.hoje ? 'text-foreground' : 'text-muted-foreground'}`}>{d.label}</span>
            <span className={`flex h-9 w-9 items-center justify-center rounded-full border ${d.ativo ? 'border-orange-500/30 bg-orange-500/15 text-orange-500' : 'bg-muted text-muted-foreground/40'} ${d.hoje ? 'ring-2 ring-primary/40' : ''}`}>
              <Flame className="h-4 w-4" />
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">Faça uma atividade hoje para manter sua sequência 🔥</p>
    </div>
  )
}
