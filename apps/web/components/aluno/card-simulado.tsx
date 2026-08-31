import Link from 'next/link'
import { Radio, Play, RotateCcw, Clock, CalendarClock, Hourglass, CircleCheck, Infinity as InfinityIcon, FileDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CapaCard } from '@/components/aluno/capa-card'
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

/** Card de um simulado disponível — usado na home e na página "Simulados".
 *  `dica` = mostra um lembrete discreto (acima do título, sobre a arte) p/ baixar o caderno de questões.
 *  `variant`: 'poster' (4:5, atual) ou 'ticket' (baixo/retangular: imagem à esquerda, infos à direita). */
export function CardSimulado({ s, dica = false, variant = 'poster' }: { s: ItemSimulado; dica?: boolean; variant?: 'poster' | 'ticket' }) {
  const StatusIcon = ICON[s.tom] ?? Radio
  const cor = s.vis?.cor ?? '#6d28d9'
  const capa = s.vis?.capa

  // Selo de status (mesma lógica do pôster): "Sempre disponível" (aberto) usa relógio; demais, o status.
  const selo = (() => {
    const label = s.tom === 'sky' ? s.quando : s.statusLabel
    if (!label) return null
    return { label, Icon: s.tom === 'sky' ? Clock : StatusIcon }
  })()

  // ===== Variante TICKET: card baixo e retangular — metade esquerda com a imagem, direita com infos. =====
  if (variant === 'ticket') {
    return (
      <div className={cn('group relative flex h-28 overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-black/5 transition duration-300 sm:h-32', s.podeFazer && 'hover:-translate-y-0.5 hover:shadow-lg')}>
        {/* metade esquerda: imagem (ou degradê da marca) */}
        <div className="relative w-[42%] max-w-[11rem] shrink-0 overflow-hidden">
          <CapaCard capa={capa} cor={cor} icone={s.vis?.icone} />
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `linear-gradient(110deg, transparent 40%, ${cor})` }} />
        </div>
        {(s.podeFazer || s.podeAguardar) && <Link href={`/simulado/${s.embed_token}`} className="absolute inset-0 z-10" aria-label={s.titulo} />}
        {/* direita: infos */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {s.novo && <span className="inline-block rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">Novo</span>}
            {s.emAndamento && <span className="inline-block rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">Em andamento</span>}
            {selo && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><selo.Icon className="h-3 w-3" /> {selo.label}</span>}
          </div>
          <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground sm:text-[15px]">{s.titulo}</h3>
          {s.refazer && !s.emAndamento && <p className="text-[10px] text-muted-foreground sm:text-[11px]">Já feito {s.finalizadas}x{Number.isFinite(s.restantes) ? ` · ${s.restantes} restante(s)` : ''}</p>}
          <div className="relative mt-1 flex items-stretch gap-1.5">
            {s.podeFazer ? (
              <Link href={`/simulado/${s.embed_token}`} className="pointer-events-auto relative z-20 inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:brightness-110" style={{ background: `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 72%, #000))` }}>
                {s.emAndamento ? <><RotateCcw className="h-4 w-4 shrink-0" /> <span className="truncate">Continuar</span></> : s.refazer ? <><RotateCcw className="h-4 w-4 shrink-0" /> <span className="truncate">Refazer</span></> : <><Play className="h-4 w-4 shrink-0" /> <span className="truncate">Fazer agora</span></>}
              </Link>
            ) : s.podeAguardar ? (
              <Link href={`/simulado/${s.embed_token}`} className="pointer-events-auto relative z-20 inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border-[1.5px] px-2.5 py-1.5 text-[13px] font-semibold shadow-sm transition-colors hover:bg-muted" style={{ borderColor: cor, color: cor }}>
                <Clock className="h-4 w-4 shrink-0" /> <span className="truncate">Aguardar início</span>
              </Link>
            ) : (
              <span className="flex flex-1 items-center justify-center rounded-lg bg-muted px-2.5 py-1.5 text-center text-[11px] text-muted-foreground">{s.statusLabel === 'Agendado' ? 'Ainda não abriu' : s.statusLabel === 'Em manutenção' ? '🔧 Em manutenção' : 'Indisponível'}</span>
            )}
            {s.enunciadoUrl && <span className="relative z-20"><EnunciadoDownloadBotao url={s.enunciadoUrl} /></span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('group relative aspect-[4/5] transform-gpu overflow-hidden rounded-2xl border shadow-sm ring-1 ring-black/5 transition duration-300', s.podeFazer && 'hover:-translate-y-1 hover:shadow-xl hover:ring-white/25')}>
      <CapaCard capa={capa} cor={cor} icone={s.vis?.icone} />
      {/* glow da cor da marca no rodapé — dá profundidade e identidade */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 opacity-50 transition-opacity duration-300 group-hover:opacity-70" style={{ background: `linear-gradient(to top, ${cor}, transparent)` }} />
      {/* escurecimento p/ legibilidade do texto */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5" />

      {s.novo && <FitaNovo />}
      {(s.podeFazer || s.podeAguardar) && <Link href={`/simulado/${s.embed_token}`} className="absolute inset-0 z-10" aria-label={s.titulo} />}

      {/* Selo de status no topo-direito. Aberto → "Sempre disponível" (relógio); demais → status (Ao vivo/Agendado/Em manutenção…). */}
      {(() => {
        const label = s.tom === 'sky' ? s.quando : s.statusLabel
        if (!label) return null
        const Icon = s.tom === 'sky' ? Clock : StatusIcon
        return (
          <span className={cn('pointer-events-none absolute right-3 z-20 inline-flex items-center gap-1 rounded-full text-[10px] font-semibold text-white sm:gap-1.5 sm:text-[11px]', s.tom === 'sky' ? 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]' : 'bg-black/55 px-2 py-0.5 sm:px-2.5 sm:py-1', s.novo ? 'top-11' : 'top-3')}>
            <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            {label}
          </span>
        )
      })()}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:p-4">
        {s.emAndamento && <span className="mb-1 inline-block rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white sm:text-[10px]">Em andamento</span>}
        <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm sm:text-base">{s.titulo}</h3>
        {/* "Sempre disponível" (aberto/sky) é redundante e polui o card — esconde. Prazo/data/manutenção continuam aparecendo. */}
        {s.quando && s.tom !== 'sky' && <p className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug text-white/80 sm:mt-1 sm:text-xs"><Clock className="mt-0.5 h-3 w-3 shrink-0" /> <span>{s.quando}</span></p>}
        {s.refazer && !s.emAndamento && <p className="text-[10px] text-white/70 sm:text-[11px]">Já feito {s.finalizadas}x{Number.isFinite(s.restantes) ? ` · ${s.restantes} restante(s)` : ''}</p>}
        <div className="relative mt-2 flex items-stretch gap-1.5 sm:mt-2.5">
          {/* Balão "Baixe o caderno" como CAMADA por cima, logo acima do botão (o texto do card fica atrás). */}
          {dica && s.enunciadoUrl && (
            <span className="pointer-events-none absolute bottom-full right-0 z-30 mb-1.5 inline-flex animate-bounce items-center gap-1 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-bold text-slate-900 shadow-md backdrop-blur-sm sm:text-[11px]">
              <FileDown className="h-3 w-3 shrink-0" /> Baixe o caderno
              {/* ponta do balão apontando para baixo, na direção do botão de download */}
              <span className="absolute -bottom-1 right-4 h-2.5 w-2.5 rotate-45 bg-white/85" />
            </span>
          )}
          {s.podeFazer ? (
            <Link href={`/simulado/${s.embed_token}`} className="group/btn pointer-events-auto relative inline-flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border-[1.5px] px-2.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg sm:px-3 sm:py-2 sm:text-sm" style={{ borderColor: cor }}>
              <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100" style={{ background: `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 72%, #000))` }} />
              <span className="relative z-10 inline-flex min-w-0 max-w-full items-center gap-1.5">{s.emAndamento ? <><RotateCcw className="h-4 w-4 shrink-0" /> <span className="truncate">Continuar</span></> : s.refazer ? <><RotateCcw className="h-4 w-4 shrink-0" /> <span className="truncate">Refazer</span></> : <><Play className="h-4 w-4 shrink-0" /> <span className="truncate">Fazer agora</span></>}</span>
            </Link>
          ) : s.podeAguardar ? (
            <Link href={`/simulado/${s.embed_token}`} className="group/btn pointer-events-auto relative inline-flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border-[1.5px] px-2.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg sm:px-3 sm:py-2 sm:text-sm" style={{ borderColor: cor }}>
              <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100" style={{ background: `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 72%, #000))` }} />
              <span className="relative z-10 inline-flex min-w-0 max-w-full items-center gap-1.5"><Clock className="h-4 w-4 shrink-0" /> <span className="truncate">Entrar e aguardar início</span></span>
            </Link>
          ) : (
            <span className="flex flex-1 items-center justify-center rounded-lg bg-black/55 px-2.5 py-1.5 text-center text-[11px] text-white/80 sm:px-3 sm:py-2 sm:text-xs">{s.statusLabel === 'Agendado' ? 'Ainda não abriu' : s.statusLabel === 'Em manutenção' ? '🔧 Em manutenção' : 'Indisponível'}</span>
          )}
          {s.enunciadoUrl && <EnunciadoDownloadBotao url={s.enunciadoUrl} />}
        </div>
      </div>
    </div>
  )
}
