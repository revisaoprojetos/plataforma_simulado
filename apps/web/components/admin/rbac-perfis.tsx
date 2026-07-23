'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, X, ShieldCheck, Users, KeyRound, ChevronRight, Crown, BookOpen, PenLine, BarChart3, Wallet, GraduationCap, FlaskConical, UserCog } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PerfilCard = { id: string; nome: string; descricao: string | null; is_sistema: boolean; permCount: number; userCount: number }

// Rótulo amigável + ícone + cor por perfil-semente conhecido (fallback genérico).
const META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; tom: string }> = {
  super_admin: { label: 'Super Admin', icon: Crown, tom: 'from-amber-500/20 text-amber-600 dark:text-amber-400' },
  admin: { label: 'Administrador', icon: ShieldCheck, tom: 'from-primary/20 text-primary' },
  admin_geral: { label: 'Admin Geral', icon: ShieldCheck, tom: 'from-primary/20 text-primary' },
  admin_conteudo: { label: 'Conteúdo', icon: BookOpen, tom: 'from-sky-500/20 text-sky-600 dark:text-sky-400' },
  admin_correcao: { label: 'Correção', icon: PenLine, tom: 'from-violet-500/20 text-violet-600 dark:text-violet-400' },
  admin_relatorio: { label: 'Relatórios', icon: BarChart3, tom: 'from-emerald-500/20 text-emerald-600 dark:text-emerald-400' },
  admin_comercial: { label: 'Comercial', icon: Wallet, tom: 'from-rose-500/20 text-rose-600 dark:text-rose-400' },
  estudante: { label: 'Estudante', icon: GraduationCap, tom: 'from-slate-500/20 text-slate-600 dark:text-slate-400' },
  testador: { label: 'Testador', icon: FlaskConical, tom: 'from-teal-500/20 text-teal-600 dark:text-teal-400' },
}
function meta(nome: string) {
  return META[nome] ?? { label: nome.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), icon: UserCog, tom: 'from-primary/20 text-primary' }
}

export function RbacPerfis({ perfis, destaqueId, basePath = '/admin/administradores/permissoes' }: { perfis: PerfilCard[]; destaqueId?: string | null; basePath?: string }) {
  const [q, setQ] = useState('')
  const [destaque, setDestaque] = useState<string | null>(destaqueId ?? null)

  // Pulso ao chegar via ?perfil=<id> (some após alguns segundos).
  useEffect(() => {
    if (!destaqueId) return
    setDestaque(destaqueId)
    const t = setTimeout(() => setDestaque(null), 4500)
    return () => clearTimeout(t)
  }, [destaqueId])

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return perfis
    return perfis.filter((p) => p.nome.toLowerCase().includes(t) || meta(p.nome).label.toLowerCase().includes(t) || (p.descricao ?? '').toLowerCase().includes(t))
  }, [perfis, q])

  // Pulsa: o resultado único da busca, ou o perfil destacado pela URL.
  const pulseId = (q.trim() && filtrados.length === 1 ? filtrados[0].id : null) ?? destaque

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar perfil…"
          className="w-full rounded-lg border bg-transparent py-2 pl-9 pr-8 text-sm outline-none transition focus:ring-2 focus:ring-ring" />
        {q && <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
      </div>

      {filtrados.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Nenhum perfil encontrado.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((p) => {
            const m = meta(p.nome)
            const Icon = m.icon
            const pulsando = p.id === pulseId
            return (
              <Link key={p.id} href={`${basePath}/${p.id}`}
                className={cn('group relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md',
                  pulsando && 'animate-pulse ring-2 ring-primary')}>
                <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r to-transparent', m.tom)} />
                <div className="flex items-start justify-between gap-2">
                  <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br to-transparent', m.tom)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  {p.is_sistema && <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">sistema</span>}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{m.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.descricao || p.nome}</p>
                </div>
                <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> <b className="tabular-nums text-foreground">{p.userCount}</b> usuário(s)</span>
                  <span className="inline-flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" /> <b className="tabular-nums text-foreground">{p.permCount}</b> permissão(ões)</span>
                  <ChevronRight className="ml-auto h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
