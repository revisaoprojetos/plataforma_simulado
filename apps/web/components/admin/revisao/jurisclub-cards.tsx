import { cn } from '@/lib/utils'
import { JC_SELOS, jcStatusLabel, type JcPasta } from '@/lib/revisao/jurisclub-tipos'

// Peças visuais do JurisClub (sem estado — servem server e client): capa do card, ticket de prévia, selos, pílula de situação.
// A cor da capa é DADO da edição (escolhida pelo admin), por isso vai em style; o resto usa tokens do tema.

export function JcCapa({ cor, acento, rotulo, sub = 'REVISÃO · JurisClub', imagem, className }: {
  cor: string; acento: string; rotulo: string; sub?: string; imagem?: string | null; className?: string
}) {
  const fundo = imagem
    ? { backgroundImage: `url('${imagem}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundImage: `linear-gradient(150deg, ${cor}, color-mix(in srgb, ${cor} 55%, black))` }
  return (
    <div className={cn('relative flex min-h-28 flex-col justify-end overflow-hidden p-3 text-white', className)} style={fundo} aria-hidden={!!imagem}>
      {!imagem && (
        <>
          <i className="absolute left-3 top-3 h-1 w-7 rounded-full" style={{ background: acento }} />
          <small className="text-[9px] font-bold uppercase tracking-widest" style={{ color: acento }}>{sub}</small>
          <b className="text-sm font-bold leading-tight">{rotulo}</b>
        </>
      )}
    </div>
  )
}

/** Rótulo curto da capa: "Edição Agosto/2026" → "Agosto/2026"; "Dia 05 · X" → "Dia 05". */
export const rotuloCapa = (titulo: string) => titulo.replace(/^Edição /, '').replace(/ · .*/, '')

export function JcStatusPill({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
      status === 'publicado' ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300'
        : status === 'agendado' ? 'bg-violet-600/15 text-violet-700 dark:text-violet-300'
          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
      {jcStatusLabel(status)}
    </span>
  )
}

export function JcSelo({ k }: { k: string }) {
  const s = JC_SELOS.find((x) => x.k === k)
  if (!s) return null
  return <span className={cn('inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none', s.cls)}>{s.n}</span>
}

/** Ticket "Prévia do card" (como aparece na lista do aluno). */
export function JcTicket({ cor, imagem, nome, pasta }: { cor: string; imagem?: string | null; nome: string; pasta: JcPasta }) {
  const t = nome.trim() || `Nome da ${pasta.un.toLowerCase()}`
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] overflow-hidden rounded-2xl border bg-card shadow-sm">
      <JcCapa cor={cor} acento={pasta.c2} imagem={imagem} rotulo={rotuloCapa(t)} sub={pasta.id === '1a7d' ? '1 Ano em 7 Dias' : 'REVISÃO · JurisClub'} className="min-h-32" />
      <div className="flex flex-col justify-center gap-1.5 p-4">
        <small className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{pasta.un}</small>
        <b className="text-sm leading-snug">{t}</b>
        <span className="mt-1 w-fit rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ background: cor }}>Ler agora</span>
      </div>
    </div>
  )
}
