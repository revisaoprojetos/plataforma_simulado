'use client'

// Accordion da Ajuda do aluno — porte fiel ao visual da nova plataforma (tokens --ink/--muted/--line…).
// Cada tema vira um Card; cada pergunta é uma linha clicável que revela a resposta com transição suave
// (altura via grid-rows 0fr↔1fr + opacidade). O chevron (Icon n="chev") gira ao abrir. Cores SEMPRE
// via tokens — nada de hex.

import { useState } from 'react'
import { Card, H2, Col } from './ui'
import { Icon } from './icons'
import type { Tema } from '@/lib/ajuda/faq'

function Item({ q, a, aberto, onToggle, primeiro }: { q: string; a?: string; aberto: boolean; onToggle: () => void; primeiro?: boolean }) {
  return (
    <div style={{ borderTop: primeiro ? 'none' : '1px solid var(--line)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberto}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '14px 0',
          background: 'transparent', border: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit',
        }}
      >
        <Icon
          n="chev"
          size={16}
          style={{ color: 'var(--muted2)', flexShrink: 0, transition: 'transform .2s ease', transform: aberto ? 'rotate(90deg)' : 'none' }}
        />
        <b style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{q}</b>
      </button>
      {/* corpo revelado: grid-rows 0fr↔1fr dá transição suave de altura sem medir o DOM */}
      <div style={{ display: 'grid', gridTemplateRows: aberto ? '1fr' : '0fr', opacity: aberto ? 1 : 0, transition: 'grid-template-rows .22s ease, opacity .22s ease' }}>
        <div style={{ overflow: 'hidden' }}>
          <p style={{ margin: 0, padding: '0 0 14px 26px', fontSize: 13, lineHeight: 1.6, color: 'var(--muted)' }}>
            {a ?? <span style={{ color: 'var(--muted2)', fontStyle: 'italic' }}>Sem detalhes por enquanto.</span>}
          </p>
        </div>
      </div>
    </div>
  )
}

export function AjudaFaqAccordion({ faq }: { faq: Tema[] }) {
  // Estado por "tema:índice". Vários itens podem ficar abertos ao mesmo tempo (independentes).
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const toggle = (k: string) => setAbertos((a) => ({ ...a, [k]: !a[k] }))

  return (
    <Col gap={16}>
      {faq.map((tema, ti) => (
        <Card key={`${tema.titulo}-${ti}`}>
          <H2>{tema.titulo}</H2>
          <Col gap={0}>
            {tema.perguntas.map((p, i) => {
              const k = `${ti}:${i}`
              return <Item key={k} q={p.q} a={p.a} primeiro={i === 0} aberto={!!abertos[k]} onToggle={() => toggle(k)} />
            })}
          </Col>
        </Card>
      ))}
    </Col>
  )
}
