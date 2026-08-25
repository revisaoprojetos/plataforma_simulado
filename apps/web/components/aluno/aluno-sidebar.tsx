'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LoginLoading } from '@/components/aluno/login-loading'
import { type LoginConfig } from '@/lib/login-config'
import { Home, ClipboardList, Sparkles, BookOpen, Star, NotebookPen, GraduationCap, LogOut, Trophy, Flame, Zap, Route, Library, CalendarDays, ChevronRight } from 'lucide-react'
import {
  Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem,
  SidebarMenuSubButton, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { OCULTAR_ALUNO_EXTRAS, OCULTAR_CRONOGRAMA, ROTAS_ALUNO_OCULTAS, LEITURA_ATIVA } from '@/lib/flags'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificacaoBellAluno } from '@/components/aluno/notificacao-bell-aluno'
import { AjudaDrawer } from '@/components/aluno/ajuda-drawer'

// Mesmas cores de estado do admin (hover = ativo; ícone segue --sidebar-icon).
const NAV_STATES =
  'hover:text-[color:var(--sidebar-text-active)] data-active:text-[color:var(--sidebar-text-active)] ' +
  '[&>svg]:text-[color:var(--sidebar-icon)] [&:hover>svg]:text-[color:var(--sidebar-icon-active)] [&[data-active]>svg]:text-[color:var(--sidebar-icon-active)] ' +
  // Badge de contagem: acompanha a cor do texto quando ativo/hover (some no estado normal, visível quando selecionado).
  '[&:hover_.nav-badge]:text-[color:var(--sidebar-text-active)] [&[data-active]_.nav-badge]:text-[color:var(--sidebar-text-active)]'

type ItemNav = {
  href: string
  label: string
  icon: typeof Home
  exact?: boolean
  tour?: string
  filhos?: { href: string; label: string; exact?: boolean }[]
}

