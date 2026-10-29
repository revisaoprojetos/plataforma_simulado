'use client'
// Runner da prova (nova) — SimProvaRevisao. Caderno de questão + folha/navegador lateral.
// Interação client-side (marcar alternativa, tesoura, navegar). CONTEÚDO DE EXEMPLO (marcado).
import * as React from 'react'
import { Icon } from '@/components/nova/icons'

// TODO(dados): ligar questões reais (enunciado, alternativas, disciplina) e auto-save das respostas.
type Questao = { disciplina: string; enunciado: string; alts: string[] }
const QUESTOES: Questao[] = [
  {
    disciplina: 'Direito Administrativo',
    enunciado: 'Nos termos da Lei nº 14.133/2021, assinale a alternativa que apresenta uma modalidade de licitação atualmente prevista.',
    alts: ['Tomada de preços.', 'Convite.', 'Diálogo competitivo.', 'Sistema de registro de preços.', 'Credenciamento.'],
  },
  {
    disciplina: 'Direito Processual Civil',
    enunciado: 'Sobre a remessa necessária disciplinada no Código de Processo Civil, é correto afirmar que:',
    alts: [
      'aplica-se a toda e qualquer sentença proferida contra a Fazenda Pública.',
      'é dispensada quando a condenação for inferior a 500 salários mínimos para a União.',
      'é dispensada quando a sentença estiver fundada em súmula de tribunal superior.',
      'não se aplica à sentença que julgar procedentes os embargos à execução fiscal.',
      'depende de requerimento expresso da Fazenda Pública no prazo recursal.',
    ],
  },
  {
    disciplina: 'Direito Tributário',
    enunciado: 'A respeito da imunidade tributária recíproca (art. 150, VI, "a", da CF), segundo a jurisprudência do STF:',
    alts: [
      'Alcança as taxas cobradas entre os entes federativos.',
      'Estende-se às empresas públicas prestadoras de serviço público em regime de monopólio.',
      'Impede a cobrança de contribuições previdenciárias dos entes públicos.',
      'Aplica-se a sociedades de economia mista com ações negociadas em bolsa.',
      'Pode ser suprimida por emenda constitucional, por não constituir cláusula pétrea.',
    ],
  },
]
const TOTAL = 100
const LETRAS = ['A', 'B', 'C', 'D', 'E']

