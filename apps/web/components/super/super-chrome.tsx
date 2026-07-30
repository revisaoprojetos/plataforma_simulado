'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Building2, LogIn, Share2, ServerCog, LogOut, ArrowLeft, ShieldCheck, Menu, X, Loader2 } from 'lucide-react'

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean; desc: string }

const NAV: Item[] = [
  { href: '/super', label: 'Início', icon: LayoutDashboard, exact: true, desc: 'Visão geral do console' },
  { href: '/super/plataformas', label: 'Plataformas', icon: Building2, desc: 'Criar e gerenciar tenants' },
  { href: '/super/entrada', label: 'Entrada', icon: LogIn, desc: 'Tela de login neutra' },
  { href: '/super/compartilhar', label: 'Compartilhar', icon: Share2, desc: 'Copiar dados entre plataformas' },
  { href: '/super/sistema', label: 'Sistema', icon: ServerCog, desc: 'Saúde e prontidão' },
]

function ativo(item: Item, pathname: string): boolean {
  if (item.exact) return pathname === item.href
  return pathname.startsWith(item.href)
}

/** Console do super-admin: chrome NEUTRO e independente de qualquer tenant (sidebar grafite
 *  fixa + topbar), para não parecer embedado em nenhuma plataforma. */
export function SuperChrome({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [saindo, setSaindo] = useState(false)

  async function sair() {
    setSaindo(true)
    try { await createClient().auth.signOut() } catch { /* ignora */ }
    router.push('/login')
  }

  const Nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map((it) => {
        const on = ativo(it, pathname)
        return (
          <Link key={it.href} href={it.href} onClick={() => setAberto(false)}
            className={cn('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              on ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')}>
            <it.icon className={cn('h-4 w-4 shrink-0 transition-colors', on ? 'text-white' : 'text-slate-500 group-hover:text-slate-200')} />
            <span className="truncate">{it.label}</span>
          </Link>
        )
      })}
    </nav>
  )

  const Aside = (
    <div className="flex h-full w-64 shrink-0 flex-col bg-slate-900 text-slate-100">
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><ShieldCheck className="h-5 w-5 text-white" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-white">Console</p>
          <p className="truncate text-[11px] leading-tight text-slate-400">Super-admin global</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">{Nav}</div>
      <div className="border-t border-white/10 p-3">
        <Link href="/login" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100">
          <ArrowLeft className="h-4 w-4" /> Seletor de plataforma
        </Link>
        <button onClick={sair} disabled={saindo}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-rose-300 disabled:opacity-60">
          {saindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Sair
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Sidebar fixa (desktop) */}
      <div className="hidden md:flex">{Aside}</div>

      {/* Drawer (mobile) */}
      {aberto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAberto(false)} />
          <div className="absolute inset-y-0 left-0">{Aside}</div>
          <button onClick={() => setAberto(false)} aria-label="Fechar" className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white"><X className="h-5 w-5" /></button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-card px-4 md:px-6">
          <div className="flex items-center gap-2">
            <button onClick={() => setAberto(true)} aria-label="Menu" className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden"><Menu className="h-5 w-5" /></button>
            <span className="text-sm font-semibold">Administração do sistema</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">{userEmail}</span>
            <button onClick={sair} disabled={saindo} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-60">
              {saindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />} Sair
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
