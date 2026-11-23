'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { BookOpen, LogOut, Building2, ChevronDown } from 'lucide-react'
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
import { APP_VERSION } from '@/lib/version'
import { useCan } from '@/components/auth/can-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { FontScaleControl } from '@/components/font-scale-control'
import { NotificationBell } from '@/components/admin/notification-bell'
import { AjudaButton } from '@/components/admin/ajuda-center'
import { logoutAction } from '@/app/login/actions'
import { confirmarDescartarAlteracoes } from '@/components/admin/use-unsaved-guard'
import { LoginLoading } from '@/components/aluno/login-loading'
import { LOGIN_DEFAULT, type LoginConfig } from '@/lib/login-config'
import { rotuloDe, IconeMenu, RotuloMenu, type SidebarRotulosAdmin, type RotuloOverride } from '@/lib/sidebar-rotulos'
import { SETORES, resolverRota, setoresVisiveis, hrefInicialAba, iconeDaAba, chaveRotuloAba, type Setor } from '@/lib/admin/setores'

// Cores por estado do item da sidebar. O HOVER usa a MESMA cor do ATIVO (assim,
// ao passar o mouse, já aparece a cor de destaque — sem precisar clicar/pressionar).
// Texto no próprio botão; ícone mirando o <svg> filho com especificidade certa.
const NAV_STATES =
  'hover:text-[color:var(--sidebar-text-active)] data-active:text-[color:var(--sidebar-text-active)] ' +
  '[&>svg]:text-[color:var(--sidebar-icon)] [&:hover>svg]:text-[color:var(--sidebar-icon-active)] [&[data-active]>svg]:text-[color:var(--sidebar-icon-active)]'

// Cores dos "pontos" dos itens no flyout em leque (giram por posição).
const FAN_CORES = ['#7c3aed', '#f59e0b', '#10b981', '#f97316', '#0ea5e9', '#e11d48', '#db2777']

// A navegação (setores › abas › itens) mora em lib/admin/setores.ts — FONTE ÚNICA, compartilhada com a
// barra de abas internas (components/admin/barra-setor.tsx) e o editor de rótulos. Aqui: setor (acordeão) › 1 linha por ABA/cluster.

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

