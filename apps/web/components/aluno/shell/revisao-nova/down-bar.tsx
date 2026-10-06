'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ClipboardList,
  Lightbulb,
  BookOpen,
  Library,
  Gavel,
  CalendarDays,
  FolderClosed,
  Plus,
  Trophy,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Check,
} from 'lucide-react'
import type { AlunoNavItem, AlunoShellUsuario } from '../types'
import { MarcaR } from './icons'
import { DOWNBAR_BG, AMARELO, AMARELO_INK, type ShellTheme } from './tokens'

type Grupo = 'sim' | 'des' | 'cro'

interface GItem {
  href: string
  Icon: React.ComponentType<{ style?: React.CSSProperties }>
  titulo: string
  sub: string
  short?: string
  navKey?: string // href-prefix para casar com nav/pathname
}

interface GrupoDef {
  key: Grupo
  label: string
  Icon: React.ComponentType<{ style?: React.CSSProperties }>
  itens: GItem[]
}

const GRUPOS: GrupoDef[] = [
  {
    key: 'sim',
    label: 'Simulados',
    Icon: ClipboardList,
    itens: [
      { href: '/aluno/realizados', Icon: ClipboardList, titulo: 'Simulados realizados', sub: 'Histórico, notas e relatórios', short: 'Realizados' },
      { href: '/aluno/recomendado', Icon: Lightbulb, titulo: 'Recomendados para você', sub: 'Escolhidos pelo seu desempenho', short: 'Para você' },
      { href: '/aluno/questoes', Icon: BookOpen, titulo: 'Banco de questões', sub: 'Treine por matéria, banca e ano', short: 'Questões' },
    ],
  },
  {
    key: 'des',
    label: 'Desafios',
    Icon: Library,
    itens: [
      { href: '/aluno/leitura', Icon: Library, titulo: 'Desafio de Lei Seca', sub: 'Trilha diária de artigos', short: 'Lei Seca' },
      { href: '/aluno/jurisprudencia', Icon: Gavel, titulo: 'Desafio de Jurisprudência', sub: 'Informativos, súmulas e teses', short: 'Juris' },
    ],
  },
  {
    key: 'cro',
    label: 'Cronograma',
    Icon: CalendarDays,
    itens: [
      { href: '/aluno/cronograma', Icon: CalendarDays, titulo: 'Meu plano de hoje', sub: 'Tarefas do cronograma ativo', short: 'Cronograma' },
      { href: '/aluno/cronograma/meus', Icon: FolderClosed, titulo: 'Meus cronogramas', sub: 'Todos os planos que você criou' },
      { href: '/aluno/cronograma/gerar', Icon: Plus, titulo: 'Gerar novo cronograma', sub: 'Monte um plano em 3 passos' },
    ],
  },
]

const SLOT_COLOR = '#D9CFFF'

export interface DownBarProps {
  theme: ShellTheme
  nav: AlunoNavItem[]
  usuario: AlunoShellUsuario
  pathname: string
  onAccount: () => void
}

export function DownBar({ theme, nav, usuario, pathname, onAccount }: DownBarProps) {
  const [aberto, setAberto] = useState<Grupo | null>(null)

  const inicioAtivo = pathname === '/aluno' || pathname === '/aluno/' || nav.find((n) => n.ativo)?.href === '/aluno'
  const ligasAtivo = pathname.startsWith('/aluno/ligas')

  // Qual grupo contém a rota atual + o item ativo (para a pílula).
  function grupoAtivo(): { g: Grupo; item: GItem } | null {
    for (const grp of GRUPOS) {
      const match = grp.itens.find((it) => pathname === it.href || pathname.startsWith(it.href + '/'))
      if (match) return { g: grp.key, item: match }
    }
    return null
  }
  const ga = grupoAtivo()

  const toggle = (g: Grupo) => setAberto((cur) => (cur === g ? null : g))
  const close = () => setAberto(null)

  return (
    <nav
      aria-label="Navegação"
      style={{
        position: 'sticky',
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
        boxShadow: '0 18px 40px -16px rgba(20,10,60,.7)',
        border: '1px solid rgba(255,255,255,.1)',
      }}
    >
      {/* Overlay */}
      {aberto && (
        <div
          className="shr-bbo"
          onClick={close}
          aria-hidden="true"
          style={{ position: 'fixed', inset: 0, zIndex: -1, background: 'rgba(10,8,25,.42)' }}
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
              boxShadow: '0 26px 50px -18px rgba(30,15,80,.6), 0 0 0 1px var(--line)',
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
            {grp.itens.map((it, k) => {
              const atual = pathname === it.href || pathname.startsWith(it.href + '/')
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
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{it.sub}</span>
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
        ) : null,
      )}

      {/* Slot Início: pílula amarela com marca R quando ativo; senão ícone casa */}
      {inicioAtivo ? (
        <Link href="/aluno" style={pilulaStyle()}>
          <MarcaR size={18} fill={AMARELO_INK} />
          Início
        </Link>
      ) : (
        <Link href="/aluno" aria-label="Início" title="Início" style={slotLinkStyle()}>
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
                background: 'rgba(217,207,255,.55)',
              }}
            />
          </button>
        )
      })}

      {/* Ligas */}
      {ligasAtivo ? (
        <Link href="/aluno/ligas" style={pilulaStyle()}>
          <Trophy style={{ width: 18, height: 18 }} />
          Ligas
        </Link>
      ) : (
        <Link href="/aluno/ligas" aria-label="Ligas" title="Ligas" style={slotLinkStyle()}>
          <Trophy style={{ width: 21, height: 21 }} />
        </Link>
      )}

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
          border: `2px solid ${pathname.startsWith('/aluno/perfil') ? 'rgba(241,194,50,1)' : 'rgba(241,194,50,.6)'}`,
          background: pathname.startsWith('/aluno/perfil') ? 'rgba(241,194,50,.2)' : 'transparent',
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
