'use client'

import Link from 'next/link'
import { User, SlidersHorizontal, LogOut, ChevronRight, Sun, Moon, Monitor } from 'lucide-react'
import type { AlunoShellUsuario } from '../types'
import { MENU_HEADER_GRAD, AMARELO, AMARELO_INK } from './tokens'
import { useEscClose, type FontIdx, type ThemePref } from './use-shell-state'

export interface AccountMenuProps {
  usuario: AlunoShellUsuario
  onClose: () => void
  themePref: ThemePref
  onTheme: (t: ThemePref) => void
  fontIdx: FontIdx
  onFont: (i: FontIdx) => void
  /** Posicionamento: desktop (fixed topo-direita) ou mobile (acima da down bar / topo). */
  variant: 'desktop' | 'mobile-top' | 'mobile-bottom'
}

const SEG_ACTIVE: React.CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--ink)',
  boxShadow: '0 2px 8px rgba(0,0,0,.12)',
}

function seg(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    height: 34,
    padding: '0 4px',
    border: 0,
    borderRadius: 9,
    background: active ? SEG_ACTIVE.background : 'transparent',
    color: active ? (SEG_ACTIVE.color as string) : 'var(--muted)',
    boxShadow: active ? (SEG_ACTIVE.boxShadow as string) : 'none',
    font: 'inherit',
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

export function AccountMenu({ usuario, onClose, themePref, onTheme, fontIdx, onFont, variant }: AccountMenuProps) {
  useEscClose(onClose)

  const pos: React.CSSProperties =
    variant === 'desktop'
      ? { right: 24, top: 72, width: 320 }
      : variant === 'mobile-bottom'
        ? { left: 10, right: 10, bottom: 92 }
        : { left: 10, right: 10, top: 66 }

  const themeIdx: 0 | 1 | 2 = themePref === 'claro' ? 0 : themePref === 'escuro' ? 1 : 2

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className="shr-fade"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90,
          background: variant === 'desktop' ? 'transparent' : 'rgba(10,8,25,.35)',
        }}
      />
      <div
        role="menu"
        aria-label="Menu da conta"
        className="shr-pop-menu"
        style={{
          position: 'fixed',
          zIndex: 91,
          borderRadius: 20,
          background: 'var(--surface)',
          boxShadow: '0 30px 60px -20px rgba(30,15,80,.55), 0 0 0 1px var(--line)',
          ...pos,
        }}
      >
        {variant === 'desktop' && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: 14,
              top: -6,
              width: 12,
              height: 12,
              background: '#4A2DB0',
              transform: 'rotate(45deg)',
              borderRadius: 2,
            }}
          />
        )}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'inherit' }}>
          {/* Cabeçalho gradiente */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 16,
              background: MENU_HEADER_GRAD,
              color: '#FFFFFF',
            }}
          >
            {usuario.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={usuario.avatarUrl}
                alt=""
                style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 0 0 3px rgba(255,255,255,.25)' }}
              />
            ) : (
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: usuario.avatarCor || '#F2A93B',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 17,
                  fontWeight: 800,
                  boxShadow: '0 0 0 3px rgba(255,255,255,.25)',
                }}
              >
                {usuario.iniciais}
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
              <b style={{ display: 'block', fontSize: 15 }}>{usuario.primeiroNome}</b>
              <span style={{ fontSize: 12, color: '#CFC4FF' }}>
                Nível {usuario.nivel} · {usuario.xpTotal.toLocaleString('pt-BR')} XP
              </span>
            </div>
            <span
              style={{
                height: 22,
                padding: '0 8px',
                borderRadius: 99,
                background: AMARELO,
                color: AMARELO_INK,
                fontSize: 10.5,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              PRO
            </span>
          </div>

          {/* Tema + Fonte */}
          <div style={{ padding: '14px 14px 10px' }}>
            <span
              style={{
                display: 'block',
                margin: '0 0 7px',
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
              }}
            >
              Tema do sistema
            </span>
            <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 12, background: 'var(--surface2)' }}>
              <button type="button" style={seg(themeIdx === 0)} onClick={() => onTheme('claro')}>
                <Sun style={{ width: 13, height: 13 }} /> Claro
              </button>
              <button type="button" style={seg(themeIdx === 1)} onClick={() => onTheme('escuro')}>
                <Moon style={{ width: 13, height: 13 }} /> Escuro
              </button>
              <button type="button" style={seg(themeIdx === 2)} onClick={() => onTheme('auto')}>
                <Monitor style={{ width: 13, height: 13 }} /> Sistema
              </button>
            </div>

            <div style={{ height: 14 }} />

            <span
              style={{
                display: 'block',
                margin: '0 0 7px',
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
              }}
            >
              Tamanho da fonte
            </span>
            <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 12, background: 'var(--surface2)' }}>
              <button type="button" style={seg(fontIdx === 0)} onClick={() => onFont(0)}>
                <span style={{ fontSize: 11 }}>A</span> Pequena
              </button>
              <button type="button" style={seg(fontIdx === 1)} onClick={() => onFont(1)}>
                <span style={{ fontSize: 13 }}>A</span> Média
              </button>
              <button type="button" style={seg(fontIdx >= 2)} onClick={() => onFont(2)}>
                <span style={{ fontSize: 15 }}>A</span> Grande
              </button>
            </div>
          </div>

          {/* Links */}
          <div style={{ padding: '4px 6px', borderTop: '1px solid var(--line)' }}>
            <Link href="/aluno/perfil" className="shr-pmi" onClick={onClose} style={linkStyle('var(--ink)')}>
              <span style={tileStyle()}>
                <User style={{ width: 15, height: 15 }} />
              </span>
              <span style={{ flex: 1 }}>Ir para o perfil</span>
              <ChevronRight style={{ width: 14, height: 14 }} />
            </Link>
            <Link href="/aluno/perfil" className="shr-pmi" onClick={onClose} style={linkStyle('var(--ink)')}>
              <span style={tileStyle()}>
                <SlidersHorizontal style={{ width: 15, height: 15 }} />
              </span>
              <span style={{ flex: 1 }}>Configurações da conta</span>
              <ChevronRight style={{ width: 14, height: 14 }} />
            </Link>
          </div>
          <div style={{ padding: '4px 6px 6px', borderTop: '1px solid var(--line)' }}>
            <Link href="/sair" className="shr-pmi" onClick={onClose} style={linkStyle('#E5484D')}>
              <span style={{ ...tileStyle(), background: 'rgba(229,72,77,.12)', color: '#E5484D' }}>
                <LogOut style={{ width: 15, height: 15 }} />
              </span>
              <span style={{ flex: 1 }}>Sair da conta</span>
              <ChevronRight style={{ width: 14, height: 14 }} />
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}

function linkStyle(color: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 12,
    color,
    fontSize: 13.5,
    fontWeight: 700,
  }
}

function tileStyle(): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: 'var(--chip)',
    color: 'var(--brand)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}
