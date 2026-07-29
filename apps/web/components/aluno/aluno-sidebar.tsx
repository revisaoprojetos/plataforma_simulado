'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ClipboardList, Sparkles, BookOpen, Star, NotebookPen, GraduationCap, Radio, TrendingUp } from 'lucide-react'
import {
  Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { OCULTAR_ALUNO_EXTRAS, ROTAS_ALUNO_OCULTAS } from '@/lib/flags'

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

/** Filtro CSS que força a logo a branco/preto — mesmo tratamento da sidebar do admin. */
function filtroLogo(f?: string): string | undefined {
  if (f === 'branco') return 'brightness(0) invert(1)'
  if (f === 'preto') return 'brightness(0)'
  return undefined
}
/** Moldura do quadro da logo conforme o estilo — igual ao admin. */
function frameLogo(estilo?: string): string {
  if (estilo === 'quadrado') return 'rounded-none'
  if (estilo === 'borda') return 'rounded-lg border'
  return 'rounded-lg'
}

export function AlunoSidebar({ logo, nome = 'Área do Aluno', subtitulo, logoBg = '#ffffff', logoEstilo = 'arredondado', logoFiltro = 'none' }: { logo?: string | null; nome?: string; subtitulo?: string | null; logoBg?: string; logoEstilo?: string; logoFiltro?: string }) {
  const pathname = usePathname()
  const ativo = (n: (typeof NAV)[number]) => (n.exact ? pathname === n.href : pathname.startsWith(n.href))
  const nav = NAV.filter((n) => !(OCULTAR_ALUNO_EXTRAS && ROTAS_ALUNO_OCULTAS.includes(n.href)))

  return (
    <Sidebar className="border-sidebar-border">
      <SidebarHeader className="flex h-14 flex-row items-center border-b border-sidebar-border px-4">
        <Link href="/aluno" className="flex min-w-0 items-center gap-2">
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden', frameLogo(logoEstilo), !logo && 'bg-primary text-primary-foreground')} style={logo ? { background: logoBg } : undefined}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={nome} className="h-full w-full object-contain" style={{ filter: filtroLogo(logoFiltro) }} />
            ) : (
              <GraduationCap className="h-4 w-4" />
            )}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold leading-tight">{nome}</span>
            {subtitulo && <span className="truncate text-[11px] leading-tight text-sidebar-foreground/60">{subtitulo}</span>}
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-3">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {nav.map((n) => (
                <SidebarMenuItem key={n.href}>
                  <SidebarMenuButton className={NAV_STATES} render={<Link href={n.href} />} isActive={ativo(n)}>
                    <n.icon className="h-4 w-4" />
                    <span>{n.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
