import { Award, Lock } from 'lucide-react'
import type { ConquistaView } from '@/lib/gamificacao/leitura'
import { iconeConquista } from '@/lib/gamificacao/icones'

/** Grade de conquistas: desbloqueadas coloridas, bloqueadas em cinza com cadeado. */
export function ConquistasGrid({ conquistas }: { conquistas: ConquistaView[] }) {
  if (!conquistas.length) return null
  const desbloqueadas = conquistas.filter((c) => c.desbloqueada).length
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Award className="h-4 w-4 text-primary" /> Conquistas</h3>
        <span className="text-[11px] text-muted-foreground">{desbloqueadas} de {conquistas.length} desbloqueadas</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {conquistas.map((c) => {
          const Icon = iconeConquista(c.def.icone)
          return (
            <div
              key={c.def.id}
              title={`${c.def.titulo} — ${c.def.descricao}`}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${c.desbloqueada ? 'border-primary/30 bg-primary/5' : 'opacity-55'}`}
            >
              <span className={`relative flex h-11 w-11 items-center justify-center rounded-full ${c.desbloqueada ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <Icon className="h-5 w-5" />
                {!c.desbloqueada && <Lock className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-background p-0.5 text-muted-foreground" />}
              </span>
              <span className="line-clamp-2 text-[11px] font-medium leading-tight">{c.def.titulo}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
