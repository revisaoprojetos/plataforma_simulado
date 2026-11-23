'use client'
// Painel de navegação (esquerda, 220px / 48px recolhido): caderno do aluno + suas seções (inclui as automáticas, somente leitura).
import { memo } from 'react'
import { BookOpen, ChevronsLeft, ChevronsRight, FolderPlus, Lock, Star, XCircle } from 'lucide-react'
import { corDaSecao, ehAuto, FONTE_UI, type Secao } from './tipos'

export const PainelNavegacao = memo(function PainelNavegacao({ caderno, secoes, ativaId, recolhido, onToggle, onSelecionar, onNovaSecao, onMenuSecao }: {
  caderno: string; secoes: Secao[]; ativaId: string | null; recolhido: boolean
  onToggle: () => void; onSelecionar: (id: string) => void; onNovaSecao: () => void
  onMenuSecao: (e: React.MouseEvent, s: Secao) => void
}) {
  return (
    <nav aria-label="Navegação do caderno" style={{
      width: recolhido ? 48 : 220, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--surface2)', borderRight: '1px solid var(--line)',
      fontFamily: FONTE_UI, transition: 'width .15s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: recolhido ? 0 : '0 6px 0 12px', justifyContent: recolhido ? 'center' : 'space-between', borderBottom: '1px solid var(--line)' }}>
        {recolhido ? null : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
            <BookOpen size={16} aria-hidden style={{ color: 'var(--brand)', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{caderno}</span>
          </span>
        )}
        <button type="button" onClick={onToggle} aria-label={recolhido ? 'Expandir painel de navegação' : 'Recolher painel de navegação'} aria-expanded={!recolhido}
          title={recolhido ? 'Expandir' : 'Recolher'} className="onenote-hover"
          style={{ width: 28, height: 28, border: 0, borderRadius: 4, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {recolhido ? <ChevronsRight size={16} aria-hidden /> : <ChevronsLeft size={16} aria-hidden />}
        </button>
      </div>

      <ul role="list" style={{ listStyle: 'none', margin: 0, padding: '4px 0', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {secoes.map((s, i) => {
          const cor = corDaSecao(s, i)
          const auto = ehAuto(s)
          const on = s.id === ativaId
          const Ico = s.tipo === 'auto_erros' ? XCircle : Star
          return (
            <li key={s.id}>
              <button type="button" className="onenote-hover" onClick={() => onSelecionar(s.id)} onContextMenu={(e) => onMenuSecao(e, s)} aria-current={on ? 'true' : undefined}
                title={auto ? `${s.nome} (automática, somente leitura)` : s.nome}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 34, padding: recolhido ? 0 : '0 12px', justifyContent: recolhido ? 'center' : 'flex-start',
                  border: 0, borderLeft: `3px solid ${on ? 'var(--brand)' : 'transparent'}`, background: on ? 'var(--chip)' : 'transparent', color: 'var(--ink)',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', textAlign: 'left',
                }}>
                {auto
                  ? <Ico size={15} aria-hidden style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  : <span aria-hidden style={{ width: 14, height: 14, borderRadius: 3, background: cor.cor, flexShrink: 0 }} />}
                {recolhido ? null : (
                  <>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nome}</span>
                    {auto ? <Lock size={11} aria-label="Somente leitura" style={{ color: 'var(--muted)' }} /> : null}
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{s.qtd_paginas}</span>
                  </>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <button type="button" onClick={onNovaSecao} className="onenote-hover" title="Nova seção (Ctrl+T)"
        style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: recolhido ? 'center' : 'flex-start', height: 36, padding: recolhido ? 0 : '0 12px', border: 0, borderTop: '1px solid var(--line)', background: 'transparent', color: 'var(--brand)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        <FolderPlus size={16} aria-hidden />{recolhido ? null : 'Adicionar seção'}
      </button>
    </nav>
  )
})