const NAV: ItemNav[] = [
  { href: '/aluno', label: 'Início', icon: Home, exact: true, tour: 'nav-inicio' },
  { href: '/aluno/simulados', label: 'Meus Simulados', icon: ClipboardList, tour: 'nav-simulados' },
  { href: '/aluno/trilha', label: 'Trilha', icon: Route, tour: 'nav-trilha' },
  { href: '/aluno/recomendado', label: 'Recomendado', icon: Sparkles, tour: 'nav-recomendado' },
  { href: '/aluno/ligas', label: 'Ligas', icon: Trophy, tour: 'nav-liga' },
  { href: '/aluno/questoes', label: 'Banco de Questões', icon: BookOpen, tour: 'nav-questoes' },
  { href: '/aluno/leitura', label: 'Leitura', icon: Library, tour: 'nav-leitura' },
  { href: '/aluno/favoritos', label: 'Favoritos', icon: Star, tour: 'nav-favoritos' },
  { href: '/aluno/cadernos', label: 'Cadernos', icon: NotebookPen, tour: 'nav-cadernos' },
  {
    href: '/aluno/cronograma',
    label: 'Cronograma',
    icon: CalendarDays,
    tour: 'nav-cronograma',
    // Gerar um plano novo e voltar a um que já existe são tarefas diferentes; o item vira
    // grupo para as duas terem entrada própria, em vez de uma esconder a outra.
    filhos: [
      { href: '/aluno/cronograma', label: 'Gerar cronograma', exact: true },
      { href: '/aluno/cronograma/meus', label: 'Meus cronogramas' },
    ],
  },
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

export interface ProgressoAluno { streak: number; xpTotal: number; nivel: number; liga: string; ligaCor: string }

export function AlunoSidebar({
  logo, nome = 'Área do Aluno', subtitulo, logoBg = '#ffffff', logoEstilo = 'arredondado', logoFiltro = 'none',
  usuarioNome = 'Aluno', usuarioEmail, avatar, avatarCor, counts, simuladosPersonalizados = 0, loginConfig, progresso, gamAtivo = false,
}: {
  logo?: string | null; nome?: string; subtitulo?: string | null; logoBg?: string; logoEstilo?: string; logoFiltro?: string
  usuarioNome?: string; usuarioEmail?: string | null; avatar?: string | null; avatarCor?: string | null; counts?: Record<string, number>; simuladosPersonalizados?: number; loginConfig: LoginConfig; progresso?: ProgressoAluno | null; gamAtivo?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { setOpenMobile } = useSidebar()
  const [saindo, setSaindo] = useState(false)
  // Ao navegar (ex.: tocar num item pelo "Mais" no mobile), fecha o menu lateral (Sheet).
  useEffect(() => { setOpenMobile(false) }, [pathname, setOpenMobile])
  const ativo = (n: { href: string; exact?: boolean }) => (n.exact ? pathname === n.href : pathname.startsWith(n.href))
  // O grupo abre sozinho quando se está dentro dele — e continua aberto se o aluno abrir na mão.
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const expandido = (n: ItemNav) => abertos[n.href] ?? ativo(n)
  // Trilha e Ligas (gamificação) só aparecem quando ativa; + oculta os extras configurados.
  const nav = NAV.filter((n) =>
    (gamAtivo || (n.href !== '/aluno/trilha' && n.href !== '/aluno/ligas')) &&
    (LEITURA_ATIVA || n.href !== '/aluno/leitura') &&
    !(OCULTAR_ALUNO_EXTRAS && ROTAS_ALUNO_OCULTAS.includes(n.href)) &&
    // Cronograma tem DOIS gates: esta flag (enquanto o módulo está em construção) e a coluna
    // `ativo` de simulado_cronograma_config, que liga por tenant — respeitada dentro da página.
    !(OCULTAR_CRONOGRAMA && n.href === '/aluno/cronograma'),
  )

  async function sair() {
    // Mostra a tela de carregamento (branded) na SAÍDA — dá tempo do login (imagem + animações)
    // entrar já pronto, sem "pular" as animações.
    setSaindo(true)
    await fetch('/api/aluno/logout', { method: 'POST' }).catch(() => {})
    setTimeout(() => { router.push('/aluno/entrar'); router.refresh() }, 1100)
  }

  const btnFooter = 'flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-xs font-medium text-sidebar-foreground/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-[color:var(--sidebar-text-active)]'

  return (
    <>
    {saindo && (
      <div className="fixed inset-0 z-[200]">
        <LoginLoading config={loginConfig} plataforma={nome} logo={logo} logoBg={logoBg} logoEstilo={logoEstilo} logoFiltro={logoFiltro} />
      </div>
    )}
    <Sidebar collapsible="icon" className="group-data-[side=left]:border-r-0">
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
                if (n.filhos) {
                  const aberto = expandido(n)
                  return (
                    <SidebarMenuItem key={n.href} data-tour={n.tour}>
                      {/* Botão, não link: abrir o grupo não deve navegar — o primeiro filho já é
                          a tela principal, e navegar ao expandir tira o aluno do lugar sem querer. */}
                      <SidebarMenuButton
                        className={NAV_STATES}
                        onClick={() => setAbertos((a) => ({ ...a, [n.href]: !aberto }))}
                        isActive={ativo(n)}
                        tooltip={n.label}
                      >
                        <n.icon className="h-4 w-4" />
                        <span>{n.label}</span>
                        <ChevronRight
                          className={`ml-auto h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden ${aberto ? 'rotate-90' : ''}`}
                        />
                      </SidebarMenuButton>
                      {aberto && (
                        <SidebarMenuSub>
                          {n.filhos.map((f) => (
                            <SidebarMenuSubItem key={f.href}>
                              <SidebarMenuSubButton render={<Link href={f.href} />} isActive={ativo(f)}>
                                <span>{f.label}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  )
                }
                return (
                  <SidebarMenuItem key={n.href} data-tour={n.tour}>
                    <SidebarMenuButton className={NAV_STATES} render={<Link href={n.href} />} isActive={ativo(n)} tooltip={n.label}>
                      <n.icon className="h-4 w-4" />
                      <span>{n.label}</span>
                      {/* Meus Simulados: "oficiais finalizados | personalizados criados" quando há pessoais. */}
                      {n.href === '/aluno/simulados' && simuladosPersonalizados > 0 ? (
                        <span className="nav-badge ml-auto pr-1.5 text-xs font-medium tabular-nums text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden">
                          {c ?? 0} <span className="opacity-40">|</span> {simuladosPersonalizados}
                        </span>
                      ) : c != null && c > 0 ? (
                        <span className="nav-badge ml-auto pr-1.5 text-xs font-medium tabular-nums text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden">{c}</span>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* RODAPÉ: perfil + notificações + tema + ajuda + sair (absorveu a antiga topbar).
          Colapsado → coluna centrada de ícones; o texto some com fade+colapso suave. */}
      <SidebarFooter className="gap-2 border-t border-sidebar-border p-3 transition-[padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-2 [&_svg]:text-[color:var(--sidebar-icon)] [&_button:hover_svg]:text-[color:var(--sidebar-icon-active)]">
        {/* SEU PROGRESSO (gamificação) — some quando a sidebar está recolhida. */}
        {progresso && (
          <Link href="/aluno/ligas" className="mb-1 block rounded-xl border border-white/10 bg-white/5 p-2.5 transition-colors hover:bg-white/10 group-data-[collapsible=icon]:hidden">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/50">Seu progresso</div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1" title="Sequência"><Flame className="h-3.5 w-3.5 text-orange-400" /> <span className="font-semibold tabular-nums">{progresso.streak}</span></span>
              <span className="inline-flex items-center gap-1" title="XP total"><Zap className="h-3.5 w-3.5 text-amber-300" /> <span className="font-semibold tabular-nums">{progresso.xpTotal.toLocaleString('pt-BR')}</span></span>
              <span className="inline-flex items-center gap-1" title={`Liga ${progresso.liga}`}><Trophy className="h-3.5 w-3.5" style={{ color: progresso.ligaCor }} /> <span className="font-semibold">{progresso.liga}</span></span>
            </div>
          </Link>
        )}
        <div className="flex w-full items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
          {/* Card do perfil (avatar + nome + email) — todo clicável, no estilo dos botões Ajuda/Sair. */}
          <Link data-tour="perfil" href="/aluno/perfil" title="Meu perfil" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 pr-2.5 transition-colors hover:bg-white/10 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-primary shadow-sm ring-1 ring-black/10" style={{ background: avatarCor ?? '#ffffff' }}>
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-full w-full object-contain object-[center_82%]" />
              ) : iniciais(usuarioNome)}
            </span>
            {/* nome/email: colapsam largura + opacidade (não somem de golpe) */}
            <div className="min-w-0 flex-1 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:opacity-0">
              <p className="truncate text-sm font-medium leading-tight">{usuarioNome}</p>
              {usuarioEmail && <p className="truncate text-[11px] leading-tight text-sidebar-foreground/55">{usuarioEmail}</p>}
            </div>
          </Link>
          {/* sem overflow-hidden: o badge do sino (-top/-right) precisa aparecer inteiro. Ao recolher,
              some por completo (não só w-0) p/ NÃO desalinhar o avatar — há um sino próprio na versão fechada. */}
          <div className="shrink-0 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[collapsible=icon]:hidden"><NotificacaoBellAluno /></div>
        </div>

        <div className="flex w-full items-center gap-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
          {/* tema — normalizado para 36px (mesmo tamanho do avatar/sino/sair) */}
          <span className="flex h-9 w-9 items-center justify-center"><ThemeToggle /></span>
          {/* Ajuda/Sair (rótulo): some por completo na colapsada (sem gap fantasma) */}
          <div className="flex min-w-0 flex-1 items-center gap-2 group-data-[collapsible=icon]:hidden">
            <AjudaDrawer gamAtivo={gamAtivo} renderTrigger={(abrir) => (
              <button type="button" data-tour="ajuda" onClick={abrir} className={btnFooter}>Ajuda</button>
            )} />
            <button type="button" onClick={sair} className={btnFooter}>Sair</button>
          </div>
          {/* colapsada: sino de notificações (abaixo do tema) */}
          <div className="hidden group-data-[collapsible=icon]:block"><NotificacaoBellAluno /></div>
          {/* colapsada: ícone de sair */}
          <button type="button" onClick={sair} title="Sair" aria-label="Sair" className="hidden h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[color:var(--sidebar-accent)] group-data-[collapsible=icon]:flex">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
    </>
  )
}
