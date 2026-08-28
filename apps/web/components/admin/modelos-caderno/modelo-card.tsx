'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreVertical, Copy, FolderInput, Pencil, Trash2, Check, Loader2, ExternalLink, ClipboardList, FileText, BookOpenCheck, BarChart3, LayoutTemplate } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { duplicarModelo, renomearModelo, excluirModelo, type ModeloRow } from '@/app/admin/modelos-caderno/actions'

export const MODALIDADE_META: Record<string, { label: string; icon: typeof FileText }> = {
  folha_respostas: { label: 'Folha de respostas', icon: ClipboardList },
  caderno_questoes: { label: 'Caderno de enunciado', icon: FileText },
  caderno_completo: { label: 'Caderno completo', icon: BookOpenCheck },
  diagnostico: { label: 'Diagnóstico', icon: BarChart3 },
}

export function ModeloCard({ modelo, onMover }: { modelo: ModeloRow; onMover?: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const c = modelo.cor ?? '#6d28d9'
  const capa = modelo.capa_card_url ?? modelo.capa_url
  const meta = MODALIDADE_META[modelo.modalidade ?? ''] ?? { label: 'Modelo', icon: LayoutTemplate }
  const Icone = meta.icon

  function duplicar() {
    start(async () => {
      const r = await duplicarModelo(modelo.id)
      if (r.ok) { toast.success('Modelo duplicado'); router.refresh() } else toast.error(r.error ?? 'Erro')
    })
  }
  async function renomear() {
    const nome = window.prompt('Novo nome do modelo:', modelo.nome)
    if (nome == null || !nome.trim()) return
    start(async () => {
      const r = await renomearModelo(modelo.id, nome)
      if (r.ok) { toast.success('Renomeado'); router.refresh() } else toast.error(r.error ?? 'Erro')
    })
  }
  async function excluir() {
    if (!(await confirmar({ titulo: 'Excluir modelo?', mensagem: `"${modelo.nome}" irá para a lixeira.`, confirmar: 'Excluir', destrutivo: true }))) return
    start(async () => {
      const r = await excluirModelo(modelo.id)
      if (r.ok) { toast.success('Modelo excluído'); router.refresh() } else toast.error(r.error ?? 'Erro')
    })
  }

  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {capa ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
      )}
      {!capa && <Icone className="absolute -right-6 -top-8 h-40 w-40 text-white/10" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

      <Link href={`/admin/modelos-caderno/${modelo.id}`} className="absolute inset-0 z-10" aria-label={modelo.nome} />

      <div className="absolute right-2 top-2 z-30">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 outline-none transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50" aria-label="Ações do modelo">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem render={<Link href={`/admin/modelos-caderno/${modelo.id}`} />}><ExternalLink className="mr-2 h-4 w-4" /> Abrir / editar</DropdownMenuItem>
            <DropdownMenuItem onClick={renomear}><Pencil className="mr-2 h-4 w-4" /> Renomear</DropdownMenuItem>
            <DropdownMenuItem onClick={duplicar}><Copy className="mr-2 h-4 w-4" /> Duplicar</DropdownMenuItem>
            {onMover && <DropdownMenuItem onClick={onMover}><FolderInput className="mr-2 h-4 w-4" /> Mover para pasta</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={excluir} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          <Icone className="h-3 w-3" /> {meta.label}
        </span>
        <h3 className="mt-1.5 line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{modelo.nome}</h3>
      </div>
    </div>
  )
}

/** Card de pasta (folder) da área de modelos. */
export function PastaModeloCard({ pasta, onAbrir, onPersonalizar, onExcluir, count }: {
  pasta: { id: string; nome: string; cor?: string | null; capa?: string | null }
  onAbrir: () => void; onPersonalizar: () => void; onExcluir: () => void; count: number
}) {
  const c = pasta.cor ?? '#6d28d9'
  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {pasta.capa ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pasta.capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
      <button type="button" onClick={onAbrir} className="absolute inset-0 z-10" aria-label={pasta.nome} />
      <div className="absolute right-2 top-2 z-30">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 outline-none transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50" aria-label="Ações da pasta">
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onAbrir}><ExternalLink className="mr-2 h-4 w-4" /> Abrir</DropdownMenuItem>
            <DropdownMenuItem onClick={onPersonalizar}><Pencil className="mr-2 h-4 w-4" /> Personalizar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExcluir} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir pasta</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">Pasta</p>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{pasta.nome}</h3>
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
          <Check className="h-3 w-3" /> {count} modelo(s)
        </span>
      </div>
    </div>
  )
}
