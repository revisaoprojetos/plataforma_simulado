'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Home, ClipboardList, Sparkles, BookOpen, Star, NotebookPen, GraduationCap, Radio, TrendingUp, LogOut } from 'lucide-react'
import {
  Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { OCULTAR_ALUNO_EXTRAS, ROTAS_ALUNO_OCULTAS } from '@/lib/flags'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificacaoBellAluno } from '@/components/aluno/notificacao-bell-aluno'
import { AjudaDrawer } from '@/components/aluno/ajuda-drawer'

// Mesmas cores de estado do admin (hover = ativo; ícone segue --sidebar-icon).
const NAV_STATES =
  'hover:text-[color:var(--sidebar-text-active)] data-active:text-[color:var(--sidebar-text-active)] ' +
  '[&>svg]:text-[color:var(--sidebar-icon)] [&:hover>svg]:text-[color:var(--sidebar-icon-active)] [&[data-active]>svg]:text-[color:var(--sidebar-icon-active)]'

const NAV = [
  { href: '/aluno', label: 'Início', icon: Home, exact: true },
  { href: '/aluno/simulado', label: 'Simulados', icon: Radio, exact: true },
  { href: '/aluno/simulados', label: 'Meus Simulados', icon: ClipboardList },
  { href: '/aluno/desempenho', label: 'Meu Desempenho', icon: TrendingUp },
  { href: '/aluno/recomendado', label: 'Recomendado', icon: Sparkles },
  { href: '/aluno/questoes', label: 'Banco de Questões', icon: BookOpen },
  { href: '/aluno/favoritos', label: 'Favoritos', icon: Star },
  { href: '/aluno/cadernos', label: 'Cadernos', icon: NotebookPen },
]

function filtroLogo(f?: string): string | undefined {
  if (f === 'branco') return 'brightness(0) invert(1)'
  if (f === 'preto') return 'brightness(0)'
  return undefined
}
function frameLogo(estilo?: string): string {
  if (estilo === 'quadrado') return 'rounded-none'
  if (estilo === 'borda') return 'rounded-lg border'
  return 'rounded-lg'
}
function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || 'A'
}

export function AlunoSidebar({
  logo, nome = 'Área do Aluno', subtitulo, logoBg = '#ffffff', logoEstilo = 'arredondado', logoFiltro = 'none',
  usuarioNome = 'Aluno', usuarioEmail, counts,
}: {
  logo?: string | null; nome?: string; subtitulo?: string | null; logoBg?: string; logoEstilo?: string; logoFiltro?: string
  usuarioNome?: string; usuarioEmail?: string | null; counts?: Record<string, number>
}) {
  const pathname = usePathname()
  const router = useRouter()
  const ativo = (n: (typeof NAV)[number]) => (n.exact ? pathname === n.href : pathname.startsWith(n.href))
  const nav = NAV.filter((n) => !(OCULTAR_ALUNO_EXTRAS && ROTAS_ALUNO_OCULTAS.includes(n.href)))

  async function sair() {
    toast.success('Saindo… logout realizado.')
    await fetch('/api/aluno/logout', { method: 'POST' }).catch(() => {})
    router.push('/login')
    router.refresh()
  }

  const btnFooter = 'flex-1 rounded-lg border border-sidebar-border bg-[color:var(--sidebar-accent)]/40 px-3 py-1.5 text-center text-xs font-medium text-sidebar-foreground/80 transition-colors hover:bg-[color:var(--sidebar-accent)] hover:text-[color:var(--sidebar-text-active)]'

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="flex h-14 flex-row items-center border-b border-sidebar-border px-4 group-data-[collapsible=icon]:px-2">
        <Link href="/aluno" className="flex min-w-0 items-center gap-2">
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden', frameLogo(logoEstilo), !logo && 'bg-primary text-primary-foreground')} style={logo ? { background: logoBg } : undefined}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={nome} className="h-full w-full object-contain" style={{ filter: filtroLogo(logoFiltro) }} />
            ) : (
              <GraduationCap className="h-4 w-4" />
            )}
          </div>
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold leading-tight">{nome}</span>
            {subtitulo && <span className="truncate text-[11px] leading-tight text-sidebar-foreground/60">{subtitulo}</span>}
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-3 group-data-[collapsible=icon]:px-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {nav.map((n) => {
                const c = counts?.[n.href]
                return (
                  <SidebarMenuItem key={n.href}>
                    <SidebarMenuButton className={NAV_STATES} render={<Link href={n.href} />} isActive={ativo(n)} tooltip={n.label}>
                      <n.icon className="h-4 w-4" />
                      <span>{n.label}</span>
                      {c != null && c > 0 && (
                        <span className="ml-auto text-xs font-medium tabular-nums text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden">{c}</span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* RODAPÉ: perfil + notificações + tema + ajuda + sair (absorveu a antiga topbar). */}
      <SidebarFooter className="gap-2 border-t border-sidebar-border p-3 group-data-[collapsible=icon]:p-2 [&_svg]:text-[color:var(--sidebar-icon)] [&_button:hover_svg]:text-[color:var(--sidebar-icon-active)]">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary ring-1 ring-primary/25">{iniciais(usuarioNome)}</span>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-medium leading-tight">{usuarioNome}</p>
            {usuarioEmail && <p className="truncate text-[11px] leading-tight text-sidebar-foreground/55">{usuarioEmail}</p>}
          </div>
          <div className="group-data-[collapsible=icon]:hidden"><NotificacaoBellAluno /></div>
        </div>

        <div className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col">
          <ThemeToggle />
          <AjudaDrawer renderTrigger={(abrir) => (
            <button type="button" onClick={abrir} className={cn(btnFooter, 'group-data-[collapsible=icon]:hidden')}>Ajuda</button>
          )} />
          <button type="button" onClick={sair} className={cn(btnFooter, 'group-data-[collapsible=icon]:hidden')}>Sair</button>
          {/* colapsada: só o ícone de sair */}
          <button type="button" onClick={sair} title="Sair" aria-label="Sair" className="hidden h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[color:var(--sidebar-accent)] group-data-[collapsible=icon]:flex">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
