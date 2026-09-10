import Link from 'next/link'
import { Library, ChevronRight } from 'lucide-react'

export type ModuloAlunoCard = { id: string; nome: string; cor: string | null; capa: string | null; capaCard: string | null; total: number; done: number }

/** Seleção de MÓDULOS do aluno (grid de cards pôster) — antes de abrir a trilha. Cada card leva a
 * `/aluno/leitura?modulo=<id>`, onde aparecem as infos do módulo + a trilha serpenteada. */
export function LeituraModulos({ modulos }: { modulos: ModuloAlunoCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {modulos.map((m) => {
        const capa = m.capaCard || m.capa
        const c = m.cor ?? '#6d28d9'
        const pct = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0
        const concluido = m.total > 0 && m.done >= m.total
        return (
          <Link key={m.id} href={`/aluno/leitura?modulo=${m.id}`}
            className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
            {capa
              ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              : <div className="absolute inset-0 flex items-center justify-center text-white/90" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }}><Library className="h-10 w-10" /></div>}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />

            <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">Módulo</p>
              <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{m.nome}</h3>
              {/* Progresso */}
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/25">
                  <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[11px] font-medium text-white/85">{concluido ? '✓ Concluído' : `${m.done}/${m.total} aula(s)`}</p>
              </div>
            </div>

            <span className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors group-hover:bg-white/30">
              <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        )
      })}
    </div>
  )
}
