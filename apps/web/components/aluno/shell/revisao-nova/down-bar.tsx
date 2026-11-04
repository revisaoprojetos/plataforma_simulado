'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ClipboardList,
  BookOpen,
  Trophy,
  ChevronRight,
  ChevronUp,
  LayoutGrid,
  ChevronDown,
  Check,
} from 'lucide-react'
import type { AlunoNavItem, AlunoShellUsuario } from '../types'
import { MarcaR, NavIcon } from './icons'
import { DOWNBAR_BG, AMARELO, AMARELO_INK, type ShellTheme } from './tokens'

export type Grupo = 'sim' | 'est' | 'mais'

export interface GItem {
  href: string
  Icon: React.ComponentType<{ style?: React.CSSProperties }>
  titulo: string
  sub: string
  short?: string
  navKey?: string // href-prefix para casar com nav/pathname
}

export interface GrupoDef {
  key: Grupo
  label: string
  Icon: React.ComponentType<{ style?: React.CSSProperties }>
  itens: GItem[]
}

// Subtítulos por área (o resto vem do próprio item do menu: rótulo, rótulo curto e ícone).
const SUB: Record<string, string> = {
  '/aluno/simulados': 'Histórico, notas e relatórios',
  '/aluno/questoes': 'Treine por matéria, banca e ano',
  '/aluno/recomendado': 'Escolhidos pelo seu desempenho',
  '/aluno/nova/cadernos': 'Cadernos, anotações, grifos e salvos',
  '/aluno/cadernos': 'Seus cadernos de questões',
  '/aluno/favoritos': 'Questões que você salvou',
  '/aluno/nova/painel': 'Seu plano e metas de estudo',
  '/aluno/nova/cursos': 'Cursos e materiais liberados',
  '/aluno/extensivos': 'Seus programas de estudo',
  '/aluno/biblioteca': 'Materiais e documentos liberados',
  '/aluno/leitura': 'Trilha diária de artigos',
  '/aluno/jurisprudencia': 'Informativos, súmulas e teses',
  '/aluno/cronograma': 'Tarefas do cronograma ativo',
  '/aluno/nova/desempenho': 'Sua evolução e estatísticas',
  '/aluno/nova/comunidade': 'Turma, ranking e conversas',
  '/aluno/nova/como-estudar': 'Método e dicas de estudo',
  '/aluno/nova/duvidas': 'Pergunte aos professores',
  '/aluno/nova/ajuda': 'Perguntas frequentes e suporte',
}
const HREFS_SIM = ['/aluno/simulados', '/aluno/questoes', '/aluno/recomendado', '/aluno/nova/cadernos', '/aluno/cadernos', '/aluno/favoritos']
const HREFS_EST = ['/aluno/nova/painel', '/aluno/nova/cursos', '/aluno/extensivos', '/aluno/biblioteca', '/aluno/leitura', '/aluno/jurisprudencia', '/aluno/cronograma']
export const ehInicio = (href: string) => href === '/aluno' || href === '/aluno/nova/inicio'
export const ehLigas = (href: string) => href === '/aluno/ligas' || href.endsWith('/comunidade/ligas')

/**
 * Grupos da down bar a partir do MESMO `nav` da sidebar (já filtrado por flags/marca/gamificação/
 * manutenção no layout). Antes a barra tinha só um grupo fixo (Simulados + Questões) e as demais áreas
 * liberadas — Painel, Cursos, Meus Extensivos, Biblioteca, Desempenho… — só apareciam na lateral.
 * Toda área sem grupo próprio cai em "Mais", então nada do menu fica de fora no celular/tablet.
 */
export function montarGrupos(nav: AlunoNavItem[]): GrupoDef[] {
  const vistos = new Set<string>()
  const itens = nav.filter((n) => !ehInicio(n.href) && !ehLigas(n.href) && !vistos.has(n.href) && vistos.add(n.href))
  const gi = (n: AlunoNavItem): GItem => ({
    href: n.href,
    Icon: (p) => <NavIcon name={n.icon} {...p} />,
    titulo: n.label,
    sub: SUB[n.href] ?? '',
    short: n.short || n.label,
  })
  const ordem = (hrefs: string[]) => (a: AlunoNavItem, b: AlunoNavItem) => hrefs.indexOf(a.href) - hrefs.indexOf(b.href)
  const sim = itens.filter((n) => HREFS_SIM.includes(n.href)).sort(ordem(HREFS_SIM)).map(gi)
  const est = itens.filter((n) => HREFS_EST.includes(n.href)).sort(ordem(HREFS_EST)).map(gi)
  const mais = itens.filter((n) => !HREFS_SIM.includes(n.href) && !HREFS_EST.includes(n.href)).map(gi)
  const grupos: GrupoDef[] = [
    { key: 'sim', label: 'Simulados', Icon: ClipboardList, itens: sim },
    { key: 'est', label: 'Estudar', Icon: BookOpen, itens: est },
    { key: 'mais', label: 'Mais', Icon: LayoutGrid, itens: mais },
  ]
  return grupos.filter((g) => g.itens.length > 0)
}

