'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { Home, ClipboardList, Bell, Menu, GraduationCap, Lightbulb, BookOpen, ClipboardCheck, ChevronRight, Library, Trophy, User, LogOut } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSWRGet } from '@/hooks/use-swr-get'
import { cn } from '@/lib/utils'
import { avatarPadraoDe } from '@/lib/aluno/avatar-padrao'
import { LoginLoading } from '@/components/aluno/login-loading'
import type { LoginConfig } from '@/lib/login-config'

export type NavMode = 'tabs' | 'menu'

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

// ── Ícones SÓLIDOS do estado ativo (estilo Instagram) ─────────────────────────────
// Os do Lucide são de traço; preenchê-los vira borrão. Aqui a silhueta é preenchida com
// a cor accent (`cor`) e os detalhes internos (porta, badalo, linhas) são vazados na cor
// do fundo da barra (`furo`), preservando o TAMANHO cheio do ícone (sem inset de traço).
type SolidProps = { className?: string; cor: string; furo: string }

// Sólidos preenchem só até a borda do path; os de contorno (inativos) têm o traço que adiciona
// ~1px de halo. Ampliamos levemente cada sólido (sobre o centro) p/ ficarem do MESMO tamanho.
function HomeSolido({ className, cor, furo }: SolidProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <g transform="translate(12 12) scale(1.1) translate(-12 -12)">
        <path d="M2.42 11.08a1 1 0 0 1 .38-.78L12 2.9l9.2 7.4a1 1 0 0 1 .38.78V19a2 2 0 0 1-2 2H4.42a2 2 0 0 1-2-2Z" fill={cor} />
        {/* porta */}
        <path d="M9.5 21v-4.75a2.5 2.5 0 0 1 5 0V21Z" fill={furo} />
      </g>
    </svg>
  )
}

function SinoSolido({ className, cor, furo }: SolidProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <g transform="translate(12 12) scale(1.1) translate(-12 -12)">
        <path d="M12 2.6a1.1 1.1 0 0 0-1.1 1.1v.62A6 6 0 0 0 6 10.2c0 3.35-1.02 4.7-1.77 5.55A1.1 1.1 0 0 0 5.06 17.6h13.88a1.1 1.1 0 0 0 .83-1.85c-.75-.85-1.77-2.2-1.77-5.55a6 6 0 0 0-4.9-5.88V3.7A1.1 1.1 0 0 0 12 2.6Z" fill={cor} />
        {/* badalo (parte de baixo) */}
        <path d="M9.6 19.1h4.8a2.4 2.4 0 0 1-4.8 0Z" fill={cor} />
      </g>
    </svg>
  )
}

function ClipboardSolido({ className, cor, furo }: SolidProps) {
  // A prancheta tem muito vazio interno; ampliada ~14% (sobre o centro) p/ igualar o peso visual da casa/sino.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <g transform="translate(12 12) scale(1.14) translate(-12 -12)">
        {/* prancheta */}
        <path d="M7 4h1.29A1.75 1.75 0 0 1 10 2.75h4A1.75 1.75 0 0 1 15.71 4H17a2.5 2.5 0 0 1 2.5 2.5V19A2.5 2.5 0 0 1 17 21.5H7A2.5 2.5 0 0 1 4.5 19V6.5A2.5 2.5 0 0 1 7 4Z" fill={cor} />
        {/* clipe */}
        <path d="M9.75 3.5h4.5a.9.9 0 0 1 .9.9v1.05a.9.9 0 0 1-.9.9h-4.5a.9.9 0 0 1-.9-.9V4.4a.9.9 0 0 1 .9-.9Z" fill={furo} />
        {/* linhas da lista */}
        <circle cx="9" cy="11.6" r="1.05" fill={furo} />
        <rect x="11.1" y="10.7" width="5.2" height="1.8" rx=".9" fill={furo} />
        <circle cx="9" cy="15.9" r="1.05" fill={furo} />
        <rect x="11.1" y="15" width="5.2" height="1.8" rx=".9" fill={furo} />
      </g>
    </svg>
  )
}

/** Bottom-sheet do portal mobile (usado pelo "Simulados" e pelo "Perfil") — mesmo visual e com
 *  animação de ABRIR e FECHAR (fade + slide), via estado controlado (monta → entra → sai → desmonta). */
function BottomSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const [montado, setMontado] = useState(false)
  const [entrando, setEntrando] = useState(false)
  useEffect(() => {
    if (open) {
      setMontado(true)
      const id = requestAnimationFrame(() => setEntrando(true))
      return () => cancelAnimationFrame(id)
    }
    setEntrando(false)
    const t = setTimeout(() => setMontado(false), 300) // espera a animação de saída terminar
    return () => clearTimeout(t)
  }, [open])
  if (!montado || typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-50 md:hidden" onClick={onClose}>
      <div className={cn('absolute inset-0 bg-black/40 transition-opacity duration-300', entrando ? 'opacity-100' : 'opacity-0')} />
      <div
        className={cn('absolute inset-x-3 rounded-[18px] border bg-card p-2 shadow-2xl transition-all duration-300 ease-out', entrando ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0')}
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 74px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

interface Props {
  navMode: NavMode
  loginConfig: LoginConfig
  logo?: string | null; nome?: string; subtitulo?: string | null; logoBg?: string; logoEstilo?: string; logoFiltro?: string
  usuarioNome?: string; avatar?: string | null; avatarCor?: string | null; counts?: Record<string, number>; hrefsOcultos?: string[]
}

/**
 * Chrome de navegação MOBILE do portal do aluno, em 2 layouts escolhidos no console (tema.mobile_nav):
 *  - 'tabs' → barra inferior fixa (4 ícones, sem rótulos; "Simulados" abre um bottom-sheet), sem app bar.
 *  - 'menu' → app bar no topo (hambúrguer + marca + sino + avatar) que abre o drawer lateral, sem barra inferior.
 * Só renderiza no mobile (md-). No desktop vale a sidebar. Cores via tokens white-label (--sidebar-*).
 */
export function AlunoMobileNav({ navMode, loginConfig, logo, nome = 'Área do Aluno', subtitulo, logoBg = '#ffffff', logoEstilo = 'arredondado', logoFiltro = 'none', usuarioNome = 'Aluno', avatar, avatarCor, counts, hrefsOcultos = [] }: Props) {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const { setOpenMobile } = useSidebar()
  const router = useRouter()
  const [popup, setPopup] = useState(false)          // bottom-sheet dos Simulados
  const [popupPerfil, setPopupPerfil] = useState(false) // bottom-sheet do Perfil (Meu perfil / Sair)
  const [saindo, setSaindo] = useState(false)

  async function sair() {
    if (saindo) return
    // Tela de carregamento branded na SAÍDA (igual ao desktop) — dá tempo do login reentrar pronto.
    setSaindo(true)
    await fetch('/api/aluno/logout', { method: 'POST' }).catch(() => {})
    setTimeout(() => { router.push('/aluno/entrar'); router.refresh() }, 1100)
  }

  // Contador de não lidas (dot) via SWR: mostra o último valor do cache NA HORA ao remontar
  // (a cada navegação) e revalida em 2º plano — sem piscar "0". Só busca no mobile.
  const { data: notif } = useSWRGet<{ naoLidas?: number }>(isMobile ? '/api/aluno/notificacoes' : null, { intervalo: 60000 })
  const naoLidas = Number(notif?.naoLidas ?? 0)

  // Trocar de rota fecha os bottom-sheets.
  useEffect(() => { setPopup(false); setPopupPerfil(false) }, [pathname])

  if (!isMobile) return null

  const inicioAtivo = pathname === '/aluno'
  // Ícone do menu (clipboard) fica ATIVO em qualquer destino do pop-up (inclui Desafio/Leitura e Ligas).
  const emSimulados = pathname.startsWith('/aluno/simulados') || pathname.startsWith('/aluno/recomendado') || pathname.startsWith('/aluno/questoes') || pathname.startsWith('/aluno/leitura') || pathname.startsWith('/aluno/ligas')
  const notifAtivo = pathname.startsWith('/aluno/notificacoes')
  const perfilAtivo = pathname.startsWith('/aluno/perfil')
  const meus = counts?.['/aluno/simulados'] ?? 0

  const avatarEl = (ativo: boolean, tam: string) => (
    <span className={cn('flex items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-primary', tam, ativo ? 'ring-2 ring-[color:var(--brand-accent)]' : 'ring-1 ring-black/10')} style={{ background: avatarCor ?? '#ffffff' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatar || avatarPadraoDe(usuarioNome)} alt="" className={cn('h-full w-full object-contain', avatar ? 'object-[center_82%]' : 'object-center')} />
    </span>
  )

  // ─────────────────────────── OPÇÃO B — app bar + drawer ───────────────────────────
  if (navMode === 'menu') {
    return (
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar px-2.5 text-sidebar-foreground md:hidden">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" onClick={() => setOpenMobile(true)} aria-label="Abrir menu" className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-white/10 active:scale-95">
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/aluno" className="flex min-w-0 items-center gap-2">
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden', frameLogo(logoEstilo), !logo && 'bg-primary text-primary-foreground')} style={logo ? { background: logoBg } : undefined}>
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={nome} className="h-full w-full object-contain" style={{ filter: filtroLogo(logoFiltro) }} />
              ) : (
                <GraduationCap className="h-4 w-4" />
              )}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">{nome}</span>
              {subtitulo && <span className="truncate text-[10px] text-sidebar-foreground/60">{subtitulo}</span>}
            </span>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Link href="/aluno/notificacoes" aria-label="Notificações" className="relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-white/10 active:scale-95">
            <Bell className="h-5 w-5" fill={notifAtivo ? 'currentColor' : 'none'} />
            {naoLidas > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full ring-2 ring-[color:var(--sidebar)]" style={{ background: 'var(--brand-accent, var(--primary))' }} />}
          </Link>
          <Link href="/aluno/perfil" aria-label="Meu perfil" className="ml-0.5 active:scale-95">{avatarEl(perfilAtivo, 'h-9 w-9')}</Link>
        </div>
      </header>
    )
  }

  // ─────────────────────────── OPÇÃO A — barra inferior (tabs) ───────────────────────────
  // Ativo = ícone SÓLIDO (silhueta accent + detalhes vazados no fundo), mesmo tamanho do inativo.
  // Inativo = contorno do Lucide em cinza. Sem scale (todos ficam do mesmo tamanho).
  const ACCENT = 'var(--brand-accent, var(--primary))'
  const SZ = 'h-[26px] w-[26px]'
  return (
    <>
      {/* Tela de carregamento branded ao SAIR (mesma do desktop). */}
      {saindo && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[200]">
          <LoginLoading config={loginConfig} plataforma={nome} logo={logo} logoBg={logoBg} logoEstilo={logoEstilo} logoFiltro={logoFiltro} />
        </div>,
        document.body,
      )}
      <nav aria-label="Navegação" className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.5)] md:hidden">
        <Link href="/aluno" className="flex flex-1 items-center justify-center py-3.5 active:scale-95" aria-label="Início">
          {inicioAtivo
            ? <HomeSolido className={SZ} cor={ACCENT} furo="var(--sidebar)" />
            : <Home className={cn(SZ, 'text-sidebar-foreground/45')} strokeWidth={2} style={{ fill: 'none' }} />}
        </Link>
        <button aria-label="Simulados" onClick={() => { setPopup((v) => !v); setPopupPerfil(false) }} className="relative flex flex-1 items-center justify-center py-3.5 outline-none active:scale-95">
          {emSimulados
            ? <ClipboardSolido className={SZ} cor={ACCENT} furo="var(--sidebar)" />
            : <ClipboardList className={cn(SZ, 'text-sidebar-foreground/45')} strokeWidth={2} style={{ fill: 'none' }} />}
        </button>
        <Link href="/aluno/notificacoes" className="flex flex-1 items-center justify-center py-3.5 active:scale-95" aria-label="Notificações">
          <span className="relative flex items-center justify-center">
            {notifAtivo
              ? <SinoSolido className={SZ} cor={ACCENT} furo="var(--sidebar)" />
              : <Bell className={cn(SZ, 'text-sidebar-foreground/45')} strokeWidth={2} style={{ fill: 'none' }} />}
            {naoLidas > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-[color:var(--sidebar)]" style={{ background: ACCENT }} />}
          </span>
        </Link>
        <button aria-label="Perfil" onClick={() => { setPopupPerfil((v) => !v); setPopup(false) }} className="flex flex-1 items-center justify-center py-3.5 outline-none active:scale-95">{avatarEl(perfilAtivo || popupPerfil, 'h-[26px] w-[26px]')}</button>
      </nav>

      {/* Bottom-sheet dos Simulados */}
      <BottomSheet open={popup} onClose={() => setPopup(false)}>
        {[
          { href: '/aluno/simulados', icon: ClipboardCheck, titulo: 'Simulados Realizados', desc: meus > 0 ? `${meus} concluído${meus > 1 ? 's' : ''}, com notas` : 'Seus resultados e notas' },
          { href: '/aluno/leitura', icon: Library, titulo: 'Desafio de Lei Seca', desc: 'Leia a lei na trilha e ganhe pontos' },
          { href: '/aluno/recomendado', icon: Lightbulb, titulo: 'Recomendado', desc: 'Questões onde você mais erra' },
          { href: '/aluno/questoes', icon: BookOpen, titulo: 'Banco de Questões', desc: 'Pratique com filtros' },
          { href: '/aluno/ligas', icon: Trophy, titulo: 'Ligas', desc: 'Dispute XP e suba de liga' },
        ].filter((o) => !hrefsOcultos.includes(o.href)).map((o) => {
          const on = pathname.startsWith(o.href)
          return (
            <Link key={o.href} href={o.href} onClick={() => setPopup(false)} className={cn('flex items-center gap-3 rounded-2xl p-3 transition-colors active:scale-[.98]', on ? 'bg-muted' : 'hover:bg-muted/60')}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><o.icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{o.titulo}</span>
                <span className="block truncate text-xs text-muted-foreground">{o.desc}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          )
        })}
      </BottomSheet>

      {/* Bottom-sheet do Perfil — Meu perfil / Sair (mesmo visual e animações do dos Simulados) */}
      <BottomSheet open={popupPerfil} onClose={() => setPopupPerfil(false)}>
        <Link href="/aluno/perfil" onClick={() => setPopupPerfil(false)} className={cn('flex items-center gap-3 rounded-2xl p-3 transition-colors active:scale-[.98]', perfilAtivo ? 'bg-muted' : 'hover:bg-muted/60')}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><User className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">Meu perfil</span>
            <span className="block truncate text-xs text-muted-foreground">Seus dados, progresso e conquistas</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
        <button type="button" onClick={sair} disabled={saindo} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-muted/60 active:scale-[.98] disabled:opacity-60">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400"><LogOut className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">Sair</span>
            <span className="block truncate text-xs text-muted-foreground">Encerrar a sessão neste aparelho</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </BottomSheet>
    </>
  )
}
