'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Palette, Trash2, Copy, ExternalLink, MoreVertical, Check, Loader2, ListChecks, PenLine, Users, FolderInput } from 'lucide-react'
import { toast } from 'sonner'
import type { CardView } from '@/lib/card-view'
import { excluirBanco, duplicarBanco } from '@/app/admin/banco-questoes/actions'

export function BancoCard({ id, nome, total, estudantes = 0, cor, icone, capa, tipo, onMover, variant = 'poster' }: { id: string; nome: string; total: number; estudantes?: number; cor?: string | null; icone?: string | null; capa?: string | null; tipo?: string | null; onMover?: () => void; variant?: CardView }) {
  const [confirmar, setConfirmar] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()

  const c = cor ?? '#6d28d9'
  const detalhe = `/admin/banco-questoes/${id}`

  function copiar() {
    start(async () => {
      const r = await duplicarBanco(id)
      if (r.ok) router.refresh()
      else toast.error(r.error ?? 'Erro')
    })
  }
  function excluir() {
    start(async () => {
      const r = await excluirBanco(id)
      if (r.ok) router.refresh()
      else toast.error(r.error ?? 'Erro')
    })
  }

  // Itens do menu de 3 pontos — compartilhados entre pôster e ticket.
  const menuItens = (
    <>
      <DropdownMenuItem render={<Link href={detalhe} />}><ExternalLink className="mr-2 h-4 w-4" /> Abrir</DropdownMenuItem>
      <DropdownMenuItem render={<Link href={`${detalhe}?tab=personalizar`} />}><Palette className="mr-2 h-4 w-4" /> Personalizar</DropdownMenuItem>
      <DropdownMenuItem onClick={copiar}><Copy className="mr-2 h-4 w-4" /> Duplicar</DropdownMenuItem>
      {onMover && <DropdownMenuItem onClick={onMover}><FolderInput className="mr-2 h-4 w-4" /> Mover para pasta</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => setConfirmar(true)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
    </>
  )

  // ===== Variante TICKET: card baixo/retangular — imagem à esquerda, infos+ações à direita. =====
  if (variant === 'ticket') {
    return (
      <div className="group relative flex h-32 overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:h-36">
        {/* metade esquerda: imagem/degradê */}
        <div className="relative w-[38%] max-w-[12rem] shrink-0 overflow-hidden">
          {capa
            ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
            : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />}
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `linear-gradient(110deg, transparent 45%, ${c})` }} />
        </div>
        {/* Link cobre o card (abaixo dos controles) */}
        <Link href={detalhe} className="absolute inset-0 z-10" aria-label={nome} />
        {/* direita: infos + ações */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Banco de questões</p>
            <div className="pointer-events-auto z-20">
              {confirmar ? (
                <div className="flex items-center gap-1 rounded-lg border bg-card px-2 py-1 shadow-sm">
                  <span className="text-xs text-muted-foreground">Excluir?</span>
                  <button type="button" onClick={excluir} disabled={pending} className="rounded p-0.5 text-rose-600 hover:text-rose-500">
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => setConfirmar(false)} className="rounded p-0.5 text-xs text-muted-foreground hover:text-foreground">Não</button>
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label="Ações do banco">
                    <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">{menuItens}</DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground sm:text-[15px]">
            <Link href={detalhe} className="pointer-events-auto relative z-20 transition-opacity hover:opacity-80">{nome}</Link>
          </h3>
          <div className="flex flex-wrap items-center gap-1">
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{total} {total === 1 ? 'questão' : 'questões'}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {tipo === 'discursiva' ? <><PenLine className="h-3 w-3" /> Discursiva</> : <><ListChecks className="h-3 w-3" /> Objetiva</>}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground" title={`${estudantes} estudante(s) neste banco`}>
              <Users className="h-3 w-3" /> {estudantes}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ===== Variante PÔSTER (padrão): card 4:5 com imagem preenchendo e texto sobreposto. =====
  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {/* Fundo: imagem de capa ou degradê da cor */}
      {capa ? (
        <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
      )}
      {/* Degradê para legibilidade do texto */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

      {/* Link cobre o card inteiro */}
      <Link href={detalhe} className="absolute inset-0 z-10" aria-label={nome} />

      {/* Ações (topo direito) */}
      <div className="absolute right-2 top-2 z-30">
        {confirmar ? (
          <div className="flex items-center gap-1 rounded-lg bg-black/70 px-2 py-1 backdrop-blur">
            <span className="text-xs text-white/80">Excluir?</span>
            <button type="button" onClick={excluir} disabled={pending} className="rounded p-0.5 text-rose-300 hover:text-rose-200">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => setConfirmar(false)} className="rounded p-0.5 text-white/70 hover:text-white text-xs">Não</button>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 outline-none transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Ações do banco"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">{menuItens}</DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Título + info básica (rodapé) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">Banco de questões</p>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{nome}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            {total} {total === 1 ? 'questão' : 'questões'}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            {tipo === 'discursiva' ? <><PenLine className="h-3 w-3" /> Discursiva</> : <><ListChecks className="h-3 w-3" /> Objetiva</>}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur" title={`${estudantes} estudante(s) neste banco`}>
            <Users className="h-3 w-3" /> {estudantes}
          </span>
        </div>
      </div>
    </div>
  )
}
