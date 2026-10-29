'use client'
// Calendário de compromissos (Início nova): seletor de dias da semana + lista do que há/tinha
// agendado no dia selecionado. Dados reais = metas do cronograma do aluno por dia (ver page.tsx).
// Eventos do Revisão (ao vivo/novidade) e "minhas tarefas" dependem de backend de calendário/tarefas
// que ainda não existe — por isso só aparecem quando houver fonte (hoje: cronograma).
import * as React from 'react'
import { Card, Btn, Muted } from '@/components/nova/ui'

export type TagKind = 'brand' | 'gold' | 'green' | 'blue' | 'pink' | 'red' | 'gray'
export type AgendaItem = { hora?: string | null; tag: string; kind: TagKind; titulo: string; contexto?: string | null; acao?: string; href?: string }
export type DiaCal = { iso: string; wd: string; dia: number; hoje: boolean; dots: TagKind[] }

const COR: Record<TagKind, { bg: string; fg: string; dot: string }> = {
  brand: { bg: 'var(--chip)', fg: 'var(--brand)', dot: 'var(--brand)' },
  gold: { bg: 'var(--peachBg)', fg: 'var(--accentInk)', dot: 'var(--gold)' },
  green: { bg: 'var(--okBg)', fg: 'var(--ok)', dot: 'var(--ok)' },
  blue: { bg: 'var(--infoBg)', fg: 'var(--info)', dot: 'var(--info)' },
  pink: { bg: 'var(--pinkBg)', fg: 'var(--pink)', dot: 'var(--pink)' },
  red: { bg: 'var(--dangerBg)', fg: 'var(--danger)', dot: 'var(--danger)' },
  gray: { bg: 'var(--surface2)', fg: 'var(--muted)', dot: 'var(--muted2)' },
}

export function CalendarioInicio({ dias, agenda, range }: { dias: DiaCal[]; agenda: Record<string, AgendaItem[]>; range: string }) {
  const hojeIso = dias.find((d) => d.hoje)?.iso ?? dias[0]?.iso ?? ''
  const [sel, setSel] = React.useState(hojeIso)
  const itens = agenda[sel] ?? []

  return (
    <Card>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accentInk)' }}>{range}</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Calendário de compromissos</h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn kind="secondary" size="sm" icon="users">Agendar mentoria</Btn>
          <Btn kind="gold" size="sm" icon="pen">Incluir tarefa</Btn>
        </div>
      </div>

      {/* Seletor de dias */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
        {dias.map((d) => {
          const on = d.iso === sel
          const bg = on ? 'var(--goldInk)' : d.hoje ? 'var(--chip)' : 'var(--surface2)'
          const bd = on ? 'var(--goldInk)' : d.hoje ? 'var(--brand)' : 'var(--line)'
          const fgNum = on ? '#FFFFFF' : d.hoje ? 'var(--brand)' : 'var(--ink)'
          const fgWd = on ? 'var(--gold)' : d.hoje ? 'var(--brand)' : 'var(--muted)'
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => setSel(d.iso)}
              aria-pressed={on}
              style={{ borderRadius: 14, border: `1px solid ${bd}`, background: bg, padding: '10px 6px', textAlign: 'center', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', color: fgWd }}>{d.hoje ? 'HOJE' : d.wd}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: fgNum }}>{d.dia}</div>
              <div style={{ height: 6, marginTop: 6, display: 'flex', gap: 3, justifyContent: 'center' }}>
                {d.dots.slice(0, 4).map((k, i) => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: 99, background: on ? 'rgba(255,255,255,.7)' : COR[k].dot }} />
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {/* Lista do dia selecionado */}
      {itens.length === 0 ? (
        <div style={{ padding: '18px 14px', borderRadius: 12, background: 'var(--surface2)', textAlign: 'center' }}>
          <Muted size={13}>Nada agendado neste dia.</Muted>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {itens.map((it, i) => {
            const c = COR[it.kind]
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)' }}>
                <div style={{ width: 42, flexShrink: 0, fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', textAlign: 'center' }}>{it.hora || '—'}</div>
                <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 99, background: c.bg, color: c.fg, fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>{it.tag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.titulo}</div>
                  {it.contexto ? <Muted size={11.5}>{it.contexto}</Muted> : null}
                </div>
                {it.href ? <Btn kind="secondary" size="sm" href={it.href}>{it.acao || 'Abrir'}</Btn> : null}
              </div>
            )
          })}
        </div>
      )}

      <Muted size={11.5}>Eventos do Revisão e o que você incluir aparecem juntos. Suas tarefas também entram no seu cronograma do dia.</Muted>
    </Card>
  )
}
