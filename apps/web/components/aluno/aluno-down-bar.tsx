'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  Home, ClipboardList, Lightbulb, BookOpen, Library, Gavel, CalendarDays,
  FolderOpen, Plus, Trophy, ChevronUp, ChevronDown, Check, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { avatarPadraoDe } from '@/lib/aluno/avatar-padrao'
import { LEITURA_ATIVA, JURISPRUDENCIA_ATIVA, OCULTAR_CRONOGRAMA } from '@/lib/flags'

/**
 * DOWN BAR flutuante da marca REVISÃO (spec 03 §2.3).
 *
 * Barra roxa arredondada, flutuante no rodapé, com 6 slots:
 *   Início · Simulados ▾ · Desafios ▾ · Cronograma ▾ · Ligas · Avatar ▾
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

const AMARELO = '#F1C232'
const AMARELO_INK = '#2A1A55'

type Item = {
  href: string
  icon: typeof Home
  titulo: string
  sub: string
  curto: string
}

type Grupo = {
  id: 'sim' | 'des' | 'cro'
  rotulo: string // título do popover (caixa alta)
  icon: typeof Home // ícone padrão do slot (quando o grupo NÃO é o ativo)
  itens: Item[]
  // Os hrefs que, quando ativos, fazem este grupo virar a pílula amarela.
}

function montarGrupos(hrefsOcultos: string[]): Grupo[] {
  const simItens: Item[] = [
    { href: '/aluno/simulados', icon: ClipboardList, titulo: 'Simulados realizados', sub: 'Histórico, notas e relatórios', curto: 'Realizados' },
    { href: '/aluno/recomendado', icon: Lightbulb, titulo: 'Recomendados para você', sub: 'Escolhidos pelo seu desempenho', curto: 'Para você' },
    { href: '/aluno/questoes', icon: BookOpen, titulo: 'Banco de questões', sub: 'Treine por matéria, banca e ano', curto: 'Questões' },
  ]
  const desItens: Item[] = [
    ...(LEITURA_ATIVA ? [{ href: '/aluno/leitura', icon: Library, titulo: 'Desafio de Lei Seca', sub: 'Trilha diária de artigos', curto: 'Lei Seca' } as Item] : []),
    ...(JURISPRUDENCIA_ATIVA ? [{ href: '/aluno/jurisprudencia', icon: Gavel, titulo: 'Desafio de Jurisprudência', sub: 'Informativos, súmulas e teses', curto: 'Juris' } as Item] : []),
  ]
  const croItens: Item[] = [
    { href: '/aluno/cronograma', icon: CalendarDays, titulo: 'Meu plano de hoje', sub: 'Tarefas do cronograma ativo', curto: 'Cronograma' },
    { href: '/aluno/cronograma/meus', icon: FolderOpen, titulo: 'Meus cronogramas', sub: 'Todos os planos que você criou', curto: 'Cronograma' },
    { href: '/aluno/cronograma', icon: Plus, titulo: 'Gerar novo cronograma', sub: 'Monte um plano em 3 passos', curto: 'Cronograma' },
  ]
  const grupos: Grupo[] = [
    { id: 'sim', rotulo: 'Simulados', icon: ClipboardList, itens: simItens },
    { id: 'des', rotulo: 'Desafios', icon: Library, itens: desItens },
    ...(!OCULTAR_CRONOGRAMA ? [{ id: 'cro', rotulo: 'Cronograma', icon: CalendarDays, itens: croItens } as Grupo] : []),
  ]
  // Remove itens em manutenção; grupos que ficarem vazios somem.
  return grupos
    .map((g) => ({ ...g, itens: g.itens.filter((it) => !hrefsOcultos.includes(it.href)) }))
    .filter((g) => g.itens.length > 0)
}

interface Props {
  usuarioNome: string
  avatar?: string | null
  avatarCor?: string | null
  hrefsOcultos?: string[]
  /** Abre o bottom-sheet da conta (reusa o menu existente do pai). */
  onAbrirConta: () => void
  /** True quando o bottom-sheet da conta/perfil está aberto (para o anel do avatar). */
  contaAberta?: boolean
}

