'use client'

import { logoutAction } from '@/app/login/actions'
import { ThemeToggle } from '@/components/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { NotificationBell } from '@/components/admin/notification-bell'
import { AjudaButton } from '@/components/admin/ajuda-center'

interface AdminHeaderProps {
  userName: string
  userEmail: string
}

function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export function AdminHeader({ userName, userEmail }: AdminHeaderProps) {
  return (
    <header
      className={
        'sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-sidebar-border px-4 ' +
        // Ícones da topbar seguem a sidebar: normal = --sidebar-icon; no hover/menu-aberto
        // espelham o item ativo da sidebar (fundo = --sidebar-accent, ícone = --sidebar-icon-active).
        '[&_svg]:text-[color:var(--sidebar-icon)] ' +
        '[&_button:hover]:bg-[color:var(--sidebar-accent)] [&_button:hover_svg]:text-[color:var(--sidebar-icon-active)] ' +
        '[&_button[aria-expanded=true]]:bg-[color:var(--sidebar-accent)] [&_button[aria-expanded=true]_svg]:text-[color:var(--sidebar-icon-active)]'
      }
      style={{ background: 'var(--topbar)', color: 'var(--sidebar-icon)' }}
    >
      <SidebarTrigger />
      <div className="flex-1" />
      <AjudaButton />
      <NotificationBell />
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none hover:bg-transparent! aria-expanded:bg-transparent! focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{userName}</p>
              <p className="text-xs leading-none text-muted-foreground">
                {userEmail}
              </p>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => { toast.success('Saindo… logout realizado.'); logoutAction() }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
