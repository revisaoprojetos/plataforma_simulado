'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import { Home, ClipboardList, Bell, Menu, GraduationCap, Sparkles, BookOpen, ClipboardCheck, ChevronRight, type LucideIcon } from 'lucide-react'
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
  // Estilo do ícone da tab bar. Ícones do Lucide são de TRAÇO — para o ativo ficar preenchido MAS
  // com os detalhes à mostra (estilo Instagram), pinta-se o corpo com a cor accent e o traço com a
  // cor do fundo da barra: as linhas internas (porta, listas, badalo) aparecem "recortadas".
  const estiloIcone = (ativo: boolean): React.CSSProperties =>
    ativo
      ? { fill: 'var(--brand-accent, var(--primary))', stroke: 'var(--sidebar)' }
      : { fill: 'none' }
  const Cell = ({ icon: Icon, ativo, dot, label, ...rest }: { icon: LucideIcon; ativo: boolean; dot?: boolean; label: string } & React.ComponentProps<'button'>) => (
    <button aria-label={label} className="relative flex flex-1 items-center justify-center py-3.5 outline-none active:scale-95" {...rest}>
      <Icon
        className={cn('h-[26px] w-[26px] transition-transform', ativo ? 'scale-110' : 'text-sidebar-foreground/45')}
        strokeWidth={2}
        style={estiloIcone(ativo)}
      />
      {dot && <span className="absolute right-[calc(50%-16px)] top-2.5 h-2 w-2 rounded-full ring-2 ring-[color:var(--sidebar)]" style={{ background: 'var(--brand-accent, var(--primary))' }} />}
    </button>
  )

  return (
    <>
      <nav aria-label="Navegação" className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.5)] md:hidden">
        <Link href="/aluno" className="flex flex-1 items-center justify-center py-3.5 active:scale-95" aria-label="Início">
          <Home className={cn('h-[26px] w-[26px] transition-transform', inicioAtivo ? 'scale-110' : 'text-sidebar-foreground/45')} strokeWidth={2} style={estiloIcone(inicioAtivo)} />
        </Link>
        <Cell icon={ClipboardList} ativo={emSimulados} label="Simulados" onClick={() => setPopup((v) => !v)} />
        <Link href="/aluno/notificacoes" className="flex flex-1 items-center justify-center py-3.5 active:scale-95" aria-label="Notificações">
          <span className="relative flex items-center justify-center">
            <Bell className={cn('h-[26px] w-[26px] transition-transform', notifAtivo ? 'scale-110' : 'text-sidebar-foreground/45')} strokeWidth={2} style={estiloIcone(notifAtivo)} />
            {naoLidas > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-[color:var(--sidebar)]" style={{ background: 'var(--brand-accent, var(--primary))' }} />}
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
