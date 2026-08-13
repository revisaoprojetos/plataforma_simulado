import { Award, Check } from 'lucide-react'
import type { ConquistaProgresso } from '@/lib/gamificacao/leitura'
import { iconeConquista, corConquista } from '@/lib/gamificacao/icones'
import { ConquistaIconeFx } from '@/components/gamificacao/conquista-icone'

const UNIDADE: Record<string, string> = { xp_total: 'XP', streak: 'dias', simulados_concluidos: 'simulados', nota_max: '% acerto' }
const fmt = (n: number) => n.toLocaleString('pt-BR')

/** Lista de conquistas com barra de progresso (as mais próximas primeiro). */
export function ConquistasProgressoLista({ itens, limite = 5 }: { itens: ConquistaProgresso[]; limite?: number }) {
  if (!itens.length) return null
  const lista = itens.slice(0, limite)
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Award className="h-4 w-4 text-primary" /> Conquistas</h3>
      <div className="space-y-3">
        {lista.map((c) => {
          const Icon = iconeConquista(c.def.icone)
          const cor = c.def.cor || corConquista(c.def.id)
          const unidade = UNIDADE[c.def.regra?.tipo] ?? ''
          return (
            <div key={c.def.id} className="group -mx-1.5 flex items-center gap-3 rounded-xl px-1.5 py-1 transition-colors hover:bg-muted/50">
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-lg" style={{ background: `color-mix(in oklab, ${cor} 16%, transparent)`, color: cor }}>
                {c.desbloqueada ? <ConquistaIconeFx icone={c.def.icone} className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium transition-colors group-hover:text-primary">{c.def.titulo}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {c.desbloqueada ? <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" /> feito</span> : <>{fmt(c.atual)}/{fmt(c.meta)} {unidade}</>}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted-foreground/20">
                  <div className="h-full rounded-full transition-all" style={{ width: `${c.pct}%`, background: c.desbloqueada ? 'var(--brand-accent, var(--primary))' : cor }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