export function AdminSidebar({ logo, nome = 'Plataforma', subtitulo, logoBg = '#ffffff', logoEstilo = 'arredondado', logoFiltro = 'none', isSuperAdmin = false, podeTrocarPlataforma = true, userName = 'Administrador', userEmail, loginConfig, counts, areasBloqueadas = [], rotulos }: { logo?: string | null; nome?: string; subtitulo?: string | null; logoBg?: string; logoEstilo?: string; logoFiltro?: string; isSuperAdmin?: boolean; podeTrocarPlataforma?: boolean; userName?: string; userEmail?: string | null; loginConfig?: LoginConfig; counts?: Record<string, number>; areasBloqueadas?: string[]; rotulos?: SidebarRotulosAdmin }) {
  // Rótulos/ícones por tenant. SETOR: chave = label do setor, aproveitando overrides antigos de GRUPO com o mesmo
  // nome (Alunos, Análise, Engajamento, Atendimento, Pedagógico) e o override antigo do item "Dashboard" (/admin)
  // p/ o setor Início. ITENS: chave = href (inalterada).
  const mapaSetores: Record<string, RotuloOverride> = { ...(rotulos?.itens?.['/admin'] ? { 'Início': rotulos.itens['/admin'] } : {}), ...(rotulos?.grupos ?? {}) }
  const lblSetor = (s: Setor) => rotuloDe(mapaSetores, s.label, s.label)
  const pathname = usePathname()
  const [saindo, setSaindo] = useState(false)
  const search = useSearchParams()
  const can = useCan()
  const { state, isMobile } = useSidebar()
  // Recolhida (rail de ícones, fora do mobile): setores abrem em flyout ao lado, listando as ABAS.
  const recolhida = state === 'collapsed' && !isMobile
  const iniciais = userName.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || 'A'
  // Hover do "Sair" usa a cor da MARCA (--primary), não --sidebar-text-active (que em sidebar clara
  // pode ser branco e sumir). O !important vence a regra de hover-svg do rodapé (que pinta o ícone).
  const btnFooter = 'flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-xs font-medium text-sidebar-foreground/70 transition-colors hover:border-[color:var(--primary)] hover:bg-[color:var(--primary)] hover:text-white [&:hover_svg]:!text-white'

  // Setores visíveis: permissão (can), flags `oculto`, super-admin (superOnly) e áreas em manutenção por tenant.
  // `areasBloqueadas` já inclui /admin/correcao quando a discursiva está oculta (env ou manutenção).
  const setores = setoresVisiveis({ can, isSuperAdmin, areasBloqueadas }, SETORES)
  // Setor aceso = o do item mais específico da rota atual (mesma regra de "href mais longo" de antes).
  const rota = resolverRota(pathname, search)
  const setorAtivoId = rota?.setor.id
  // Acordeão: abre por padrão o setor da rota atual; clicar no setor abre/recolhe a lista de áreas dele.
  const [abertos, setAbertos] = useState<string[]>(() => (setorAtivoId ? [setorAtivoId] : []))
  const alternar = (id: string) => setAbertos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

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
          <div data-preview-logobox className={cn('flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden', frameLogo(logoEstilo), !logo && 'bg-primary text-primary-foreground')}
            style={logo ? { background: logoBg } : undefined}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={nome} className="h-full w-full object-contain" style={{ filter: filtroLogo(logoFiltro) }} />
            ) : (
              <BookOpen className="h-4 w-4" />
            )}
          </div>
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span data-preview-nome className="truncate font-semibold text-sm leading-tight">{nome}</span>
            <span data-preview-subtitulo className={cn('truncate text-[11px] leading-tight text-sidebar-foreground/60', !subtitulo && 'hidden')}>{subtitulo}</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-3 group-data-[collapsible=icon]:px-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {setores.map((setor) => {
                const ativo = setor.id === setorAtivoId
                const aberto = abertos.includes(setor.id)
                const ovIcone = mapaSetores[setor.label]?.icone
                // Setor com UMA entrada só (Início, Engajamento): link direto, sem acordeão/flyout.
                const direto = setor.abas.length === 1

                if (direto) {
                  return (
                    <SidebarMenuItem key={setor.id}>
                      <SidebarMenuButton className={NAV_STATES} render={<Link href={hrefInicialAba(setor.abas[0])} />} isActive={ativo} tooltip={lblSetor(setor)}>
                        <IconeMenu override={ovIcone} fallback={setor.icone} className="h-4 w-4" ativo={ativo} />
                        <RotuloMenu map={mapaSetores} chave={setor.label} fallback={setor.label} ativo={ativo} />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                }

                // Recolhida: clicar no ícone do setor abre um flyout AO LADO (DropdownMenu, com animação) listando as
                // ABAS (clusters) do setor; clicar numa aba navega para o 1º item dela e fecha o flyout.
                if (recolhida) {
                  return (
                    <SidebarMenuItem key={setor.id}>
                      {setor.superOnly && <div className="mx-auto mb-1 mt-2 h-px w-6 bg-sidebar-border" aria-hidden />}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={lblSetor(setor)}
                          title={lblSetor(setor)}
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
                          <IconeMenu override={ovIcone} fallback={setor.icone} className="h-4 w-4" ativo={ativo} />
                        </DropdownMenuTrigger>
                        {/* Flyout em LEQUE que ENVOLVE o ícone: align=center põe o leque na altura
                            do ícone; o recuo em ARCO (meio mais à direita, pontas recuadas para junto
                            do ícone) faz os comprimidos abraçarem o ícone. */}
                        <DropdownMenuContent
                          side="right" align="center" sideOffset={6}
                          className="w-auto min-w-0 overflow-visible border-0 bg-transparent p-0 shadow-none ring-0"
                        >
                          <div className="flex flex-col gap-2 py-1 pl-1 pr-8">
                            {setor.abas.map((aba, i) => {
                              const cor = FAN_CORES[i % FAN_CORES.length]
                              const nSub = setor.abas.length
                              const mid = (nSub - 1) / 2
                              // Arco: meio = recuo máximo (mais à direita), pontas = 0 (juntas ao ícone).
                              const recuo = Math.round(46 * (1 - Math.abs(i - mid) / (mid || 1)))
                              const abaOn = ativo && rota?.aba.id === aba.id
                              // Contagem (por href) das páginas da aba — soma dos itens que têm contador.
                              const cnts = aba.itens.map((it) => counts?.[it.href]).filter((n): n is number => n != null)
                              const cnt = cnts.length ? cnts.reduce((a, b) => a + b, 0) : null
                              const lbl = rotuloDe(rotulos?.itens, chaveRotuloAba(aba), aba.label)
                              return (
                                <DropdownMenuItem
                                  key={aba.id}
                                  render={<Link href={hrefInicialAba(aba)} />}
                                  style={{ marginLeft: recuo, animationDelay: `${i * 45}ms`, animationFillMode: 'both' }}
                                  className={cn(
                                    'w-56 cursor-pointer gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-md ring-1',
                                    // Claro: comprimido branco / texto escuro. Escuro: card escuro / texto claro.
                                    'bg-white text-neutral-900 ring-black/10 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-white/10 dark:shadow-black/40',
                                    'animate-in fade-in slide-in-from-left-3',
                                    'transition-shadow hover:shadow-lg focus:shadow-lg',
                                    abaOn && 'ring-2 ring-primary/50',
                                  )}
                                >
                                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
                                  <span className="truncate">{lbl}</span>
                                  {cnt != null && <span className="ml-auto shrink-0 pl-2 text-xs font-semibold tabular-nums text-neutral-400 dark:text-neutral-500">{cnt.toLocaleString('pt-BR')}</span>}
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
                  <SidebarMenuItem key={setor.id}>
                    {setor.superOnly && (
                      <div className="mb-1 mt-3 flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                        <span className="h-px flex-1 bg-sidebar-border" />
                        <span className="shrink-0">Restrito</span>
                        <span className="h-px flex-1 bg-sidebar-border" />
                      </div>
                    )}
                    <SidebarMenuButton className={NAV_STATES} onClick={() => alternar(setor.id)} isActive={ativo} aria-expanded={aberto} tooltip={lblSetor(setor)}>
                      <IconeMenu override={ovIcone} fallback={setor.icone} className="h-4 w-4" ativo={ativo} />
                      <RotuloMenu map={mapaSetores} chave={setor.label} fallback={setor.label} ativo={ativo} />
                      <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden', aberto && 'rotate-180')} />
                    </SidebarMenuButton>
                    {/* Acordeão: UMA linha por ABA (cluster) do setor, só quando aberto. As páginas irmãs de cada cluster
                        ficam nas abas internas da própria área (BarraSetor), não aqui. */}
                    {aberto && (
                      <div className="overflow-hidden">
                        <SidebarMenuSub className="mr-0 pr-0 duration-200 animate-in fade-in slide-in-from-top-1">
                          {setor.abas.map((aba) => {
                            const abaOn = ativo && rota?.aba.id === aba.id
                            const chave = chaveRotuloAba(aba)
                            return (
                              <SidebarMenuSubItem key={aba.id}>
                                <SidebarMenuSubButton className={NAV_STATES} render={<Link href={hrefInicialAba(aba)} />} isActive={abaOn}>
                                  <IconeMenu override={rotulos?.itens?.[chave]?.icone} fallback={iconeDaAba(aba)} className="h-4 w-4" ativo={abaOn} />
                                  <RotuloMenu map={rotulos?.itens} chave={chave} fallback={aba.label} ativo={abaOn} />
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            )
                          })}
                        </SidebarMenuSub>
                      </div>
                    )}
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
          <FontScaleControl scope={`admin:${userEmail || 'admin'}`} align="start" />
          <AjudaButton />
          {/* "Trocar de plataforma" SÓ aparece p/ quem pode trocar (super-admin OU admin com acesso a
              >1 plataforma). Com 1 acesso só, trocar levava ao seletor que reentrava na MESMA
              plataforma ("carrega e volta") — então some. */}
          {podeTrocarPlataforma && (
            <button type="button" onClick={() => { window.location.href = '/login?trocar=1' }} title="Trocar de plataforma" aria-label="Trocar de plataforma"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent transition-colors hover:border-[color:var(--primary)] hover:bg-[color:var(--primary)] hover:text-white [&:hover_svg]:!text-white">
              <Building2 className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={async () => { if (!(await confirmarDescartarAlteracoes())) return; setSaindo(true); setTimeout(() => { void logoutAction() }, 1100) }} title="Sair" aria-label="Sair"
            className={cn(btnFooter, 'flex items-center justify-center gap-1.5 group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:px-0')}>
            <LogOut className="h-3.5 w-3.5" /> <span className="group-data-[collapsible=icon]:hidden">Sair</span>
          </button>
        </div>
        {/* Versão do sistema — visível dentro da plataforma (além do rodapé do login). */}
        <p className="text-center text-[10px] leading-none text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden">v{APP_VERSION}</p>
      </SidebarFooter>
    </Sidebar>
    </>
  )
}
