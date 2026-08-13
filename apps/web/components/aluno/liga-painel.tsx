import { Shield } from 'lucide-react'
import type { LigaDef } from '@/lib/gamificacao/config'

const fmt = (n: number) => n.toLocaleString('pt-BR')

/** Escada de ligas (tiles) + nota de progresso para a próxima. */
export function LigaPainel({ ligas, ligaAtual, xpTotal, proximaNome, faltam }: { ligas: LigaDef[]; ligaAtual: string; xpTotal: number; proximaNome: string | null; faltam: number }) {
  const ord = [...ligas].sort((a, b) => a.xp_min - b.xp_min)
  const atual = ord.find((l) => l.id === ligaAtual) ?? ord[0]
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4" style={{ color: atual?.cor }} />
        <h3 className="text-sm font-semibold">Liga {atual?.nome}</h3>
      </div>
      <div className="flex justify-between gap-1">
        {ord.map((l) => {
          const on = l.id === ligaAtual
          return (
            <div key={l.id} className="flex flex-1 flex-col items-center gap-1">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full border transition-transform ${on ? 'scale-110' : ''}`}
                style={{ background: on ? `color-mix(in oklab, ${l.cor} 26%, transparent)` : 'transparent', borderColor: on ? `color-mix(in oklab, ${l.cor} 95%, transparent)` : 'var(--border)', boxShadow: on ? `0 0 11px color-mix(in oklab, ${l.cor} 55%, transparent)` : undefined }}>
                <Shield className="h-4 w-4" fill={l.cor} style={{ color: `color-mix(in oklab, ${l.cor} 68%, #000)`, opacity: on ? 1 : 0.9 }} />
              </span>
              <span className={`text-[9px] font-medium uppercase ${on ? 'text-foreground' : 'text-muted-foreground/70'}`}>{l.nome}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 rounded-lg border bg-muted/30 p-2.5 text-xs text-muted-foreground">
        {proximaNome
          ? <>Você tem <span className="font-semibold text-foreground">{fmt(xpTotal)} XP</span> — faltam <span className="font-semibold text-primary">{fmt(faltam)} XP</span> para a {proximaNome}.</>
          : <>Você está na <span className="font-semibold text-foreground">liga máxima</span> 🏆</>}
      </div>
    </div>
  )
}
