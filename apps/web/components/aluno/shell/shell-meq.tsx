'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SHELL DA MARCA MEQ (Fase 3 do redesign) — spec 03 §2.5 / §2.6 / §2.7.
// ─────────────────────────────────────────────────────────────────────────────
//
// Chrome da área do aluno para o tenant MEQ:
//   • Desktop: RAIL 96px fixo à esquerda (logo caixa + 8 itens verticais) + TOP BAR
//     76px (título da página + data por extenso real + busca + Foco + XP + sino).
//   • Mobile: header 62px + TAB BAR 5 itens com marcador ciano.
//   • 3 temas (Claro / Azul / Escuro / Sistema) — o "azul" é EXCLUSIVO da MEQ.
//
// NÃO toca em layout.tsx, aluno-sidebar, aluno-mobile-nav nem shell-vnd. Consome o
// contrato de `./types.ts`. O conteúdo da página chega por `children`.
//
// Tokens: usa EXCLUSIVAMENTE os tokens curtos do mockup (lib/brand/brand-tokens.ts),
// aplicados como CSS vars no wrapper `.app`. Sem hex fora de marca (as cores "cyan"
// e "#F2A93B" do XP vêm dos próprios tokens/constantes do mockup).

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import { useTheme } from 'next-themes'
import {
  Home, ClipboardList, Library, Gavel, CalendarDays, Lightbulb, BookOpen, Trophy,
  LogOut, Search, Moon, Sun, Monitor, Bell, Zap,
  BarChart3, User, Check, ChevronRight, SlidersHorizontal, Settings2, Type,
  type LucideIcon,
} from 'lucide-react'
import { getBrandTokens } from '@/lib/brand/brand-tokens'
import {
  FONT_SCALE_LEVELS, FONT_SCALE_DEFAULT, lerEscala, salvarEscala, aplicarEscala, nivelDe,
} from '@/lib/font-scale'
import { primeAppearance } from '@/lib/brand/use-appearance'
import { avatarPadraoDe } from '@/lib/aluno/avatar-padrao'
import { cn } from '@/lib/utils'
import type { AlunoShellProps, AlunoNavItem } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Ícones — mapa nome(lucide kebab/pascal) → componente. Reusa os ícones da
// sidebar atual (aluno-sidebar.tsx) para os mesmos itens canônicos (spec §2.1).
// O `icon` do AlunoNavItem pode vir em kebab-case ou PascalCase; normalizamos.
// ─────────────────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, LucideIcon> = {
  home: Home,
  clipboardlist: ClipboardList,
  clip: ClipboardList,
  library: Library,
  books: Library,
  gavel: Gavel,
  calendardays: CalendarDays,
  cal: CalendarDays,
  lightbulb: Lightbulb,
  bulb: Lightbulb,
  bookopen: BookOpen,
  book: BookOpen,
  trophy: Trophy,
}

function iconDe(nome: string): LucideIcon {
  const k = nome.replace(/[-_\s]/g, '').toLowerCase()
  return ICON_MAP[k] ?? Home
}

// ─────────────────────────────────────────────────────────────────────────────
// Data por extenso REAL (horário de Brasília, UTC−3). Ex.: "Sábado, 3 de outubro".
// Segue o padrão do mockup (dia da semana capitalizado + dia + mês). Usa o mesmo
// offset fixo UTC−3 de @/lib/brt (o Brasil não tem horário de verão desde 2019).
// ─────────────────────────────────────────────────────────────────────────────
function dataPorExtensoBrt(): string {
  const agoraBrt = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  })
  const txt = fmt.format(agoraBrt) // ex.: "sábado, 3 de outubro"
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Temas da MEQ. next-themes só conhece 'light'/'dark' (Providers), então o 3º tema
// ('azul') é gerido AQUI: classe `.theme-azul` no wrapper + persistência própria.
// RISCO documentado no relatório de entrega.
// ─────────────────────────────────────────────────────────────────────────────
type TemaMeq = 'claro' | 'azul' | 'escuro' | 'sistema'
const CHAVE_TEMA_MEQ = 'meq:tema'

