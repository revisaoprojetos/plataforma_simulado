import Link from 'next/link'
import { Radio, Play, RotateCcw, Clock, CalendarClock, Hourglass, Infinity as InfinityIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconeBanco } from '@/lib/banco-visual'
import type { ItemSimulado } from '@/lib/aluno/simulado-item'

const ICON: Record<string, any> = { emerald: Radio, amber: Hourglass, sky: InfinityIcon, slate: CalendarClock, rose: Clock }

/** Fitinha "novo" — banner de 2 pontas (fishtail) no canto superior direito. */
function FitaNovo() {
  return (
    <span className="pointer-events-none absolute right-3 top-0 z-30 select-none" aria-label="Novo">
      <span
        className="flex h-8 w-11 items-start justify-center pt-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-md"
        style={{ background: 'linear-gradient(180deg, #fb7185, #e11d48)', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%)' }}
      >
        Novo
      </span>
    </span>
  )
}

/** Card (pôster) de um simulado disponível — usado na home e na página "Simulados". */
export function CardSimulado({ s }: { s: ItemSimulado }) {
  const StatusIcon = ICON[s.tom] ?? Radio
  const cor = s.vis?.cor ?? '#6d28d9'
  const BancoIcon = iconeBanco(s.vis?.icone)
  const capa = s.vis?.capa
  return (
    <div className={cn('group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all', s.podeFazer && 'hover:-translate-y-1 hover:shadow-lg', s.aoVivo && 'ring-2 ring-emerald-500/50')}>
      {capa
        ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
      {!capa && <BancoIcon className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

      {s.novo && <FitaNovo />}
      {s.podeFazer && <Link href={`/simulado/${s.embed_token}`} className="absolute inset-0 z-10" aria-label={s.titulo} />}

      <span className="pointer-events-none absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-white/20" style={{ background: cor }}><BancoIcon className="h-4 w-4" /></span>
      <span className={cn('pointer-events-none absolute right-3 z-20 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur', s.novo ? 'top-11' : 'top-3', s.aoVivo ? 'bg-emerald-500/90' : 'bg-black/45')}>
        {s.aoVivo
          ? <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>
          : <StatusIcon className="h-3.5 w-3.5" />}
        {s.statusLabel}
      </span>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
        {s.emAndamento && <span className="mb-1 inline-block rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">Em andamento</span>}
        <h3 className="line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{s.titulo}</h3>
        {s.quando && <p className="mt-1 flex items-start gap-1 text-xs leading-snug text-white/80"><Clock className="mt-0.5 h-3 w-3 shrink-0" /> <span>{s.quando}</span></p>}
        {s.refazer && !s.emAndamento && <p className="text-[11px] text-white/70">Já feito {s.finalizadas}x{Number.isFinite(s.restantes) ? ` · ${s.restantes} restante(s)` : ''}</p>}
        {s.podeFazer ? (
          <span className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black shadow-sm">
            {s.emAndamento ? <><RotateCcw className="h-4 w-4" /> Continuar</> : s.refazer ? <><RotateCcw className="h-4 w-4" /> Refazer</> : <><Play className="h-4 w-4" /> Fazer agora</>}
          </span>
        ) : (
          <span className="mt-2 block rounded-lg bg-black/45 px-3 py-2 text-center text-xs text-white/80 backdrop-blur">{s.statusLabel === 'Agendado' ? 'Ainda não abriu' : 'Indisponível'}</span>
        )}
      </div>
    </div>
  )
}
