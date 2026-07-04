'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { adicionarMembros, removerMembro } from '@/app/admin/grupos/actions'
import { confirmar } from '@/components/ui/confirm-dialog'
import { EditarGrupoDialog } from '@/components/admin/editar-grupo-dialog'
import { ImportarMembrosDialog } from '@/components/admin/importar-membros-dialog'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'
import { ArrowLeft, Pencil, Users, UserPlus, UserMinus, Search, Upload } from 'lucide-react'

type Est = { id: string; nome: string; email: string | null; classificacao: string | null }

export function GrupoDetalheClient({ grupo, membros, naoMembros }: { grupo: { id: string; nome: string; cor: string | null }; membros: Est[]; naoMembros: Est[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editando, setEditando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaMembros, setBuscaMembros] = useState('')

  const q = busca.trim().toLowerCase()
  const disponiveis = q ? naoMembros.filter((e) => `${e.nome} ${e.email ?? ''}`.toLowerCase().includes(q)) : naoMembros
  const qm = buscaMembros.trim().toLowerCase()
  const membrosFiltrados = qm ? membros.filter((e) => `${e.nome} ${e.email ?? ''}`.toLowerCase().includes(qm)) : membros
  const iniciais = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')
  const cor = grupo.cor ?? '#6d28d9'

  function add(e: Est) {
    start(async () => { const r = await adicionarMembros(grupo.id, [e.id]); if (r.ok) { toast.success(`${e.nome} adicionado`); router.refresh() } else toast.error(r.error ?? 'Erro') })
  }
  async function remover(e: Est) {
    if (!(await confirmar({ mensagem: `Remover "${e.nome}" do grupo?`, destrutivo: true }))) return
    start(async () => { const r = await removerMembro(grupo.id, e.id); if (r.ok) { toast.success('Removido do grupo'); router.refresh() } else toast.error(r.error ?? 'Erro') })
  }

  return (
    <div className="animate-page space-y-5">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-4 p-5" style={{ background: `linear-gradient(90deg, ${cor}22, transparent)` }}>
          <Link href="/admin/grupos" className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm" style={{ background: cor }}><Users className="h-7 w-7" /></span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{grupo.nome}</h1>
            <p className="text-muted-foreground">{membros.length} participante(s)</p>
          </div>
          <button type="button" onClick={() => setEditando(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary">
            <Pencil className="h-4 w-4" /> Editar
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Membros */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Participantes ({membros.length})</CardTitle>
            <button type="button" onClick={() => setImportando(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:text-primary">
              <Upload className="h-3.5 w-3.5" /> Importar
            </button>
          </CardHeader>
          <CardContent className="space-y-3">
            {membros.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum participante no grupo. Adicione ao lado.</p>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={buscaMembros} onChange={(e) => setBuscaMembros(e.target.value)} placeholder="Buscar participante…" className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <ul className="scroll-claro max-h-[360px] divide-y overflow-auto rounded-lg border">
                  {membrosFiltrados.length === 0 ? (
                    <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum participante encontrado.</li>
                  ) : membrosFiltrados.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{iniciais(e.nome)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/admin/estudantes/${e.id}`} className="truncate font-medium hover:text-primary">{e.nome}</Link>
                          <ClassificacaoBadge classificacao={e.classificacao} />
                        </div>
                        {e.email && <p className="truncate text-xs text-muted-foreground">{e.email}</p>}
                      </div>
                      <button type="button" onClick={() => remover(e)} disabled={pending} title="Remover do grupo" className="shrink-0 rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"><UserMinus className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        {/* Adicionar */}
        <Card>
          <CardHeader><CardTitle className="text-base">Adicionar estudantes</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar estudante…" className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="scroll-claro max-h-[360px] space-y-1.5 overflow-auto">
              {disponiveis.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{naoMembros.length === 0 ? 'Todos os estudantes já estão no grupo.' : 'Nenhum estudante encontrado.'}</p>
              ) : disponiveis.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:border-primary/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{e.nome}</p>
                      <ClassificacaoBadge classificacao={e.classificacao} />
                    </div>
                    {e.email && <p className="truncate text-xs text-muted-foreground">{e.email}</p>}
                  </div>
                  <button type="button" onClick={() => add(e)} disabled={pending} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"><UserPlus className="h-3.5 w-3.5" /> Adicionar</button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {editando && <EditarGrupoDialog grupo={grupo} onClose={() => setEditando(false)} />}
      {importando && <ImportarMembrosDialog grupoId={grupo.id} onClose={() => setImportando(false)} />}
    </div>
  )
}