export const casa = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/')

const SLOT_COLOR = 'var(--pn-d9cfff,#D9CFFF)'

export interface DownBarProps {
  theme: ShellTheme
  nav: AlunoNavItem[]
  usuario: AlunoShellUsuario
  pathname: string
  onAccount: () => void
}

export function DownBar({ theme, nav, usuario, pathname, onAccount }: DownBarProps) {
  const [aberto, setAberto] = useState<Grupo | null>(null)
  const GRUPOS = montarGrupos(nav)
  const ligasItem = nav.find((n) => ehLigas(n.href)) ?? null // só existe com gamificação ativa

  // Início ativo SÓ na home exata. (O item '/aluno' do nav casa por startsWith → ficava "ativo" em
  // TODAS as rotas /aluno/*; por isso não dá p/ usar nav.find(ativo) aqui.)
  const inicioAtivo = pathname === '/aluno/nova/inicio' || pathname === '/aluno' || pathname === '/aluno/'
  const ligasAtivo = !!ligasItem && casa(pathname, ligasItem.href)

  // Qual grupo contém a rota atual + o item ativo (para a pílula): o match MAIS LONGO vence
  // (ex.: /aluno/nova/comunidade/ligas não acende "Comunidade").
  function grupoAtivo(): { g: Grupo; item: GItem } | null {
    let best: { g: Grupo; item: GItem } | null = null
    for (const grp of GRUPOS) {
      for (const it of grp.itens) {
        const match = casa(pathname, it.href) ||
          // "Banco de questões" engloba a aba "Recomendados" (área unificada).
          (it.href === '/aluno/questoes' && casa(pathname, '/aluno/recomendado'))
        if (match && (!best || it.href.length > best.item.href.length)) best = { g: grp.key, item: it }
      }
    }
    if (ligasItem && casa(pathname, ligasItem.href)) return null
    return best
  }
  const ga = grupoAtivo()

  const toggle = (g: Grupo) => setAberto((cur) => (cur === g ? null : g))
  const close = () => setAberto(null)

  return (
    <nav
      aria-label="Navegação"
      style={{
        // FIXA no viewport (não rola com o conteúdo): o shell é minHeight:100vh e o body rola, então
        // 'sticky' deixava a barra no fim do conteúdo. O .shr-main já tem padding-bottom p/ compensar.
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 14,
        zIndex: 60,
        margin: '0 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 64,
        padding: '0 10px',
        borderRadius: 22,
        background: DOWNBAR_BG[theme],
        boxShadow: '0 18px 40px -16px color-mix(in srgb,var(--pn-140a3c,#140A3C) 70%,transparent)',
        border: '1px solid rgba(255,255,255,.1)',
      }}
    >
      {/* Overlay */}
      {aberto && (
        <div
          className="shr-bbo"
          onClick={close}
          aria-hidden="true"
          style={{ position: 'fixed', inset: 0, zIndex: -1, background: 'color-mix(in srgb,var(--pn-0a0819,#0A0819) 42%,transparent)' }}
        />
      )}

      {/* Popovers dos grupos */}
      {GRUPOS.map((grp) =>
        aberto === grp.key ? (
          <div
            key={grp.key}
            className="shr-bbp"
            role="menu"
            aria-label={grp.label}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 74,
              padding: 8,
              borderRadius: 22,
              background: 'var(--surface)',
              boxShadow: '0 26px 50px -18px color-mix(in srgb,var(--pn-1e0f50,#1E0F50) 60%,transparent), 0 0 0 1px var(--line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px' }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: '.16em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                }}
              >
                {grp.label}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Fechar"
                style={{
                  width: 28,
                  height: 28,
                  padding: 0,
                  border: 0,
                  borderRadius: 9,
                  background: 'var(--surface2)',
                  color: 'var(--muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <ChevronDown style={{ width: 15, height: 15 }} />
              </button>
            </div>
            {/* lista rola se não couber (muitos itens em tela baixa) */}
            <div style={{ maxHeight: 'min(60vh, 440px)', overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {grp.itens.map((it, k) => {
              const atual = ga?.item.href === it.href
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className="shr-bbi"
                  onClick={close}
                  style={{
                    animationDelay: `${0.04 + k * 0.045}s`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 10,
                    borderRadius: 14,
                    background: atual ? 'var(--chip)' : 'transparent',
                    color: 'var(--ink)',
                  }}
                >
                  <span
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      background: atual ? AMARELO : 'var(--chip)',
                      color: atual ? AMARELO_INK : 'var(--brand)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <it.Icon style={{ width: 18, height: 18 }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                    <b style={{ display: 'block', fontSize: 14 }}>{it.titulo}</b>
                    {it.sub && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{it.sub}</span>}
                  </span>
                  {atual ? (
                    <Check style={{ width: 16, height: 16, color: 'var(--brand)' }} />
                  ) : (
                    <ChevronRight style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                  )}
                </Link>
              )
            })}
            </div>
          </div>
        ) : null,
      )}

      {/* Slot Início: pílula amarela com marca R quando ativo; senão ícone casa */}
      {inicioAtivo ? (
        <Link href="/aluno/nova/inicio" style={pilulaStyle()}>
          <MarcaR size={18} fill={AMARELO_INK} />
          Início
        </Link>
      ) : (
        <Link href="/aluno/nova/inicio" aria-label="Início" title="Início" style={slotLinkStyle()}>
          <MarcaR size={21} fill={SLOT_COLOR} />
        </Link>
      )}

      {/* Slots de grupo */}
      {GRUPOS.map((grp) => {
        const isGa = ga?.g === grp.key
        const isOpen = aberto === grp.key
        if (isGa && !isOpen) {
          // pílula amarela do grupo ativo com rótulo curto da página atual
          return (
            <button key={grp.key} type="button" className="shr-bbt" onClick={() => toggle(grp.key)} style={pilulaStyle()}>
              <grp.Icon style={{ width: 18, height: 18 }} />
              {ga.item.short || grp.label}
              <ChevronUp style={{ width: 13, height: 13 }} />
            </button>
          )
        }
        return (
          <button
            key={grp.key}
            type="button"
            className="shr-bbt"
            onClick={() => toggle(grp.key)}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-label={grp.label}
            title={grp.label}
            style={slotBtnStyle(isOpen)}
          >
            {isGa && isOpen ? <ChevronUp style={{ width: 21, height: 21 }} /> : <grp.Icon style={{ width: 21, height: 21 }} />}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                bottom: 5,
                left: '50%',
                width: 4,
                height: 4,
                marginLeft: -2,
                borderRadius: '50%',
                background: 'color-mix(in srgb,var(--pn-d9cfff,#D9CFFF) 55%,transparent)',
              }}
            />
          </button>
        )
      })}

      {/* Ligas — só quando está no menu (gamificação ativa); usa o href do próprio menu */}
      {ligasItem && (ligasAtivo ? (
        <Link href={ligasItem.href} style={pilulaStyle()}>
          <Trophy style={{ width: 18, height: 18 }} />
          {ligasItem.short || 'Ligas'}
        </Link>
      ) : (
        <Link href={ligasItem.href} aria-label={ligasItem.label} title={ligasItem.label} style={slotLinkStyle()}>
          <Trophy style={{ width: 21, height: 21 }} />
        </Link>
      ))}

      {/* Avatar → menu da conta */}
      <button
        type="button"
        className="shr-bbt"
        onClick={onAccount}
        aria-haspopup="menu"
        aria-label="Menu da conta"
        style={{
          display: 'inline-flex',
          padding: 3,
          borderRadius: '50%',
          border: `2px solid ${pathname.startsWith('/aluno/perfil') ? 'color-mix(in srgb,var(--pn-f1c232,#F1C232) 100%,transparent)' : 'color-mix(in srgb,var(--pn-f1c232,#F1C232) 60%,transparent)'}`,
          background: pathname.startsWith('/aluno/perfil') ? 'color-mix(in srgb,var(--pn-f1c232,#F1C232) 20%,transparent)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        {usuario.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={usuario.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: usuario.avatarCor || '#F2A93B',
              color: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {usuario.iniciais}
          </span>
        )}
      </button>
    </nav>
  )
}

function pilulaStyle(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    height: 44,
    padding: '0 13px 0 11px',
    border: 0,
    borderRadius: 15,
    background: AMARELO,
    color: AMARELO_INK,
    font: 'inherit',
    fontSize: 13,
    fontWeight: 800,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  }
}

function slotBtnStyle(open: boolean): React.CSSProperties {
  return {
    position: 'relative',
    width: 42,
    height: 44,
    padding: 0,
    border: 0,
    borderRadius: 14,
    background: open ? 'rgba(255,255,255,.14)' : 'transparent',
    color: SLOT_COLOR,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    font: 'inherit',
    cursor: 'pointer',
  }
}

function slotLinkStyle(): React.CSSProperties {
  return {
    position: 'relative',
    width: 42,
    height: 44,
    padding: 0,
    border: 0,
    borderRadius: 14,
    background: 'transparent',
    color: SLOT_COLOR,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    font: 'inherit',
    cursor: 'pointer',
  }
}
