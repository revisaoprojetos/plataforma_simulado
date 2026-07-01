'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { GraduationCap, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/theme-toggle'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/aluno', label: 'Início', exact: true },
  { href: '/aluno/questoes', label: 'Questões' },
  { href: '/aluno/recomendado', label: 'Recomendado' },
  { href: '/aluno/favoritos', label: 'Favoritos' },
  { href: '/aluno/cadernos', label: 'Cadernos' },
]

export function AlunoHeader({ nome, plataforma }: { nome: string; plataforma: string }) {
  const router = useRouter()
  const pathname = usePathname()

  async function sair() {
    toast.success('Saindo… logout realizado.')
    await fetch('/api/aluno/logout', { method: 'POST' }).catch(() => {})
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/aluno" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-4 w-4" />
          </div>
          <span className="hidden text-sm font-semibold sm:inline">{plataforma}</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((n) => {
            const ativo = n.exact ? pathname === n.href : pathname.startsWith(n.href)
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'rounded-md px-2.5 py-1.5 transition-colors',
                  ativo ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {n.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground md:inline">Olá, {nome.split(' ')[0]}</span>
          <ThemeToggle />
          <button
            onClick={sair}
            className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </div>
    </header>
  )
}
