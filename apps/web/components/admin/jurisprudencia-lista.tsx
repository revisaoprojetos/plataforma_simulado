'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Gamepad2, Loader2, Gavel } from 'lucide-react'
import { type CardView } from '@/lib/card-view'
import { criarDesafio } from '@/app/admin/jurisprudencia/actions'

type DesafioItem = { id: string; nome: string; imagens?: Record<string, any> | null }

// Lista de desafios (cards) + criar novo. Cards no MESMO formato da área Desafio de Lei Seca
// (ModuloCard: pôster 4:5 ou ticket, conforme o card_view do tenant). Sem desafios → estado vazio com CTA.
export function JurisDesafioLista({ desafios, cardView = 'poster' }: { desafios: DesafioItem[]; cardView?: CardView }) {
  const router = useRouter()
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [pending, start] = useTransition()

  function salvar() {
    const n = nome.trim()
    if (!n) { toast.error('Dê um nome ao desafio.'); return }
    start(async () => {
      const r = await criarDesafio(n)
      if (!r.ok || !r.id) { toast.error(r.error ?? 'Erro ao criar desafio.'); return }
      toast.success('Desafio criado.')
      router.push(`/admin/jurisprudencia?desafio=${r.id}`)
    })
  }

  const grid = cardView === 'ticket'
    ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-3'
    : 'grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{desafios.length} desafio(s)</p>
        {!criando && (
          <button type="button" onClick={() => setCriando(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
            <Plus className="h-4 w-4" /> Novo desafio
          </button>
        )}
      </div>

      {criando && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-4 shadow-sm">
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && salvar()}
            placeholder="Nome do desafio (ex.: Jurisprudência 2026)" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          <button type="button" onClick={salvar} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar
          </button>
          <button type="button" onClick={() => { setCriando(false); setNome('') }} className="rounded-lg border px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted">Cancelar</button>
        </div>
      )}

      {desafios.length === 0 && !criando ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center shadow-sm">
          <Gamepad2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-semibold">Nenhum desafio ainda</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Crie o primeiro desafio de jurisprudência para começar a montar os dias e as teses.</p>
          <button type="button" onClick={() => setCriando(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
            <Plus className="h-4 w-4" /> Novo desafio
          </button>
        </div>
      ) : (
        <div className={grid}>
          {desafios.map((d) => <DesafioCard key={d.id} d={d} variant={cardView} />)}
        </div>
      )}
    </div>
  )
}

/** Card de desafio no MESMO formato do ModuloCard da Lei Seca (pôster 4:5 / ticket). */
function DesafioCard({ d, variant }: { d: DesafioItem; variant: CardView }) {
  const href = `/admin/jurisprudencia?desafio=${d.id}`
  const c = 'var(--primary)'
  // Pôster prefere a CAPA (4:5); ticket prefere o TICKET (4:3). Um cai no outro se faltar.
  const capaPoster = (d.imagens?.capa as string | undefined) || (d.imagens?.ticket as string | undefined) || null
  const capaTicket = (d.imagens?.ticket as string | undefined) || (d.imagens?.capa as string | undefined) || null
  const Badge = () => (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><Gavel className="h-3 w-3" /> Jurisprudência</span>
  )

  // ===== TICKET: imagem à esquerda (4:3), infos à direita — igual ao ModuloCard ticket. =====
  if (variant === 'ticket') {
    return (
      <Link href={href} aria-label={`Abrir desafio ${d.nome}`}
        className="group relative flex h-32 overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:h-36">
        <div className="relative h-full aspect-[4/3] shrink-0 overflow-hidden">
          {capaTicket
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={capaTicket} alt="" className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
            : <div className="absolute inset-0 flex items-center justify-center text-white/90" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }}><Gavel className="h-8 w-8" /></div>}
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `linear-gradient(110deg, transparent 45%, ${c})` }} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Desafio</p>
          <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground sm:text-[15px]">{d.nome}</h3>
          <Badge />
        </div>
      </Link>
    )
  }

  // ===== PÔSTER (4:5): imagem preenchendo, nome + badge sobrepostos — igual ao ModuloCard pôster. =====
  return (
    <Link href={href} aria-label={`Abrir desafio ${d.nome}`}
      className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {capaPoster
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={capaPoster} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        : <div className="absolute inset-0 flex items-center justify-center text-white/90" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }}><Gavel className="h-10 w-10" /></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">Desafio</p>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{d.nome}</h3>
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur"><Gavel className="h-3 w-3" /> Jurisprudência</span>
      </div>
    </Link>
  )
}
