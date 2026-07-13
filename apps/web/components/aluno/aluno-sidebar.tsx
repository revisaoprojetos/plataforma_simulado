'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ClipboardList, Sparkles, BookOpen, Star, NotebookPen, GraduationCap, Radio } from 'lucide-react'
import {
  Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

// Mesmas cores de estado do admin (hover = ativo; ícone segue --sidebar-icon).
const NAV_STATES =
  'hover:text-[color:var(--sidebar-text-active)] data-active:text-[color:var(--sidebar-text-active)] ' +
  '[&>svg]:text-[color:var(--sidebar-icon)] [&:hover>svg]:text-[color:var(--sidebar-icon-active)] [&[data-active]>svg]:text-[color:var(--sidebar-icon-active)]'

const NAV = [
  { href: '/aluno', label: 'Início', icon: Home, exact: true },
  { href: '/aluno/simulado', label: 'Simulados', icon: Radio, exact: true },
  { href: '/aluno/simulados', label: 'Meus Simulados', icon: ClipboardList },
  { href: '/aluno/recomendado', label: 'Recomendado', icon: Sparkles },
  { href: '/aluno/questoes', label: 'Banco de Questões', icon: BookOpen },
  { href: '/aluno/favoritos', label: 'Favoritos', icon: Star },
  { href: '/aluno/cadernos', label: 'Cadernos', icon: NotebookPen },
]

export function AlunoSidebar({ logo, nome = 'Área do Aluno', subtitulo, logoBg = '#ffffff' }: { logo?: string | null; nome?: string; subtitulo?: string | null; logoBg?: string }) {
  const pathname = usePathname()
  const ativo = (n: (typeof NAV)[number]) => (n.exact ? pathname === n.href : pathname.startsWith(n.href))

  return (
    <Sidebar className="border-sidebar-border">
      <SidebarHeader className="flex h-14 flex-row items-center border-b border-sidebar-border px-4">
        <Link href="/aluno" className="flex min-w-0 items-center gap-2">
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg', !logo && 'bg-primary text-primary-foreground')} style={logo ? { background: logoBg } : undefined}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={nome} className="h-full w-full object-contain" />
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
              {NAV.map((n) => (
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
