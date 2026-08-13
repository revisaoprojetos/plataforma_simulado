import { Flame, Gift } from 'lucide-react'
import type { DiaAtivo } from '@/lib/gamificacao/leitura'

/** Calendário da semana com a chama nos dias ativos (sequência) + baú da sequência. */
export function StreakCalendario({ dias, streak, chestXp = 0, chestCadaN = 0 }: { dias: DiaAtivo[]; streak: number; chestXp?: number; chestCadaN?: number }) {
  const faltam = chestCadaN > 0 ? (chestCadaN - (streak % chestCadaN)) % chestCadaN || chestCadaN : 0
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Flame className="h-4 w-4 text-orange-500" /> Sequência</h3>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{streak} {streak === 1 ? 'dia' : 'dias'}</span>
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
      {chestXp > 0 && chestCadaN > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/30 p-2.5 text-xs">
          <Gift className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">Baú da sequência: <span className="font-semibold text-primary">+{chestXp} XP</span> — mantenha {chestCadaN} dias{faltam > 0 ? <> e ganhe · faltam <span className="font-semibold text-foreground">{faltam}</span></> : null}.</span>
        </div>
      )}
    </div>
  )
}
