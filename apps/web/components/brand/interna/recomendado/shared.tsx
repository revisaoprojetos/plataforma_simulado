'use client'

// Átomos compartilhados da área "Recomendado" (spec 03 §5). O centro é o BLOCO DE QUESTÃO (qcore),
// usado pelas 3 marcas com variações pequenas (letra redonda Rev/VND × quadrada MEQ; botão Resolver
// dourado no VND). Estados locais: qa (escolha), x_* (eliminada via tesoura), qr (resolvida), ct (aba).
// REGRA anti-"texto esticado": nada de <text> em SVG escalado — rótulos/barras são HTML.

import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Brand } from '../interna-tokens'
import type { Letra, Questao } from './mock'
import { LETRAS } from './mock'

// ---------------------------------------------------------------- ícones (subset)
const I: Record<string, ReactNode> = {
  chart: (<><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></>),
  target: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>),
  bulb: (<><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" /></>),
  clip: (<><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>),
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  play: <path d="M7 4v16l13-8z" />,
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  arrow: <path d="M5 12h14M12 5l7 7-7 7" />,
  flag: <path d="M4 22V4M4 4h12l-2 4 2 4H4" />,
  bookmark: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  scissors: (<><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" /></>),
  lock: (<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  comment: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  cap: (<><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></>),
  sliders: (<><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>),
  trend: (<><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>),
  bolt: <path d="M13 2 3 14h9l-1 8 10-12h-9z" />,
}

export function Ic({ n, s = 16, c, sw }: { n: string; s?: number; c?: string; sw?: number }) {
  const st: CSSProperties = { width: s, height: s, flexShrink: 0 }
  if (c) st.color = c
  return <svg viewBox="0 0 24 24" aria-hidden="true" style={st} fill="none" stroke="currentColor" strokeWidth={sw ?? 1.8} strokeLinecap="round" strokeLinejoin="round">{I[n] ?? null}</svg>
}

// semânticos fixos (spec §1.4)
export const OK = '#1FA868'
export const ERR = '#E5484D'
export const WARN = '#D99A1E'

export const isRev = (b: Brand) => b === 'revisao'
export const isVnd = (b: Brand) => b === 'vnd'
export const isMeq = (b: Brand) => b === 'meq'

// Tokens que a área usa mas NÃO existem em sim-tokens (spec 03 §1.1–§1.3) — setados inline no root.
// accentInk = texto amarelo legível; muted2 = texto mais apagado; peachBg(Rev) = amarelo suave do insight.
export function extraVars(brand: Brand, dark: boolean): Record<string, string> {
  if (brand === 'revisao') {
    return {
      '--accentInk': dark ? '#F1C232' : '#9A7400',
      '--muted2': dark ? '#73717F' : '#B3ADC7',
      '--peachBg': dark ? 'rgba(241,194,50,.12)' : '#FDF5D8',
    }
  }
  if (brand === 'vnd') {
    return {
      '--goldToken': dark ? '#E8C877' : '#D8B45A',
      '--goldInk': dark ? '#F1D48A' : '#9A7414',
      '--muted2': dark ? '#71907F' : '#B5C4BB',
    }
  }
  // meq
  return {
    '--muted2': dark ? '#3E4A78' : '#B7C0D8',
    '--head': dark ? '#FFFFFF' : '#171E3B',
    '--sub': dark ? '#8E9BC4' : '#66729A',
  }
}

// ================================================================ BLOCO DE QUESTÃO (qcore)
// Props: brand (p/ forma de letra/CTA), q (dados), accent (cor da tag/CTA), numeroStr (header).
// Header/progress/tags são passados pelo pai (variam muito por marca) — aqui vai só o miolo compartilhado.

interface QCoreProps {
  brand: Brand
  q: Questao
  /** cor do CTA "Resolver" (VND=dourado) e seu texto */
  ctaBg: string
  ctaInk?: string
  /** cor da letra selecionada (fundo do círculo) */
  selDot: string
  selBg: string
}

export function QCore({ brand, q, ctaBg, ctaInk = '#FFF', selDot, selBg }: QCoreProps) {
  const [qa, setQa] = useState<Letra | null>(null) // escolha
  const [cut, setCut] = useState<Record<Letra, boolean>>({ a: false, b: false, c: false, d: false, e: false })
  const [qr, setQr] = useState(false) // resolvida
  const [ct, setCt] = useState<'com' | 'est'>('com')

  const meq = isMeq(brand)
  const resolved = qr
  const correta = qr && qa === q.gabarito

  const pick = (l: Letra) => { if (!qr && !cut[l]) setQa(l) }
  const toggleCut = (l: Letra) => {
    if (qr) return
    setCut((c) => {
      const nx = { ...c, [l]: !c[l] }
      if (!c[l] && qa === l) setQa(null) // eliminar a selecionada limpa a escolha
      return nx
    })
  }
  const resolve = () => { if (qa) setQr(true) }
  const next = () => { setQa(null); setQr(false); setCut({ a: false, b: false, c: false, d: false, e: false }); setCt('com') }

  // estilo de cada alternativa conforme estado
  function altStyle(l: Letra): { bd: string; bg: string; op: number; dot: string; ink: string; td: string; cutCol: string } {
    const eliminada = cut[l]
    const escolhida = qa === l
    let bd = 'var(--line)', bg = 'transparent', op = 1, dot = 'var(--surface2)', ink = 'var(--ink)', td = 'none'
    const cutCol = eliminada ? selDot : 'var(--muted2)'
    if (qr) {
      if (l === q.gabarito) { bd = OK; bg = 'rgba(31,168,104,.09)'; dot = OK; ink = '#FFF' }
      else if (escolhida) { bd = ERR; bg = 'rgba(229,72,77,.08)'; dot = ERR; ink = '#FFF' }
    } else if (escolhida) {
      bd = selDot; bg = selBg; dot = selDot; ink = '#FFF'
    }
    if (eliminada) { op = 0.45; td = 'line-through' }
    return { bd, bg, op, dot, ink, td, cutCol }
  }

  const letterRadius = meq ? 8 : '50%'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, ['--qSelBg' as string]: selBg } as CSSProperties}>
      {/* alternativas A–E */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.alternativas.map((alt) => {
          const s = altStyle(alt.letra)
          return (
            <div key={alt.letra} className="rcm-alt" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 12px 12px 14px', borderRadius: 14, border: `1.5px solid ${s.bd}`, background: s.bg, opacity: s.op, transition: 'border-color .2s,background .2s,opacity .2s,box-shadow .2s' }}>
              <button type="button" onClick={() => pick(alt.letra)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 12, padding: 0, border: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: qr ? 'default' : 'pointer' }}>
                <span style={{ width: 30, height: 30, borderRadius: letterRadius, background: s.dot, color: s.ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 800, transition: 'background .2s,color .2s' }}>{alt.letra.toUpperCase()}</span>
                <span style={{ paddingTop: 5, fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink)', textDecoration: s.td }}>{alt.texto}</span>
              </button>
              <button type="button" onClick={() => toggleCut(alt.letra)} aria-label={`Eliminar alternativa ${alt.letra.toUpperCase()}`} title="Eliminar alternativa" className="rcm-cut" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 9, border: 0, background: 'transparent', color: s.cutCol, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: qr ? 'default' : 'pointer' }}>
                <Ic n="scissors" s={15} />
              </button>
            </div>
          )
        })}
      </div>

      {/* resultado */}
      {qr && correta && (
        <div className="rcm-pv" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(31,168,104,.1)', border: `1px solid ${OK}` }}>
          <span style={{ width: 30, height: 30, borderRadius: '50%', background: OK, color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="check" s={16} sw={3} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 13.5, color: OK }}>Resposta correta!</b>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>+10 XP · questão removida do seu reforço</span>
          </div>
        </div>
      )}
      {qr && !correta && (
        <div className="rcm-pv" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(229,72,77,.09)', border: `1px solid ${ERR}` }}>
          <span style={{ width: 30, height: 30, borderRadius: '50%', background: ERR, color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="x" s={16} sw={3} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 13.5, color: ERR }}>Resposta incorreta — o gabarito é {q.gabarito.toUpperCase()}.</b>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Ela volta para o seu reforço em 3 dias.</span>
          </div>
        </div>
      )}

      {/* ações: Resolver/Próxima + Salvar/Reportar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        {!resolved ? (
          <button type="button" onClick={resolve} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, padding: '0 22px', border: 0, borderRadius: meq ? 10 : 12, color: ctaInk, background: ctaBg, font: 'inherit', fontSize: 14, fontWeight: 800, opacity: qa ? 1 : 0.45, cursor: qa ? 'pointer' : 'not-allowed', transition: 'opacity .2s,filter .15s' }}>
            <Ic n="check" s={15} />Resolver
          </button>
        ) : (
          <button type="button" onClick={next} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, padding: '0 22px', border: 0, borderRadius: meq ? 10 : 12, color: ctaInk, background: ctaBg, font: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            Próxima questão<Ic n="arrow" s={15} />
          </button>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="rcm-ibtn" aria-label="Salvar questão" title="Salvar questão" style={iconBtn(meq)}><Ic n="bookmark" s={15} /></button>
          <button type="button" className="rcm-ibtn" aria-label="Reportar erro" title="Reportar erro" style={iconBtn(meq)}><Ic n="flag" s={15} /></button>
        </div>
      </div>

      {/* abas Comentário / Estatísticas (bloqueadas até resolver) */}
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 11, background: 'var(--surface2)', border: '1px solid var(--line)' }}>
          {([['com', 'Comentário', 'comment'], ['est', 'Estatísticas', 'chart']] as const).map(([k, label, icon]) => (
            <button key={k} type="button" onClick={() => resolved && setCt(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', border: 0, borderRadius: 8, background: ct === k && resolved ? 'var(--surface)' : 'transparent', color: ct === k && resolved ? 'var(--ink)' : 'var(--muted)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: resolved ? 'pointer' : 'not-allowed', boxShadow: ct === k && resolved ? '0 2px 8px rgba(0,0,0,.08)' : 'none' }}>
              <Ic n={icon} s={13} />{label}
            </button>
          ))}
        </div>

        {!resolved && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)', fontSize: 12.5, color: 'var(--muted)' }}>
            <Ic n="lock" s={15} />Resolva a questão para ver o comentário e as estatísticas.
          </div>
        )}
        {resolved && ct === 'com' && (
          <div className="rcm-pv" style={{ display: 'flex', gap: 12, marginTop: 14 }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="cap" s={17} /></span>
            <div>
              <b style={{ fontSize: 13, color: 'var(--ink)' }}>Comentário do professor</b>
              <p style={{ margin: '4px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)' }}>{q.comentario}</p>
            </div>
          </div>
        )}
        {resolved && ct === 'est' && (
          <div className="rcm-pv" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* §6: só agregados, nunca nomes de terceiros */}
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Respostas de <b style={{ color: 'var(--ink)' }}>{q.totalRespostas.toLocaleString('pt-BR')} alunos</b> · {q.pctAcerto}% acertaram</span>
            {q.distribuicao.map((d) => {
              const ok = d.letra === q.gabarito
              return (
                <div key={d.letra} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 40px', alignItems: 'center', gap: 10 }}>
                  <b style={{ fontSize: 12.5, color: ok ? OK : 'var(--muted)' }}>{d.letra.toUpperCase()}</b>
                  <div style={{ height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                    <span className="rcm-bar" style={{ display: 'block', width: `${d.pct}%`, height: '100%', borderRadius: 99, background: ok ? OK : 'var(--line2)' }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', textAlign: 'right' }}>{d.pct}%</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function iconBtn(meq: boolean): CSSProperties {
  return { width: 40, height: 40, flexShrink: 0, borderRadius: meq ? 10 : 10, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
}

// cabeçalho do bloco de questão: tags (cores/raio por marca — MEQ usa raio 6)
export function QTags({ tags, radius = 99 }: { tags: { label: string; bg: string; color: string }[]; radius?: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {tags.map((t, i) => (
        <span key={i} style={{ height: 26, padding: '0 10px', borderRadius: radius, background: t.bg, color: t.color, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{t.label}</span>
      ))}
    </div>
  )
}

// enunciado comum
export function QEnunciado({ texto }: { texto: string }) {
  return <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55, fontWeight: 600, color: 'var(--ink)' }}>{texto}</p>
}

// CSS compartilhado (animações da área + hovers). Prefixo rcm- é genérico; cada brand adiciona o seu.
export const SHARED_CSS = `
.rcm-pv{animation:rcmpv .45s cubic-bezier(.22,1,.36,1) both}
@keyframes rcmpv{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.rcm-bar{transform-origin:0 50%;animation:rcmgrow 1s cubic-bezier(.22,1,.36,1) both}
@keyframes rcmgrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.rcm-up{animation:rcmup .7s cubic-bezier(.22,1,.36,1) both}
@keyframes rcmup{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.rcm-alt:hover{box-shadow:0 0 0 3px var(--qSelBg)}
.rcm-cut:hover{background:var(--surface2)}
.rcm-ibtn{transition:background .15s,color .15s,border-color .15s}
.rcm-ibtn:hover{background:var(--chip);color:var(--brand)}
.rcm-tile{transition:transform .4s cubic-bezier(.22,1,.36,1)}.rcm-tile:hover{transform:translateY(-3px)}
.rcm-hc{transition:transform .2s}.rcm-hc:hover{transform:scale(1.08)}
.rcm-rowh{transition:background .2s;border-radius:12px}.rcm-rowh:hover{background:var(--surface2)}
.rcm-cta{transition:filter .15s,transform .15s}.rcm-cta:hover{filter:brightness(1.08);transform:translateY(-1px)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`

export { LETRAS }
