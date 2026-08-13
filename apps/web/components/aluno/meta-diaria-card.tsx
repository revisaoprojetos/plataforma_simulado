import { Target } from 'lucide-react'

const fmt = (n: number) => n.toLocaleString('pt-BR')

/** Meta diária de XP (progresso do dia). */
export function MetaDiariaCard({ xpHoje, meta }: { xpHoje: number; meta: number }) {
  const pct = meta > 0 ? Math.min(100, Math.round((xpHoje / meta) * 100)) : 0
  const ok = pct >= 100
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" /> Meta diária</h3>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{fmt(xpHoje)} / {fmt(meta)} XP</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: ok ? 'var(--brand-accent, var(--primary))' : 'var(--brand-primary, var(--primary))' }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{ok ? 'Meta de hoje concluída! 🎉' : 'Um simulado de hoje garante sua sequência.'}</p>
    </div>
  )
}
