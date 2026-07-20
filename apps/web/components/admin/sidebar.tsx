'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Users,
  UsersRound,
  BarChart3,
  Database,
  ShieldCheck,
  ClipboardCheck,
  CreditCard,
  MessageSquare,
  KeyRound,
  GraduationCap,
  SlidersHorizontal,
  Building2,
  Flag,
  PenLine,
  FileText,
  MessagesSquare,
  LogIn,
  FilePen,
  ChevronDown,
  Trash2,
  PieChart,
  Trophy,
  HelpCircle,
  DownloadCloud,
  Webhook,
  Share2,
  Plug,
  Zap,
  Palette,
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
import { OCULTAR_DISCURSIVA } from '@/lib/flags'
import { useCan } from '@/components/auth/can-provider'

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>

interface NavItem {
  label: string
  href: string
  icon: IconType
  exact?: boolean
  perm?: string // permissão necessária para ver o item
}

interface NavGroup {
  label: string
  icon: IconType
  items: NavItem[]
}

// Cores por estado do item da sidebar. O HOVER usa a MESMA cor do ATIVO (assim,
// ao passar o mouse, já aparece a cor de destaque — sem precisar clicar/pressionar).
// Texto no próprio botão; ícone mirando o <svg> filho com especificidade certa.
const NAV_STATES =
  'hover:text-[color:var(--sidebar-text-active)] data-active:text-[color:var(--sidebar-text-active)] ' +
  '[&>svg]:text-[color:var(--sidebar-icon)] [&:hover>svg]:text-[color:var(--sidebar-icon-active)] [&[data-active]>svg]:text-[color:var(--sidebar-icon-active)]'

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
      { label: 'Banco de Simulado', href: '/admin/banco-questoes', icon: Database, perm: 'questoes:view' },
      { label: 'Correção (discursivas)', href: '/admin/correcao', icon: PenLine, perm: 'questoes:view' },
      { label: 'Cadernos de Prova', href: '/admin/cadernos', icon: FileText, perm: 'questoes:view' },
    ],
  },
  {
    label: 'Alunos',
    icon: GraduationCap,
    items: [
      { label: 'Estudantes', href: '/admin/estudantes', icon: Users, perm: 'estudantes:view' },
      { label: 'Grupos', href: '/admin/grupos', icon: UsersRound, perm: 'grupos:view' },
      { label: 'Matrículas', href: '/admin/matriculas', icon: CreditCard, perm: 'matriculas:view' },
    ],
  },
  {
    label: 'Conexões',
    icon: Share2,
    items: [
      { label: 'Integrações', href: '/admin/integracoes', icon: Plug, perm: 'estudantes:create' },
      { label: 'Webhooks & n8n', href: '/admin/conexoes/webhooks', icon: Webhook, perm: 'estudantes:create' },
    ],
  },
  {
    label: 'Análise',
    icon: BarChart3,
    items: [
      { label: 'Relatório Gráfico', href: '/admin/relatorios/graficos', icon: PieChart, perm: 'relatorios:view' },
      { label: 'Relatório Simulado', href: '/admin/relatorios/simulados', icon: ClipboardList, perm: 'relatorios:view' },
      { label: 'Relatório Disciplina', href: '/admin/relatorios/disciplinas', icon: BookOpen, perm: 'relatorios:view' },
      { label: 'Relatório Estudantes', href: '/admin/relatorios/estudantes', icon: GraduationCap, perm: 'relatorios:view' },
      { label: 'Ranking', href: '/admin/relatorios/ranking', icon: Trophy, perm: 'relatorios:view' },
    ],
  },
  {
    label: 'Auditoria',
    icon: ClipboardCheck,
    items: [
      { label: 'Acessos', href: '/admin/auditoria?tipo=acessos', icon: LogIn, perm: 'auditoria:view' },
      { label: 'Modificações', href: '/admin/auditoria?tipo=modificacoes', icon: FilePen, perm: 'auditoria:view' },
      { label: 'Automações', href: '/admin/auditoria?tipo=automacoes', icon: Zap, perm: 'auditoria:view' },
    ],
  },
  {
    label: 'Feedback',
    icon: MessagesSquare,
    items: [
      { label: 'Comentários', href: '/admin/comentarios', icon: MessageSquare, perm: 'questoes:view' },
      { label: 'Reports de Questões', href: '/admin/feedbacks', icon: Flag, perm: 'questoes:view' },
    ],
  },
  {
    label: 'Configuração',
    icon: SlidersHorizontal,
    items: [
      { label: 'Plataformas', href: '/admin/tenants', icon: Building2, perm: 'tenants:manage' },
      { label: 'Permissões (RBAC)', href: '/admin/rbac', icon: ShieldCheck, perm: 'rbac:view' },
      { label: 'API Keys', href: '/admin/api-keys', icon: KeyRound, perm: 'api_keys:manage' },
      { label: 'Aparência', href: '/admin/configuracoes', icon: Palette, exact: true, perm: 'configuracoes:view' },
      { label: 'Mensagens', href: '/admin/configuracoes/mensagens', icon: MessageSquare, perm: 'configuracoes:view' },
      { label: 'Lixeira', href: '/admin/lixeira', icon: Trash2, perm: 'questoes:view' },
      { label: 'Ajuda', href: '/admin/ajuda', icon: HelpCircle },
    ],
  },
]

