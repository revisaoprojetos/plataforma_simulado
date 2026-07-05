'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Palette, Trash2, Copy, ExternalLink, MoreVertical, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { excluirBanco, duplicarBanco } from '@/app/admin/banco-questoes/actions'
import { iconeBanco } from '@/lib/banco-visual'

export function BancoCard({ id, nome, total, cor, icone, capa }: { id: string; nome: string; total: number; cor?: string | null; icone?: string | null; capa?: string | null }) {
  const [confirmar, setConfirmar] = useState(false)
  const [pending, start] = useTransition()

  const Icon = iconeBanco(icone)
  const c = cor ?? '#6d28d9'

  function copiar() {
    start(async () => {
      const r = await duplicarBanco(id)
      if (r.ok) window.location.reload()
      else toast.error(r.error ?? 'Erro')
    })
  }
  function excluir() {
    start(async () => {
      const r = await excluirBanco(id)
      if (r.ok) window.location.reload()
      else toast.error(r.error ?? 'Erro')
    })
  }

  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {/* Fundo: imagem de capa ou degradê da cor */}
      {capa ? (
        <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
      )}
      {/* Ícone-marca d'água quando não há capa */}
      {!capa && <Icon className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
      {/* Degradê para legibilidade do texto */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

      {/* Link cobre o card inteiro */}
      <Link href={`/admin/banco-questoes/${id}`} className="absolute inset-0 z-10" aria-label={nome} />

      {/* Chip do ícone (topo esquerdo) */}
      <div className="pointer-events-none absolute left-3 top-3 z-20">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-white/20" style={{ background: c }}>
          <Icon className="h-4 w-4" />
        </span>
      </div>

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
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem render={<Link href={`/admin/banco-questoes/${id}`} />}>
                <ExternalLink className="mr-2 h-4 w-4" /> Abrir
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href={`/admin/banco-questoes/${id}?tab=personalizar`} />}>
                <Palette className="mr-2 h-4 w-4" /> Personalizar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copiar}>
                <Copy className="mr-2 h-4 w-4" /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setConfirmar(true)} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Título + info básica (rodapé) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">Banco de questões</p>
        <h3 className="mt-0.5 line-clamp-2 text-lg font-bold leading-tight text-white drop-shadow-sm">{nome}</h3>
        <span className="mt-2 inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur">
          {total} {total === 1 ? 'questão' : 'questões'}
        </span>
      </div>
    </div>
  )
}
