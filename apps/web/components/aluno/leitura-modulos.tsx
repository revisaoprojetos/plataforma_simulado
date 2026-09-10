import Link from 'next/link'
import { Library, ChevronRight } from 'lucide-react'
import { type CardView } from '@/lib/card-view'

export type ModuloAlunoCard = { id: string; nome: string; cor: string | null; capa: string | null; capaCard: string | null; total: number; done: number }

/** Seleção de MÓDULOS do aluno (grid de cards) — antes de abrir a trilha. Segue o card_view do tenant
 * (pôster × ticket). Cada card leva a `/aluno/leitura?modulo=<id>` (infos + trilha serpenteada). */
export function LeituraModulos({ modulos, cardView = 'poster' }: { modulos: ModuloAlunoCard[]; cardView?: CardView }) {
  const grid = cardView === 'ticket'
    ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-3'
    : 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
  return (
    <div className={grid}>
      {modulos.map((m) => <ModuloCardAluno key={m.id} m={m} variant={cardView} />)}
    </div>
  )
}

function Progresso({ done, total, claro }: { done: number; total: number; claro?: boolean }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const concluido = total > 0 && done >= total
  return (
    <div className="space-y-1">
      <div className={`h-1.5 w-full overflow-hidden rounded-full ${claro ? 'bg-white/25' : 'bg-muted'}`}>
        <div className={`h-full rounded-full transition-all ${claro ? 'bg-white' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-[11px] font-medium ${claro ? 'text-white/85' : 'text-muted-foreground'}`}>{concluido ? '✓ Concluído' : `${done}/${total} aula(s)`}</p>
    </div>
  )
}

function ModuloCardAluno({ m, variant }: { m: ModuloAlunoCard; variant: CardView }) {
  const capa = m.capaCard || m.capa
  const c = m.cor ?? '#6d28d9'
  const href = `/aluno/leitura?modulo=${m.id}`

  // ===== TICKET: mesmo tamanho dos tickets de "Simulados realizados" (h-28/sm:h-32, imagem w-[42%]). =====
  if (variant === 'ticket') {
    return (
      <Link href={href} className="group relative flex h-28 overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-black/5 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:h-32">
        <div className="relative w-[42%] max-w-[11rem] shrink-0 overflow-hidden">
          {capa
            ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
            : <div className="absolute inset-0 flex items-center justify-center text-white/90" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }}><Library className="h-8 w-8" /></div>}
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `linear-gradient(110deg, transparent 45%, ${c})` }} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Módulo</p>
          <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground">{m.nome}</h3>
          <Progresso done={m.done} total={m.total} />
        </div>
      </Link>
    )
  }

  // ===== PÔSTER (4:5): imagem preenchendo, nome + progresso sobrepostos. =====
  return (
    <Link href={href} className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {capa
        ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        : <div className="absolute inset-0 flex items-center justify-center text-white/90" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }}><Library className="h-10 w-10" /></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />
      <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">Módulo</p>
        <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{m.nome}</h3>
        <Progresso done={m.done} total={m.total} claro />
      </div>
      <span className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors group-hover:bg-white/30">
        <ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  )
}
