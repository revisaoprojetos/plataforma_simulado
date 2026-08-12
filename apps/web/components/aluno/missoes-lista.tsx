import { Check, Zap, Target } from 'lucide-react'
import type { MissaoView } from '@/lib/gamificacao/leitura'

/** Lista de missões do dia com barra de progresso e recompensa em XP. */
export function MissoesLista({ missoes, renova }: { missoes: MissaoView[]; renova?: string }) {
  if (!missoes.length) return null
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" /> Missões de hoje</h3>
        {renova && <span className="text-[11px] text-muted-foreground">renova em {renova}</span>}
      </div>
      <div className="space-y-3">
        {missoes.map((m) => {
          const pct = Math.min(100, Math.round((m.progresso / Math.max(1, m.def.meta)) * 100))
          return (
            <div key={m.def.id} className="flex items-center gap-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${m.completa ? 'bg-emerald-500/15 text-emerald-500' : 'bg-primary/10 text-primary'}`}>
                {m.completa ? <Check className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{m.def.titulo}</span>
                  <span className="shrink-0 text-xs font-semibold text-primary">+{m.def.xp} XP</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full transition-all ${m.completa ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{Math.min(m.progresso, m.def.meta)}/{m.def.meta}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