function itemAtivo(item: NavItem, pathname: string, search: URLSearchParams) {
  const [path, qs] = item.href.split('?')
  if (item.exact) return pathname === path
  if (qs) {
    // Itens que compartilham a mesma rota e diferem só pela query (ex.: Auditoria).
    if (pathname !== path) return false
    const want = new URLSearchParams(qs)
    for (const [k, v] of want) if (search.get(k) !== v) return false
    return true
  }
  return pathname.startsWith(path)
}

function frameLogo(estilo?: string): string {
  if (estilo === 'quadrado') return 'rounded-none'
  if (estilo === 'borda') return 'rounded-lg border'
  return 'rounded-lg'
}

/** Filtro CSS que força a logo a branco/preto (útil em sidebar escura/clara). */
function filtroLogo(f?: string): string | undefined {
  if (f === 'branco') return 'brightness(0) invert(1)'
  if (f === 'preto') return 'brightness(0)'
  return undefined
}

export function AdminSidebar({ logo, nome = 'Plataforma', subtitulo, logoBg = '#ffffff', logoEstilo = 'arredondado', logoFiltro = 'none' }: { logo?: string | null; nome?: string; subtitulo?: string | null; logoBg?: string; logoEstilo?: string; logoFiltro?: string }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const can = useCan()

  // Filtra itens/grupos por permissão do usuário (e oculta a parte discursiva quando a flag está ligada).
  const gruposVisiveis = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm) && !(OCULTAR_DISCURSIVA && i.href === '/admin/correcao')) }))
    .filter((g) => g.items.length > 0)

  const grupoAtivo = (group: NavGroup) => group.items.some((i) => itemAtivo(i, pathname, search))

  // Abre por padrão a seção que contém a rota atual.
  const [abertos, setAbertos] = useState<string[]>(() =>
    gruposVisiveis.filter((g) => g.items.some((i) => itemAtivo(i, pathname, search))).map((g) => g.label),
  )

  function toggle(label: string) {
    setAbertos((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]))
  }

  return (
    <Sidebar className="border-sidebar-border">
      <SidebarHeader className="flex h-14 flex-row items-center border-b border-sidebar-border px-4">
        <Link href="/admin" className="flex min-w-0 items-center gap-2">
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden', frameLogo(logoEstilo), !logo && 'bg-primary text-primary-foreground')}
            style={logo ? { background: logoBg } : undefined}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={nome} className="h-full w-full object-contain" style={{ filter: filtroLogo(logoFiltro) }} />
            ) : (
              <BookOpen className="h-4 w-4" />
            )}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-sm leading-tight">{nome}</span>
            {subtitulo && (
              <span className="truncate text-[11px] leading-tight text-sidebar-foreground/60">{subtitulo}</span>
            )}
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-3">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {/* Dashboard (item solto) */}
              <SidebarMenuItem>
                <SidebarMenuButton className={NAV_STATES} render={<Link href={dashboard.href} />} isActive={itemAtivo(dashboard, pathname, search)}>
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
                      className={NAV_STATES}
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
                      <SidebarMenuSub className="mr-0 pr-0">
                        {group.items.map((item) => (
                          <SidebarMenuSubItem key={item.href}>
                            <SidebarMenuSubButton
                              className={NAV_STATES}
                              render={<Link href={item.href} />}
                              isActive={itemAtivo(item, pathname, search)}
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
