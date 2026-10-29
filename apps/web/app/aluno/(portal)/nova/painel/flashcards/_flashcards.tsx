'use client'
// Revisão por flashcards (Revisão): carta que vira + avaliação SRS (Leitner). Ao revelar o verso o
// aluno avalia (Errei/Difícil/Bom/Fácil); cada clique grava a revisão via server action
// (salvarRevisaoFlashcard) e avança para o próximo cartão. Ao fim, tela de conclusão com acertos/erros.
// Client-only (índice/virada/contadores). Cores sempre via tokens.
import * as React from 'react'
import { Bar, Btn, Eyebrow, Tag } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { salvarRevisaoFlashcard } from './actions'
import type { ResultadoRevisao, EstadoCard } from '@/lib/flashcards/tipos'

export type Card = { id: string; frente: string; verso: string; estado?: EstadoCard }

// Avaliações SRS (esquerda→direita = mais fácil). Cores via tokens de estado.
const AVALIACOES: { r: ResultadoRevisao; t: string; icon: Parameters<typeof Icon>[0]['n']; bg: string; fg: string }[] = [
  { r: 'errou', t: 'Errei', icon: 'x', bg: 'var(--dangerBg)', fg: 'var(--danger)' },
  { r: 'dificil', t: 'Difícil', icon: 'alert', bg: 'var(--peachBg)', fg: 'var(--accentInk)' },
  { r: 'bom', t: 'Bom', icon: 'check', bg: 'color-mix(in srgb, var(--brand) 14%, transparent)', fg: 'var(--brand)' },
  { r: 'facil', t: 'Fácil', icon: 'bolt', bg: 'var(--okBg)', fg: 'var(--ok)' },
]

const ESTADO_LABEL: Record<EstadoCard, { t: string; kind: 'gray' | 'blue' | 'gold' | 'green' }> = {
  novo: { t: 'Novo', kind: 'blue' },
  aprendendo: { t: 'Aprendendo', kind: 'gold' },
  revisar: { t: 'Revisar', kind: 'gold' },
  quase: { t: 'Quase lá', kind: 'green' },
  dominado: { t: 'Dominado', kind: 'green' },
}

export function FlashcardsRunner({ cards }: { cards: Card[] }) {
  const [idx, setIdx] = React.useState(0)
  const [flip, setFlip] = React.useState(false)
  const [acertos, setAcertos] = React.useState(0)
  const [erros, setErros] = React.useState(0)
  const [done, setDone] = React.useState(false)
  const [aviso, setAviso] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const total = cards.length
  const c = cards[idx]

  const go = (d: number) => { setIdx((i) => Math.max(0, Math.min(total - 1, i + d))); setFlip(false) }

  // Avalia o cartão atual: grava a revisão (SRS) e avança; último cartão → tela de conclusão.
  const avaliar = (resultado: ResultadoRevisao) => {
    if (pending) return
    if (resultado === 'errou') setErros((n) => n + 1)
    else setAcertos((n) => n + 1)
    const id = c.id
    startTransition(async () => {
      try {
        const res = await salvarRevisaoFlashcard(id, resultado)
        setAviso(res.ok ? null : 'Não foi possível salvar este progresso agora — seguimos a revisão.')
      } catch {
        setAviso('Não foi possível salvar este progresso agora — seguimos a revisão.')
      }
    })
    if (idx < total - 1) { setIdx((i) => i + 1); setFlip(false) }
    else setDone(true)
  }

  const reiniciar = () => { setIdx(0); setFlip(false); setAcertos(0); setErros(0); setDone(false); setAviso(null) }

  // ───────────────────────── Conclusão ─────────────────────────
  if (done) {
    const respondidos = acertos + erros
    const pct = respondidos > 0 ? Math.round((acertos / respondidos) * 100) : 0
    return (
      <div style={{ textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: 99, background: 'var(--okBg)', color: 'var(--ok)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon n="trophy" size={30} />
        </div>
        <Eyebrow color="var(--ok)">Revisão concluída</Eyebrow>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>
          Você revisou {respondidos.toLocaleString('pt-BR')} {respondidos === 1 ? 'cartão' : 'cartões'}
        </div>
        <div style={{ display: 'flex', gap: 28, justifyContent: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ok)' }}>{acertos.toLocaleString('pt-BR')}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>acertos</div>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--danger)' }}>{erros.toLocaleString('pt-BR')}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>erros</div>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand)' }}>{pct.toLocaleString('pt-BR')}%</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>aproveitamento</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Btn kind="primary" icon="shuffle" onClick={reiniciar}>Revisar novamente</Btn>
        </div>
      </div>
    )
  }

  const estado = c.estado ? ESTADO_LABEL[c.estado] : null

  return (
    <>
      {/* progresso + navegação */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <b style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{(idx + 1).toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}</b>
        <Bar pct={((idx + 1) / total) * 100} style={{ flex: 1 }} />
        <Btn kind="secondary" size="sm" icon="back" onClick={() => go(-1)}>Anterior</Btn>
        <Btn kind="secondary" size="sm" icon="arrow" onClick={() => go(1)}>Próxima</Btn>
      </div>

      {/* carta (clique vira) */}
      <button
        type="button"
        onClick={() => setFlip((v) => !v)}
        style={{ textAlign: 'left', width: '100%', minHeight: 300, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 36, display: 'flex', flexDirection: 'column', gap: 16, cursor: 'pointer' }}
      >
        {!flip ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Eyebrow>Pergunta</Eyebrow>
              {estado ? <Tag kind={estado.kind}>{estado.t}</Tag> : null}
            </div>
            <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.25, color: 'var(--ink)' }}>{c.frente}</div>
            <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>Toque para ver a resposta</span>
          </>
        ) : (
          <>
            <Eyebrow>Resposta</Eyebrow>
            <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.5, color: 'var(--ink)', fontFamily: 'var(--font-read)' }}>{c.verso}</div>
            <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>Como foi lembrar? Avalie abaixo.</span>
          </>
        )}
      </button>

      {/* aviso leve de falha ao salvar (não bloqueia a revisão) */}
      {aviso ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--accentInk)' }}>
          <Icon n="alert" size={14} />{aviso}
        </div>
      ) : null}

      {/* avaliação SRS: só após revelar o verso. Antes disso, instrução para virar a carta. */}
      {flip ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {AVALIACOES.map((b) => (
            <button
              key={b.r}
              type="button"
              disabled={pending}
              onClick={() => avaliar(b.r)}
              style={{ height: 56, borderRadius: 14, border: 0, background: b.bg, color: b.fg, fontSize: 14.5, fontWeight: 800, cursor: pending ? 'wait' : 'pointer', opacity: pending ? 0.65 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Icon n={b.icon} size={16} />{b.t}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', fontSize: 13.5, fontWeight: 700, color: 'var(--muted)', padding: '10px 0' }}>
          Toque na carta para ver a resposta e avaliar.
        </div>
      )}
    </>
  )
}
