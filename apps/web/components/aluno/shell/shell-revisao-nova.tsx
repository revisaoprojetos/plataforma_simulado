'use client'

import { useState, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  Moon,
  Type as TypeIcon,
  LogOut,
  Search,
  Bell,
  Flame,
  Zap,
  Sun,
  Monitor,
  Check,
} from 'lucide-react'
import type { AlunoNavItem, AlunoShellUsuario } from './types'
import { internaTokensStyle } from '@/components/brand/interna/interna-tokens'
import { BuscaOverlay } from '@/components/brand/interna/busca/busca-overlay'
import { cn } from '@/lib/utils'
import { NavIcon, MarcaR } from './revisao-nova/icons'
import {
  revTokensStyle,
  SIDEBAR_GRAD,
  COLLAPSE_BTN_BG,
  MOBILE_TOPBAR_GRAD,
  AMARELO,
  AMARELO_INK,
  type ShellTheme,
} from './revisao-nova/tokens'
import {
  useSidebarCollapsed,
  useFontScale,
  useThemePref,
  FONT_SCALES,
  type FontIdx,
} from './revisao-nova/use-shell-state'
import { AccountMenu } from './revisao-nova/account-menu'
import { NotificationsPanel } from './revisao-nova/notifications'
import { DownBar } from './revisao-nova/down-bar'
import { useTheme } from 'next-themes'
import { usePathname } from 'next/navigation'
import { useTemaInterno } from '@/components/brand/interna/use-tema-interno'

export interface ShellRevisaoNovaProps {
  theme: ShellTheme
  nav: AlunoNavItem[]
  usuario: AlunoShellUsuario
  pathname: string
  logo: string | null
  nome: string
  subtitulo: string | null
  children: ReactNode
}

