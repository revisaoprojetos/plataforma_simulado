'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { criarGrupo, excluirGrupo } from '@/app/admin/grupos/actions'
import { pedirTexto, confirmar } from '@/components/ui/confirm-dialog'
import { EditarGrupoDialog } from '@/components/admin/editar-grupo-dialog'
import { Plus, Users, Pencil, Trash2, Loader2, UsersRound, ChevronRight } from 'lucide-react'

type Grupo = { id: string; nome: string; membros: number; cor: string | null }

export function GruposClient({ grupos }: { grupos: Grupo[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editando, setEditando] = useState<Grupo | null>(null)

  async function novo() {
    const nome = await pedirTexto({ titulo: 'Novo grupo', label: 'Nome do grupo', placeholder: 'ex.: Turma 2026', confirmar: 'Criar' })
    if (!nome) return
    start(async () => { const r = await criarGrupo(nome); if (r.ok) { toast.success('Grupo criado'); router.refresh() } else toast.error(r.error ?? 'Erro ao criar') })
  }
  async function excluir(g: Grupo) {
    if (!(await confirmar({ mensagem: `Excluir o grupo "${g.nome}"?`, destrutivo: true }))) return
    start(async () => { const r = await excluirGrupo(g.id); if (r.ok) { toast.success('Grupo excluído'); router.refresh() } else toast.error(r.error ?? 'Erro') })
  }

  return (
    <div className="animate-page space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Grupos</h1>
          <p className="text-muted-foreground">Gerencie grupos de estudantes para atribuição de simulados.</p>
        </div>
        <button type="button" onClick={novo} disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Novo grupo
        </button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Grupos cadastrados ({grupos.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {grupos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <UsersRound className="h-8 w-8 opacity-40" />
              <p className="text-sm">Nenhum grupo cadastrado.</p>
              <button type="button" onClick={novo} className="text-sm font-medium text-primary hover:underline">Criar o primeiro</button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Nome</th>
                  <th className="px-4 py-2.5 font-medium">Participantes</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {grupos.map((g) => (
                  <tr key={g.id} className="group transition-colors hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/grupos/${g.id}`} className="flex items-center gap-2 font-medium hover:text-primary">
                        <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: g.cor ?? 'var(--muted-foreground)' }} />
                        {g.nome}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    </td>
                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><Users className="h-3.5 w-3.5" /> {g.membros}</span></td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => setEditando(g)} title="Editar (nome e cor)" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => excluir(g)} title="Excluir" className="rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {editando && <EditarGrupoDialog grupo={editando} onClose={() => setEditando(null)} />}
    </div>
  )
}
