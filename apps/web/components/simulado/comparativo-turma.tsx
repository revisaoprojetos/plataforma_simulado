import { cn } from '@/lib/utils'
import { Users, Crown, TrendingUp, Target } from 'lucide-react'
import type { Comparativo } from '@/lib/simulado/comparativo'

export function ComparativoTurma({ c }: { c: Comparativo }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini icon={Users} label="Participantes" value={c.participantes} chip="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" />
        <Mini icon={Crown} label="Sua posição" value={c.minhaPosicao ? `${c.minhaPosicao}º` : '—'} chip="bg-amber-500/15 text-amber-600 dark:text-amber-400" />
        <Mini icon={TrendingUp} label="Percentil" value={c.percentil != null ? `${c.percentil}%` : '—'} sub={c.percentil != null ? 'melhor ou igual' : undefined} chip="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" />
        <Mini icon={Target} label="Média da turma" value={c.notaMediaTurma != null ? c.notaMediaTurma.toFixed(1).replace('.', ',') : '—'} sub={c.acertoMedioTurma != null ? `${c.acertoMedioTurma}% de acerto` : undefined} chip="bg-violet-500/15 text-violet-600 dark:text-violet-400" />
      </div>

      {c.porDisciplina.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold">Você × turma por disciplina</h3>
            <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> Você</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Turma</span>
            </span>
          </div>
          <div className="space-y-3">
            {c.porDisciplina.map((d) => {
              const acima = d.minhaPct != null && d.minhaPct >= d.turmaPct
              return (
                <div key={d.nome}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{d.nome}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      <b className={cn(d.minhaPct != null && (acima ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'))}>{d.minhaPct != null ? `${d.minhaPct}%` : '—'}</b> · {d.turmaPct}%
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${d.minhaPct ?? 0}%` }} /></div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-slate-400 transition-all" style={{ width: `${d.turmaPct}%` }} /></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Mini({ icon: Icon, label, value, sub, chip }: { icon: any; label: string; value: React.ReactNode; sub?: string; chip: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', chip)}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-xl font-bold leading-none tabular-nums">{value}</p>
          <p className="mt-1 truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}{sub ? ` · ${sub}` : ''}</p>
        </div>
      </div>
    </div>
  )
}