export function ShellRevisaoNova({
  theme: themeProp,
  nav,
  usuario,
  pathname,
  logo,
  nome,
  subtitulo,
  children,
}: ShellRevisaoNovaProps) {
  // Segue o tema REAL (classe .dark do next-themes), reativo ao toggle — não o prop estático do server.
  const theme: ShellTheme = useTemaInterno(themeProp) === 'escuro' ? 'escuro' : 'claro'
  // Fundo das ÁREAS NOVAS = fundo INTERNA da marca (#0E0A24/#F5F3FC), NÃO o --bg do shell (revTokensStyle
  // usa #18181D cinza no dark). As páginas internas pintam esse mesmo fundo; igualar o shr-main evita a
  // "faixa cinza" quando o conteúdo não preenche a altura toda.
  const internaBg = theme === 'escuro' ? '#0E0A24' : '#F5F3FC'
  // Faixa cinza no rodapé (dark): html/body usam bg-background (cinza shadcn), mas o fundo interno é
  // roxo (--bg). Em qualquer área não pintada (overscroll/rodapé) o cinza vazava. Enquanto o shell
  // está montado, forçamos html+body ao --bg da marca (revertendo ao desmontar).
  useEffect(() => {
    const bg = theme === 'escuro' ? '#0E0A24' : '#F5F3FC'
    const html = document.documentElement
    const body = document.body
    const prevH = html.style.background
    const prevB = body.style.background
    html.style.background = bg
    body.style.background = bg
    return () => { html.style.background = prevH; body.style.background = prevB }
  }, [theme])

  // Busca de simulados (overlay): abre pela barra do topo ou por Ctrl/⌘+K.
  const [buscaAberta, setBuscaAberta] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setBuscaAberta((v) => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // Rota ATUAL pelo cliente: o layout do portal NÃO re-roda na navegação client-side, então o
  // `pathname`/`ativo` do servidor congelam em "Início". usePathname() reflete a rota de verdade.
  const rota = usePathname() || pathname
  const ehAtivo = (href: string) => (href === '/aluno' ? rota === '/aluno' : rota.startsWith(href))
  // Áreas com CONTEÚDO REDESENHADO (trazem o próprio layout/padding/fundo) ficam FULL-BLEED, como a
  // home — senão o shell aplicaria padding em cima do padding do componente ("encaixe"/caixa dupla).
  // As demais (conteúdo atual) recebem padding para não ficar cortadas. Nova área → adicionar aqui.
  const AREAS_NOVAS = ['/aluno/perfil', '/aluno/cronograma', '/aluno/recomendado', '/aluno/simulados', '/aluno/questoes', '/aluno/ligas', '/aluno/leitura', '/aluno/jurisprudencia']
  const ehAreaNova = rota === '/aluno' || AREAS_NOVAS.some((a) => rota.startsWith(a))
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()
  const [fontIdx, applyFont] = useFontScale()
  const [themePref, aplicarPref] = useThemePref(theme)
  // Aplica o tema DE VERDADE via next-themes (alterna a classe .dark em <html>) + persiste a escolha.
  const { setTheme } = useTheme()
  const applyTheme = (p: typeof themePref) => {
    aplicarPref(p)
    setTheme(p === 'auto' ? 'system' : p === 'escuro' ? 'dark' : 'light')
  }

  // Popovers da sidebar (Tema / Fonte) e menus globais.
  const [popTema, setPopTema] = useState(false)
  const [popFonte, setPopFonte] = useState(false)
  const [notif, setNotif] = useState(false)
  // 'desktop' | 'mobile-top' | 'mobile-bottom' | null
  const [account, setAccount] = useState<null | 'desktop' | 'mobile-top' | 'mobile-bottom'>(null)

  const closeAllMenus = () => {
    setNotif(false)
    setAccount(null)
    setPopTema(false)
    setPopFonte(false)
  }

  const xpFmt = usuario.xpTotal.toLocaleString('pt-BR')
  const avatarCor = usuario.avatarCor || '#F2A93B'

  return (
    <div
      className="shr-root"
      style={{
        ...internaTokensStyle('revisao', theme),
        ...revTokensStyle(theme),
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: "'Plus Jakarta Sans',sans-serif",
      }}
    >
      <ScopedStyle />

      {/* Menus globais (notificações + conta) */}
      {notif && (
        <NotificationsPanel variant="desktop" onClose={() => setNotif(false)} />
      )}
      {account === 'desktop' && (
        <AccountMenu
          variant="desktop"
          usuario={usuario}
          themePref={themePref}
          onTheme={applyTheme}
          fontIdx={fontIdx}
          onFont={applyFont}
          onClose={() => setAccount(null)}
        />
      )}

      {/* ───────── SIDEBAR (desktop) ───────── */}
      <aside
        className={cn('shr-side', collapsed && 'shr-col')}
        style={{
          position: 'relative',
          zIndex: 6,
          width: collapsed ? 84 : 264,
          transition: 'width .38s cubic-bezier(.22,1,.36,1)',
          flexShrink: 0,
          background: SIDEBAR_GRAD[theme],
          color: '#FFFFFF',
        }}
      >
        <div className="shr-lines2" aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        <div
          style={{
            position: 'sticky',
            top: 0,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            padding: '24px 14px 18px',
          }}
        >
          {/* Logo lockup */}
          <div style={{ padding: '0 8px 22px' }}>
            <Link href="/aluno" aria-label={nome} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                // Logo da sidebar SEMPRE em branco (fundo roxo) — filtro neutraliza a cor original.
                <img src={logo} alt="" style={{ height: 40, width: 'auto', flexShrink: 0, filter: 'brightness(0) invert(1)' }} />
              ) : (
                <MarcaR size={40} />
              )}
              <div className="shr-lbl">
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    fontFamily: 'Montserrat, sans-serif',
                    color: '#FFFFFF',
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: 17, lineHeight: 0.8, letterSpacing: '.01em' }}>
                    {(nome || 'REVISÃO').toUpperCase()}
                  </span>
                  {subtitulo && (
                    <span style={{ fontWeight: 500, fontSize: 8, letterSpacing: '.22em', color: '#E1D9FF' }}>
                      {subtitulo.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </div>

          {/* Botão recolher/expandir */}
          <button
            type="button"
            className="shr-sbcol"
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            onClick={() => {
              closeAllMenus()
              toggleCollapsed()
            }}
            style={{
              position: 'absolute',
              top: 29,
              right: -15,
              zIndex: 40,
              width: 30,
              height: 30,
              padding: 0,
              borderRadius: '50%',
              border: 0,
              background: COLLAPSE_BTN_BG[theme],
              color: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 6px 14px -4px rgba(20,8,60,.6)',
            }}
          >
            <ChevronLeft
              className="shr-sbcol-ico"
              style={{ width: 16, height: 16, strokeWidth: 2.6, transform: collapsed ? 'rotate(180deg)' : 'none' }}
            />
          </button>

          {/* Nav */}
          <nav className="shr-nav" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {nav.map((item) => {
              const active = ehAtivo(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    height: 42,
                    padding: '0 12px',
                    borderRadius: 12,
                    fontSize: 13.5,
                    whiteSpace: 'nowrap',
                    fontWeight: active ? 800 : 600,
                    background: active ? AMARELO : 'transparent',
                    color: active ? AMARELO_INK : '#E6DEFF',
                  }}
                >
                  <NavIcon name={item.icon} style={{ width: 18, height: 18 }} />
                  <span className="shr-lbl" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.badge && (
                      <span style={badgePill(item.badge)}>{item.badge}</span>
                    )}
                  </span>
                </Link>
              )
            })}
          </nav>

          {/* Rodapé: cartão de perfil + botões */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link
              href="/aluno/perfil"
              className="shr-prof"
              aria-label="Abrir meu perfil"
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                borderRadius: 16,
                background: 'linear-gradient(135deg,rgba(255,255,255,.12),rgba(255,255,255,.04))',
                border: '1px solid rgba(241,194,50,.28)',
                color: '#FFFFFF',
              }}
            >
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                {usuario.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={usuario.avatarUrl}
                    alt=""
                    style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 0 0 2px rgba(241,194,50,.55)' }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: avatarCor,
                      color: '#FFFFFF',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 17,
                      fontWeight: 800,
                      boxShadow: '0 0 0 2px rgba(241,194,50,.55)',
                    }}
                  >
                    {usuario.iniciais}
                  </span>
                )}
                <span
                  style={{
                    position: 'absolute',
                    right: -2,
                    bottom: -2,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: '#3FD58A',
                    boxShadow: `0 0 0 2px ${theme === 'escuro' ? '#160F36' : '#2E1F7A'}`,
                  }}
                />
              </span>
              <div className="shr-lbl" style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                <b style={{ display: 'block', fontSize: 14.5 }}>{usuario.primeiroNome}</b>
                <span
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: '#D9CFFF',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  Nível {usuario.nivel} · {xpFmt} XP
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 4,
                    fontSize: 11,
                    fontWeight: 800,
                    color: AMARELO,
                  }}
                >
                  Ver meu perfil
                  <ChevronRight style={{ width: 12, height: 12 }} />
                </span>
              </div>
            </Link>

            <div className="shr-brow" style={{ position: 'relative', display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="shr-sbtn"
                aria-label="Tema"
                aria-haspopup="true"
                onClick={() => {
                  setPopFonte(false)
                  setPopTema((v) => !v)
                }}
                style={footerBtnStyle()}
              >
                <Moon style={{ width: 16, height: 16 }} />
              </button>
              <button
                type="button"
                className="shr-sbtn"
                aria-label="Tamanho da fonte"
                aria-haspopup="true"
                onClick={() => {
                  setPopTema(false)
                  setPopFonte((v) => !v)
                }}
                style={footerBtnStyle()}
              >
                <TypeIcon style={{ width: 16, height: 16 }} />
              </button>
              <Link
                href="/sair"
                className="shr-sair"
                aria-label="Sair"
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 11,
                  border: '1px solid rgba(255,255,255,.14)',
                  background: 'rgba(255,255,255,.05)',
                  color: '#E6DEFF',
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                }}
              >
                <LogOut style={{ width: 15, height: 15 }} />
                <span className="shr-lbl">Sair</span>
              </Link>

              {/* Popover Tema */}
              {popTema && (
                <div className="shr-pop" role="menu" style={popStyle(0)}>
                  <span style={popTitle()}>TEMA</span>
                  <PopOpt
                    active={themePref === 'claro'}
                    icon={<Sun style={{ width: 16, height: 16, color: '#5B3FD0' }} />}
                    label="Claro"
                    onClick={() => {
                      applyTheme('claro')
                      setPopTema(false)
                    }}
                  />
                  <PopOpt
                    active={themePref === 'escuro'}
                    icon={<Moon style={{ width: 16, height: 16, color: '#5B3FD0' }} />}
                    label="Escuro"
                    onClick={() => {
                      applyTheme('escuro')
                      setPopTema(false)
                    }}
                  />
                  <PopOpt
                    active={themePref === 'auto'}
                    icon={<Monitor style={{ width: 16, height: 16, color: '#5B3FD0' }} />}
                    label="Automático (sistema)"
                    onClick={() => {
                      applyTheme('auto')
                      setPopTema(false)
                    }}
                  />
                </div>
              )}

              {/* Popover Fonte */}
              {popFonte && (
                <div className="shr-pop" role="menu" style={popStyle(46)}>
                  <span style={popTitle()}>TAMANHO DO TEXTO</span>
                  {(['Pequeno', 'Padrão', 'Grande', 'Extra grande'] as const).map((label, i) => (
                    <PopOpt
                      key={label}
                      active={fontIdx === i}
                      icon={
                        <span
                          style={{ width: 22, textAlign: 'center', fontWeight: 800, fontSize: 11 + i * 2, color: '#5B3FD0' }}
                        >
                          Aa
                        </span>
                      }
                      label={label}
                      onClick={() => {
                        applyFont(i as FontIdx)
                        setPopFonte(false)
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* ───────── COLUNA PRINCIPAL ───────── */}
      <div className="shr-main-col" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Top bar desktop */}
        <header
          className="shr-topbar"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            height: 72,
            padding: '0 28px',
            background: 'var(--top)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <button type="button" className="shr-searchbox" aria-label="Buscar simulados" onClick={() => setBuscaAberta(true)} style={searchBoxStyle()}>
            <Search style={{ width: 17, height: 17 }} />
            <span style={{ flex: 1, textAlign: 'left' }}>Buscar simulados pelo nome…</span>
            <kbd
              style={{
                font: 'inherit',
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 7px',
                borderRadius: 7,
                background: 'var(--surface2)',
                border: '1px solid var(--line)',
              }}
            >
              Ctrl K
            </kbd>
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={streakChip()}>
              <Flame style={{ width: 15, height: 15 }} />0 dias
            </span>
            <span style={xpChip()}>
              <Zap style={{ width: 15, height: 15 }} />
              {xpFmt} XP
            </span>
            <button
              type="button"
              aria-label="Notificações"
              className="shr-bell"
              onClick={() => {
                setAccount(null)
                setNotif((v) => !v)
              }}
              style={{
                position: 'relative',
                width: 40,
                height: 40,
                borderRadius: 12,
                border: '1px solid var(--line)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Bell style={{ width: 18, height: 18 }} />
              <span
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 9,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#E0A800',
                  boxShadow: '0 0 0 2px var(--surface)',
                }}
              />
            </button>
            <button
              type="button"
              aria-label="Abrir menu da conta"
              onClick={() => {
                setNotif(false)
                setAccount((v) => (v === 'desktop' ? null : 'desktop'))
              }}
              style={{
                flexShrink: 0,
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: avatarCor,
                color: '#FFFFFF',
                border: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
                overflow: 'hidden',
              }}
            >
              {usuario.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={usuario.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                usuario.iniciais
              )}
            </button>
          </div>
        </header>

        {/* Top bar mobile (roxa) */}
        <header
          className="shr-topbar-mobile"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 5,
            display: 'none',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 64,
            padding: '0 18px',
            background: MOBILE_TOPBAR_GRAD[theme],
            color: '#FFFFFF',
          }}
        >
          <Link href="/aluno" aria-label={nome} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" style={{ height: 28, width: 'auto' }} />
            ) : (
              <MarcaR size={28} />
            )}
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 3, fontFamily: 'Montserrat, sans-serif', color: '#FFFFFF' }}
            >
              <span style={{ fontWeight: 800, fontSize: 12, lineHeight: 0.8, letterSpacing: '.01em' }}>
                {(nome || 'REVISÃO').toUpperCase()}
              </span>
              {subtitulo && (
                <span style={{ fontWeight: 500, fontSize: 5, letterSpacing: '.22em', color: '#E1D9FF' }}>
                  {subtitulo.toUpperCase()}
                </span>
              )}
            </div>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" aria-label="Buscar" style={mobileTopBtn()}>
              <Search style={{ width: 18, height: 18 }} />
            </button>
            <button
              type="button"
              aria-label="Notificações"
              className="shr-bell"
              onClick={() => {
                setAccount(null)
                setNotif((v) => !v)
              }}
              style={{ ...mobileTopBtn(), position: 'relative' }}
            >
              <Bell style={{ width: 18, height: 18 }} />
              <span
                style={{
                  position: 'absolute',
                  top: 9,
                  right: 10,
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: AMARELO,
                }}
              />
            </button>
            <button
              type="button"
              aria-label="Abrir menu da conta"
              onClick={() => {
                setNotif(false)
                setAccount((v) => (v === 'mobile-top' ? null : 'mobile-top'))
              }}
              style={{
                flexShrink: 0,
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: avatarCor,
                color: '#FFFFFF',
                border: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
                overflow: 'hidden',
              }}
            >
              {usuario.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={usuario.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                usuario.iniciais
              )}
            </button>
          </div>
        </header>

        {/* Conteúdo: a HOME (/aluno) é full-bleed (carrossel largura total); as demais áreas
            recebem padding para o conteúdo (ainda o atual) não ficar cortado nas laterais. */}
        <main className={cn('shr-main', !ehAreaNova && 'shr-main-pad')} style={{ flex: 1, overflowY: 'auto', background: ehAreaNova ? internaBg : 'var(--bg)' }}>
          {children}
        </main>

        {/* Overlay de busca de simulados (Ctrl/⌘+K ou clique na barra do topo) */}
        <BuscaOverlay open={buscaAberta} onClose={() => setBuscaAberta(false)} theme={theme} />

        {/* Down bar mobile */}
        <div className="shr-downbar">
          <DownBar
            theme={theme}
            nav={nav}
            usuario={usuario}
            pathname={rota}
            onAccount={() => {
              setNotif(false)
              setAccount((v) => (v === 'mobile-bottom' ? null : 'mobile-bottom'))
            }}
          />
        </div>
      </div>

      {/* Menus globais mobile */}
      {account === 'mobile-top' && (
        <AccountMenu
          variant="mobile-top"
          usuario={usuario}
          themePref={themePref}
          onTheme={applyTheme}
          fontIdx={fontIdx}
          onFont={applyFont}
          onClose={() => setAccount(null)}
        />
      )}
      {account === 'mobile-bottom' && (
        <AccountMenu
          variant="mobile-bottom"
          usuario={usuario}
          themePref={themePref}
          onTheme={applyTheme}
          fontIdx={fontIdx}
          onFont={applyFont}
          onClose={() => setAccount(null)}
        />
      )}
    </div>
  )
}

