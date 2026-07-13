'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LogOut } from 'lucide-react'

function iniciais(nome: string) {
  return nome.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
}

export function AlunoTopbar({ nome }: { nome: string }) {
  const router = useRouter()
  async function sair() {
    toast.success('Saindo… logout realizado.')
    await fetch('/api/aluno/logout', { method: 'POST' }).catch(() => {})
    router.push('/login')
    router.refresh()
  }

  return (
    <header
      className={
        'sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-sidebar-border px-4 ' +
        '[&_svg]:text-[color:var(--sidebar-icon)] ' +
        '[&_button:hover]:bg-[color:var(--sidebar-accent)] [&_button:hover_svg]:text-[color:var(--sidebar-icon-active)] ' +
        '[&_button[aria-expanded=true]]:bg-[color:var(--sidebar-accent)] [&_button[aria-expanded=true]_svg]:text-[color:var(--sidebar-icon-active)]'
      }
      style={{ background: 'var(--topbar)', color: 'var(--sidebar-icon)' }}
    >
      <SidebarTrigger />
      <div className="flex-1" />
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none hover:bg-transparent! aria-expanded:bg-transparent! focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{iniciais(nome)}</AvatarFallback></Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{nome}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={sair}><LogOut className="mr-2 h-4 w-4" /> Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
