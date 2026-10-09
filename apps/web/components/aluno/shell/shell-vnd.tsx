'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SHELL DA MARCA VND (spec 03 §2.4 · §2.6 · §2.7) — "Você na Defensoria".
// ─────────────────────────────────────────────────────────────────────────────
//
// Chrome da área do aluno para o tenant VND, SEM afetar Revisão/MEQ. Consome o
// contrato `AlunoShellProps` (components/aluno/shell/types.ts).
//
// Estrutura:
//  - Desktop: header sticky 76px (sem sidebar) com lockup verde + <nav> horizontal
//    (Início link + menus suspensos Realizados/Lei Seca/Juris/Cronograma/Questões/
//    Ligas + Recomendado "Para você" — DECISÃO DO PO: incluído no nav). Um dropdown
//    aberto por vez; chevron gira. À direita: busca expansível, Tema/Texto, sino,
//    botão de perfil com anel cônico de XP → menu da conta (sem e-mail).
//  - Mobile: header 62px + tab bar com recorte côncavo + FAB dourado "Simular
//    agora"; 5 slots que variam por página; slot "Menu" abre uma folha com todo o nav.
//
// Tokens: usa o namespace de nomes CURTOS do mockup VND (var(--brand), var(--gold)…)
// injetado por lib/brand/brand-tokens.ts no `.app` (claro = :root, escuro = .dark).
// NÃO usa hex fixo fora das cores de marca inline do lockup/FAB (idênticas ao mockup).

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  Home, ClipboardList, Library, Gavel, CalendarDays, Lightbulb, BookOpen, Trophy,
  Search, Sun, Moon, Monitor, ChevronDown, ChevronRight, User, LogOut, X, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FontScaleControl } from '@/components/font-scale-control'
import { NotificacaoBellAluno } from '@/components/aluno/notificacao-bell-aluno'
import type { AlunoShellProps, AlunoNavItem } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Mapa de ícones. A sidebar atual (aluno-sidebar.tsx) usa os componentes lucide
// direto na constante NAV; não há um mapa string→ícone reutilizável, então este
// shell define o seu (chaves = AlunoNavItem.icon, spec 03 §2.1).
// ─────────────────────────────────────────────────────────────────────────────
const ICONES: Record<string, LucideIcon> = {
  home: Home,
  clip: ClipboardList,
  books: Library,
  gavel: Gavel,
  cal: CalendarDays,
  bulb: Lightbulb,
  book: BookOpen,
  trophy: Trophy,
}
function iconeDe(nome: string): LucideIcon {
  return ICONES[nome] ?? Home
}

// Marca "V" da VND (mesma SVG do lockup do mockup HomeVND).
function MarcaV({ className, fill = '#3FD58A' }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path
        fill={fill}
        d="M1.00 5.90L11.51 5.77Q12.20 5.76 12.53 6.13L21.21 15.98Q21.47 16.25 21.57 15.86L21.60 8.10C21.60 7.05 20.81 6.30 19.76 5.88L30.57 5.90Q31.00 5.91 30.74 6.33L23.18 14.49C22.26 15.55 21.80 16.65 21.73 18.23L21.67 25.45Q21.60 26.24 20.95 25.96L6.03 8.31C4.78 6.96 3.14 6.19 1.00 5.90Z"
      />
    </svg>
  )
}

