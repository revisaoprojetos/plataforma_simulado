'use client'
// Diálogos do Caderno OneNote: Mover/Copiar página (árvore de seções), Cor da seção e Atalhos de teclado.
import { useEffect, useRef, useState } from 'react'
import { BookOpen, X } from 'lucide-react'
import { LISTA_ATALHOS } from './atalhos'
import { corDaSecao, ehAuto, FONTE_UI, PALETA_SECAO, type Secao } from './tipos'

function Modal({ titulo, onFechar, children, largura = 460 }: { titulo: string; onFechar: () => void; children: React.ReactNode; largura?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onFechar() } }
    window.addEventListener('keydown', f, true); return () => window.removeEventListener('keydown', f, true)
  }, [onFechar])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, fontFamily: FONTE_UI }}>
      <div onClick={onFechar} aria-hidden style={{ position: 'absolute', inset: 0, background: 'color-mix(in srgb, var(--ink) 45%, transparent)' }} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={titulo}
        style={{ position: 'relative', width: `min(100%, ${largura}px)`, maxHeight: 'min(86vh, calc(100dvh - 24px))', display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 8, outline: 'none', boxShadow: '0 24px 60px -20px color-mix(in srgb, var(--ink) 60%, transparent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 44, padding: '0 6px 0 16px', borderBottom: '1px solid var(--line)' }}>
          <strong style={{ flex: 1, fontSize: 14.5 }}>{titulo}</strong>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={{ width: 32, height: 32, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} aria-hidden /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16 }}>{children}</div>
      </div>
    </div>
  )
}

const btnSec: React.CSSProperties = { height: 34, padding: '0 14px', border: '1px solid var(--line2)', borderRadius: 4, background: 'transparent', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnPri: React.CSSProperties = { ...btnSec, border: '1px solid var(--brand)', background: 'var(--brand)', color: 'var(--onBrand, #fff)' }

export function DialogoMoverCopiar({ titulo, secoes, secaoAtualId, onConfirmar, onFechar }: {
  titulo: string; secoes: Secao[]; secaoAtualId: string | null
  onConfirmar: (secaoId: string, copiar: boolean) => void; onFechar: () => void
}) {
  const manuais = secoes.filter((s) => !ehAuto(s))
  const [dest, setDest] = useState<string | null>(null)
  return (
    <Modal titulo={`Mover ou copiar “${titulo || 'Página sem título'}”`} onFechar={onFechar}>
      <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--muted)' }}>Escolha a seção de destino:</p>
      <div role="tree" aria-label="Seções do caderno" style={{ border: '1px solid var(--line)', borderRadius: 4, maxHeight: 280, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13, fontWeight: 700, background: 'var(--surface2)' }}><BookOpen size={15} aria-hidden style={{ color: 'var(--brand)' }} />Meu caderno</div>
        {manuais.map((s, i) => {
          const on = dest === s.id
          return (
            <button key={s.id} type="button" role="treeitem" aria-selected={on} onClick={() => setDest(s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 34, padding: '0 10px 0 28px', border: 0, background: on ? 'var(--chip)' : 'transparent', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', textAlign: 'left' }}>
              <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: corDaSecao(s, i).cor }} />
              <span style={{ flex: 1 }}>{s.nome}</span>{s.id === secaoAtualId ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>seção atual</span> : null}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={onFechar} style={btnSec}>Cancelar</button>
        <button type="button" disabled={!dest || dest === secaoAtualId} onClick={() => dest && onConfirmar(dest, true)} style={{ ...btnSec, opacity: !dest ? 0.45 : 1 }}>Copiar</button>
        <button type="button" disabled={!dest || dest === secaoAtualId} onClick={() => dest && onConfirmar(dest, false)} style={{ ...btnPri, opacity: !dest || dest === secaoAtualId ? 0.45 : 1 }}>Mover</button>
      </div>
    </Modal>
  )
}

export function DialogoCorSecao({ secao, atual, onEscolher, onFechar }: { secao: Secao; atual: string; onEscolher: (chave: string) => void; onFechar: () => void }) {
  return (
    <Modal titulo={`Cor da seção “${secao.nome}”`} onFechar={onFechar} largura={340}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {PALETA_SECAO.map((c) => (
          <button key={c.chave} type="button" title={c.nome} aria-label={c.nome} aria-pressed={c.chave === atual} onClick={() => onEscolher(c.chave)}
            style={{ height: 40, borderRadius: 6, border: c.chave === atual ? '3px solid var(--ink)' : '1px solid var(--line2)', background: c.cor, cursor: 'pointer' }} />
        ))}
      </div>
    </Modal>
  )
}

export function DialogoAtalhos({ onFechar }: { onFechar: () => void }) {
  return (
    <Modal titulo="Atalhos de teclado" onFechar={onFechar} largura={620}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
        {LISTA_ATALHOS.map((g) => (
          <section key={g.grupo}>
            <h3 style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--brand)' }}>{g.grupo}</h3>
            <dl style={{ margin: 0 }}>
              {g.itens.map(([k, d]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', borderBottom: '1px solid var(--line)', fontSize: 12.5 }}>
                  <dt style={{ color: 'var(--ink)' }}>{d}</dt><dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--muted)', textAlign: 'right' }}>{k}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
