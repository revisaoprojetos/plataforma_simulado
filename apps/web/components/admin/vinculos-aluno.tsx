'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { ClipboardList, UsersRound, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SimuladoVinc { id: string; titulo: string; status: string }
export interface GrupoVinc { id: string; nome: string; cor: string | null; membros: number }

const fmt = (n: number) => n.toLocaleString('pt-BR')
const SIM_STATUS: Record<string, { label: string; cls: string }> = {
  publicado: { label: 'Publicado', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  rascunho: { label: 'Rascunho', cls: 'bg-muted text-muted-foreground' },
  encerrado: { label: 'Encerrado', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
}

/** Aba "Vínculos": simulados vinculados + grupos (com nº de alunos), ambos expandidos e com busca. */
export function VinculosAluno({ simulados, grupos }: { simulados: SimuladoVinc[]; grupos: GrupoVinc[] }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <SimuladosVinculados simulados={simulados} />
      <GruposVinculados grupos={grupos} />
    </div>
  )
}

function SimuladosVinculados({ simulados }: { simulados: SimuladoVinc[] }) {
  const [q, setQ] = useState('')
  const busca = q.trim().toLowerCase()
  const lista = busca ? simulados.filter((s) => s.titulo.toLowerCase().includes(busca)) : simulados
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-1.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="h-3.5 w-3.5" /></span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold">Simulados vinculados</p>
          <p className="text-[11px] text-muted-foreground">{simulados.length} simulado(s)</p>
        </div>
        <div className="relative ml-auto min-w-[150px] flex-1 sm:max-w-[240px] sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar simulado…"
            className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      <div className="border-t p-3">
        {lista.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{simulados.length === 0 ? 'Nenhum simulado vinculado.' : 'Nenhum simulado encontrado.'}</p>
        ) : (
          <div className="flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto pr-1">
            {lista.map((s) => {
              const st = SIM_STATUS[s.status] ?? { label: s.status, cls: 'bg-muted text-muted-foreground' }
              return (
                <Link key={s.id} href={`/admin/simulados/${s.id}`} className="flex items-center gap-3 rounded-xl border p-2.5 transition hover:border-primary hover:bg-primary/5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ClipboardList className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.titulo}</span>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', st.cls)}>{st.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}

function GruposVinculados({ grupos }: { grupos: GrupoVinc[] }) {
  const [q, setQ] = useState('')
  const busca = q.trim().toLowerCase()
  const lista = busca ? grupos.filter((g) => g.nome.toLowerCase().includes(busca)) : grupos
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-1.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><UsersRound className="h-3.5 w-3.5" /></span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold">Grupos vinculados</p>
          <p className="text-[11px] text-muted-foreground">{grupos.length} grupo(s)</p>
        </div>
        <div className="relative ml-auto min-w-[150px] flex-1 sm:max-w-[240px] sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar grupo…"
            className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      <div className="border-t p-3">
        {lista.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{grupos.length === 0 ? 'Não é membro de nenhum grupo.' : 'Nenhum grupo encontrado.'}</p>
        ) : (
          <div className="flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto pr-1">
            {lista.map((g) => (
              <Link key={g.id} href={`/admin/grupos/${g.id}`} className="flex items-center gap-3 rounded-xl border p-2.5 transition hover:border-primary hover:bg-primary/5">
                <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: g.cor ?? 'var(--muted-foreground)' }} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.nome}</span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <UsersRound className="h-3 w-3" /> {fmt(g.membros)} aluno(s)
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
