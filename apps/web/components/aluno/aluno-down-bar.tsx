'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import { Home, Trophy, ChevronUp, ChevronDown, Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { avatarPadraoDe } from '@/lib/aluno/avatar-padrao'
import type { AlunoNavItem } from '@/components/aluno/shell/types'
import { montarGrupos, ehInicio, ehLigas, casa, type Grupo, type GItem } from '@/components/aluno/shell/revisao-nova/down-bar'

/**
 * DOWN BAR flutuante da marca REVISÃO (spec 03 §2.3) — shell ATUAL (quando o shell novo está desligado).
 *
 * Barra roxa arredondada, flutuante no rodapé:
 *   Início · Simulados ▾ · Estudar ▾ · Mais ▾ · Ligas · Avatar ▾
 *
 * Os grupos saem do MESMO `nav` do layout (já filtrado por marca/flags/gamificação/manutenção) e do
 * MESMO agrupamento da down bar do shell novo (`montarGrupos`) — antes eram listas FIXAS
 * (Simulados/Desafios/Cronograma) e Meus Extensivos, Cadernos, Painel, Cursos, Biblioteca… não
 * apareciam no celular. Toda área do menu sem grupo próprio cai em "Mais": nada liberado fica de fora.
 *
 * O slot do grupo da página atual vira uma PÍLULA AMARELA (ícone + rótulo curto +
 * chevron que gira). Grupos abrem um popover acima da barra (animação `bbin`/`bbit`
 * com stagger) e um overlay que fecha ao tocar fora. O avatar abre o bottom-sheet da
 * conta (passado por quem renderiza, p/ reusar o menu existente). Respeita
 * `prefers-reduced-motion` (via variantes motion-reduce).
 *
 * Esta é a variante VISUAL da Revisão para o modo `tabs` do mobile; a seleção
 * tabs/menu continua sendo feita pelo layout (tema.mobile_nav) — não é alterada aqui.
 */

const AMARELO = 'var(--pn-f1c232,#F1C232)'
const AMARELO_INK = 'var(--pn-2a1a55,#2A1A55)'

type IconeSlot = React.ComponentType<{ style?: React.CSSProperties }>

interface Props {
  /** O MESMO nav do layout (já filtrado: só as áreas liberadas p/ este aluno). */
  nav: AlunoNavItem[]
  usuarioNome: string
  avatar?: string | null
  avatarCor?: string | null
  /** Abre o bottom-sheet da conta (reusa o menu existente do pai). */
  onAbrirConta: () => void
  /** True quando o bottom-sheet da conta/perfil está aberto (para o anel do avatar). */
  contaAberta?: boolean
}

