import type { LigaDef } from '@/lib/gamificacao/config'
import { EscudoLiga } from '@/components/aluno/escudo-liga'

const fmt = (n: number) => n.toLocaleString('pt-BR')

/** Escada de ligas (tiles) + nota de progresso para a próxima. */
export function LigaPainel({ ligas, ligaAtual, xpTotal, proximaNome, faltam }: { ligas: LigaDef[]; ligaAtual: string; xpTotal: number; proximaNome: string | null; faltam: number }) {
  const ord = [...ligas].sort((a, b) => a.xp_min - b.xp_min)
  const atual = ord.find((l) => l.id === ligaAtual) ?? ord[0]
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <EscudoLiga cor={atual?.cor ?? 'var(--muted-foreground)'} nome={atual?.nome} ativo fundo={false} className="h-6 w-6" />
        <h3 className="text-sm font-semibold">Liga {atual?.nome}</h3>
      </div>
      <div className="flex justify-between gap-1">
        {ord.map((l) => {
          const on = l.id === ligaAtual
          return (
            <div key={l.id} className="flex flex-1 flex-col items-center gap-1">
              <EscudoLiga cor={l.cor} nome={l.nome} ativo={on} fundo={on} className={`h-9 w-9 transition-transform ${on ? 'scale-110' : ''}`} />
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
