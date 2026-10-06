'use client'

import { useState } from 'react'
import { Check, Bell } from 'lucide-react'
import { AMARELO, AMARELO_INK } from './tokens'
import { useEscClose } from './use-shell-state'

type Aba = 'all' | 'unread' | 'est' | 'sim' | 'rank'

const ABAS: { key: Aba; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Não lidas' },
  { key: 'est', label: 'Estudos' },
  { key: 'sim', label: 'Simulados' },
  { key: 'rank', label: 'Ranking' },
]

export interface NotificationsPanelProps {
  onClose: () => void
  /** desktop = fixed topo-direita com seta; mobile = faixa + overlay escuro. */
  variant: 'desktop' | 'mobile'
}

/**
 * Central de notificações — versão VISUAL branded (spec §2.7). O wiring de backend
 * (GET /notificacoes, marcar lida, preferências) é fase posterior; aqui mostramos
 * o cabeçalho, as abas e o estado vazio "Nada por aqui", fechável.
 */
export function NotificationsPanel({ onClose, variant }: NotificationsPanelProps) {
  const [aba, setAba] = useState<Aba>('all')
  useEscClose(onClose)

  const pos: React.CSSProperties =
    variant === 'desktop' ? { right: 24, top: 72, width: 400 } : { left: 10, right: 10, top: 66 }

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
        role="dialog"
        aria-label="Notificações"
        className="shr-pop-menu"
        style={{
          position: 'fixed',
          zIndex: 91,
          borderRadius: 22,
          background: 'var(--surface)',
          boxShadow: '0 30px 60px -20px rgba(30,15,80,.55), 0 0 0 1px var(--line)',
          overflow: 'visible',
          ...pos,
        }}
      >
        {variant === 'desktop' && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: 74,
              top: -6,
              width: 12,
              height: 12,
              background: '#5B3FD0',
              transform: 'rotate(45deg)',
              borderRadius: 2,
            }}
          />
        )}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'inherit' }}>
          {/* Cabeçalho gradiente roxo */}
          <div
            style={{
              background: 'radial-gradient(120% 140% at 100% 0%,#6449E0,#3B1E8F 60%,#241047)',
              color: '#FFFFFF',
              paddingTop: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px 0 18px' }}>
              <b style={{ fontSize: 17, letterSpacing: '-0.02em' }}>Notificações</b>
              <span
                style={{
                  height: 22,
                  padding: '0 9px',
                  borderRadius: 99,
                  background: AMARELO,
                  color: AMARELO_INK,
                  fontSize: 11,
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                tudo lido
              </span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                title="Marcar todas como lidas"
                aria-label="Marcar todas como lidas"
                style={headerBtn()}
              >
                <Check style={{ width: 16, height: 16 }} />
              </button>
            </div>
            {/* Abas */}
            <div style={{ marginTop: 8 }}>
              <div className="shr-hs" style={{ display: 'flex', gap: 18, padding: '0 18px', overflowX: 'auto' }}>
                {ABAS.map((a) => {
                  const active = aba === a.key
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => setAba(a.key)}
                      style={{
                        position: 'relative',
                        flexShrink: 0,
                        height: 40,
                        padding: '0 2px',
                        border: 0,
                        background: 'none',
                        color: active ? AMARELO : 'rgba(255,255,255,.72)',
                        font: 'inherit',
                        fontSize: 13,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                      }}
                    >
                      {a.label}
                      <span
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: 3,
                          borderRadius: '3px 3px 0 0',
                          background: active ? AMARELO : 'transparent',
                        }}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Estado vazio (visual stub) */}
          <div style={{ minHeight: 180, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '36px 20px', textAlign: 'center', margin: 'auto' }}>
              <span
                style={{
                  display: 'inline-flex',
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'var(--surface2)',
                  color: 'var(--muted)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bell style={{ width: 22, height: 22 }} />
              </span>
              <b style={{ display: 'block', marginTop: 10, fontSize: 14, color: 'var(--ink)' }}>Nada por aqui</b>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Você está em dia com essa categoria.</span>
            </div>
            <a
              href="/aluno/notificacoes"
              style={{
                display: 'block',
                padding: 13,
                textAlign: 'center',
                fontSize: 13,
                fontWeight: 800,
                color: 'var(--brand)',
                borderTop: '1px solid var(--line)',
              }}
            >
              Ver todas as notificações
            </a>
          </div>
        </div>
      </div>
    </>
  )
}

function headerBtn(): React.CSSProperties {
  return {
    width: 34,
    height: 34,
    padding: 0,
    border: 0,
    borderRadius: 10,
    background: 'rgba(255,255,255,.14)',
    color: '#FFFFFF',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  }
}