export function AlunoDownBar({ nav, usuarioNome, avatar, avatarCor, onAbrirConta, contaAberta = false }: Props) {
  const pathname = usePathname()
  const grupos = montarGrupos(nav)
  // Qual grupo está com o popover aberto (null = nenhum).
  const [aberto, setAberto] = useState<Grupo | null>(null)

  // Trocar de rota fecha o popover.
  useEffect(() => { setAberto(null) }, [pathname])

  const inicioHref = nav.find((n) => ehInicio(n.href))?.href ?? '/aluno'
  const ligasItem = nav.find((n) => ehLigas(n.href)) ?? null // só existe com gamificação ativa
  const inicioAtivo = pathname === '/aluno' || pathname === inicioHref
  const ligasAtivo = !!ligasItem && casa(pathname, ligasItem.href)
  const perfilAtivo = pathname.startsWith('/aluno/perfil')

  // Item da página atual (pílula amarela + rótulo curto): o match MAIS LONGO entre todos os grupos vence.
  const atualGlobal = (() => {
    if (ligasAtivo) return null
    let best: { g: Grupo; item: GItem } | null = null
    for (const grp of grupos) for (const it of grp.itens) {
      const match = casa(pathname, it.href) || (it.href === '/aluno/questoes' && casa(pathname, '/aluno/recomendado'))
      if (match && (!best || it.href.length > best.item.href.length)) best = { g: grp.key, item: it }
    }
    return best
  })()
  const itemAtualDoGrupo = (g: Grupo): GItem | null => (atualGlobal?.g === g ? atualGlobal.item : null)

  // Avatar: anel amarelo quando está na página Perfil ou com o menu da conta aberto;
  // fundo levemente amarelo quando é a PÁGINA Perfil (spec 03 §2.3).
  const avatarRealce = perfilAtivo || contaAberta
  const avatarEl = (
    <span
      className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-primary"
      style={{
        background: perfilAtivo ? 'color-mix(in srgb,var(--pn-f1c232,#F1C232) 20%,transparent)' : (avatarCor ?? '#ffffff'),
        boxShadow: avatarRealce ? '0 0 0 2px color-mix(in srgb,var(--pn-f1c232,#F1C232) 60%,transparent)' : '0 0 0 1px rgba(0,0,0,.1)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatar || avatarPadraoDe(usuarioNome)} alt="" className={cn('h-full w-full object-contain', avatar ? 'object-[center_82%]' : 'object-center')} />
    </span>
  )

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      {/* Overlay: fecha o popover ao tocar fora (só quando há grupo aberto). */}
      {aberto && (
        <div
          className="fixed inset-0 z-[55] bg-[rgba(10,8,25,.42)] animate-[bbo_.25s_ease] md:hidden motion-reduce:animate-none"
          onClick={() => setAberto(null)}
          aria-hidden
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-[60] md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Popover do grupo aberto */}
        {grupos.map((g) => {
          if (aberto !== g.key) return null
          const atual = itemAtualDoGrupo(g.key)
          return (
            <div
              key={g.key}
              role="menu"
              aria-label={g.label}
              className="absolute inset-x-[14px] bottom-[74px] rounded-[22px] bg-[var(--surface,var(--card))] p-2 shadow-[0_26px_50px_-18px_rgba(30,15,80,.6),0_0_0_1px_var(--line,var(--border))] animate-[bbin_.3s_cubic-bezier(.22,1,.36,1)] origin-bottom motion-reduce:animate-none"
            >
              {/* Cabeçalho */}
              <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">{g.label}</span>
                <button type="button" onClick={() => setAberto(null)} aria-label="Fechar" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted active:scale-90 motion-reduce:transition-none">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              {/* Itens (com stagger) — rola se não couber (muitas áreas em tela baixa) */}
              <div className="flex max-h-[min(60vh,440px)] flex-col gap-0.5 overflow-y-auto overscroll-contain">
                {g.itens.map((it, k) => {
                  const isAtual = atual?.href === it.href
                  return (
                    <Link
                      key={`${it.href}-${k}`}
                      href={it.href}
                      role="menuitem"
                      onClick={() => setAberto(null)}
                      style={{ animationDelay: `${0.04 + k * 0.045}s` }}
                      className={cn(
                        'flex items-center gap-3 rounded-[14px] p-2.5 opacity-0 animate-[bbit_.34s_cubic-bezier(.22,1,.36,1)_forwards] transition-colors active:scale-[.98] motion-reduce:animate-none motion-reduce:opacity-100',
                        isAtual ? 'bg-[var(--chip,var(--muted))]' : 'hover:bg-muted/60',
                      )}
                    >
                      <span
                        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px]"
                        style={isAtual
                          ? { background: AMARELO, color: AMARELO_INK }
                          : { background: 'var(--chip, color-mix(in oklab, var(--primary) 14%, transparent))', color: 'var(--brand, var(--primary))' }}
                      >
                        <it.Icon style={{ width: 19, height: 19 }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-foreground">{it.titulo}</span>
                        {it.sub && <span className="block truncate text-xs text-muted-foreground">{it.sub}</span>}
                      </span>
                      {isAtual
                        ? <Check className="h-4 w-4 shrink-0 text-foreground" />
                        : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* A barra */}
        <nav
          aria-label="Navegação"
          className="relative mx-[14px] mb-[14px] flex h-16 items-center justify-between gap-1 rounded-[22px] border border-white/10 px-2.5 shadow-[0_18px_40px_-16px_rgba(20,10,60,.7)] bg-[color:var(--pn-2e1f7a,#2E1F7A)] dark:bg-[color:var(--pn-22184f,#22184F)]"
        >
          {/* Início */}
          <SlotLink href={inicioHref} ativo={inicioAtivo} aria-label="Início">
            {inicioAtivo
              ? <Pilula icon={Home} rotulo="Início" />
              : <Home className="h-[21px] w-[21px]" style={{ color: 'var(--pn-d9cfff,#D9CFFF)' }} strokeWidth={2} />}
          </SlotLink>

          {/* Grupos (Simulados / Estudar / Mais) — montados do nav */}
          {grupos.map((g) => {
            const atual = itemAtualDoGrupo(g.key)
            const grupoAtivo = !!atual
            const estaAberto = aberto === g.key
            const Icone: IconeSlot = atual?.Icon ?? g.Icon
            return (
              <button
                key={g.key}
                type="button"
                aria-haspopup="menu"
                aria-expanded={estaAberto}
                aria-label={g.label}
                onClick={() => setAberto((cur) => (cur === g.key ? null : g.key))}
                className={cn(
                  'relative flex items-center justify-center outline-none transition-[background-color] active:scale-[.94] motion-reduce:transition-none',
                  grupoAtivo ? '' : 'h-11 w-[42px] rounded-[14px]',
                  !grupoAtivo && estaAberto && 'bg-white/[.14]',
                )}
              >
                {grupoAtivo
                  ? <Pilula icon={Icone} rotulo={atual!.short || g.label} chevron aberto={estaAberto} />
                  : (
                    <>
                      <Icone style={{ width: 21, height: 21, color: 'var(--pn-d9cfff,#D9CFFF)' }} />
                      {/* pontinho indicando submenu */}
                      <span className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full" style={{ background: 'var(--pn-d9cfff,#D9CFFF)', opacity: 0.8 }} aria-hidden />
                    </>
                  )}
              </button>
            )
          })}

          {/* Ligas — só quando está no menu (gamificação ativa); usa o href do próprio menu */}
          {ligasItem && (
            <SlotLink href={ligasItem.href} ativo={ligasAtivo} aria-label={ligasItem.label}>
              {ligasAtivo
                ? <Pilula icon={Trophy} rotulo={ligasItem.short || 'Ligas'} />
                : <Trophy className="h-[21px] w-[21px]" style={{ color: 'var(--pn-d9cfff,#D9CFFF)' }} strokeWidth={2} />}
            </SlotLink>
          )}

          {/* Avatar → menu da conta (acima da barra) */}
          <button
            type="button"
            aria-haspopup="menu"
            aria-label="Conta"
            onClick={onAbrirConta}
            className="flex h-11 w-[42px] items-center justify-center rounded-[14px] outline-none transition-[background-color] active:scale-[.94] motion-reduce:transition-none"
          >
            {avatarEl}
          </button>
        </nav>
      </div>
    </>,
    document.body,
  )
}

/** Slot que é um link (Início / Ligas). Quando inativo é um botão quadrado; quando ativo vira pílula. */
function SlotLink({ href, ativo, children, ...rest }: { href: string; ativo: boolean; children: ReactNode } & { 'aria-label': string }) {
  return (
    <Link
      href={href}
      {...rest}
      className={cn(
        'flex items-center justify-center outline-none active:scale-[.94]',
        ativo ? '' : 'h-11 w-[42px] rounded-[14px]',
      )}
    >
      {children}
    </Link>
  )
}

/** Pílula amarela do slot/grupo ativo (ícone + rótulo curto + chevron opcional que gira). */
function Pilula({ icon: Icon, rotulo, chevron, aberto }: { icon: IconeSlot; rotulo: string; chevron?: boolean; aberto?: boolean }) {
  return (
    <span
      className="flex h-11 items-center gap-1.5 rounded-[15px] pl-[11px] pr-[13px] text-[13px] font-extrabold"
      style={{ background: AMARELO, color: AMARELO_INK }}
    >
      <Icon style={{ width: 18, height: 18 }} />
      <span className="whitespace-nowrap">{rotulo}</span>
      {chevron && (
        <ChevronUp className={cn('h-[13px] w-[13px] transition-transform duration-300 motion-reduce:transition-none', aberto && 'rotate-180')} strokeWidth={2.6} />
      )}
    </span>
  )
}