export function AlunoDownBar({ usuarioNome, avatar, avatarCor, hrefsOcultos = [], onAbrirConta, contaAberta = false }: Props) {
  const pathname = usePathname()
  const grupos = montarGrupos(hrefsOcultos)
  // Qual grupo está com o popover aberto (null = nenhum).
  const [aberto, setAberto] = useState<Grupo['id'] | null>(null)

  // Trocar de rota fecha o popover.
  useEffect(() => { setAberto(null) }, [pathname])

  const inicioAtivo = pathname === '/aluno'
  const ligasAtivo = pathname.startsWith('/aluno/ligas')
  const perfilAtivo = pathname.startsWith('/aluno/perfil')

  // Para cada grupo: qual item é o "atual" (href ativo) — define a pílula amarela e o rótulo curto.
  const itemAtualDoGrupo = (g: Grupo): Item | null => {
    const match = g.itens.find((it) => pathname.startsWith(it.href))
    return match ?? null
  }

  // Avatar: anel amarelo quando está na página Perfil ou com o menu da conta aberto;
  // fundo levemente amarelo quando é a PÁGINA Perfil (spec 03 §2.3).
  const avatarRealce = perfilAtivo || contaAberta
  const avatarEl = (
    <span
      className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-primary"
      style={{
        background: perfilAtivo ? 'rgba(241,194,50,.2)' : (avatarCor ?? '#ffffff'),
        boxShadow: avatarRealce ? '0 0 0 2px rgba(241,194,50,.6)' : '0 0 0 1px rgba(0,0,0,.1)',
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
          if (aberto !== g.id) return null
          const atual = itemAtualDoGrupo(g)
          return (
            <div
              key={g.id}
              role="menu"
              aria-label={g.rotulo}
              className="absolute inset-x-[14px] bottom-[74px] rounded-[22px] bg-[var(--surface,var(--card))] p-2 shadow-[0_26px_50px_-18px_rgba(30,15,80,.6),0_0_0_1px_var(--line,var(--border))] animate-[bbin_.3s_cubic-bezier(.22,1,.36,1)] origin-bottom motion-reduce:animate-none"
            >
              {/* Cabeçalho */}
              <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">{g.rotulo}</span>
                <button type="button" onClick={() => setAberto(null)} aria-label="Fechar" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted active:scale-90 motion-reduce:transition-none">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              {/* Itens (com stagger) */}
              <div className="flex flex-col gap-0.5">
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
                        <it.icon className="h-[19px] w-[19px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-foreground">{it.titulo}</span>
                        <span className="block truncate text-xs text-muted-foreground">{it.sub}</span>
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
          className="relative mx-[14px] mb-[14px] flex h-16 items-center justify-between gap-1 rounded-[22px] border border-white/10 px-2.5 shadow-[0_18px_40px_-16px_rgba(20,10,60,.7)] bg-[#2E1F7A] dark:bg-[#22184F]"
        >
          {/* Início */}
          <SlotLink href="/aluno" ativo={inicioAtivo} aria-label="Início">
            {inicioAtivo
              ? <Pilula icon={Home} rotulo="Início" />
              : <Home className="h-[21px] w-[21px]" style={{ color: '#D9CFFF' }} strokeWidth={2} />}
          </SlotLink>

          {/* Grupos (Simulados / Desafios / Cronograma) */}
          {grupos.map((g) => {
            const atual = itemAtualDoGrupo(g)
            const grupoAtivo = !!atual
            const estaAberto = aberto === g.id
            const Icone = atual?.icon ?? g.icon
            return (
              <button
                key={g.id}
                type="button"
                aria-haspopup="menu"
                aria-expanded={estaAberto}
                aria-label={g.rotulo}
                onClick={() => setAberto((cur) => (cur === g.id ? null : g.id))}
                className={cn(
                  'relative flex items-center justify-center outline-none transition-[background-color] active:scale-[.94] motion-reduce:transition-none',
                  grupoAtivo ? '' : 'h-11 w-[42px] rounded-[14px]',
                  !grupoAtivo && estaAberto && 'bg-white/[.14]',
                )}
              >
                {grupoAtivo
                  ? <Pilula icon={Icone} rotulo={atual!.curto} chevron aberto={estaAberto} />
                  : (
                    <>
                      <Icone className="h-[21px] w-[21px]" style={{ color: '#D9CFFF' }} strokeWidth={2} />
                      {/* pontinho indicando submenu */}
                      <span className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full" style={{ background: '#D9CFFF', opacity: 0.8 }} aria-hidden />
                    </>
                  )}
              </button>
            )
          })}

          {/* Ligas */}
          <SlotLink href="/aluno/ligas" ativo={ligasAtivo} aria-label="Ligas">
            {ligasAtivo
              ? <Pilula icon={Trophy} rotulo="Ligas" />
              : <Trophy className="h-[21px] w-[21px]" style={{ color: '#D9CFFF' }} strokeWidth={2} />}
          </SlotLink>

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
function Pilula({ icon: Icon, rotulo, chevron, aberto }: { icon: typeof Home; rotulo: string; chevron?: boolean; aberto?: boolean }) {
  return (
    <span
      className="flex h-11 items-center gap-1.5 rounded-[15px] pl-[11px] pr-[13px] text-[13px] font-extrabold"
      style={{ background: AMARELO, color: AMARELO_INK }}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.4} />
      <span className="whitespace-nowrap">{rotulo}</span>
      {chevron && (
        <ChevronUp className={cn('h-[13px] w-[13px] transition-transform duration-300 motion-reduce:transition-none', aberto && 'rotate-180')} strokeWidth={2.6} />
      )}
    </span>
  )
}