export function ShellMEQ({ brand, nav, usuario, pathname, logoUrl, children }: AlunoShellProps) {
  // Semeia a aparência (marca MEQ) SÍNCRONA no 1º render: quando o PlatformLoader for montado numa
  // transição do portal (ex.: saída/logout), ele resolve a marca certa de imediato — sem piscar o
  // roxo da Revisão enquanto /api/public/appearance não volta (spec 02 §3.3). Idempotente.
  primeAppearance({ brand: 'meq' })

  // next-themes continua sendo a fonte de verdade de claro/escuro (e system).
  const { theme: ntTheme, setTheme: setNtTheme, resolvedTheme } = useTheme()

  // Tema MEQ efetivo (inclui 'azul'). Hidrata do localStorage no mount.
  const [temaMeq, setTemaMeq] = useState<TemaMeq>('claro')
  const [montado, setMontado] = useState(false)
  useEffect(() => {
    setMontado(true)
    // Tema AZUL DESATIVADO para o aluno: limpa qualquer azul já salvo e nunca mais o aplica.
    try {
      if (localStorage.getItem(CHAVE_TEMA_MEQ) === 'azul') localStorage.removeItem(CHAVE_TEMA_MEQ)
    } catch { /* ignore */ }
    // Espelha o next-themes (claro/escuro/sistema).
    if (ntTheme === 'dark') setTemaMeq('escuro')
    else if (ntTheme === 'system') setTemaMeq('sistema')
    else setTemaMeq('claro')
  }, [ntTheme])

  // Aplica o tema escolhido. 'azul' NÃO existe no next-themes → forçamos light no
  // next-themes (para shadcn/base ficarem no claro) e marcamos `.theme-azul` no
  // wrapper. Claro/Escuro/Sistema seguem direto no next-themes.
  function aplicarTema(t: TemaMeq) {
    setTemaMeq(t)
    try {
      if (t === 'azul') localStorage.setItem(CHAVE_TEMA_MEQ, 'azul')
      else localStorage.removeItem(CHAVE_TEMA_MEQ)
    } catch { /* ignore */ }
    if (t === 'azul') setNtTheme('light')
    else if (t === 'escuro') setNtTheme('dark')
    else if (t === 'sistema') setNtTheme('system')
    else setNtTheme('light')
  }

  // Tema "concreto" para resolver os TOKENS do mockup. 'sistema' cai em claro/escuro
  // conforme o resolvedTheme do next-themes.
  const temaConcreto: 'claro' | 'azul' | 'escuro' = useMemo(() => {
    if (temaMeq === 'azul') return 'azul'
    if (temaMeq === 'escuro') return 'escuro'
    if (temaMeq === 'sistema') return resolvedTheme === 'dark' ? 'escuro' : 'claro'
    return 'claro'
  }, [temaMeq, resolvedTheme])

  // Tokens curtos do mockup (--rail, --top, --cyan…) aplicados no wrapper `.app`.
  // Memoizado por tema concreto: troca de tema recomputa só quando muda de verdade
  // (evita novo objeto a cada render e re-render do subtree → troca instantânea).
  const tokens = useMemo(() => getBrandTokens('meq', temaConcreto) ?? {}, [temaConcreto])
  const styleVars = useMemo(() => {
    const o: Record<string, string> = {}
    for (const [k, v] of Object.entries(tokens)) o[`--${k}`] = v
    return o as React.CSSProperties
  }, [tokens])

  // Rota REATIVA (client-side): o `pathname`/`nav[].ativo` do servidor congelam no "Início" porque o
  // layout (server component) não re-renderiza na navegação soft. usePathname() reflete a rota real.
  const pular = usePathname() || (pathname ?? '')
  const ehAtivo = (href: string) => (href === '/aluno' ? pular === '/aluno' : pular.startsWith(href))
  const tituloPagina = useMemo(() => tituloDaPagina(nav, pular), [nav, pular])

  // ── Menus (tema / fonte / notificações / conta) — abertos um por vez. ──────
  const [menuTema, setMenuTema] = useState(false)
  const [menuFonte, setMenuFonte] = useState(false)
  const [notifAberta, setNotifAberta] = useState(false)
  // Posição do menu da conta: fechado (null) ou aberto ancorado no rail/top (desktop) ou no header mobile.
  const [menuConta, setMenuConta] = useState<null | 'desktop' | 'mobile'>(null)

  // Estado das notificações elevado ao shell (fonte: MOCK por ora) para o SINO refletir "não lidas"
  // AO VIVO e ficar SEM bolinha quando não há nada (spec §2.7). O painel edita o MESMO estado.
  const [notifLidas, setNotifLidas] = useState<Record<string, boolean>>({})
  const [notifRemovidas, setNotifRemovidas] = useState<Record<string, boolean>>({})
  const notifNaoLidas = MOCK_NOTIFS.filter((n) => !notifRemovidas[n.id] && !(n.lida || notifLidas[n.id])).length

  // Abrir um menu global fecha os outros (spec §2.6/§2.7: sino ↔ conta ↔ tema ↔ fonte mutuamente exclusivos).
  function abrirTema() { setNotifAberta(false); setMenuConta(null); setMenuFonte(false); setMenuTema((v) => !v) }
  function abrirFonte() { setNotifAberta(false); setMenuConta(null); setMenuTema(false); setMenuFonte((v) => !v) }
  function abrirNotif() { setMenuTema(false); setMenuFonte(false); setMenuConta(null); setNotifAberta((v) => !v) }
  function abrirConta(onde: 'desktop' | 'mobile') {
    setMenuTema(false); setMenuFonte(false); setNotifAberta(false)
    setMenuConta((v) => (v === onde ? null : onde))
  }

  return (
    <div
      className={cn('app min-h-screen', temaMeq === 'azul' && 'theme-azul')}
      style={{
        ...styleVars,
        background: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: "'Sora', var(--font-sans, sans-serif)",
        display: 'flex',
      }}
      data-brand={brand}
      data-tema={temaConcreto}
    >
      {/* prefers-reduced-motion: desliga animações/transições (spec §1.4). */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap');
        @media (prefers-reduced-motion: reduce) {
          .meq-shell *, .meq-shell *::before, .meq-shell *::after {
            animation: none !important; transition: none !important;
          }
        }
        /* "Sair" em tons de vermelho no hover/clique (igual ao shell novo do Revisão: .shr-sair). */
        .meq-sair { transition: background .18s, border-color .18s, color .18s; }
        .meq-sair:hover  { background:#E5484D !important; border-color:#E5484D !important; color:#FFFFFF !important; }
        .meq-sair:active { background:#CF3E42 !important; border-color:#CF3E42 !important; color:#FFFFFF !important; }
        /* Opção "Sair" no menu da conta: realce vermelho no hover e mais forte no clique. */
        .meq-sair-row:hover  { background:rgba(229,72,77,.12) !important; }
        .meq-sair-row:active { background:rgba(229,72,77,.22) !important; }
      `}</style>

      <div className="meq-shell contents">
        {/* ══════════════════ RAIL (desktop ≥ lg) ══════════════════ */}
        <aside
          className="sticky top-0 hidden h-screen w-24 shrink-0 flex-col lg:flex"
          style={{ background: 'var(--rail)', borderRight: '1px solid var(--railLine)' }}
        >
          <div className="flex h-full flex-col items-stretch gap-1.5 px-3 py-5">
            {/* Logo caixa MEQ */}
            <Link href="/aluno" aria-label="Início" className="flex justify-center pb-3.5">
              <LogoCaixaMeq logoUrl={logoUrl} />
            </Link>

            {/* 8 itens verticais (ícone + rótulo curto). Ativo = fundo railAct +
                3 quadradinhos ciano à esquerda. `title` = rótulo longo. */}
            <nav className="flex flex-col gap-1">
              {nav.map((item) => (
                <RailItem key={item.href} item={item} ativo={ehAtivo(item.href)} />
              ))}
            </nav>

            {/* Rodapé: Tema / Fonte / Sair + avatar (abre o menu da conta) com anel ciano. */}
            <div className="mt-auto flex flex-col items-center gap-2">
              <BotaoTemaRail onClick={abrirTema} aberto={menuTema} />
              <BotaoFonteRail onClick={abrirFonte} aberto={menuFonte} />
              <BotaoSairRail />
              <div className="mt-1.5">
                <AvatarMeq
                  usuario={usuario}
                  tamanho={40}
                  onClick={() => abrirConta('desktop')}
                  aberto={menuConta === 'desktop'}
                />
              </div>
            </div>
          </div>
        </aside>

        {/* ══════════════════ COLUNA DE CONTEÚDO ══════════════════ */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* ── TOP BAR (desktop ≥ lg) ── */}
          <header
            className="sticky top-0 z-20 hidden items-center gap-5 px-8 lg:flex"
            style={{
              height: 76,
              background: 'var(--top)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderBottom: '1px solid var(--railLine)',
            }}
          >
            {/* Título da página + data por extenso real */}
            <div className="leading-tight">
              <b
                className="block text-[18px] font-bold tracking-[-0.03em]"
                style={{ color: 'var(--topInk)' }}
              >
                {tituloPagina}
              </b>
              <DataExtenso />
            </div>

            {/* Busca (placeholder funcional; TODO: ligar ao comando de busca real) */}
            <div
              className="ml-6 flex h-11 max-w-[480px] flex-1 items-center gap-2.5 rounded-xl px-3.5 text-[13px]"
              style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--muted)' }}
            >
              <Search className="h-[17px] w-[17px]" />
              <span className="flex-1 truncate">Buscar por banca, órgão, cargo…</span>
              <kbd
                className="rounded-md px-1.5 py-0.5 text-[11px]"
                style={{ background: 'var(--surface2)', border: '1px solid var(--line)' }}
              >
                Ctrl K
              </kbd>
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              {/* Chip XP — só com gamificação ligada p/ este aluno (off esconde). */}
              {usuario.gamAtivo !== false && (
                <span
                  className="inline-flex h-10 items-center gap-1.5 rounded-[11px] px-3 text-[12.5px] font-bold"
                  style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)' }}
                >
                  <Zap className="h-[15px] w-[15px]" style={{ color: '#F2A93B' }} />
                  {usuario.xpTotal.toLocaleString('pt-BR')} XP
                </span>
              )}

              {/* Sino — abre a central de notificações MEQ (§2.7). */}
              <BotaoSino onClick={abrirNotif} aberto={notifAberta} temNaoLidas={notifNaoLidas > 0} />
            </div>
          </header>

          {/* ── HEADER MOBILE (< lg) ── */}
          <header
            className="sticky top-0 z-20 flex items-center gap-3 px-4 lg:hidden"
            style={{
              height: 62,
              background: 'var(--top)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderBottom: '1px solid var(--railLine)',
            }}
          >
            <Link href="/aluno" aria-label="Início" className="flex items-center gap-2">
              <LogoCaixaMeq compacto logoUrl={logoUrl} />
              <span className="text-[15px] font-extrabold tracking-[-0.03em]" style={{ color: 'var(--topInk)' }}>
                MEQ
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Buscar"
                className="flex h-9 w-9 items-center justify-center rounded-[11px]"
                style={{ color: 'var(--topInk)' }}
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
              <BotaoSino onClick={abrirNotif} aberto={notifAberta} temNaoLidas={notifNaoLidas > 0} mobile />
              <AvatarMeq
                usuario={usuario}
                tamanho={34}
                onClick={() => abrirConta('mobile')}
                aberto={menuConta === 'mobile'}
              />
            </div>
          </header>

          {/* Conteúdo da página. pb no mobile p/ não ficar sob a tab bar. */}
          <main className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>
        </div>

        {/* ══════════════════ TAB BAR (mobile < lg) ══════════════════ */}
        <TabBarMeq nav={nav} pathname={pular} />
      </div>

      {/* ── Menu de TEMA (3 temas + sistema) — portalado p/ escapar do rail ── */}
      {menuTema && montado && createPortal(
        <MenuTema
          atual={temaMeq}
          onEscolher={(t) => { aplicarTema(t); setMenuTema(false) }}
          onFechar={() => setMenuTema(false)}
        />,
        document.body,
      )}

      {/* ── Menu de FONTE (tamanho do texto) — mesmo padrão lateral do tema (abre à direita do rail) ── */}
      {menuFonte && montado && createPortal(
        <MenuFonte onFechar={() => setMenuFonte(false)} />,
        document.body,
      )}

      {/* ── Menu da conta (avatar) — estilo MEQ (spec §2.6): raio 14, sem gradiente roxo,
          "Nível · XP" no lugar do e-mail, Tema/Fonte/Ver perfil/Configurações/Sair. ── */}
      {menuConta && montado && createPortal(
        <MenuConta
          variante={menuConta}
          usuario={usuario}
          temaAtual={temaMeq}
          onTema={(t) => aplicarTema(t)}
          onFechar={() => setMenuConta(null)}
        />,
        document.body,
      )}

      {/* ── Central de notificações — estilo MEQ (spec §2.7). ── */}
      {notifAberta && montado && createPortal(
        <CentralNotificacoesMeq
          lidas={notifLidas} setLidas={setNotifLidas}
          removidas={notifRemovidas} setRemovidas={setNotifRemovidas}
          onFechar={() => setNotifAberta(false)}
        />,
        document.body,
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Título da página derivado do nav ativo / pathname (spec §2.5: título na top bar).
// ─────────────────────────────────────────────────────────────────────────────
function tituloDaPagina(nav: AlunoNavItem[], pathname: string): string {
  const ativo = nav.find((n) => (n.href === '/aluno' ? pathname === '/aluno' : pathname.startsWith(n.href)))
  if (ativo) return ativo.label
  // Fallback por pathname: casa o item com o href mais específico.
  const candidatos = nav
    .filter((n) => pathname === n.href || pathname.startsWith(n.href + '/') || pathname.startsWith(n.href))
    .sort((a, b) => b.href.length - a.href.length)
  return candidatos[0]?.label ?? 'Início'
}

// ─────────────────────────────────────────────────────────────────────────────
// Item do rail (desktop). Ativo = fundo railAct + 3 quadradinhos ciano à esquerda.
// ─────────────────────────────────────────────────────────────────────────────
function RailItem({ item, ativo }: { item: AlunoNavItem; ativo: boolean }) {
  const Icone = iconDe(item.icon)
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={ativo ? 'page' : undefined}
      className="relative flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center text-[10px] font-semibold transition-colors"
      style={{
        background: ativo ? 'var(--railAct)' : 'transparent',
        color: ativo ? '#FFFFFF' : 'var(--railInk)',
      }}
    >
      <Icone className="h-5 w-5" />
      <span className="leading-none">{item.short}</span>
      {ativo && (
        <span className="absolute left-[-12px] top-1/2 -mt-[9px] flex flex-col gap-0.5" aria-hidden>
          <span className="h-1 w-1 rounded-[1px]" style={{ background: 'var(--cyan)' }} />
          <span className="h-1 w-1 rounded-[1px]" style={{ background: 'var(--cyan)', opacity: 0.7 }} />
          <span className="h-1 w-1 rounded-[1px]" style={{ background: 'var(--cyan)', opacity: 0.45 }} />
        </span>
      )}
      {item.badge && (
        <span
          className="absolute right-1 top-1 rounded-full px-1 text-[9px] font-bold"
          style={{ background: 'var(--cyan)', color: 'var(--rail)' }}
        >
          {item.badge}
        </span>
      )}
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab bar mobile — 5 itens com marcador ciano. Slots fixos (spec §2.5):
// Início · Buscar · Simulados · Desempenho · Perfil. Em Recomendado o slot 2 vira
// "Para você". O item ativo ganha pílula + rótulo em CAIXA ALTA + 3 traços ciano.
// ─────────────────────────────────────────────────────────────────────────────
interface SlotTab { label: string; href: string; icon: LucideIcon }

function TabBarMeq({ nav, pathname }: { nav: AlunoNavItem[]; pathname: string }) {
  const href = (frag: string, fb: string) => nav.find((n) => n.href.endsWith(frag))?.href ?? fb
  const emRecomendado = pathname.includes('/recomendado')

  const slots: SlotTab[] = [
    { label: 'Início', href: href('/aluno', '/aluno'), icon: Home },
    emRecomendado
      ? { label: 'Para você', href: href('recomendado', '/aluno/recomendado'), icon: Lightbulb }
      : { label: 'Buscar', href: href('questoes', '/aluno/questoes'), icon: Search },
    { label: 'Simulados', href: href('simulados', '/aluno/simulados'), icon: ClipboardList },
    { label: 'Desempenho', href: href('ligas', '/aluno/ligas'), icon: BarChart3 },
    { label: 'Perfil', href: '/aluno/perfil', icon: User },
  ]

  const ativoDoSlot = (s: SlotTab) =>
    s.href === '/aluno' ? pathname === '/aluno' : pathname.startsWith(s.href)

  return (
    <nav
      aria-label="Navegação"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 lg:hidden"
      style={{
        height: 72,
        background: 'var(--rail)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderTop: '1px solid var(--railLine)',
      }}
    >
      {slots.map((s) => {
        const ativo = ativoDoSlot(s)
        const Icone = s.icon
        return (
          <Link
            key={s.label}
            href={s.href}
            aria-label={s.label}
            aria-current={ativo ? 'page' : undefined}
            className="relative flex flex-col items-center justify-center gap-1.5 text-[10px] font-bold tracking-[0.04em]"
            style={{ color: ativo ? '#FFFFFF' : 'var(--railInk)' }}
          >
            {ativo && (
              <span className="absolute left-1/2 top-0 -ml-[18px] flex gap-[3px]" aria-hidden>
                <span className="h-[3px] w-2.5" style={{ background: 'var(--cyan)', opacity: 0.45 }} />
                <span className="h-[3px] w-2.5" style={{ background: 'var(--cyan)', opacity: 0.7 }} />
                <span className="h-[3px] w-2.5" style={{ background: 'var(--cyan)' }} />
              </span>
            )}
            <span
              className="inline-flex h-8 w-10 items-center justify-center rounded-[9px]"
              style={{ background: ativo ? 'rgba(94,206,240,.16)' : 'transparent' }}
            >
              <Icone className="h-[19px] w-[19px]" />
            </span>
            {ativo && <span className="uppercase">{s.label}</span>}
          </Link>
        )
      })}
    </nav>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Botões do rodapé do rail.
// ─────────────────────────────────────────────────────────────────────────────
function BotaoTemaRail({ onClick, aberto }: { onClick: () => void; aberto: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Tema"
      aria-expanded={aberto}
      className="inline-flex h-10 w-10 items-center justify-center rounded-[11px] transition-colors"
      style={{ border: '1px solid var(--railLine)', background: 'transparent', color: 'var(--railInk)' }}
    >
      <Moon className="h-[17px] w-[17px]" />
    </button>
  )
}

// Botão de FONTE — idêntico ao de tema (quadradinho 40 com borda), ícone "T" (Type).
// Abre o MenuFonte lateral (mesmo padrão do tema), em vez do FontScaleControl genérico.
function BotaoFonteRail({ onClick, aberto }: { onClick: () => void; aberto: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Tamanho da fonte"
      aria-expanded={aberto}
      className="inline-flex h-10 w-10 items-center justify-center rounded-[11px] transition-colors"
      style={{ border: '1px solid var(--railLine)', background: 'transparent', color: 'var(--railInk)' }}
    >
      <Type className="h-[17px] w-[17px]" />
    </button>
  )
}

function BotaoSairRail() {
  async function sair() {
    await fetch('/api/aluno/logout', { method: 'POST' }).catch(() => {})
    window.location.href = '/aluno/entrar'
  }
  return (
    <button
      type="button"
      onClick={sair}
      aria-label="Sair"
      title="Sair"
      className="meq-sair inline-flex h-10 w-10 items-center justify-center rounded-[11px]"
      style={{ border: '1px solid var(--railLine)', background: 'transparent', color: 'var(--railInk)' }}
    >
      <LogOut className="h-[17px] w-[17px]" />
    </button>
  )
}

function BotaoSino({ onClick, aberto, temNaoLidas, mobile }: { onClick: () => void; aberto?: boolean; temNaoLidas?: boolean; mobile?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={temNaoLidas ? 'Notificações (há novas)' : 'Notificações'}
      aria-haspopup="dialog"
      aria-expanded={aberto}
      className={cn(
        'relative inline-flex items-center justify-center rounded-[11px]',
        mobile ? 'h-9 w-9' : 'h-10 w-10',
      )}
      style={
        mobile
          ? { color: 'var(--topInk)' }
          : { border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }
      }
    >
      <Bell className="h-[18px] w-[18px]" />
      {/* Ponto de aviso ciano — SÓ quando há não-lidas (spec §2.7). */}
      {temNaoLidas && (
        <span
          className="absolute right-2 top-2 h-2 w-2 rounded-full"
          style={{ background: 'var(--cyan)', boxShadow: '0 0 0 2px var(--surface)' }}
        />
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar com anel ciano — iniciais do aluno (privacidade: sem e-mail/nome completo).
// Cor do avatar do próprio usuário = #F2A93B (spec §6). Abre o MENU DA CONTA (§2.5/§2.6).
// ─────────────────────────────────────────────────────────────────────────────
function AvatarMeq({
  usuario, tamanho, onClick, aberto,
}: {
  usuario: AlunoShellProps['usuario']
  tamanho: number
  onClick: () => void
  aberto: boolean
}) {
  const fonte = usuario.avatarUrl || null
  const cor = usuario.avatarCor || '#F2A93B'
  return (
    <button
      type="button"
      onClick={onClick}
      title="Minha conta"
      aria-label="Abrir menu da conta"
      aria-haspopup="menu"
      aria-expanded={aberto}
      className="inline-flex items-center justify-center overflow-hidden rounded-full border-0 p-0 font-extrabold text-white"
      style={{
        width: tamanho,
        height: tamanho,
        fontSize: tamanho * 0.38,
        background: fonte ? '#fff' : cor,
        boxShadow: '0 0 0 2px var(--cyan)',
        cursor: 'pointer',
      }}
    >
      {fonte ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fonte || avatarPadraoDe(usuario.primeiroNome)} alt="" className="h-full w-full object-cover" />
      ) : (
        usuario.iniciais
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Logo caixa MEQ (marca). Caixa branca arredondada com a glifo da marca.
// ─────────────────────────────────────────────────────────────────────────────
function LogoCaixaMeq({ compacto, logoUrl }: { compacto?: boolean; logoUrl?: string | null }) {
  const lado = compacto ? 32 : 36

  // Logo do tenant (white-label). O asset é HORIZONTAL (monograma à esquerda + marca secundária/vazio
  // à direita); recortamos ao monograma via container estreito + overflow + imagem alinhada à esquerda.
  // Caixa branca atrás = contraste do azul da marca sobre o rail escuro (o asset é transparente).
  if (logoUrl) {
    const larg = compacto ? 42 : 52
    return (
      <span
        className="inline-flex items-center overflow-hidden"
        style={{ width: larg, height: lado, borderRadius: lado * 0.26, background: '#FFFFFF' }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt=""
          style={{ height: lado, width: 'auto', maxWidth: 'none', flexShrink: 0, display: 'block', objectFit: 'contain', objectPosition: 'left center', paddingLeft: 2 }}
        />
      </span>
    )
  }

  // Fallback (tenant sem logo): caixa branca com a inicial da marca.
  return (
    <span
      className="inline-flex items-center justify-center font-extrabold"
      style={{
        width: lado,
        height: lado,
        borderRadius: lado * 0.28,
        background: '#FFFFFF',
        color: 'var(--brand)',
        fontSize: lado * 0.42,
        letterSpacing: '-0.04em',
      }}
      aria-hidden
    >
      M
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Data por extenso — client-only (evita mismatch SSR, já que depende do "agora").
// ─────────────────────────────────────────────────────────────────────────────
function DataExtenso() {
  const [data, setData] = useState('')
  useEffect(() => { setData(dataPorExtensoBrt()) }, [])
  return (
    <span className="text-[12px]" style={{ color: 'var(--topMuted)' }} suppressHydrationWarning>
      {data || ' '}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu de TEMA — Claro / Azul / Escuro / Sistema (spec §2.5 / §2.6). O "azul" é o
// 3º tema exclusivo da MEQ. Ancorado no canto inferior-esquerdo (junto ao rail).
// ─────────────────────────────────────────────────────────────────────────────
// Tema AZUL desativado para o aluno (fica fora das opções; a máquina do azul permanece no código
// para preview admin / reativação futura, mas o aluno não consegue selecioná-lo).
const OPCOES_TEMA: { chave: TemaMeq; rotulo: string; icon: LucideIcon }[] = [
  { chave: 'claro', rotulo: 'Claro', icon: Sun },
  { chave: 'escuro', rotulo: 'Escuro', icon: Moon },
  { chave: 'sistema', rotulo: 'Sistema', icon: Monitor },
]

function MenuTema({
  atual, onEscolher, onFechar,
}: { atual: TemaMeq; onEscolher: (t: TemaMeq) => void; onFechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onFechar() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onFechar])

  return (
    <>
      <div className="fixed inset-0 z-[90] lg:hidden" style={{ background: 'rgba(10,17,36,.35)' }} onClick={onFechar} />
      <div
        ref={ref}
        role="menu"
        aria-label="Tema"
        className="app fixed z-[95] w-56 overflow-hidden rounded-2xl p-2 shadow-2xl"
        style={{
          // Aparece À DIREITA do rail (w-24 = 96px), não por cima dos itens.
          left: 104, bottom: 20,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          animation: 'meqTemaIn .18s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <style>{`@keyframes meqTemaIn{from{opacity:0;transform:translateY(8px) scale(.98)}}@media (prefers-reduced-motion:reduce){[role=menu]{animation:none!important}}`}</style>
        <div className="px-2 pb-1.5 pt-1 text-[10.5px] font-extrabold uppercase tracking-[0.16em]" style={{ color: 'var(--muted)' }}>
          Tema
        </div>
        {OPCOES_TEMA.map((o) => {
          const Icone = o.icon
          const sel = atual === o.chave
          return (
            <button
              key={o.chave}
              type="button"
              role="menuitemradio"
              aria-checked={sel}
              onClick={() => onEscolher(o.chave)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors"
              style={{
                background: sel ? 'var(--chip)' : 'transparent',
                color: sel ? 'var(--brand)' : 'var(--ink)',
              }}
            >
              <Icone className="h-4 w-4" />
              <span className="flex-1">{o.rotulo}</span>
              {sel && (
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--cyan)' }} />
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu de FONTE — Pequena / Média / Grande. Mesmo padrão lateral do MenuTema
// (abre à direita do rail, left:104/bottom:20). Reusa a escala global de fonte
// (lib/font-scale) no mesmo escopo do menu da conta (`aluno:meq`) — ficam em sync.
// ─────────────────────────────────────────────────────────────────────────────
const NIVEIS_FONTE: { chave: number; rotulo: string; dica: string }[] = [
  { chave: 0.85, rotulo: 'Pequena', dica: 'A' },
  { chave: FONT_SCALE_DEFAULT, rotulo: 'Média', dica: 'A' },
  { chave: 1.15, rotulo: 'Grande', dica: 'A' },
]

function MenuFonte({ onFechar }: { onFechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFechaFora(ref, onFechar)

  const [idx, setIdx] = useState(1)
  useEffect(() => {
    const v = lerEscala(scopeFonteConta)
    const i = NIVEIS_FONTE.findIndex((n) => Math.abs(n.chave - v) < 0.001)
    setIdx(i >= 0 ? i : v <= NIVEIS_FONTE[0].chave ? 0 : v >= NIVEIS_FONTE[2].chave ? 2 : 1)
  }, [])

  function escolher(i: number) {
    setIdx(i)
    const v = NIVEIS_FONTE[i].chave
    aplicarEscala(v)
    salvarEscala(scopeFonteConta, v)
    window.dispatchEvent(new CustomEvent('plt:fontscale', { detail: v }))
  }

  return (
    <>
      <div className="fixed inset-0 z-[90] lg:hidden" style={{ background: 'rgba(10,17,36,.35)' }} onClick={onFechar} />
      <div
        ref={ref}
        role="menu"
        aria-label="Tamanho da fonte"
        className="app fixed z-[95] w-56 overflow-hidden rounded-2xl p-2 shadow-2xl"
        style={{
          left: 104, bottom: 20,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          animation: 'meqTemaIn .18s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <style>{`@keyframes meqTemaIn{from{opacity:0;transform:translateY(8px) scale(.98)}}@media (prefers-reduced-motion:reduce){[role=menu]{animation:none!important}}`}</style>
        <div className="px-2 pb-1.5 pt-1 text-[10.5px] font-extrabold uppercase tracking-[0.16em]" style={{ color: 'var(--muted)' }}>
          Tamanho da fonte
        </div>
        {NIVEIS_FONTE.map((o, i) => {
          const sel = idx === i
          return (
            <button
              key={o.rotulo}
              type="button"
              role="menuitemradio"
              aria-checked={sel}
              onClick={() => escolher(i)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors"
              style={{
                background: sel ? 'var(--chip)' : 'transparent',
                color: sel ? 'var(--brand)' : 'var(--ink)',
              }}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center" style={{ fontSize: 11 + i * 3, fontWeight: 800, lineHeight: 1 }}>
                {o.dica}
              </span>
              <span className="flex-1">{o.rotulo}</span>
              {sel && (
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--cyan)' }} />
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook comum: fecha o menu/painel ao clicar fora (do ref) ou apertar Esc.
// ─────────────────────────────────────────────────────────────────────────────
function useFechaFora(ref: React.RefObject<HTMLElement | null>, onFechar: () => void) {
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onFechar() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [ref, onFechar])
}

// ─────────────────────────────────────────────────────────────────────────────
// MENU DA CONTA (avatar) — estilo MEQ (spec §2.6). Raio 14, SEM gradiente roxo
// (cabeçalho em superfície clara da marca MEQ). Mostra "Nível · XP" (nunca e-mail),
// segmentado de Tema (Claro/Azul/Escuro/Sistema) e de Tamanho da fonte (Pequena/
// Média/Grande), e os links Ver perfil / Configurações / Sair.
// ─────────────────────────────────────────────────────────────────────────────
function MenuConta({
  variante, usuario, temaAtual, onTema, onFechar,
}: {
  variante: 'desktop' | 'mobile'
  usuario: AlunoShellProps['usuario']
  temaAtual: TemaMeq
  onTema: (t: TemaMeq) => void
  onFechar: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useFechaFora(ref, onFechar)

  // Tamanho da fonte (3 segmentos → níveis canônicos da escala global, compartilhada com o
  // FontScaleControl do rail). Pequena=0.85, Média=1 (padrão), Grande=1.15.
  const NIVEIS_FS = [FONT_SCALE_LEVELS.indexOf(0.85), FONT_SCALE_LEVELS.indexOf(FONT_SCALE_DEFAULT), FONT_SCALE_LEVELS.indexOf(1.15)]
    .map((i) => (i < 0 ? 0 : i))
  const [fsIdx, setFsIdx] = useState(1)
  useEffect(() => {
    const atual = nivelDe(lerEscala(scopeFonteConta))
    const i = NIVEIS_FS.findIndex((n) => n === atual)
    setFsIdx(i >= 0 ? i : atual <= NIVEIS_FS[0] ? 0 : atual >= NIVEIS_FS[2] ? 2 : 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function aplicarFonte(i: number) {
    setFsIdx(i)
    const v = FONT_SCALE_LEVELS[NIVEIS_FS[i]]
    aplicarEscala(v)
    salvarEscala(scopeFonteConta, v)
    window.dispatchEvent(new CustomEvent('plt:fontscale', { detail: v }))
  }

  const pos: React.CSSProperties =
    variante === 'desktop'
      ? { right: 24, top: 72, width: 320 }
      : { left: 10, right: 10, top: 66 }

  // Índice do tema no segmentado (Claro/Azul/Escuro/Sistema).
  const temas: { chave: TemaMeq; rotulo: string; icon: LucideIcon }[] = [
    { chave: 'claro', rotulo: 'Claro', icon: Sun },
    { chave: 'escuro', rotulo: 'Escuro', icon: Moon },
    { chave: 'sistema', rotulo: 'Sistema', icon: Monitor },
  ]

  return (
    <>
      <div
        className="fixed inset-0 z-[90]"
        style={{ background: variante === 'desktop' ? 'transparent' : 'rgba(10,17,36,.35)' }}
        onClick={onFechar}
        aria-hidden
      />
      <div
        ref={ref}
        role="menu"
        aria-label="Menu da conta"
        className="app fixed z-[95] overflow-hidden"
        data-brand="meq"
        style={{
          ...pos,
          borderRadius: 14,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: '0 24px 48px -18px rgba(11,17,36,.45)',
          animation: 'meqMenuIn .22s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <style>{`@keyframes meqMenuIn{from{opacity:0;transform:translateY(-8px) scale(.98)}}@media (prefers-reduced-motion:reduce){[role=menu]{animation:none!important}}`}</style>

        {/* Cabeçalho (sem gradiente roxo): avatar + nome + "Nível · XP" + selo PRO. */}
        <div className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <span
            className="inline-flex items-center justify-center overflow-hidden rounded-full font-extrabold text-white"
            style={{ width: 44, height: 44, fontSize: 17, background: usuario.avatarUrl ? '#fff' : (usuario.avatarCor || '#F2A93B'), boxShadow: '0 0 0 2px var(--cyan)' }}
          >
            {usuario.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={usuario.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : usuario.iniciais}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <b className="block truncate text-[15px]" style={{ color: 'var(--ink)' }}>{usuario.primeiroNome}</b>
            <span className="text-[12px]" style={{ color: 'var(--muted)' }}>
              {usuario.gamAtivo !== false
                ? `Nível ${usuario.nivel} · ${usuario.xpTotal.toLocaleString('pt-BR')} XP`
                : 'Área do aluno'}
            </span>
          </div>
          <span
            className="inline-flex items-center rounded-full px-2 text-[10.5px] font-extrabold"
            style={{ height: 22, background: 'var(--chip)', color: 'var(--brand)' }}
          >
            PRO
          </span>
        </div>

        {/* Tema (4 opções) + Tamanho da fonte (3). */}
        <div className="px-3.5 pt-3.5">
          <RotuloSecao>Tema do sistema</RotuloSecao>
          <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--surface2)' }}>
            {temas.map((t) => (
              <SegBtn key={t.chave} ativo={temaAtual === t.chave} onClick={() => onTema(t.chave)}>
                <t.icon className="h-3.5 w-3.5" />
                <span>{t.rotulo}</span>
              </SegBtn>
            ))}
          </div>

          <div className="h-3.5" />

          <RotuloSecao>Tamanho da fonte</RotuloSecao>
          <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--surface2)' }}>
            {(['Pequena', 'Média', 'Grande'] as const).map((rot, i) => (
              <SegBtn key={rot} ativo={fsIdx === i} onClick={() => aplicarFonte(i)}>
                <span style={{ fontSize: 11 + i * 2, fontWeight: 800 }}>A</span>
                <span>{rot}</span>
              </SegBtn>
            ))}
          </div>
        </div>

        {/* Links */}
        <div className="mt-2 p-1.5" style={{ borderTop: '1px solid var(--line)' }}>
          <LinkConta href="/aluno/perfil" icon={User} onFechar={onFechar}>Ver perfil</LinkConta>
          <LinkConta href="/aluno/perfil" icon={SlidersHorizontal} onFechar={onFechar}>Configurações</LinkConta>
        </div>
        <div className="p-1.5 pt-0.5" style={{ borderTop: '1px solid var(--line)' }}>
          <button
            type="button"
            role="menuitem"
            onClick={async () => { onFechar(); await fetch('/api/aluno/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/aluno/entrar' }}
            className="meq-sair-row flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-bold transition-colors"
            style={{ color: '#E5484D' }}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: 'rgba(229,72,77,.12)', color: '#E5484D' }}>
              <LogOut className="h-[15px] w-[15px]" />
            </span>
            <span className="flex-1">Sair</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  )
}

const scopeFonteConta = 'aluno:meq'

function RotuloSecao({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[10.5px] font-extrabold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>
      {children}
    </span>
  )
}

function SegBtn({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-1 text-[12px] font-bold transition-colors"
      style={{
        background: ativo ? 'var(--surface)' : 'transparent',
        color: ativo ? 'var(--ink)' : 'var(--muted)',
        boxShadow: ativo ? '0 2px 8px rgba(0,0,0,.12)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

function LinkConta({ href, icon: Icon, onFechar, children }: { href: string; icon: LucideIcon; onFechar: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onFechar}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-bold transition-colors hover:bg-[color:var(--surface2)]"
      style={{ color: 'var(--ink)' }}
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: 'var(--chip)', color: 'var(--brand)' }}>
        <Icon className="h-[15px] w-[15px]" />
      </span>
      <span className="flex-1">{children}</span>
      <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL DE NOTIFICAÇÕES — estilo MEQ (spec §2.7). Cabeçalho: 3 barrinhas da marca
// + título + selo "N novas". Abas segmentadas (Todas/Não lidas/Estudos/Simulados/
// Ranking). Itens: tile 34, barra lateral 3px --brand2 se não lida, ação = link
// "Texto ›". Rodapé "Central de notificações ›". Vista de Preferências via engrenagem.
// Dados são MOCK (spec permite stub visual); o wiring de /api fica para fase posterior.
// ─────────────────────────────────────────────────────────────────────────────
type CatNotif = 'est' | 'sim' | 'rank' | 'com'
interface ItemNotif {
  id: string; cat: CatNotif; icon: LucideIcon; titulo: string; texto: string; tempo: string; lida: boolean; grupo: 'hoje' | 'antes'; acao?: { rotulo: string; url: string }
}

const MOCK_NOTIFS: ItemNotif[] = [
  { id: 'n1', cat: 'sim', icon: ClipboardList, titulo: 'Simulado PF 2026 liberado', texto: '6 simulados no padrão Cebraspe, com ranking.', tempo: 'há 2 h', lida: false, grupo: 'hoje', acao: { rotulo: 'Ver simulados', url: '/aluno/simulados' } },
  { id: 'n2', cat: 'est', icon: Library, titulo: 'Sua trilha de hoje está pronta', texto: 'Faça o check-in da Lei Seca e ganhe +10 XP.', tempo: 'há 4 h', lida: false, grupo: 'hoje', acao: { rotulo: 'Abrir trilha', url: '/aluno/leitura' } },
  { id: 'n3', cat: 'rank', icon: Trophy, titulo: 'Você subiu para o 7º lugar', texto: 'Continue assim para alcançar o pódio da liga Ouro.', tempo: 'há 6 h', lida: false, grupo: 'hoje', acao: { rotulo: 'Ver ranking', url: '/aluno/ligas' } },
  { id: 'n4', cat: 'sim', icon: Check, titulo: 'Correção concluída', texto: 'Seu simulado TJ/SP foi corrigido: 81% de acerto.', tempo: 'ontem', lida: true, grupo: 'antes', acao: { rotulo: 'Ver resultado', url: '/aluno/simulados' } },
  { id: 'n5', cat: 'est', icon: Lightbulb, titulo: 'Recomendados para você', texto: 'Escolhemos 3 questões pelo seu desempenho.', tempo: 'há 2 dias', lida: true, grupo: 'antes', acao: { rotulo: 'Para você', url: '/aluno/recomendado' } },
  { id: 'n6', cat: 'rank', icon: Trophy, titulo: 'Nova temporada de ligas', texto: 'A temporada reinicia. Pontue para subir de divisão.', tempo: 'há 3 dias', lida: true, grupo: 'antes' },
  { id: 'n7', cat: 'est', icon: CalendarDays, titulo: 'Cronograma atualizado', texto: 'Seu plano da semana foi recalculado.', tempo: 'há 4 dias', lida: true, grupo: 'antes', acao: { rotulo: 'Ver cronograma', url: '/aluno/cronograma' } },
]

type AbaNotif = 'all' | 'unread' | 'est' | 'sim' | 'rank'
const ABAS_NOTIF: { key: AbaNotif; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Não lidas' },
  { key: 'est', label: 'Estudos' },
  { key: 'sim', label: 'Simulados' },
  { key: 'rank', label: 'Ranking' },
]

function CentralNotificacoesMeq({ lidas, setLidas, removidas, setRemovidas, onFechar }: {
  lidas: Record<string, boolean>
  setLidas: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  removidas: Record<string, boolean>
  setRemovidas: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  onFechar: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useFechaFora(ref, onFechar)

  const [aba, setAba] = useState<AbaNotif>('all')
  const [prefs, setPrefs] = useState(false)

  const itens = MOCK_NOTIFS
    .filter((n) => !removidas[n.id])
    .map((n) => ({ ...n, lida: n.lida || !!lidas[n.id] }))
  const naoLidas = itens.filter((n) => !n.lida).length
  const visiveis = itens.filter((n) => aba === 'all' || (aba === 'unread' ? !n.lida : n.cat === aba))
  const hoje = visiveis.filter((n) => n.grupo === 'hoje')
  const antes = visiveis.filter((n) => n.grupo === 'antes')

  function marcarLida(id: string) { setLidas((m) => ({ ...m, [id]: true })) }
  function marcarTodas() { setLidas(Object.fromEntries(itens.map((n) => [n.id, true]))) }

  return (
    <>
      <div className="fixed inset-0 z-[90]" style={{ background: 'rgba(10,17,36,.35)' }} onClick={onFechar} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-label="Notificações"
        className="app fixed z-[95] flex max-h-[80vh] flex-col overflow-hidden"
        data-brand="meq"
        style={{
          right: 'var(--nt-right, 24px)',
          borderRadius: 14,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: '0 24px 48px -18px rgba(11,17,36,.45)',
          animation: 'meqMenuIn .22s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <style>{`
          /* Desktop: ancorado à DIREITA (right) → abre PARA A ESQUERDA, e top abaixo da barra → abre PARA BAIXO.
             max-height trava o painel ao espaço ABAIXO da barra → a lista interna rola sempre que estoura. */
          [data-brand="meq"][role="dialog"]{ --nt-right:24px; top:84px; width:400px; left:auto; max-height:calc(100vh - 104px); }
          @media (max-width:1023px){ [data-brand="meq"][role="dialog"]{ left:10px; right:10px!important; top:66px; width:auto; max-height:calc(100dvh - 86px); } }
          @keyframes meqMenuIn{from{opacity:0;transform:translateY(-8px) scale(.98)}}
          @media (prefers-reduced-motion:reduce){[role="dialog"]{animation:none!important}}
          /* Barra de rolagem enxuta nas áreas roláveis do painel. */
          .meq-nt-scroll{ scrollbar-width:thin; scrollbar-color:var(--line2,rgba(0,0,0,.2)) transparent; overscroll-behavior:contain; }
          .meq-nt-scroll::-webkit-scrollbar{ width:8px; }
          .meq-nt-scroll::-webkit-scrollbar-thumb{ background:color-mix(in srgb,var(--muted) 35%,transparent); border-radius:99px; border:2px solid transparent; background-clip:padding-box; }
          .meq-nt-scroll::-webkit-scrollbar-thumb:hover{ background:color-mix(in srgb,var(--muted) 55%,transparent); background-clip:padding-box; }
        `}</style>

        {/* Cabeçalho: 3 barrinhas da marca + título + selo "N novas" + ações. */}
        <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3">
          <span className="inline-flex items-end gap-0.5" style={{ height: 14 }} aria-hidden>
            <span className="block w-[3px] rounded-[1px]" style={{ height: 6, background: 'var(--brand2)' }} />
            <span className="block w-[3px] rounded-[1px]" style={{ height: 10, background: 'var(--brand2)' }} />
            <span className="block w-[3px] rounded-[1px]" style={{ height: 14, background: 'var(--brand)' }} />
          </span>
          <b className="text-[15px]" style={{ color: 'var(--ink)' }}>{prefs ? 'Preferências' : 'Notificações'}</b>
          {!prefs && (
            <span
              className="inline-flex items-center rounded-full px-2 text-[11px] font-extrabold"
              style={{ height: 22, background: 'color-mix(in srgb,var(--brand2) 14%,transparent)', color: 'var(--brand2)' }}
            >
              {naoLidas ? `${naoLidas} ${naoLidas === 1 ? 'nova' : 'novas'}` : 'tudo lido'}
            </span>
          )}
          <span className="flex-1" />
          {!prefs && naoLidas > 0 && (
            <button type="button" title="Marcar todas como lidas" aria-label="Marcar todas como lidas" onClick={marcarTodas} className="inline-flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
              <Check className="h-4 w-4" />
            </button>
          )}
          <button type="button" title="Preferências" aria-label="Preferências" aria-pressed={prefs} onClick={() => setPrefs((v) => !v)} className="inline-flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: prefs ? 'var(--chip)' : 'var(--surface2)', color: prefs ? 'var(--brand)' : 'var(--muted)' }}>
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

        {prefs ? (
          <PreferenciasNotif />
        ) : (
          <>
            {/* Abas segmentadas */}
            <div className="mx-4 mb-1 flex gap-1 overflow-x-auto rounded-xl p-1" style={{ background: 'var(--surface2)' }}>
              {ABAS_NOTIF.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setAba(a.key)}
                  className="inline-flex h-8 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-2.5 text-[12px] font-bold transition-colors"
                  style={{
                    background: aba === a.key ? 'var(--surface)' : 'transparent',
                    color: aba === a.key ? 'var(--ink)' : 'var(--muted)',
                    boxShadow: aba === a.key ? '0 1px 4px rgba(0,0,0,.12)' : 'none',
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {/* Lista */}
            <div className="meq-nt-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-1">
              {visiveis.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
                  <span className="inline-flex items-center justify-center rounded-full" style={{ width: 52, height: 52, background: 'var(--surface2)', color: 'var(--muted)' }}>
                    <Bell className="h-[22px] w-[22px]" />
                  </span>
                  <b className="text-[14px]" style={{ color: 'var(--ink)' }}>Nada por aqui</b>
                  <span className="text-[12px]" style={{ color: 'var(--muted)' }}>Você está em dia com essa categoria.</span>
                </div>
              ) : (
                <>
                  {hoje.length > 0 && <GrupoNotif titulo="Hoje" />}
                  {hoje.map((n) => <LinhaNotif key={n.id} item={n} onLer={marcarLida} onRemover={(id) => setRemovidas((m) => ({ ...m, [id]: true }))} />)}
                  {antes.length > 0 && <GrupoNotif titulo="Anteriores" />}
                  {antes.map((n) => <LinhaNotif key={n.id} item={n} onLer={marcarLida} onRemover={(id) => setRemovidas((m) => ({ ...m, [id]: true }))} />)}
                </>
              )}
            </div>

            {/* Rodapé */}
            <a href="/aluno/notificacoes" className="flex items-center justify-center gap-1 py-3 text-[13px] font-extrabold" style={{ background: 'var(--surface2)', color: 'var(--brand)', borderTop: '1px solid var(--line)' }}>
              Central de notificações <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </>
        )}
      </div>
    </>
  )
}

function GrupoNotif({ titulo }: { titulo: string }) {
  return (
    <div className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.14em]" style={{ color: 'var(--muted)' }}>
      {titulo}
    </div>
  )
}

function LinhaNotif({ item, onLer, onRemover }: { item: ItemNotif; onLer: (id: string) => void; onRemover: (id: string) => void }) {
  const Icone = item.icon
  return (
    <div
      className="group relative flex gap-2.5 rounded-xl p-2.5"
      style={{ background: item.lida ? 'transparent' : 'color-mix(in srgb,var(--brand2) 7%,transparent)' }}
      onClick={() => !item.lida && onLer(item.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !item.lida) { e.preventDefault(); onLer(item.id) } }}
    >
      {!item.lida && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-[2px]" style={{ background: 'var(--brand2)' }} aria-hidden />}
      <span className="inline-flex shrink-0 items-center justify-center rounded-[9px]" style={{ width: 34, height: 34, background: 'var(--chip)', color: 'var(--brand)' }}>
        <Icone className="h-[17px] w-[17px]" />
      </span>
      <div className="min-w-0 flex-1 leading-snug">
        <b className="block text-[13px]" style={{ color: 'var(--ink)', fontWeight: item.lida ? 600 : 800 }}>{item.titulo}</b>
        <span className="block text-[12px]" style={{ color: 'var(--muted)' }}>{item.texto}</span>
        <div className="mt-1 flex items-center gap-2.5">
          <span className="text-[11px]" style={{ color: 'var(--muted2)' }}>{item.tempo}</span>
          {item.acao && (
            <a href={item.acao.url} className="inline-flex items-center gap-0.5 text-[11.5px] font-bold" style={{ color: 'var(--brand)' }} onClick={(e) => e.stopPropagation()}>
              {item.acao.rotulo} <ChevronRight className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
      <button
        type="button"
        aria-label="Remover notificação"
        title="Remover notificação"
        onClick={(e) => { e.stopPropagation(); onRemover(item.id) }}
        className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: 'var(--muted)' }}
      >
        <span className="text-[16px] leading-none">×</span>
      </button>
    </div>
  )
}

// Vista de PREFERÊNCIAS (spec §2.7): O que avisar / Onde receber / Silenciar.
const PREF_AVISAR: { label: string; on: boolean }[] = [
  { label: 'Aulas e lembretes diários', on: true },
  { label: 'Resultados de simulados', on: true },
  { label: 'Ranking e ligas', on: true },
  { label: 'Comunidade', on: false },
  { label: 'Novidades da plataforma', on: true },
]
const PREF_CANAIS: { label: string; on: boolean }[] = [
  { label: 'Push no celular', on: true },
  { label: 'E-mail', on: false },
]

function PreferenciasNotif() {
  const [avisar, setAvisar] = useState(PREF_AVISAR.map((p) => p.on))
  const [canais, setCanais] = useState(PREF_CANAIS.map((p) => p.on))
  const [silenciar, setSilenciar] = useState(0)
  return (
    <div className="meq-nt-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1">
      <RotuloSecao>O que avisar</RotuloSecao>
      <div className="mb-4 flex flex-col gap-0.5">
        {PREF_AVISAR.map((p, i) => (
          <ToggleLinha key={p.label} label={p.label} on={avisar[i]} onToggle={() => setAvisar((a) => a.map((v, k) => (k === i ? !v : v)))} />
        ))}
      </div>
      <RotuloSecao>Onde receber</RotuloSecao>
      <div className="mb-4 flex flex-col gap-0.5">
        {PREF_CANAIS.map((p, i) => (
          <ToggleLinha key={p.label} label={p.label} on={canais[i]} onToggle={() => setCanais((a) => a.map((v, k) => (k === i ? !v : v)))} />
        ))}
      </div>
      <RotuloSecao>Silenciar</RotuloSecao>
      <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--surface2)' }}>
        {['Ativas', 'Pausar 1 h', 'Até amanhã'].map((rot, i) => (
          <SegBtn key={rot} ativo={silenciar === i} onClick={() => setSilenciar(i)}>{rot}</SegBtn>
        ))}
      </div>
    </div>
  )
}

function ToggleLinha({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[13px]" style={{ color: 'var(--ink)' }}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className="relative shrink-0 rounded-full transition-colors"
        style={{ width: 42, height: 24, background: on ? 'var(--brand2)' : 'var(--line2)' }}
      >
        <span className="absolute top-[3px] rounded-full bg-white transition-transform" style={{ width: 18, height: 18, left: 3, transform: on ? 'translateX(18px)' : 'translateX(0)' }} />
      </button>
    </div>
  )
}
