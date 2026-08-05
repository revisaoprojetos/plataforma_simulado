import Link from 'next/link'
import { Radio, Play, RotateCcw, Clock, CalendarClock, Hourglass, CircleCheck, Infinity as InfinityIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconeBanco } from '@/lib/banco-visual'
import { EnunciadoDownloadBotao } from '@/components/aluno/enunciado-download-menu'
import type { ItemSimulado } from '@/lib/aluno/simulado-item'

// "emerald" = simulado disponível para o aluno (dentro da janela). Ícone neutro (não "ao vivo").
const ICON: Record<string, any> = { emerald: CircleCheck, amber: Hourglass, sky: InfinityIcon, slate: CalendarClock, rose: Clock }

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

/** Card (pôster) de um simulado disponível — usado na home e na página "Simulados".
 *  `dica` = mostra um balão apontando o botão de baixar o caderno de questões (usado no 1º recente). */
export function CardSimulado({ s, dica = false }: { s: ItemSimulado; dica?: boolean }) {
  const StatusIcon = ICON[s.tom] ?? Radio
  const cor = s.vis?.cor ?? '#6d28d9'
  const BancoIcon = iconeBanco(s.vis?.icone)
  const capa = s.vis?.capa
  return (
    <div className={cn('group relative aspect-[4/5] transform-gpu overflow-hidden rounded-2xl border shadow-sm ring-1 ring-black/5 transition duration-300', s.podeFazer && 'hover:-translate-y-1 hover:shadow-xl hover:ring-white/25')}>
      {capa
        ? <img src={capa} alt="" className="absolute inset-0 h-full w-full transform-gpu object-cover transition-transform duration-500 group-hover:scale-105" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
      {!capa && <BancoIcon className="absolute -right-6 -top-6 h-40 w-40 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />}
      {/* glow da cor da marca no rodapé — dá profundidade e identidade */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 opacity-50 transition-opacity duration-300 group-hover:opacity-70" style={{ background: `linear-gradient(to top, ${cor}, transparent)` }} />
      {/* escurecimento p/ legibilidade do texto */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5" />

      {s.novo && <FitaNovo />}
      {(s.podeFazer || s.podeAguardar) && <Link href={`/simulado/${s.embed_token}`} className="absolute inset-0 z-10" aria-label={s.titulo} />}

      <span className={cn('pointer-events-none absolute right-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white', s.novo ? 'top-11' : 'top-3')}>
        <StatusIcon className="h-3.5 w-3.5" />
        {s.statusLabel}
      </span>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
        {s.emAndamento && <span className="mb-1 inline-block rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Em andamento</span>}
        <h3 className="line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{s.titulo}</h3>
        {s.quando && <p className="mt-1 flex items-start gap-1 text-xs leading-snug text-white/80"><Clock className="mt-0.5 h-3 w-3 shrink-0" /> <span>{s.quando}</span></p>}
        {s.refazer && !s.emAndamento && <p className="text-[11px] text-white/70">Já feito {s.finalizadas}x{Number.isFinite(s.restantes) ? ` · ${s.restantes} restante(s)` : ''}</p>}
        <div className="relative mt-2.5 flex items-stretch gap-1.5">
          {/* Balão de dica apontando o botão de baixar o caderno de questões. */}
          {dica && s.enunciadoUrl && (
            <div className="pointer-events-none absolute -top-9 right-0 z-30 animate-bounce">
              <span className="relative block whitespace-nowrap rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-900 shadow-lg ring-1 ring-black/5">
                Baixe o caderno de questões
                <span className="absolute -bottom-1 right-4 h-2.5 w-2.5 rotate-45 bg-white" />
              </span>
            </div>
          )}
          {s.podeFazer ? (
            <Link href={`/simulado/${s.embed_token}`} className="group/btn pointer-events-auto relative inline-flex flex-1 items-center justify-center overflow-hidden rounded-lg border-[1.5px] px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg" style={{ borderColor: cor }}>
              <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100" style={{ background: `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 72%, #000))` }} />
              <span className="relative z-10 inline-flex items-center gap-1.5">{s.emAndamento ? <><RotateCcw className="h-4 w-4" /> Continuar</> : s.refazer ? <><RotateCcw className="h-4 w-4" /> Refazer</> : <><Play className="h-4 w-4" /> Fazer agora</>}</span>
            </Link>
          ) : s.podeAguardar ? (
            <Link href={`/simulado/${s.embed_token}`} className="group/btn pointer-events-auto relative inline-flex flex-1 items-center justify-center overflow-hidden rounded-lg border-[1.5px] px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg" style={{ borderColor: cor }}>
              <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100" style={{ background: `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 72%, #000))` }} />
              <span className="relative z-10 inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> Entrar e aguardar início</span>
            </Link>
          ) : (
            <span className="flex flex-1 items-center justify-center rounded-lg bg-black/55 px-3 py-2 text-center text-xs text-white/80">{s.statusLabel === 'Agendado' ? 'Ainda não abriu' : s.statusLabel === 'Em manutenção' ? '🔧 Em manutenção' : 'Indisponível'}</span>
          )}
          {s.enunciadoUrl && <EnunciadoDownloadBotao url={s.enunciadoUrl} />}
        </div>
      </div>
    </div>
  )
}
