'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Users,
  UsersRound,
  BarChart3,
  Database,
  ClipboardCheck,
  CreditCard,
  MessageSquare,
  KeyRound,
  GraduationCap,
  SlidersHorizontal,
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
  Star,
  HelpCircle,
  Webhook,
  Share2,
  Plug,
  Zap,
  ServerCog,
  UserCog,
  ShieldCheck,
  Megaphone,
  LogOut,
  Building2,
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
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'
import { useCan } from '@/components/auth/can-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationBell } from '@/components/admin/notification-bell'
import { AjudaButton } from '@/components/admin/ajuda-center'
import { logoutAction } from '@/app/login/actions'
import { LoginLoading } from '@/components/aluno/login-loading'
import { LOGIN_DEFAULT, type LoginConfig } from '@/lib/login-config'

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>

interface NavItem {
  label: string
  href: string
  icon: IconType
  exact?: boolean
  perm?: string // permissão necessária para ver o item
  superOnly?: boolean // só aparece para super-admin GLOBAL (não por-tenant)
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

// Cores dos "pontos" dos itens no flyout em leque (giram por posição).
const FAN_CORES = ['#7c3aed', '#f59e0b', '#10b981', '#f97316', '#0ea5e9', '#e11d48', '#db2777']

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
      { label: 'Integrações', href: '/admin/integracoes', icon: Plug, perm: 'integracoes:view' },
      { label: 'Webhooks & n8n', href: '/admin/conexoes/webhooks', icon: Webhook, perm: 'integracoes:view' },
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
      { label: 'NPS / Satisfação', href: '/admin/relatorios/nps', icon: Star, perm: 'relatorios:view' },
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
      // Plataformas / Entrada / Compartilhar migraram para o CONSOLE isolado do super-admin
      // (/super) — gestão cross-tenant fica fora de qualquer plataforma.
      { label: 'Administradores', href: '/admin/administradores', icon: UserCog, perm: 'rbac:view' },
      { label: 'API Keys', href: '/admin/api-keys', icon: KeyRound, perm: 'api_keys:manage' },
      // Aparência (identidade/cores/tema) MIGRADA para o Console (super-admin) → Plataformas → Aparência.
      { label: 'Sistema', href: '/admin/sistema', icon: ServerCog, perm: 'configuracoes:view' },
      { label: 'Mensagens', href: '/admin/configuracoes/mensagens', icon: MessageSquare, perm: 'configuracoes:view' },
      { label: 'Banners & Pop-ups', href: '/admin/configuracoes/banners', icon: Megaphone, perm: 'configuracoes:view' },
      { label: 'LGPD', href: '/admin/lgpd', icon: ShieldCheck, perm: 'estudantes:view' },
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

export function AdminSidebar({ logo, nome = 'Plataforma', subtitulo, logoBg = '#ffffff', logoEstilo = 'arredondado', logoFiltro = 'none', isSuperAdmin = false, userName = 'Administrador', userEmail, loginConfig, counts }: { logo?: string | null; nome?: string; subtitulo?: string | null; logoBg?: string; logoEstilo?: string; logoFiltro?: string; isSuperAdmin?: boolean; userName?: string; userEmail?: string | null; loginConfig?: LoginConfig; counts?: Record<string, number> }) {
  const pathname = usePathname()
  const [saindo, setSaindo] = useState(false)
  const search = useSearchParams()
  const can = useCan()
  const { state, isMobile } = useSidebar()
  // Recolhida (rail de ícones, fora do mobile): grupos com sub-itens abrem em flyout ao lado.
  const recolhida = state === 'collapsed' && !isMobile
  const iniciais = userName.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || 'A'
  const btnFooter = 'flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-xs font-medium text-sidebar-foreground/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-[color:var(--sidebar-text-active)]'

  // Filtra itens/grupos por permissão do usuário (super-admin gate + flag discursiva).
  const gruposVisiveis = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm) && !(i.superOnly && !isSuperAdmin) && !(OCULTAR_DISCURSIVA && i.href === '/admin/correcao')) }))
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
    <>
    {saindo && (
      <div className="fixed inset-0 z-[200]">
        <LoginLoading config={loginConfig ?? LOGIN_DEFAULT} plataforma={nome} logo={logo} logoBg={logoBg} logoEstilo={logoEstilo} logoFiltro={logoFiltro} />
      </div>
    )}
    <Sidebar collapsible="icon" className="group-data-[side=left]:border-r-0">
      <SidebarHeader className="flex h-14 flex-row items-center border-b border-sidebar-border px-4 group-data-[collapsible=icon]:px-2">
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
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold text-sm leading-tight">{nome}</span>
            {subtitulo && (
              <span className="truncate text-[11px] leading-tight text-sidebar-foreground/60">{subtitulo}</span>
            )}
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-3 group-data-[collapsible=icon]:px-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {/* Dashboard (item solto) */}
              <SidebarMenuItem>
                <SidebarMenuButton className={NAV_STATES} render={<Link href={dashboard.href} />} isActive={itemAtivo(dashboard, pathname, search)} tooltip={dashboard.label}>
                  <dashboard.icon className="h-4 w-4" />
                  <span>{dashboard.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Seções recolhíveis */}
              {gruposVisiveis.map((group) => {
                const aberto = abertos.includes(group.label)
                const ativo = grupoAtivo(group)

                // Recolhida: clicar no ícone do grupo abre um flyout AO LADO (DropdownMenu, com
                // animação de abrir/fechar); clicar num sub-item navega para a área e fecha o flyout.
                if (recolhida) {
                  return (
                    <SidebarMenuItem key={group.label}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={group.label}
                          title={group.label}
                          data-active={ativo ? 'true' : undefined}
                          className={cn(
                            'mx-auto flex h-8 w-8 items-center justify-center rounded-md outline-none transition-colors',
                            NAV_STATES,
                            // Hover PRECISA de fundo: NAV_STATES pinta o ícone com a cor "ativa"
                            // no hover; sem fundo, ela fica igual ao sidebar escuro e o ícone some.
                            'hover:bg-[color:var(--sidebar-accent)]',
                            // Aberto: ícone fica SELECIONADO (bg + cor ativa) — "ligado" ao flyout.
                            'data-[popup-open]:bg-[color:var(--sidebar-accent)] data-[popup-open]:text-[color:var(--sidebar-text-active)] [&[data-popup-open]>svg]:text-[color:var(--sidebar-icon-active)]',
                            ativo && 'bg-[color:var(--sidebar-accent)]',
                          )}
                        >
                          <group.icon className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        {/* Flyout em LEQUE que ENVOLVE o ícone: align=center põe o leque na altura
                            do ícone; o recuo em ARCO (meio mais à direita, pontas recuadas para junto
                            do ícone) faz os comprimidos abraçarem o ícone. Fundo dourado = cor do ícone. */}
                        <DropdownMenuContent
                          side="right" align="center" sideOffset={6}
                          className="w-auto min-w-0 overflow-visible border-0 bg-transparent p-0 shadow-none ring-0"
                        >
                          <div className="flex flex-col gap-2 py-1 pl-1 pr-8">
                            {group.items.map((item, i) => {
                              const cor = FAN_CORES[i % FAN_CORES.length]
                              const nSub = group.items.length
                              const mid = (nSub - 1) / 2
                              // Arco: meio = recuo máximo (mais à direita), pontas = 0 (juntas ao ícone).
                              const recuo = Math.round(46 * (1 - Math.abs(i - mid) / (mid || 1)))
                              const itemOn = itemAtivo(item, pathname, search)
                              const cnt = counts?.[item.href]
                              return (
                                <DropdownMenuItem
                                  key={item.href}
                                  render={<Link href={item.href} />}
                                  style={{ marginLeft: recuo, animationDelay: `${i * 45}ms`, animationFillMode: 'both' }}
                                  className={cn(
                                    'w-56 cursor-pointer gap-2.5 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-md ring-1 ring-black/10',
                                    'animate-in fade-in slide-in-from-left-3',
                                    'transition-shadow hover:shadow-lg focus:shadow-lg',
                                    itemOn && 'ring-2 ring-primary/50',
                                  )}
                                >
                                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
                                  <span className="truncate">{item.label}</span>
                                  {cnt != null && <span className="ml-auto shrink-0 pl-2 text-xs font-semibold tabular-nums text-neutral-400">{cnt.toLocaleString('pt-BR')}</span>}
                                </DropdownMenuItem>
                              )
                            })}
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  )
                }

                return (
                  <SidebarMenuItem key={group.label}>
                    <SidebarMenuButton
                      className={NAV_STATES}
                      onClick={() => toggle(group.label)}
                      isActive={ativo}
                      aria-expanded={aberto}
                      tooltip={group.label}
                    >
                      <group.icon className="h-4 w-4" />
                      <span>{group.label}</span>
                      <ChevronDown
                        className={cn('ml-auto h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden', aberto && 'rotate-180')}
                      />
                    </SidebarMenuButton>

                    {/* Acordeão animado: grid-rows 0fr↔1fr anima a altura (sem medir); a sub fica
                        sempre montada para o recolher também animar. Fade acompanha. */}
                    <div className={cn('grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]', aberto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')} aria-hidden={!aberto}>
                      <div className={cn('overflow-hidden transition-opacity duration-200', aberto ? 'opacity-100' : 'opacity-0')}>
                        <SidebarMenuSub className="mr-0 pr-0">
                          {group.items.map((item) => (
                            <SidebarMenuSubItem key={item.href}>
                              <SidebarMenuSubButton
                                className={NAV_STATES}
                                render={<Link href={item.href} />}
                                isActive={itemAtivo(item, pathname, search)}
                                tabIndex={aberto ? undefined : -1}
                              >
                                <item.icon className="h-4 w-4" />
                                <span>{item.label}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </div>
                    </div>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* RODAPÉ: perfil + notificações + ajuda + tema + trocar/sair (absorveu a antiga topbar). */}
      <SidebarFooter className="gap-2 border-t border-sidebar-border p-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-2 [&_svg]:text-[color:var(--sidebar-icon)] [&_button:hover_svg]:text-[color:var(--sidebar-icon-active)]">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-primary shadow-sm ring-1 ring-black/10">{iniciais}</span>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-medium leading-tight">{userName}</p>
            {userEmail && <p className="truncate text-[11px] leading-tight text-sidebar-foreground/55">{userEmail}</p>}
          </div>
          <span className="group-data-[collapsible=icon]:hidden"><NotificationBell /></span>
        </div>

        <div className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1.5">
          <ThemeToggle />
          <AjudaButton />
          <button type="button" onClick={() => { window.location.href = '/login' }} title="Trocar de plataforma" aria-label="Trocar de plataforma"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[color:var(--sidebar-accent)]">
            <Building2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { setSaindo(true); setTimeout(() => { void logoutAction() }, 1100) }} title="Sair" aria-label="Sair"
            className={cn(btnFooter, 'flex items-center justify-center gap-1.5 group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:px-0')}>
            <LogOut className="h-3.5 w-3.5" /> <span className="group-data-[collapsible=icon]:hidden">Sair</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
    </>
  )
}
