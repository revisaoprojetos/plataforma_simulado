'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  BookOpen,
  ClipboardList,
  Users,
  UsersRound,
  BarChart3,
  Database,
  Settings,
  ShieldCheck,
  ClipboardCheck,
  CreditCard,
  MessageSquare,
  KeyRound,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from '@/components/ui/sidebar'

const navGroups = [
  {
    label: 'Principal',
    items: [
      { label: 'Dashboard', href: '/admin', icon: Home, exact: true },
    ],
  },
  {
    label: 'Conteúdo',
    items: [
      { label: 'Questões', href: '/admin/questoes', icon: BookOpen },
      { label: 'Simulados', href: '/admin/simulados', icon: ClipboardList },
      { label: 'Banco de Questões', href: '/admin/banco-questoes', icon: Database },
    ],
  },
  {
    label: 'Alunos',
    items: [
      { label: 'Estudantes', href: '/admin/estudantes', icon: Users },
      { label: 'Matrículas', href: '/admin/matriculas', icon: CreditCard },
      { label: 'Grupos', href: '/admin/grupos', icon: UsersRound },
    ],
  },
  {
    label: 'Análise',
    items: [
      { label: 'Relatórios', href: '/admin/relatorios', icon: BarChart3 },
      { label: 'Auditoria', href: '/admin/auditoria', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Configuração',
    items: [
      { label: 'Permissões (RBAC)', href: '/admin/rbac', icon: ShieldCheck },
      { label: 'API Keys', href: '/admin/api-keys', icon: KeyRound },
      { label: 'Configurações', href: '/admin/configuracoes', icon: Settings, exact: true },
      { label: 'Mensagens', href: '/admin/configuracoes/mensagens', icon: MessageSquare },
    ],
  },
]

export function AdminSidebar() {
  const pathname = usePathname()

  function isActive(item: { href: string; exact?: boolean }) {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-4">
        <Link href="/admin" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="h-4 w-4" />
          </div>
          <span className="font-semibold text-sm">Plataforma</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive(item)}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
