'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import { Home, ClipboardList, Bell, Menu, GraduationCap, Sparkles, BookOpen, ClipboardCheck, ChevronRight } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSWRGet } from '@/hooks/use-swr-get'
import { cn } from '@/lib/utils'

export type NavMode = 'tabs' | 'menu'

function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || 'A'
}
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

interface Props {
  navMode: NavMode
  logo?: string | null; nome?: string; subtitulo?: string | null; logoBg?: string; logoEstilo?: string; logoFiltro?: string
  usuarioNome?: string; avatar?: string | null; avatarCor?: string | null; counts?: Record<string, number>
}

/**
 * Chrome de navegação MOBILE do portal do aluno, em 2 layouts escolhidos no console (tema.mobile_nav):
 *  - 'tabs' → barra inferior fixa (4 ícones, sem rótulos; "Simulados" abre um bottom-sheet), sem app bar.
 *  - 'menu' → app bar no topo (hambúrguer + marca + sino + avatar) que abre o drawer lateral, sem barra inferior.
 * Só renderiza no mobile (md-). No desktop vale a sidebar. Cores via tokens white-label (--sidebar-*).
 */
export function AlunoMobileNav({ navMode, logo, nome = 'Área do Aluno', subtitulo, logoBg = '#ffffff', logoEstilo = 'arredondado', logoFiltro = 'none', usuarioNome = 'Aluno', avatar, avatarCor, counts }: Props) {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const { setOpenMobile } = useSidebar()
  const [popup, setPopup] = useState(false)

  // Contador de não lidas (dot) via SWR: mostra o último valor do cache NA HORA ao remontar
  // (a cada navegação) e revalida em 2º plano — sem piscar "0". Só busca no mobile.
  const { data: notif } = useSWRGet<{ naoLidas?: number }>(isMobile ? '/api/aluno/notificacoes' : null, { intervalo: 60000 })
  const naoLidas = Number(notif?.naoLidas ?? 0)

  // Trocar de rota fecha o popup de "Simulados".
  useEffect(() => { setPopup(false) }, [pathname])

  if (!isMobile) return null

  const inicioAtivo = pathname === '/aluno'
  const emSimulados = pathname.startsWith('/aluno/simulados') || pathname.startsWith('/aluno/recomendado') || pathname.startsWith('/aluno/questoes')
  const notifAtivo = pathname.startsWith('/aluno/notificacoes')
  const perfilAtivo = pathname.startsWith('/aluno/perfil')
  const meus = counts?.['/aluno/simulados'] ?? 0

  const avatarEl = (ativo: boolean, tam: string) => (
    <span className={cn('flex items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-primary', tam, ativo ? 'ring-2 ring-[color:var(--brand-accent)]' : 'ring-1 ring-black/10')} style={{ background: avatarCor ?? '#ffffff' }}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="h-full w-full object-contain object-[center_82%]" />
      ) : iniciais(usuarioNome)}
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
      <nav aria-label="Navegação" className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.5)] md:hidden">
        <Link href="/aluno" className="flex flex-1 items-center justify-center py-3.5 active:scale-95" aria-label="Início">
          {inicioAtivo
            ? <HomeSolido className={SZ} cor={ACCENT} furo="var(--sidebar)" />
            : <Home className={cn(SZ, 'text-sidebar-foreground/45')} strokeWidth={2} style={{ fill: 'none' }} />}
        </Link>
        <button aria-label="Simulados" onClick={() => setPopup((v) => !v)} className="relative flex flex-1 items-center justify-center py-3.5 outline-none active:scale-95">
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
        <Link href="/aluno/perfil" className="flex flex-1 items-center justify-center py-3.5 active:scale-95" aria-label="Perfil">{avatarEl(perfilAtivo, 'h-[26px] w-[26px]')}</Link>
      </nav>

      {popup && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setPopup(false)}>
          <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" />
          <div
            className="absolute inset-x-3 animate-in fade-in slide-in-from-bottom-4 rounded-[18px] border bg-card p-2 shadow-2xl duration-300"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 74px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {[
              { href: '/aluno/simulados', icon: ClipboardCheck, titulo: 'Meus Simulados', desc: meus > 0 ? `${meus} concluído${meus > 1 ? 's' : ''}, com notas` : 'Seus resultados e notas' },
              { href: '/aluno/recomendado', icon: Sparkles, titulo: 'Recomendado', desc: 'Questões onde você mais erra' },
              { href: '/aluno/questoes', icon: BookOpen, titulo: 'Banco de Questões', desc: 'Pratique com filtros' },
            ].map((o) => {
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
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
