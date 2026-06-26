'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
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
  GraduationCap,
  SlidersHorizontal,
  Building2,
  ChevronDown,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { useCan } from '@/components/auth/can-provider'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
  perm?: string // permissão necessária para ver o item
}

interface NavGroup {
  label: string
  icon: React.ComponentType<{ className?: string }>
  items: NavItem[]
}

// Item solto no topo (sem filhos).
const dashboard: NavItem = { label: 'Dashboard', href: '/admin', icon: LayoutDashboard, exact: true }

// Seções recolhíveis — cada uma abre mostrando todas as suas áreas.
const navGroups: NavGroup[] = [
  {
    label: 'Simulado',
    icon: BookOpen,
    items: [
      { label: 'Aplicação de Simulado', href: '/admin/simulados', icon: ClipboardList, perm: 'simulados:view' },
      { label: 'Questões', href: '/admin/questoes', icon: BookOpen, perm: 'questoes:view' },
      { label: 'Banco de Questões', href: '/admin/banco-questoes', icon: Database, perm: 'questoes:view' },
    ],
  },
  {
    label: 'Alunos',
    icon: GraduationCap,
    items: [
      { label: 'Estudantes', href: '/admin/estudantes', icon: Users, perm: 'estudantes:view' },
      { label: 'Matrículas', href: '/admin/matriculas', icon: CreditCard, perm: 'matriculas:view' },
      { label: 'Grupos', href: '/admin/grupos', icon: UsersRound, perm: 'grupos:view' },
    ],
  },
  {
    label: 'Análise',
    icon: BarChart3,
    items: [
      { label: 'Relatórios', href: '/admin/relatorios', icon: BarChart3, perm: 'relatorios:view' },
      { label: 'Auditoria', href: '/admin/auditoria', icon: ClipboardCheck, perm: 'auditoria:view' },
    ],
  },
  {
    label: 'Configuração',
    icon: SlidersHorizontal,
    items: [
      { label: 'Plataformas', href: '/admin/tenants', icon: Building2, perm: 'tenants:manage' },
      { label: 'Permissões (RBAC)', href: '/admin/rbac', icon: ShieldCheck, perm: 'rbac:view' },
      { label: 'API Keys', href: '/admin/api-keys', icon: KeyRound, perm: 'api_keys:manage' },
      { label: 'Configurações', href: '/admin/configuracoes', icon: Settings, exact: true, perm: 'configuracoes:view' },
      { label: 'Mensagens', href: '/admin/configuracoes/mensagens', icon: MessageSquare, perm: 'configuracoes:view' },
    ],
  },
]

function itemAtivo(item: NavItem, pathname: string) {
  if (item.exact) return pathname === item.href
  return pathname.startsWith(item.href)
}

export function AdminSidebar() {
  const pathname = usePathname()
  const can = useCan()

  // Filtra itens/grupos por permissão do usuário.
  const gruposVisiveis = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm)) }))
    .filter((g) => g.items.length > 0)

  const grupoAtivo = (group: NavGroup) => group.items.some((i) => itemAtivo(i, pathname))

  // Abre por padrão a seção que contém a rota atual.
  const [abertos, setAbertos] = useState<string[]>(() =>
    gruposVisiveis.filter((g) => g.items.some((i) => itemAtivo(i, pathname))).map((g) => g.label),
  )

  function toggle(label: string) {
    setAbertos((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]))
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Dashboard (item solto) */}
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link href={dashboard.href} />} isActive={itemAtivo(dashboard, pathname)}>
                  <dashboard.icon className="h-4 w-4" />
                  <span>{dashboard.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Seções recolhíveis */}
              {gruposVisiveis.map((group) => {
                const aberto = abertos.includes(group.label)
                const ativo = grupoAtivo(group)
                return (
                  <SidebarMenuItem key={group.label}>
                    <SidebarMenuButton
                      onClick={() => toggle(group.label)}
                      isActive={ativo}
                      aria-expanded={aberto}
                    >
                      <group.icon className="h-4 w-4" />
                      <span>{group.label}</span>
                      <ChevronDown
                        className={cn('ml-auto h-4 w-4 transition-transform', aberto && 'rotate-180')}
                      />
                    </SidebarMenuButton>

                    {aberto && (
                      <SidebarMenuSub>
                        {group.items.map((item) => (
                          <SidebarMenuSubItem key={item.href}>
                            <SidebarMenuSubButton
                              render={<Link href={item.href} />}
                              isActive={itemAtivo(item, pathname)}
                            >
                              <item.icon className="h-4 w-4" />
                              <span>{item.label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