function Lockup() {
  return (
    <Link href="/aluno" className="flex shrink-0 items-center gap-[11px] whitespace-nowrap" aria-label="Você na Defensoria — início">
      <span
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px]"
        style={{
          background: 'linear-gradient(160deg,#0F4A2E,#072A1B)',
          border: '1px solid rgba(120,230,170,.3)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12), 0 8px 20px -8px rgba(34,197,110,.5)',
        }}
      >
        <MarcaV className="h-[22px] w-[22px]" />
      </span>
      <span className="flex flex-col leading-[1.2]">
        <span className="text-[15px] font-extrabold text-[color:var(--topink)]">Você na Defensoria</span>
        <span className="text-[10.5px] font-bold tracking-[.18em] text-[color:var(--goldInk)]">SIMULA VND</span>
      </span>
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Desktop: item de nav simples (Início) e menu suspenso (demais itens).
// ─────────────────────────────────────────────────────────────────────────────
function NavLinkSimples({ item }: { item: AlunoNavItem }) {
  const Icone = iconeDe(item.icon)
  return (
    <Link
      href={item.href}
      aria-current={item.ativo ? 'page' : undefined}
      className={cn(
        'inline-flex h-10 items-center gap-[7px] whitespace-nowrap rounded-xl px-[13px] text-[13.5px] transition-colors',
        item.ativo
          ? 'bg-[color:var(--tabact)] font-extrabold text-[color:var(--brand)]'
          : 'font-semibold text-[color:var(--topink)] hover:bg-[color:var(--tabact)]',
      )}
    >
      <Icone className="h-4 w-4" />
      {item.label}
    </Link>
  )
}

function NavMenu({
  item, aberto, onToggle, onFechar,
}: { item: AlunoNavItem; aberto: boolean; onToggle: () => void; onFechar: () => void }) {
  const Icone = iconeDe(item.icon)
  const menuRef = useRef<HTMLDivElement>(null)
  const id = useId()
  // Fecha ao clicar fora / Esc.
  useEffect(() => {
    if (!aberto) return
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) onFechar() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [aberto, onFechar])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={id}
        className={cn(
          'inline-flex h-10 items-center gap-[5px] whitespace-nowrap rounded-xl py-0 pl-[13px] pr-[10px] text-[13.5px] transition-colors',
          aberto || item.ativo
            ? 'bg-[color:var(--tabact)] font-extrabold text-[color:var(--brand)]'
            : 'font-semibold text-[color:var(--topink)] hover:bg-[color:var(--tabact)]',
        )}
      >
        <Icone className="h-4 w-4" />
        {item.label}
        <ChevronDown className={cn('h-[14px] w-[14px] transition-transform duration-200 motion-reduce:transition-none', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <div
          id={id}
          role="menu"
          className="absolute left-0 top-[52px] z-20 w-[320px] rounded-[18px] border border-[color:var(--line2)] bg-[color:var(--surface)] p-2 shadow-[0_28px_60px_-24px_rgba(0,0,0,.55),0_2px_6px_rgba(0,0,0,.08)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-top-1 motion-safe:duration-150"
        >
          {/* Seta apontando para o botão. */}
          <svg aria-hidden="true" viewBox="0 0 24 11" className="absolute -top-[10px] left-[22px] h-[11px] w-6 overflow-visible">
            <path d="M0 11 L9.6 1.6 Q12 -0.6 14.4 1.6 L24 11" fill="var(--surface)" stroke="var(--line2)" strokeWidth="1" strokeLinejoin="round" />
            <rect x="0.6" y="9.6" width="22.8" height="2.4" fill="var(--surface)" />
          </svg>
          <div className="relative flex flex-col gap-0.5">
            {/* Item principal = a própria página; subtítulo com o badge/rótulo curto. */}
            <Link
              href={item.href}
              role="menuitem"
              onClick={onFechar}
              className="group/mi flex items-center gap-3 rounded-xl p-[10px_12px] transition-colors hover:bg-[color:var(--tabact)]"
            >
              <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--chip)] text-[color:var(--brand)] transition-colors group-hover/mi:bg-[color:var(--brand)] group-hover/mi:text-[color:var(--surface)]">
                <Icone className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 leading-[1.3]">
                <b className="block text-[13.5px] font-bold text-[color:var(--ink)]">{item.short}</b>
                {item.badge && <span className="text-xs text-[color:var(--muted)]">{item.badge}</span>}
              </span>
              <ChevronRight className="h-[15px] w-[15px] text-[color:var(--brand)] transition-transform group-hover/mi:translate-x-0.5" />
            </Link>
          </div>
          <Link
            href={item.href}
            onClick={onFechar}
            className="mt-1.5 flex items-center justify-center gap-2 rounded-xl border border-[color:var(--line)] py-2.5 text-[12.5px] font-extrabold text-[color:var(--brand)] transition-colors hover:bg-[color:var(--tabact)]"
          >
            Ver tudo <ChevronRight className="h-[13px] w-[13px]" />
          </Link>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Busca expansível (desktop). Botão → caixa 380px (transição de largura).
// ─────────────────────────────────────────────────────────────────────────────
function BuscaExpansivel() {
  const [aberto, setAberto] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (aberto) inputRef.current?.focus()
  }, [aberto])
  useEffect(() => {
    if (!aberto) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current?.contains(e.target as Node)) return
      if (!inputRef.current?.value) setAberto(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [aberto])

  return (
    <div
      ref={boxRef}
      className={cn(
        'flex h-10 items-center overflow-hidden rounded-xl transition-[width,background,border-color] duration-[450ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none',
        aberto ? 'w-[380px] border border-[color:var(--line2)] bg-[color:var(--surface)]' : 'w-10 border border-transparent',
      )}
    >
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label="Buscar"
        aria-expanded={aberto}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[color:var(--topmuted)] transition-colors hover:text-[color:var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
      >
        <Search className="h-[18px] w-[18px]" />
      </button>
      <input
        ref={inputRef}
        type="search"
        placeholder="Buscar simulados, matérias, questões…"
        aria-label="Buscar simulados, matérias, questões"
        className={cn(
          'min-w-0 flex-1 bg-transparent pr-3 text-[13.5px] text-[color:var(--ink)] placeholder:text-[color:var(--muted)] focus:outline-none',
          !aberto && 'pointer-events-none',
        )}
        tabIndex={aberto ? 0 : -1}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tema e texto (desktop). TEMA (claro/escuro/sistema via next-themes) + TAMANHO
// DO TEXTO (reusa FontScaleControl existente).
// ─────────────────────────────────────────────────────────────────────────────
function TemaTextoMenu({ scope }: { scope: string }) {
  const [aberto, setAberto] = useState(false)
  const { theme, setTheme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [aberto])

  const opcoesTema: { valor: string; label: string; Icone: LucideIcon }[] = [
    { valor: 'light', label: 'Claro', Icone: Sun },
    { valor: 'dark', label: 'Escuro', Icone: Moon },
    { valor: 'system', label: 'Automático', Icone: Monitor },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Tema e tamanho do texto"
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[color:var(--topmuted)] transition-colors hover:text-[color:var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
      >
        <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 motion-reduce:transition-none" />
        <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 motion-reduce:transition-none" />
      </button>
      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-[52px] z-20 w-[240px] rounded-[18px] border border-[color:var(--line2)] bg-[color:var(--surface)] p-3 shadow-[0_28px_60px_-24px_rgba(0,0,0,.55)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150"
        >
          <p className="mb-2 px-1 text-[10.5px] font-extrabold uppercase tracking-[.14em] text-[color:var(--muted)]">Tema</p>
          <div className="flex flex-col gap-0.5">
            {opcoesTema.map(({ valor, label, Icone }) => (
              <button
                key={valor}
                type="button"
                role="menuitemradio"
                aria-checked={theme === valor}
                onClick={() => setTheme(valor)}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold transition-colors',
                  theme === valor
                    ? 'bg-[color:var(--tabact)] text-[color:var(--brand)]'
                    : 'text-[color:var(--ink)] hover:bg-[color:var(--surface2)]',
                )}
              >
                <Icone className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-3 px-1 text-[10.5px] font-extrabold uppercase tracking-[.14em] text-[color:var(--muted)]">Tamanho do texto</p>
          {/* Reusa o controle canônico de acessibilidade (abre para baixo aqui). */}
          <div className="px-1">
            <FontScaleControl scope={scope} align="start" openDir="down" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Botão de perfil + menu da conta (spec §2.6). Anel cônico de XP; sem e-mail.
// ─────────────────────────────────────────────────────────────────────────────
function BotaoPerfil({
  usuario, scope, compacto = false,
}: { usuario: AlunoShellProps['usuario']; scope: string; compacto?: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const { theme, setTheme } = useTheme()
  useEffect(() => {
    if (!aberto) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [aberto])

  async function sair() {
    setSaindo(true)
    await fetch('/api/aluno/logout', { method: 'POST' }).catch(() => {})
    setTimeout(() => { router.push('/aluno/entrar'); router.refresh() }, 300)
  }

  const gamOn = usuario.gamAtivo !== false
  const avatar = (tam: number) => (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: tam,
        height: tam,
        // Anel cônico de XP (spec §2.4): dourado preenchendo a fração do nível.
        // Gamificação desligada → anel neutro (sem indicar progresso de XP).
        background: gamOn
          ? 'conic-gradient(var(--gold) 0 59%, color-mix(in oklab, var(--gold) 25%, transparent) 59% 100%)'
          : 'color-mix(in oklab, var(--gold) 22%, transparent)',
        padding: 3,
      }}
    >
      <span
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full text-[13px] font-extrabold"
        style={{ background: usuario.avatarCor ?? 'var(--surface)', color: 'var(--brand)' }}
      >
        {usuario.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={usuario.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          usuario.iniciais
        )}
      </span>
      {/* Ponto online. */}
      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[color:var(--surface)] bg-[color:var(--brand)]" aria-hidden />
    </span>
  )

  const nivelXp = `Nível ${usuario.nivel} · ${usuario.xpTotal.toLocaleString('pt-BR')} XP`

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Menu da conta"
        className={cn(
          'flex items-center gap-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
          compacto ? 'p-0' : 'py-1 pl-1 pr-2.5 hover:bg-[color:var(--tabact)]',
        )}
      >
        {avatar(compacto ? 30 : 42)}
        {!compacto && (
          <>
            <span className="flex max-w-[120px] flex-col items-start leading-[1.15]">
              <span className="truncate text-[13px] font-extrabold text-[color:var(--topink)]">{usuario.primeiroNome}</span>
              {gamOn && (
                <span className="truncate text-[11px] font-semibold text-[color:var(--goldInk)]">
                  {usuario.liga ? `${usuario.liga}${usuario.posicaoLiga ? ` · ${usuario.posicaoLiga}º` : ''}` : (usuario.tituloNivel ?? nivelXp)}
                </span>
              )}
            </span>
            <ChevronDown className={cn('h-[14px] w-[14px] text-[color:var(--topmuted)] transition-transform', aberto && 'rotate-180')} />
          </>
        )}
      </button>

      {aberto && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 w-[320px] rounded-[20px] border border-[color:var(--line2)] bg-[color:var(--surface)] shadow-[0_28px_60px_-24px_rgba(0,0,0,.55)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-top-2 motion-safe:duration-150',
            compacto ? 'left-1/2 top-[52px] -translate-x-1/2' : 'right-0 top-[56px]',
          )}
        >
          {/* Cabeçalho com gradiente verde (sem e-mail — spec §6). */}
          <div className="rounded-t-[20px] p-4" style={{ background: 'linear-gradient(120deg,#041A10 0%,#0B4A2E 55%,#12643D 100%)' }}>
            <div className="flex items-center gap-3">
              {avatar(44)}
              <div className="min-w-0">
                <p className="truncate text-[15px] font-extrabold text-white">{usuario.primeiroNome}</p>
                {gamOn && <p className="truncate text-[12px] font-semibold text-[color:#F1D48A]">{nivelXp}</p>}
              </div>
            </div>
          </div>
          {/* Tema — segmentado 3. */}
          <div className="p-3">
            <p className="mb-1.5 px-1 text-[10.5px] font-extrabold uppercase tracking-[.14em] text-[color:var(--muted)]">Tema</p>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[color:var(--surface2)] p-1">
              {([['light', 'Claro'], ['dark', 'Escuro'], ['system', 'Sistema']] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={theme === v}
                  onClick={() => setTheme(v)}
                  className={cn(
                    'rounded-lg px-2 py-1.5 text-[12px] font-bold transition-colors',
                    theme === v ? 'bg-[color:var(--surface)] text-[color:var(--ink)] shadow-[0_2px_8px_rgba(0,0,0,.12)]' : 'text-[color:var(--muted)]',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            {/* Tamanho do texto — reusa o controle canônico. */}
            <p className="mb-1.5 mt-3 px-1 text-[10.5px] font-extrabold uppercase tracking-[.14em] text-[color:var(--muted)]">Tamanho do texto</p>
            <div className="px-1"><FontScaleControl scope={scope} align="start" openDir="down" /></div>
          </div>
          {/* Links. */}
          <div className="border-t border-[color:var(--line)] p-2">
            <Link
              href="/aluno/perfil"
              role="menuitem"
              onClick={() => setAberto(false)}
              className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-[color:var(--surface2)]"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[color:var(--chip)] text-[color:var(--brand)]"><User className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0 leading-[1.25]">
                <b className="block text-[13.5px] font-bold text-[color:var(--ink)]">Meu perfil</b>
                <span className="text-[12px] text-[color:var(--muted)]">Dados, plano e preferências</span>
              </span>
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={sair}
              disabled={saindo}
              className="mt-0.5 flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-[color:rgba(229,72,77,.12)] disabled:opacity-60"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[color:rgba(229,72,77,.12)] text-[#E5484D]"><LogOut className="h-[18px] w-[18px]" /></span>
              <b className="text-[13.5px] font-bold text-[#E5484D]">{saindo ? 'Saindo…' : 'Sair da conta'}</b>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile: folha "Menu" com todos os itens do nav (spec §2.4 — não há no mockup).
// ─────────────────────────────────────────────────────────────────────────────
function FolhaMenu({ nav, aberto, onFechar }: { nav: AlunoNavItem[]; aberto: boolean; onFechar: () => void }) {
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [aberto, onFechar])
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" aria-label="Fechar menu" onClick={onFechar} className="absolute inset-0 bg-[rgba(10,8,25,.42)] motion-safe:animate-in motion-safe:fade-in-0" />
      <div className="absolute inset-x-0 bottom-0 rounded-t-[26px] border-t border-[color:var(--line)] bg-[color:var(--surface)] p-4 pb-6 shadow-[0_-26px_50px_-18px_rgba(6,38,25,.5)] motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-300">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-extrabold uppercase tracking-[.16em] text-[color:var(--muted)]">Menu</span>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--muted)] hover:bg-[color:var(--surface2)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {nav.map((item) => {
            const Icone = iconeDe(item.icon)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onFechar}
                aria-current={item.ativo ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3 transition-colors',
                  item.ativo ? 'border-transparent bg-[color:var(--tabact)]' : 'border-[color:var(--line)] bg-[color:var(--surface)] hover:bg-[color:var(--surface2)]',
                )}
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--chip)] text-[color:var(--brand)]"><Icone className="h-5 w-5" /></span>
                <span className="min-w-0 leading-[1.2]">
                  <b className="block truncate text-[13.5px] font-bold text-[color:var(--ink)]">{item.short}</b>
                  {item.badge && <span className="truncate text-[11px] text-[color:var(--muted)]">{item.badge}</span>}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab bar mobile com recorte côncavo + FAB dourado "Simular agora".
// 5 slots que variam por página: 2 fixos de contexto + FAB central + 2 + "Menu".
// ─────────────────────────────────────────────────────────────────────────────
function TabBar({ nav, onAbrirMenu }: { nav: AlunoNavItem[]; onAbrirMenu: () => void }) {
  // Helper p/ achar um item do nav por href-suffix (fallback para o 1º do nav).
  const buscar = (sufixo: string) => nav.find((n) => n.href.endsWith(sufixo))
  const inicio = buscar('/aluno') ?? nav[0]
  // Slots laterais: variam pela página ativa (spec §2.4). O item ativo ganha o
  // destaque; se a página atual é Realizados/Recomendado, ele entra no slot 2.
  const ativo = nav.find((n) => n.ativo)
  const questoes = buscar('/questoes')
  const juris = buscar('/jurisprudencia')
  // Slot 2 = página de contexto (a ativa quando não for Início/Questões/Juris),
  // senão Questões. Slot 4 = Juris (ou Questões como fallback).
  const contexto = ativo && !['/aluno', '/questoes', '/jurisprudencia'].some((s) => ativo.href.endsWith(s)) ? ativo : questoes
  const slotEsq = [inicio, contexto].filter(Boolean) as AlunoNavItem[]
  const slotDir = [juris ?? questoes].filter(Boolean) as AlunoNavItem[]

  const Item = ({ item }: { item: AlunoNavItem }) => {
    const Icone = iconeDe(item.icon)
    return (
      <Link
        href={item.href}
        aria-current={item.ativo ? 'page' : undefined}
        className="flex flex-col items-center gap-1 text-[10.5px]"
        style={{ color: item.ativo ? '#E8C877' : '#9DB5A8', fontWeight: item.ativo ? 800 : 600 }}
      >
        <Icone className="h-5 w-5" />
        {item.short}
        <span className="h-1 w-1 rounded-full" style={{ background: item.ativo ? '#E8C877' : 'transparent' }} />
      </Link>
    )
  }

  return (
    <nav aria-label="Navegação" className="sticky bottom-0 z-[60] h-[84px] lg:hidden" style={{ background: 'transparent' }}>
      {/* Recorte côncavo central (SVG). Cor do fundo da barra = verde-escuro VND. */}
      <svg viewBox="0 0 390 84" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
        <path d="M0 14 H140 C158 14 160 44 195 44 C230 44 232 14 250 14 H390 V84 H0 Z" className="fill-[#062A1B] dark:fill-[#202522]" />
      </svg>
      <div className="relative grid h-full grid-cols-[1fr_1fr_96px_1fr_1fr] items-end px-1.5 pb-3.5">
        {slotEsq.map((it) => <Item key={`e-${it.href}`} item={it} />)}
        {/* FAB "Simular agora" — borda na cor do --bg. */}
        <Link
          href="/aluno/simulados"
          aria-label="Simular agora"
          className="fab-vnd col-start-3 -mt-[18px] flex h-[62px] w-[62px] shrink-0 items-center justify-center justify-self-center self-start rounded-full"
          style={{
            background: 'linear-gradient(180deg,#F1D48A,#D8B45A)',
            color: '#2A1F02',
            border: '4px solid var(--bg)',
          }}
        >
          <MarcaV className="h-6 w-6" fill="#2A1F02" />
        </Link>
        {slotDir.map((it) => <Item key={`d-${it.href}`} item={it} />)}
        {/* Slot 5 = Menu (abre a folha). */}
        <button
          type="button"
          onClick={onAbrirMenu}
          className="flex flex-col items-center gap-1 text-[10.5px] font-semibold"
          style={{ color: '#9DB5A8' }}
          aria-haspopup="dialog"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor" /><rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor" /><rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" /><rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor" /></svg>
          Menu
          <span className="h-1 w-1" />
        </button>
      </div>
      <style>{`.fab-vnd{animation:fabVndPulse 2.4s ease-in-out infinite}@keyframes fabVndPulse{0%,100%{box-shadow:0 10px 24px -8px rgba(216,180,90,.8),0 0 0 0 rgba(216,180,90,.45)}50%{box-shadow:0 10px 24px -8px rgba(216,180,90,.8),0 0 0 10px rgba(216,180,90,0)}}@media (prefers-reduced-motion:reduce){.fab-vnd{animation:none}}`}</style>
    </nav>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL VND.
// ─────────────────────────────────────────────────────────────────────────────
export function ShellVND({ nav, usuario, children }: AlunoShellProps) {
  const [menuAberto, setMenuAberto] = useState<string | null>(null) // href do dropdown desktop aberto (um por vez)
  const [folhaMenu, setFolhaMenu] = useState(false)
  // Escopo da escala de fonte por aluno (mesma convenção da sidebar de Revisão).
  const scope = `aluno:${usuario.primeiroNome || 'aluno'}`

  // Início é link; os demais itens viram menu suspenso no desktop (spec §2.4).
  const inicio = nav.find((n) => n.href === '/aluno' || n.href.endsWith('/aluno'))
  const menus = nav.filter((n) => n !== inicio)

  // Áreas com CONTEÚDO REDESENHADO (trazem o próprio layout/padding/fundo) ficam FULL-BLEED — senão o
  // shell aplica padding em cima do padding do componente ("borda/encaixe" em volta). As demais recebem
  // padding p/ não ficar coladas. Mesmo critério do shell do Revisão (ShellRevisaoNova).
  const rota = usePathname() || ''
  // Páginas que JÁ renderizam o conteúdo redesenhado (PlatformX ou InternaPageShell — ambos trazem o
  // PRÓPRIO padding) → full-bleed, senão o shell dobra o padding ("moldura/encaixe"). As ainda legadas
  // (favoritos, cadernos) recebem padding do shell. NOTA: lista precisa acompanhar o wiring das páginas
  // (ver resolverInterno/interno-gate); idealmente o shell deveria consultar esse gate em vez de lista fixa.
  const AREAS_NOVAS = [
    '/aluno/simulados', '/aluno/recomendado', '/aluno/perfil', '/aluno/questoes',
    '/aluno/ligas', '/aluno/cronograma', '/aluno/leitura', '/aluno/jurisprudencia',
  ]
  const ehAreaNova = rota === '/aluno' || AREAS_NOVAS.some((a) => rota.startsWith(a))

  return (
    <div className="flex min-h-dvh flex-col bg-[color:var(--bg)] text-[color:var(--ink)]">
      {/* ───── Header desktop (sticky 76px, sem sidebar) ───── */}
      <header
        className="sticky top-0 z-40 hidden h-[76px] items-center gap-3 border-b border-[color:var(--line)] px-5 backdrop-blur-[14px] lg:flex"
        style={{ background: 'var(--topbg)' }}
      >
        <Lockup />
        <nav className="ml-3 flex items-center gap-0.5" aria-label="Navegação principal">
          {inicio && <NavLinkSimples item={inicio} />}
          {menus.map((item) => (
            <NavMenu
              key={item.href}
              item={item}
              aberto={menuAberto === item.href}
              onToggle={() => setMenuAberto((cur) => (cur === item.href ? null : item.href))}
              onFechar={() => setMenuAberto((cur) => (cur === item.href ? null : cur))}
            />
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <BuscaExpansivel />
          <TemaTextoMenu scope={scope} />
          {/* Central de notificações: reusa o sino existente (abre PARA BAIXO não é
              suportado por ele; abre p/ cima a partir do botão — aceitável no header).
              TODO: central de notificações VND (abas/preferências/silenciar, spec §2.7). */}
          <span className="flex h-10 w-10 items-center justify-center text-[color:var(--topmuted)]">
            <NotificacaoBellAluno />
          </span>
          <BotaoPerfil usuario={usuario} scope={scope} />
        </div>
      </header>

      {/* ───── Header mobile (62px) ───── */}
      <header
        className="sticky top-0 z-40 flex h-[62px] items-center gap-2 px-4 lg:hidden"
        style={{ background: '#062A1B' }}
      >
        <Link href="/aluno" className="flex items-center gap-2" aria-label="Você na Defensoria — início">
          <span className="flex h-9 w-9 items-center justify-center rounded-[11px]" style={{ background: 'linear-gradient(160deg,#0F4A2E,#072A1B)', border: '1px solid rgba(120,230,170,.3)' }}>
            <MarcaV className="h-[18px] w-[18px]" />
          </span>
          <span className="flex flex-col leading-[1.1]">
            <span className="text-[13px] font-extrabold text-white">Você na Defensoria</span>
            <span className="text-[9px] font-bold tracking-[.18em] text-[#F1D48A]">SIMULA VND</span>
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-1 text-white [&_svg]:text-white">
          <span className="flex h-10 w-10 items-center justify-center"><NotificacaoBellAluno /></span>
          <BotaoPerfil usuario={usuario} scope={scope} compacto />
        </div>
      </header>

      {/* ───── Conteúdo ───── */}
      {/* O <main> (flex-1) já preenche a viewport; o conteúdo interno fica top-aligned e, como o root usa
          min-h-dvh (min-height, não height), o `min-height:100%` do conteúdo NÃO resolve → sobraria a faixa
          cinza do fundo do shell (var(--bg)) abaixo dele. Solução: pintar o <main> com o MESMO fundo das
          telas internas (simVars vnd claro/escuro) via dark: — assim não há emenda/faixa em área nenhuma. */}
      <main className={cn('flex-1', ehAreaNova ? 'bg-[#F5F8F6] pb-[90px] dark:bg-[#061009] lg:pb-0' : 'px-4 pb-[100px] pt-4 lg:px-6 lg:pb-8 lg:pt-6')}>{children}</main>

      {/* ───── Tab bar + folha Menu (mobile) ───── */}
      <TabBar nav={nav} onAbrirMenu={() => setFolhaMenu(true)} />
      <FolhaMenu nav={nav} aberto={folhaMenu} onFechar={() => setFolhaMenu(false)} />
    </div>
  )
}

export default ShellVND