// ───────── helpers de estilo ─────────

function badgePill(badge: string): React.CSSProperties {
  if (badge.toUpperCase() === 'NOVO') {
    return {
      fontSize: 9.5,
      fontWeight: 800,
      letterSpacing: '.08em',
      padding: '3px 7px',
      borderRadius: 99,
      background: 'rgba(241,194,50,.2)',
      color: '#F7DA7A',
    }
  }
  return { fontSize: 11, color: '#B9A8FF' }
}

function footerBtnStyle(): React.CSSProperties {
  return {
    width: 40,
    height: 38,
    borderRadius: 11,
    border: '1px solid rgba(255,255,255,.14)',
    background: 'rgba(255,255,255,.05)',
    color: '#E6DEFF',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  }
}

function popStyle(left: number): React.CSSProperties {
  return {
    position: 'absolute',
    left,
    bottom: 48,
    zIndex: 30,
    width: 220,
    padding: 6,
    borderRadius: 14,
    background: 'var(--surface)',
    color: 'var(--ink)',
    boxShadow: '0 20px 44px -16px rgba(10,5,40,.6)',
  }
}

function popTitle(): React.CSSProperties {
  return {
    display: 'block',
    padding: '8px 10px 6px',
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: '.16em',
    color: 'var(--muted)',
  }
}

