'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { BookOpen, Scale, CheckCircle2, ListChecks, Search } from 'lucide-react'
import { iconeBanco } from '@/lib/banco-visual'
import type { CardView } from '@/lib/card-view'
import { PendentesChip, type PendenteGenerico } from './pendentes-chip'
import { cn } from '@/lib/utils'

export interface DesafioCardRow {
  moduloId: string
  nome: string
  area: string
  aulasConcluidas: number
  quizzesRespondidos: number
}
export type DesafioVisual = { capa: string | null; cor: string | null; icone: string | null }

/**
 * Cards dos desafios (Lei Seca/Jurisprudência) feitos pelo aluno — mesmo "card" dos simulados feitos:
 * cabeçalho compacto + busca, grade de pôster (4:5) ou ticket (horizontal) conforme `tema.card_view`,
 * com rolagem após ~6 itens. Cada card abre a área interna com o relatório do aluno.
 */
export function DesafiosFeitosCards({ desafios, visuais, estudanteId, cardView = 'poster', pendentes = [] }: {
  desafios: DesafioCardRow[]
  visuais: Record<string, DesafioVisual>
  estudanteId: string
  cardView?: CardView
  pendentes?: PendenteGenerico[]
}) {
  const [busca, setBusca] = useState('')
  const q = busca.trim().toLowerCase()
  const filtrados = q ? desafios.filter((d) => d.nome.toLowerCase().includes(q)) : desafios

  return (
    <Card className="overflow-hidden">
      {/* Cabeçalho compacto: título à esquerda, busca à direita */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-1.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><BookOpen className="h-3.5 w-3.5" /></span>
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold">Desafios feitos</p>
            <p className="text-[11px] text-muted-foreground">{desafios.length} desafio(s)</p>
          </div>
        </div>
        <PendentesChip pendentes={pendentes} titulo="Desafios pendentes" icon={BookOpen} />
        <div className="relative ml-auto min-w-[170px] flex-1 sm:max-w-[280px] sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar desafio…"
            className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      <div className="border-t p-4">
        {filtrados.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{desafios.length === 0 ? 'Nenhuma atividade em desafios.' : 'Nenhum desafio encontrado.'}</p>
        ) : (
          <div className={cn('grid auto-rows-max content-start gap-3 overflow-y-auto pr-1', cardView === 'ticket' ? 'h-[19rem] sm:grid-cols-2 xl:grid-cols-3' : 'h-[31rem] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4')}>
            {filtrados.map((d) => {
              const v = visuais[d.moduloId] ?? { capa: null, cor: null, icone: null }
              const juris = d.area === 'jurisprudencia'
              const AreaIcon = juris ? Scale : BookOpen
              const Icon = iconeBanco(v.icone)
              const c = v.cor ?? '#6d28d9'
              const detalhe = `/admin/estudantes/${estudanteId}/desafio/${d.moduloId}`

              // ── TICKET: imagem 4:3 à esquerda, infos sobre o bg-card à direita ──
              if (cardView === 'ticket') {
                return (
                  <Link key={d.moduloId} href={detalhe} className="group relative flex h-32 overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg sm:h-36">
                    <div className="relative aspect-[4/3] h-full shrink-0 overflow-hidden">
                      {v.capa
                        ? <img src={v.capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />}
                      {!v.capa && <Icon className="absolute -right-4 -top-4 h-28 w-28 text-white/10" />}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-between px-3 pb-2 pt-2">
                      <span className="inline-flex w-fit items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"><AreaIcon className="h-3 w-3" /> {juris ? 'Jurisprudência' : 'Lei Seca'}</span>
                      <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground sm:text-[15px]">{d.nome}</h3>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><CheckCircle2 className="h-3 w-3" /> {d.aulasConcluidas} aula(s)</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><ListChecks className="h-3 w-3" /> {d.quizzesRespondidos} quiz</span>
                      </div>
                    </div>
                  </Link>
                )
              }

              // ── PÔSTER 4:5 ──
              return (
                <Link key={d.moduloId} href={detalhe} className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
                  {v.capa
                    ? <img src={v.capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />}
                  {!v.capa && <Icon className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <span className="mb-1 inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/80 backdrop-blur"><AreaIcon className="h-3 w-3" /> {juris ? 'Jurisprudência' : 'Lei Seca'}</span>
                    <h3 className="line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{d.nome}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur"><CheckCircle2 className="h-3 w-3" /> {d.aulasConcluidas} aula(s)</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur"><ListChecks className="h-3 w-3" /> {d.quizzesRespondidos} quiz</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}
