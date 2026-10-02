import Link from 'next/link'
import { Gavel } from 'lucide-react'

export type DesafioJurisTicket = { id: string; nome: string; imagemTicket?: string | null }

/** Grade de TICKETS dos desafios de jurisprudência com acesso do aluno. Mesmo formato do ticket
 *  da Leitura (h-28/sm:h-32, imagem w-[42%]); clicar leva a /aluno/jurisprudencia?desafio=<id>. */
export function JurisprudenciaTickets({ desafios }: { desafios: DesafioJurisTicket[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {desafios.map((d) => <TicketDesafio key={d.id} d={d} />)}
    </div>
  )
}

function TicketDesafio({ d }: { d: DesafioJurisTicket }) {
  const href = `/aluno/jurisprudencia?desafio=${d.id}`
  const capa = d.imagemTicket || null
  return (
    <Link
      href={href}
      aria-label={`Abrir desafio ${d.nome}`}
      className="group relative flex h-28 overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-black/5 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:h-32"
    >
      <div className="relative w-[42%] max-w-[11rem] shrink-0 overflow-hidden">
        {capa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/90" style={{ background: 'linear-gradient(155deg, var(--primary) 0%, #0f172a 135%)' }}>
            <Gavel className="h-8 w-8" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: 'linear-gradient(110deg, transparent 45%, var(--primary))' }} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Desafio</p>
        <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground">{d.nome}</h3>
        <p className="text-[11px] font-medium text-muted-foreground">Jurisprudência</p>
      </div>
    </Link>
  )
}
