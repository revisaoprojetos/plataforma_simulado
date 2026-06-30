'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MoreHorizontal, Trash2, ListChecks, ClipboardList, FileText, FileCheck2, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { excluirSessaoAction } from '@/app/admin/estudantes/actions'

type Mod = { id: string; nome: string }

function IconeMod({ nome }: { nome: string }) {
  const n = (nome ?? '').toLowerCase()
  const Icon = n.includes('diagn') ? ClipboardList : n.includes('discursiv') ? FileText : n.includes('gabarito') || n.includes('objetiv') ? FileCheck2 : ListChecks
  return <Icon className="mr-2 h-4 w-4" />
}

export function SessaoAcoesMenu({
  cadId, mods, estudanteId, sessaoId, simuladoId, temResultado,
}: {
  cadId: string | null
  mods: Mod[]
  estudanteId: string
  sessaoId: string
  simuladoId: string
  temResultado: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function abrir(url: string) {
    window.open(url, '_blank', 'noopener')
  }

  function excluir() {
    if (!confirm('Excluir esta tentativa?\n\nEla sai do histórico, dos resultados e do ranking (recalculado), e vai para a Lixeira — pode ser restaurada.')) return
    start(async () => {
      const r = await excluirSessaoAction(sessaoId, simuladoId, estudanteId)
      if (r?.error) toast.error(r.error)
      else { toast.success('Tentativa enviada para a Lixeira'); router.refresh() }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        title="Ações" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {temResultado && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Gabaritos</DropdownMenuLabel>
              {cadId && mods.length ? (
                mods.map((m) => (
                  <DropdownMenuItem key={m.id} onClick={() => abrir(`/imprimir/caderno/${cadId}?aluno=${estudanteId}&mod=${m.id}&sessao=${sessaoId}`)}>
                    <IconeMod nome={m.nome} /> {m.nome}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem onClick={() => router.push(`/admin/estudantes/${estudanteId}/gabarito/${sessaoId}`)}>
                  <ListChecks className="mr-2 h-4 w-4" /> Ver gabarito
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={excluir} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Excluir tentativa
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