export function ProvaRunner({ voltarHref }: { voltarHref: string }) {
  const [modo, setModo] = React.useState<'caderno' | 'folha'>('caderno')
  const [i, setI] = React.useState(0)
  const [resp, setResp] = React.useState<Record<number, number>>({})
  const [cortes, setCortes] = React.useState<Record<string, boolean>>({})
  const [revisar, setRevisar] = React.useState<Record<number, boolean>>({})

  const q = QUESTOES[i % QUESTOES.length]
  const marcada = resp[i]
  const nResp = Object.keys(resp).length

  const marcar = (alt: number) => setResp((s) => ({ ...s, [i]: alt }))
  const cortar = (alt: number) => setCortes((s) => ({ ...s, [`${i}:${alt}`]: !s[`${i}:${alt}`] }))

  return (
    <>
      {/* barra superior de foco */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <a href={voltarHref} aria-label="Voltar" title="Voltar" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, flexShrink: 0, borderRadius: 11, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}>
          <Icon n="back" size={17} />
        </a>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <b style={{ fontSize: 15, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Simulado Mensal – 10/2026</b>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Padrão PGE/PGM · objetiva A–E</span>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 13, background: 'var(--track)' }}>
          {(['caderno', 'folha'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setModo(m)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', border: 0, borderRadius: 10, fontSize: 13, fontWeight: modo === m ? 800 : 700, background: modo === m ? 'var(--surface)' : 'transparent', color: modo === m ? 'var(--ink)' : 'var(--muted)', boxShadow: modo === m ? '0 2px 8px rgba(30,15,80,.1)' : undefined, cursor: 'pointer' }}>
              <Icon n={m === 'caderno' ? 'book' : 'list'} size={15} />{m === 'caderno' ? 'Caderno' : 'Folha'}
            </button>
          ))}
        </div>
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
          <b style={{ fontSize: 13, color: 'var(--brand)' }}>Sem limite</b>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>00:42 decorridos</span>
        </span>
        <button type="button" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, padding: '0 16px', border: 0, borderRadius: 12, background: 'var(--btnPrimary)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
          <Icon n="check" size={16} />Finalizar
        </button>
      </header>

      {/* corpo: caderno + folha/navegador */}
      <div className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 24, alignItems: 'start', padding: '24px' }}>
        {/* principal */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {modo === 'caderno' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>
                  {i + 1}<span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>/ {TOTAL}</span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 11.5, fontWeight: 800 }}>{q.disciplina}</span>
                <span style={{ flex: 1 }} />
                <button type="button" onClick={() => setRevisar((s) => ({ ...s, [i]: !s[i] }))} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 99, border: '1px solid var(--line)', background: revisar[i] ? 'var(--peachBg)' : 'var(--surface)', color: revisar[i] ? 'var(--accentInk)' : 'var(--muted)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                  <Icon n="flag" size={13} />Para revisar
                </button>
              </div>

              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: 'var(--ink)' }}>{q.enunciado}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {q.alts.map((txt, k) => {
                  const cut = cortes[`${i}:${k}`]
                  const on = marcada === k
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
                      <button type="button" onClick={() => cortar(k)} aria-label="Eliminar alternativa" title="Eliminar alternativa" className="cut" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: cut ? 'var(--accentInk)' : 'var(--muted2)', cursor: 'pointer' }}>
                        <Icon n="shuffle" size={15} />
                      </button>
                      <button type="button" onClick={() => marcar(k)} className="alt" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${on ? 'var(--brand)' : 'var(--line)'}`, background: on ? 'var(--chip)' : 'var(--surface)', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer', textDecoration: cut ? 'line-through' : undefined, opacity: cut ? 0.5 : 1 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, flexShrink: 0, borderRadius: 8, background: on ? 'var(--brand)' : 'var(--surface2)', color: on ? '#fff' : 'var(--muted)', fontSize: 13, fontWeight: 800 }}>{LETRAS[k]}</span>
                        <span style={{ fontSize: 14, lineHeight: 1.5 }}>{txt}</span>
                      </button>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setI((v) => Math.max(0, v - 1))} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 16px', borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  <Icon n="back" size={15} />Anterior
                </button>
                <span style={{ flex: 1 }} />
                <button type="button" onClick={() => setI((v) => Math.min(TOTAL - 1, v + 1))} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 18px', borderRadius: 13, border: 0, background: 'var(--btnPrimary)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                  Próximo<Icon n="chev" size={15} />
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <b style={{ fontSize: 17, color: 'var(--ink)' }}>Folha de respostas</b>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>Marque direto aqui. Tudo fica sincronizado com o caderno.</span>
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--brand)' }}>{nResp}/{TOTAL} marcadas</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 }}>
                {Array.from({ length: TOTAL }).map((_, n) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <b style={{ width: 24, fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>{String(n + 1).padStart(2, '0')}</b>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {LETRAS.map((L, k) => {
                        const on = resp[n] === k
                        return (
                          <button key={k} type="button" onClick={() => setResp((s) => ({ ...s, [n]: k }))} style={{ width: 24, height: 24, borderRadius: 7, border: `1px solid ${on ? 'var(--brand)' : 'var(--line)'}`, background: on ? 'var(--brand)' : 'var(--surface)', color: on ? '#fff' : 'var(--muted)', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{L}</button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* lateral: navegador */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 24 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <b style={{ fontSize: 15, color: 'var(--ink)' }}>Navegador</b>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)' }}>{Math.round((nResp / TOTAL) * 100)}% feito</span>
            </div>
            <div className="nscroll" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {Array.from({ length: TOTAL }).map((_, n) => {
                  const atual = n === i
                  const ok = resp[n] != null
                  const rev = revisar[n]
                  const bg = atual ? 'var(--brand)' : rev ? 'var(--peachBg)' : ok ? 'var(--chip)' : 'var(--surface2)'
                  const fg = atual ? '#fff' : rev ? 'var(--accentInk)' : ok ? 'var(--brand)' : 'var(--muted)'
                  return (
                    <button key={n} type="button" onClick={() => { setI(n); setModo('caderno') }} style={{ position: 'relative', height: 34, borderRadius: 9, border: atual ? '0' : '1px solid var(--line)', background: bg, color: fg, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>{n + 1}</button>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11.5, color: 'var(--muted)' }}>
              <Legend c="var(--brand)" t="Atual" />
              <Legend c="var(--chip)" t="Respondidas" />
              <Legend c="var(--surface2)" t="Em branco" />
              <Legend c="var(--peachBg)" t="Para revisar" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'var(--peachBg)', color: 'var(--accentInk)' }}>
            <Icon n="bulb" size={16} />
            <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>Use a tesoura para eliminar alternativas e o marcador para voltar depois.</span>
          </div>
        </div>
      </div>
    </>
  )
}

function Legend({ c, t }: { c: string; t: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 11, height: 11, borderRadius: 4, background: c, border: '1px solid var(--line)' }} />{t}
    </span>
  )
}
