'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Search, UserPlus, UserMinus, Users, Loader2, X, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { atribuirPerfil, removerDoPerfil, type UsuarioPerfil } from '@/app/admin/rbac/actions'

function iniciais(nome: string | null, email: string | null) {
  const base = nome || email || '?'
  return base.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')
}

export function RbacPerfilUsuarios({ roleId, membros, disponiveis }: { roleId: string; membros: UsuarioPerfil[]; disponiveis: UsuarioPerfil[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [q, setQ] = useState('')
  const [alvo, setAlvo] = useState<string | null>(null) // userId em ação (spinner)

  const disp = useMemo(() => {
    const t = q.trim().toLowerCase()
    return disponiveis.filter((u) => !t || (u.nome ?? '').toLowerCase().includes(t) || (u.email ?? '').toLowerCase().includes(t))
  }, [disponiveis, q])

  function agir(fn: () => Promise<{ ok: boolean; error?: string }>, userId: string, sucesso: string) {
    setAlvo(userId)
    start(async () => {
      const r = await fn()
      setAlvo(null)
      if (!r.ok) { toast.error(r.error ?? 'Falha.'); return }
      toast.success(sucesso)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Membros do perfil */}
      <div className="rounded-2xl border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Usuários com este perfil</h3>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{membros.length}</span>
        </div>
        <div className="scroll-claro max-h-[55vh] overflow-y-auto p-2">
          {membros.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum usuário neste perfil.</p>
          ) : membros.map((u) => (
            <div key={u.userId} className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-muted/50">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{iniciais(u.nome, u.email)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.nome || '—'}</p>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Mail className="h-3 w-3" /> {u.email ?? 'sem e-mail'}</p>
              </div>
              <button type="button" disabled={pending} onClick={() => agir(() => removerDoPerfil(roleId, u.userId), u.userId, 'Removido do perfil.')}
                className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400">
                {alvo === u.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />} Remover
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Adicionar usuários */}
      <div className="rounded-2xl border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <UserPlus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-sm font-semibold">Adicionar ao perfil</h3>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{disp.length}</span>
        </div>
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar usuário do tenant…"
              className="w-full rounded-lg border bg-transparent py-2 pl-9 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring" />
            {q && <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
          </div>
        </div>
        <div className="scroll-claro max-h-[48vh] overflow-y-auto p-2">
          {disp.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum usuário disponível.</p>
          ) : disp.map((u) => (
            <div key={u.userId} className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-muted/50">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{iniciais(u.nome, u.email)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.nome || '—'}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email ?? 'sem e-mail'}{u.roleAtual ? ` · atual: ${u.roleAtual}` : ''}</p>
              </div>
              <button type="button" disabled={pending} onClick={() => agir(() => atribuirPerfil(roleId, u.userId), u.userId, 'Adicionado ao perfil.')}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 px-2.5 py-1.5 text-xs font-medium text-emerald-600 transition hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400">
                {alvo === u.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Adicionar
              </button>
            </div>
          ))}
        </div>
        <p className="border-t p-2 text-[11px] text-muted-foreground">Cada usuário tem um perfil por vez. Adicionar troca o perfil atual dele; remover volta para <b>estudante</b> (mantém o acesso).</p>
      </div>
    </div>
  )
}
