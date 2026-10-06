'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { Bell, Menu, GraduationCap, ChevronRight, User, LogOut } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSWRGet } from '@/hooks/use-swr-get'
import { cn } from '@/lib/utils'
import { avatarPadraoDe } from '@/lib/aluno/avatar-padrao'
import { LoginLoading } from '@/components/aluno/login-loading'
import { AlunoDownBar } from '@/components/aluno/aluno-down-bar'
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
export function AlunoMobileNav({ navMode, loginConfig, logo, nome = 'Área do Aluno', subtitulo, logoBg = '#ffffff', logoEstilo = 'arredondado', logoFiltro = 'none', usuarioNome = 'Aluno', avatar, avatarCor, hrefsOcultos = [] }: Props) {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const { setOpenMobile } = useSidebar()
  const router = useRouter()
  const [popupPerfil, setPopupPerfil] = useState(false) // bottom-sheet do Perfil/conta (Meu perfil / Sair)
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

  // Trocar de rota fecha o bottom-sheet da conta.
  useEffect(() => { setPopupPerfil(false) }, [pathname])

  if (!isMobile) return null

  const notifAtivo = pathname.startsWith('/aluno/notificacoes')
  const perfilAtivo = pathname.startsWith('/aluno/perfil')

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

  // ─────────────────────────── OPÇÃO A — DOWN BAR agrupada (visual Revisão, spec 03 §2.3) ───────────────────────────
  // A barra flutuante roxa com pílula amarela + listas agrupadas (Simulados/Desafios/Cronograma)
  // vive em <AlunoDownBar>. O avatar abre o bottom-sheet da conta já existente (reuso).
  return (
    <>
      {/* Tela de carregamento branded ao SAIR (mesma do desktop). */}
      {saindo && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[200]">
          <LoginLoading config={loginConfig} plataforma={nome} logo={logo} logoBg={logoBg} logoEstilo={logoEstilo} logoFiltro={logoFiltro} />
        </div>,
        document.body,
      )}

      <AlunoDownBar
        usuarioNome={usuarioNome}
        avatar={avatar}
        avatarCor={avatarCor}
        hrefsOcultos={hrefsOcultos}
        contaAberta={popupPerfil}
        onAbrirConta={() => setPopupPerfil((v) => !v)}
      />

      {/* Bottom-sheet do Perfil / conta — Meu perfil / Sair (reusado pelo avatar da down bar) */}
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
