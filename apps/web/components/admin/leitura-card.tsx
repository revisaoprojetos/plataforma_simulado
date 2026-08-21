'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Trash2, Copy, ExternalLink, MoreVertical, Check, Loader2, BookOpenText, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { duplicarDocumento, excluirDocumento, type Documento } from '@/app/admin/leitura/actions'

/** Card pôster de um documento de leitura (mesma linguagem do banco-card). */
export function LeituraCard({ doc }: { doc: Documento }) {
  const [confirmar, setConfirmar] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  const c = doc.cor ?? '#6d28d9'

  function copiar() {
    start(async () => { const r = await duplicarDocumento(doc.id); r.ok ? router.refresh() : toast.error(r.error ?? 'Erro') })
  }
  function excluir() {
    start(async () => { const r = await excluirDocumento(doc.id); r.ok ? router.refresh() : toast.error(r.error ?? 'Erro') })
  }

  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {doc.capa_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={doc.capa_url} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
      )}
      {!doc.capa_url && <BookOpenText className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

      <Link href={`/admin/leitura/${doc.id}`} className="absolute inset-0 z-10" aria-label={doc.titulo} />

      {/* Status (topo esquerdo) */}
      <div className="absolute left-2 top-2 z-20">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur ${doc.publicado ? 'bg-emerald-500/80 text-white' : 'bg-white/15 text-white/90'}`}>
          {doc.publicado ? <><Eye className="h-3 w-3" /> Publicado</> : <><EyeOff className="h-3 w-3" /> Rascunho</>}
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
            <button type="button" onClick={() => setConfirmar(false)} className="rounded p-0.5 text-xs text-white/70 hover:text-white">Não</button>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 outline-none transition-colors hover:bg-white/15 hover:text-white" aria-label="Ações do documento">
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem render={<Link href={`/admin/leitura/${doc.id}`} />}>
                <ExternalLink className="mr-2 h-4 w-4" /> Abrir
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

      {/* Título + info (rodapé) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">Documento de leitura</p>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{doc.titulo}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            <BookOpenText className="h-3 w-3" /> {doc.artigos ?? 0} {(doc.artigos ?? 0) === 1 ? 'seção' : 'seções'}
          </span>
        </div>
      </div>
    </div>
  )
}
