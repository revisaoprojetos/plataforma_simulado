'use client'

// "Caderno de reforço" — mostra UMA questão por vez (QCore novo) a partir do ARRAY `questoes`.
// Chips de matéria = "Todas" + disciplinas ÚNICAS das questões; clicar FILTRA a lista por
// questao.disciplina e reseta o índice. Pílulas de progresso (1..n, atual destacada) + Anterior/Próxima
// navegam DENTRO da lista filtrada. Variantes por marca só mudam o acento do header/pílulas/chip ligado.

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Brand } from '../interna-tokens'
import type { QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { QCore } from '../qcore'

export interface CadernoAcento {
  /** cor do destaque (pílula atual / chip ligado / ícone do header) */
  hi: string
  /** cor do texto sobre o destaque (chip/pílula ligada) */
  hiInk: string
  /** sombra opcional da pílula atual (VND) */
  pillShadow?: string
}

export function CadernoReforco({
  brand, questoes, header, acento, chipRadius = 99, progresso = 'dots',
}: {
  brand: Brand
  questoes: QuestaoAluno[]
  /** header do caderno (título/subtítulo/ícone), varia por marca — renderizado acima das pílulas */
  header?: React.ReactNode
  acento: CadernoAcento
  chipRadius?: number
  /** forma do progresso: Rev/VND = pílulas (dots); MEQ = "Questão NN / NN" + segmentos retos */
  progresso?: 'dots' | 'segments'
}) {
  const [materia, setMateria] = useState<string>('__all')
  const [idx, setIdx] = useState(0)

  // disciplinas ÚNICAS, na ordem de aparição.
  const disciplinas = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const q of questoes) { const d = q.disciplina?.trim(); if (d && !seen.has(d)) { seen.add(d); out.push(d) } }
    return out
  }, [questoes])

  const filtradas = useMemo(
    () => (materia === '__all' ? questoes : questoes.filter((q) => (q.disciplina?.trim() ?? '') === materia)),
    [questoes, materia],
  )

  const n = filtradas.length
  const seguro = Math.min(idx, Math.max(0, n - 1))
  const atual = filtradas[seguro]

  function escolherMateria(m: string) { setMateria(m); setIdx(0) }

  const chips: { key: string; label: string }[] = [{ key: '__all', label: 'Todas' }, ...disciplinas.map((d) => ({ key: d, label: d }))]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* MEQ: "Questão NN / NN" + segmentos retos (atual na cor de acento) */}
      {progresso === 'segments' ? (
        n > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: acento.hi, whiteSpace: 'nowrap' }}>
              Questão {String(seguro + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 1 }}>
              {filtradas.map((_, k) => (
                <span key={k} aria-hidden style={{ flex: 1, height: 6, borderRadius: 2, background: k === seguro ? acento.hi : 'var(--track)', transition: 'background .2s' }} />
              ))}
            </div>
          </div>
        )
      ) : (
        /* Rev/VND: header + pílulas de progresso */
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            {header ?? (
              <>
                <b style={{ display: 'block', fontSize: 15.5, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Caderno de reforço</b>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{n} {n === 1 ? 'questão' : 'questões'} · selecionadas pelos seus erros recentes</span>
              </>
            )}
          </div>
          {n > 0 && (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
              {filtradas.map((_, k) => (
                <span key={k} aria-hidden style={{ width: k === seguro ? 22 : 8, height: 8, borderRadius: 99, background: k === seguro ? acento.hi : 'var(--track)', boxShadow: k === seguro && acento.pillShadow ? acento.pillShadow : 'none', transition: 'width .2s,background .2s' }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* chips de matéria (FILTRAM) */}
      {chips.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chips.map((c) => {
            const on = materia === c.key
            return (
              <button
                key={c.key} type="button" onClick={() => escolherMateria(c.key)}
                style={{ flexShrink: 0, height: 32, padding: '0 12px', borderRadius: chipRadius, border: '1px solid var(--line)', background: on ? acento.hi : 'transparent', color: on ? acento.hiInk : 'var(--ink)', font: 'inherit', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', transition: 'background .15s,color .15s' }}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      )}

      {/* questão atual */}
      {atual ? (
        <QCore key={atual.id} brand={brand} questao={atual} numero={seguro + 1} />
      ) : (
        <div style={{ padding: '28px 16px', borderRadius: 16, border: '1px dashed var(--line)', background: 'var(--surface2)', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          Nenhuma questão de reforço nesta matéria.
        </div>
      )}

      {/* navegação Anterior/Próxima (dentro da lista filtrada) */}
      {n > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button
            type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={seguro === 0}
            style={navBtn(seguro === 0)}
          >
            <ChevronLeft size={15} /> Anterior
          </button>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>{seguro + 1} / {n}</span>
          <button
            type="button" onClick={() => setIdx((i) => Math.min(n - 1, i + 1))} disabled={seguro >= n - 1}
            style={navBtn(seguro >= n - 1)}
          >
            Próxima <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

function navBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 11,
    border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink)', font: 'inherit',
    fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
  }
}