function PopOpt({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      className="shr-opt"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 10px',
        border: 0,
        borderRadius: 10,
        background: active ? 'var(--chip)' : 'transparent',
        color: 'var(--ink)',
        fontSize: 13,
        fontWeight: active ? 800 : 600,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {active && <Check style={{ width: 15, height: 15, color: '#5B3FD0' }} />}
    </button>
  )
}

function searchBoxStyle(): React.CSSProperties {
  return {
    flex: 1,
    maxWidth: 520,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    height: 44,
    padding: '0 14px',
    borderRadius: 13,
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    color: 'var(--muted)',
    fontSize: 13.5,
    cursor: 'pointer',
  }
}

function streakChip(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 38,
    padding: '0 12px',
    borderRadius: 12,
    background: 'var(--peachBg)',
    color: 'var(--accentInk)',
    fontSize: 13,
    fontWeight: 800,
  }
}

function xpChip(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 38,
    padding: '0 12px',
    borderRadius: 12,
    background: 'var(--chip)',
    color: 'var(--brand)',
    fontSize: 13,
    fontWeight: 800,
  }
}

function mobileTopBtn(): React.CSSProperties {
  return {
    width: 40,
    height: 40,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,.18)',
    background: 'rgba(255,255,255,.06)',
    color: '#FFFFFF',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  }
}

