'use client'

// AÇÕES do cabeçalho da classificação (menu ⋮): duplicar, subir/descer na ordem, arquivar/reativar, apagar seguro.
// Só dispara as rotas (tipos / [id]) e navega; o bloqueio de "apagar" vem calculado do servidor (bloqueioApagar).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Copy, Loader2, MoreVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { navProgressStart } from '@/lib/nav-progress'
import { API_TIPOS, api, apiDetalhe, hrefDetalhe } from '../classificacao-comuns'

export function CabecalhoAcoes({ id, nome, ativo, sistema, versao, anteriorId, proximoId, bloqueioApagar, podeEditar }: {
  id: string; nome: string; ativo: boolean; sistema: boolean; versao: number
  anteriorId: string | null; proximoId: string | null; bloqueioApagar: string | null; podeEditar: boolean
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  if (!podeEditar) return null

  async function chamar(fn: () => Promise<{ ok: boolean; data: any }>, ok: string, depois?: (d: any) => void) {
    setOcupado(true)
    const r = await fn()
    setOcupado(false)
    if (!r.ok) return toast.error(r.data?.error || 'Não foi possível concluir.')
    toast.success(ok)
    if (depois) depois(r.data); else router.refresh()
  }
  const duplicar = () => chamar(() => api('POST', API_TIPOS, { duplicarDe: id, nome: `${nome} (cópia)`.slice(0, 60) }), 'Classificação duplicada. Abrindo a cópia…', (d) => { navProgressStart(); router.push(hrefDetalhe(d.id as string)) })
  const mover = (delta: -1 | 1) => chamar(() => api('POST', apiDetalhe(id), { acao: 'mover', delta }), 'Ordem atualizada.')
  const alternar = () => chamar(() => api('PATCH', API_TIPOS, { id, patch: { ativo: !ativo }, versao }), ativo ? 'Classificação arquivada.' : 'Classificação reativada.')
  async function apagar() {
    if (bloqueioApagar) {
      await confirmar({ titulo: 'Não é possível apagar', mensagem: bloqueioApagar, confirmar: 'Entendi', cancelar: 'Fechar' })
      return
    }
    if (!(await confirmar({ titulo: 'Apagar classificação', mensagem: `Apagar "${nome}" definitivamente? As regras de uso dela também são removidas. Não dá para desfazer.`, confirmar: 'Apagar', destrutivo: true }))) return
    await chamar(() => api('DELETE', `${API_TIPOS}?id=${id}&modo=apagar`), 'Classificação apagada.', () => { navProgressStart(); router.push('/admin/biblioteca/classificacao') })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Ações da classificação" render={<Button variant="outline" size="icon" disabled={ocupado} />}>
        {ocupado ? <Loader2 className="animate-spin" /> : <MoreVertical />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={duplicar}><Copy className="h-4 w-4" />Duplicar</DropdownMenuItem>
        <DropdownMenuItem disabled={!anteriorId} onClick={() => void mover(-1)}><ArrowUp className="h-4 w-4" />Subir na ordem</DropdownMenuItem>
        <DropdownMenuItem disabled={!proximoId} onClick={() => void mover(1)}><ArrowDown className="h-4 w-4" />Descer na ordem</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={alternar}>{ativo ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}{ativo ? 'Arquivar (desativar)' : 'Reativar'}</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" disabled={sistema} onClick={() => void apagar()}><Trash2 className="h-4 w-4" />Apagar{bloqueioApagar && !sistema ? ' (em uso)' : ''}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