// ───────── <style> escopado (prefixo shr-) ─────────

function ScopedStyle() {
  return (
    <style>{`
.shr-root a{text-decoration:none;color:inherit}
.shr-side .shr-lines2{background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:32px 32px;-webkit-mask-image:linear-gradient(180deg,#000,transparent 70%);mask-image:linear-gradient(180deg,#000,transparent 70%)}
.shr-side .shr-lbl{overflow:hidden;white-space:nowrap;max-width:230px;opacity:1;transition:opacity .22s ease .13s,max-width .38s cubic-bezier(.22,1,.36,1)}
.shr-side.shr-col .shr-lbl{opacity:0;max-width:0;transition:opacity .12s ease,max-width .38s cubic-bezier(.22,1,.36,1)}
.shr-side .shr-nav a,.shr-side .shr-prof,.shr-side .shr-brow,.shr-side .shr-sair{transition:padding .38s cubic-bezier(.22,1,.36,1),gap .38s cubic-bezier(.22,1,.36,1),background .2s,border-color .2s,color .2s,transform .25s cubic-bezier(.22,1,.36,1)}
.shr-side.shr-col .shr-nav a{padding:0 19px!important;gap:0!important}
.shr-side.shr-col .shr-prof{padding:6px!important;gap:0!important}
.shr-side.shr-col .shr-brow{flex-direction:column}
.shr-side.shr-col .shr-brow>button,.shr-side.shr-col .shr-brow>a{width:100%!important;flex:none!important}
.shr-side.shr-col .shr-sair{gap:0!important}
.shr-side.shr-col .shr-pop{left:66px!important;bottom:0!important}
.shr-nav a:hover{background:rgba(255,255,255,.08)}
.shr-prof:hover{transform:translateY(-2px);border-color:rgba(241,194,50,.6);background:linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.06))!important}
.shr-sbtn:hover{background:rgba(255,255,255,.12)!important}
.shr-sair:hover{background:#E5484D!important;border-color:#E5484D!important;color:#FFFFFF!important}
.shr-opt:hover{filter:brightness(.98)}
.shr-sbcol{transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s}
.shr-sbcol:hover{transform:scale(1.1);box-shadow:0 0 0 4px rgba(91,63,208,.22),0 6px 14px -4px rgba(20,8,60,.6)}
.shr-sbcol-ico{transition:transform .38s cubic-bezier(.22,1,.36,1)}
.shr-pop{animation:shr-popUp .2s cubic-bezier(.2,.8,.2,1) both;transform-origin:20% 100%}
@keyframes shr-popUp{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}
.shr-pop-menu{animation:shr-ntin .22s cubic-bezier(.22,1,.36,1)}
@keyframes shr-ntin{from{opacity:0;transform:translateY(-8px) scale(.98)}}
.shr-fade{animation:shr-f .2s ease both}@keyframes shr-f{from{opacity:0}}
.shr-pmi:hover{background:var(--surface2)}
.shr-bell:hover{transform:translateY(-1px)}
.shr-hs::-webkit-scrollbar{display:none}
.shr-bbp{animation:shr-bbin .3s cubic-bezier(.22,1,.36,1) both;transform-origin:50% 100%}
@keyframes shr-bbin{from{opacity:0;transform:translateY(14px) scale(.96)}}
.shr-bbi{animation:shr-bbit .34s cubic-bezier(.22,1,.36,1) both;transition:background .15s}
.shr-bbi:hover{background:var(--surface2)}
@keyframes shr-bbit{from{opacity:0;transform:translateY(8px)}}
.shr-bbo{animation:shr-bbfade .25s ease both}@keyframes shr-bbfade{from{opacity:0}}
.shr-bbt{transition:background .2s,transform .15s}
.shr-bbt:active{transform:scale(.94)}
.shr-cta:hover{filter:brightness(1.08)}
/* Áreas não-home: padding do conteúdo (desktop). A home fica full-bleed. */
.shr-main-pad{padding:24px 28px 40px}
/* COLISAO --muted: a raiz do shell injeta os tokens internos (--muted = texto cinza da marca, ex. #6E6886),
   que vazam para componentes shadcn do conteudo (ex.: o runner do quiz usa bg-muted e ficava com fundo roxo).
   Aqui RESTAURAMOS o --muted do shadcn SO no conteudo (.shr-main); as paginas internas reaplicam seus tokens
   no proprio root, entao nao sao afetadas. */
.shr-main{--muted:oklch(0.97 0.004 300)}
.dark .shr-main{--muted:oklch(0.27 0.015 300)}

/* FAIXA CINZA no rodape (dark): o body usa bg-background (cinza shadcn), mas o fundo interno e roxo
   (--bg). Quando o conteudo rola, o cinza do body aparecia atras do shell. Enquanto o shell esta
   montado, alinhamos o fundo do body ao --bg da marca (claro/escuro). */
body:has(.shr-root){background:#F5F3FC}
.dark body:has(.shr-root){background:#0E0A24}

/* mobile: esconde sidebar + topbar desktop, mostra topbar mobile + downbar */
.shr-topbar-mobile{display:none}
.shr-downbar{display:none}
@media (max-width:640px){
  .shr-side{display:none!important}
  .shr-topbar{display:none!important}
  .shr-topbar-mobile{display:flex!important}
  .shr-downbar{display:block}
  .shr-main{padding-bottom:92px}
  .shr-main-pad{padding:14px 14px 100px}
}
@media (prefers-reduced-motion: reduce){
  .shr-root *,.shr-root *::before,.shr-root *::after{animation:none!important;transition:none!important}
}
`}</style>
  )
}
