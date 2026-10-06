'use client'

// SIMULADO MEQ — RESULTADO (spec 06 §3). Boletim técnico/dashboard.
// grid 330px/1fr: [boletim + gauge + ritmo + NPS] | [downloads + tabela + gráfico]
// Correção questão a questão largura total (blocos Certo/Errado). Prefixo: smr-

import { useState } from 'react'
import { simTokensStyle } from '../sim-tokens'
import type { SimCorrecaoItem, SimMock, SimTheme } from '../types'
import {
  AMBER, baseKeyframes, BgfxMeq, btnGhost, btnPrimary, ERR_RED, IconBulb, IconCheck, IconChevD,
  IconChevL, IconChevR, IconDownload, IconHome, IconRefresh, IconStar, IconX, MarcaMeq,
  MEQ_CYAN, MEQ_NAVY_GRAD, OK_GREEN, SoraLink,
} from './shared'

const P = 'smr'
type Filtro = 'all' | 'e' | 'c' | 'b'

export function Resultado({ theme, data }: { theme: SimTheme; data: SimMock }) {
  const { info, resultado } = data
  const [rq, setRq] = useState(1)
  const [rf, setRf] = useState<Filtro>('all')
  const [jx, setJx] = useState(true)
  const [np, setNp] = useState(-1)
  const [nsent, setNsent] = useState(false)

  return (
    <div className={`${P}-app`} style={{ ...simTokensStyle('meq', theme), position: 'relative', minHeight: '100vh', overflowX: 'hidden' }}>
      <SoraLink />
      <style>{css()}</style>
      <BgfxMeq p={P} />

      {/* Header */}
      <div className={`${P}-top`} style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 20, height: 70, padding: '0 32px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <MarcaMeq size={26} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: OK_GREEN }}><IconCheck size={15} sw={2.8} /> Simulado finalizado</span>
        <span style={{ flex: 1 }} />
        <button type="button" className={`${P}-sbtn ${P}-tbtn`} style={{ ...btnGhost(40), width: 'auto', fontSize: 13, padding: '0 16px', borderRadius: 11 }}><IconRefresh /> <span className={`${P}-tlab`}>Refazer como treino</span></button>
        <button type="button" className={`${P}-sbtn ${P}-tbtn`} style={{ ...btnPrimary(40), width: 'auto', fontSize: 13, padding: '0 16px', borderRadius: 11 }}><IconHome /> <span className={`${P}-tlab`}>Início da plataforma</span></button>
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto', padding: '28px 32px 60px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className={`${P}-grid`} style={{ display: 'grid', gridTemplateColumns: '330px minmax(0,1fr)', gap: 20, alignItems: 'stretch' }}>
          {/* Coluna esquerda */}
          <div className={`${P}-left`} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Boletim data={data} />
            <Ritmo />
            <Nps np={np} setNp={setNp} sent={nsent} onSend={() => setNsent(true)} />
          </div>
          {/* Coluna direita */}
          <div className={`${P}-right`} style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            <Downloads grupos={resultado.downloads} />
            <TabelaDisciplina data={data} />
            <Grafico data={data} />
          </div>
        </div>

        {/* Correção largura total */}
        <Correcao data={data} rq={rq} setRq={setRq} rf={rf} setRf={setRf} jx={jx} setJx={setJx} />
      </div>
    </div>
  )
}

// ── Boletim (navy + gauge + stats) ──────────────────────────────────────────
function Boletim({ data }: { data: SimMock }) {
  const r = data.resultado
  const liquida = r.liquida ?? 0
  const corte = r.cortEstimado ?? 0
  const max = data.info.n
  const delta = corte - liquida
  // gauge semicircular viewBox 0 0 200 116, arco r=80 centro (100,100), 180°→0°
  const R = 80, cx = 100, cy = 100
  const ang = (frac: number) => Math.PI - frac * Math.PI // 180°..0°
  const pt = (frac: number, rad = R) => [cx + rad * Math.cos(ang(frac)), cy - rad * Math.sin(ang(frac))]
  const fillFrac = Math.min(1, liquida / max)
  const [ex, ey] = pt(fillFrac)
  const [tx1, ty1] = pt(corte / max, R - 10)
  const [tx2, ty2] = pt(corte / max, R + 14)
  const largeArc = fillFrac > 0.5 ? 1 : 0

  return (
    <div style={{ borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
      <div style={{ position: 'relative', overflow: 'hidden', padding: '22px 24px', background: MEQ_NAVY_GRAD, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.2em', color: '#8BEAEA' }}>BOLETIM DE DESEMPENHO</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 6, background: MEQ_CYAN, color: '#0B1124', fontSize: 11.5, fontWeight: 700 }}>Corrigido</span>
        </div>
        <h1 style={{ margin: '10px 0 2px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em' }}>{data.info.titulo}</h1>
        <span style={{ fontSize: 12.5, color: '#A9C6F0' }}>{data.info.subtitulo} · {r.data}</span>
      </div>

      {/* Gauge */}
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg viewBox="0 0 200 124" style={{ width: '100%', maxWidth: 280 }}>
          <path d={`M20 100 A80 80 0 0 1 180 100`} fill="none" stroke="var(--track)" strokeWidth={16} strokeLinecap="round" />
          <path className={`${P}-gauge`} d={`M20 100 A80 80 0 ${largeArc} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`} fill="none" stroke="#3E7FE0" strokeWidth={16} strokeLinecap="round" />
          <line x1={tx1.toFixed(1)} y1={ty1.toFixed(1)} x2={tx2.toFixed(1)} y2={ty2.toFixed(1)} stroke={ERR_RED} strokeWidth={3} />
          <text x={tx2.toFixed(1)} y={(ty2 - 4).toFixed(1)} fontSize={9} fill={ERR_RED} fontWeight={700} textAnchor="middle">corte {corte}</text>
          <text x={cx} y={94} textAnchor="middle" fontSize={34} fontWeight={700} fill="var(--ink)">{liquida}</text>
          <text x={cx} y={112} textAnchor="middle" fontSize={9.5} fill="var(--muted)">nota líquida</text>
        </svg>
        {delta > 0 ? (
          <span style={{ marginTop: 6, height: 26, padding: '0 10px', borderRadius: 6, background: 'rgba(229,72,77,.1)', color: ERR_RED, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{delta} pontos abaixo do corte estimado</span>
        ) : (
          <span style={{ marginTop: 6, height: 26, padding: '0 10px', borderRadius: 6, background: 'rgba(31,168,104,.1)', color: OK_GREEN, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>acima do corte estimado</span>
        )}
      </div>

      {/* Stats */}
      <div style={{ padding: '0 18px 18px' }}>
        <Row label="Certos" value={String(r.certas)} color={OK_GREEN} top={false} />
        <Row label="Errados" value={String(r.erradas)} color={ERR_RED} />
        <Row label="Em branco" value={String(r.branco)} color="var(--ink)" />
        <Row label="Posição" value={`${r.posicao}º / ${r.total.toLocaleString('pt-BR')}`} color="var(--ink)" />
        {r.percentil != null ? <Row label="Percentil" value={String(r.percentil)} color="var(--brand2)" /> : null}
        <Row label="Tempo" value={`${r.tempo} de ${minDur(data.info.duracaoMin)}`} color="var(--ink)" />
      </div>
    </div>
  )
}

function Row({ label, value, color, top = true }: { label: string; value: string; color: string; top?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: top ? '1px solid var(--line)' : undefined, fontSize: 13 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <b style={{ color }}>{value}</b>
    </div>
  )
}

// ── Ritmo de prova ──────────────────────────────────────────────────────────
function Ritmo() {
  const linhas: [string, string, string][] = [
    ['Itens 1–40', '58 min', '1,5 min/item'],
    ['Itens 41–80', '1h02', '1,6 min/item'],
    ['Itens 81–120', '1h11', '1,8 min/item'],
  ]
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 18, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
      <b style={{ display: 'block', fontSize: 16, color: 'var(--ink)', marginBottom: 6 }}>Ritmo de prova</b>
      {linhas.map(([bloco, t, pace], i) => (
        <div key={bloco} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 0', borderTop: i === 0 ? undefined : '1px solid var(--line)' }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{bloco}</span>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
            <b style={{ fontSize: 15, color: 'var(--ink)' }}>{t}</b>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{pace}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

// ── NPS ─────────────────────────────────────────────────────────────────────
function Nps({ np, setNp, sent, onSend }: { np: number; setNp: (v: number) => void; sent: boolean; onSend: () => void }) {
  return (
    <div className={`${P}-fillc`} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 20, boxShadow: '0 1px 2px rgba(16,30,70,.04)', display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ color: 'var(--brand)' }}><IconStar /></span>
        <div>
          <b style={{ display: 'block', fontSize: 16, color: 'var(--ink)' }}>Como foi sua experiência?</b>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>De 0 a 10, o quanto recomendaria este simulado?</span>
        </div>
      </div>
      {sent ? (
        <div style={{ padding: 16, borderRadius: 12, background: 'rgba(31,168,104,.12)', color: OK_GREEN, textAlign: 'center', fontSize: 14, fontWeight: 700 }}>
          Obrigado! Sua avaliação ajuda a melhorar os próximos simulados.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {Array.from({ length: 11 }, (_, i) => {
              const sel = np === i
              const c = i <= 6 ? ERR_RED : i <= 8 ? AMBER : OK_GREEN
              return (
                <button key={i} type="button" onClick={() => setNp(i)} style={{ flex: 1, height: 42, border: `1px solid ${sel ? c : 'var(--line)'}`, borderRadius: 8, background: sel ? c : 'var(--surface)', color: sel ? '#fff' : 'var(--ink)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>{i}</button>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
            <span>Não recomendaria</span><span>Recomendaria muito</span>
          </div>
          <textarea placeholder="Quer contar o porquê? (opcional)" style={{ width: '100%', height: 76, padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--line2)', background: 'var(--surface)', font: 'inherit', fontSize: 13.5, color: 'var(--ink)', resize: 'none', marginBottom: 12 }} />
          <button type="button" className={`${P}-sbtn`} onClick={np >= 0 ? onSend : undefined} style={{ ...btnPrimary(46), marginTop: 'auto', opacity: np >= 0 ? 1 : 0.45, pointerEvents: np >= 0 ? 'auto' : 'none' }}>Enviar avaliação</button>
        </>
      )}
    </div>
  )
}

// ── Downloads ───────────────────────────────────────────────────────────────
function Downloads({ grupos }: { grupos: SimMock['resultado']['downloads'] }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 20, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
      <b style={{ display: 'block', fontSize: 16, color: 'var(--ink)', marginBottom: 14 }}>Materiais e downloads</b>
      {grupos.map((g, gi) => (
        <div key={g.grupo} style={{ marginTop: gi ? 16 : 0 }}>
          <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>{g.grupo}</span>
          <div className={`${P}-dgrid`} style={{ display: 'grid', gridTemplateColumns: g.itens.length >= 3 ? 'repeat(3,1fr)' : 'repeat(2,1fr)', gap: 10 }}>
            {g.itens.map((it) => (
              <button key={it.nome} type="button" className={`${P}-doc`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, cursor: 'pointer', textAlign: 'left', background: it.destaque ? 'var(--selBg)' : 'var(--surface)', border: `1.5px solid ${it.destaque ? 'var(--selLine)' : 'var(--line)'}` }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><IconDownload size={18} /></span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{it.nome}</span>
                <span style={{ color: 'var(--brand)', flexShrink: 0 }}><IconDownload size={16} /></span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tabela por disciplina ───────────────────────────────────────────────────
function TabelaDisciplina({ data }: { data: SimMock }) {
  const linhas = data.resultado.porMateria
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 18, boxShadow: '0 1px 2px rgba(16,30,70,.04)', display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <b style={{ fontSize: 16, color: 'var(--ink)' }}>Desempenho por disciplina</b>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Aprov. = líquida ÷ itens</span>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 260 }}>
        <div className={`${P}-nscroll`} style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface)' }}>
              <tr>
                {['Matéria', 'Itens', 'C', 'E', 'B', 'Líquida', 'Aprov.'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: i === 0 ? 'left' : 'center', borderBottom: '1px solid var(--line2)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((m) => {
                const erradas = m.total - m.certas - Math.max(0, m.total - m.certas - Math.round(m.total * 0.1))
                const branco = m.total - m.certas - erradas
                const liquida = m.certas - erradas
                const aprov = Math.max(0, Math.round((liquida / m.total) * 100))
                const barC = aprov >= 40 ? OK_GREEN : aprov >= 20 ? AMBER : ERR_RED
                return (
                  <tr key={m.nome} className={`${P}-rowh`}>
                    <td style={{ padding: '10px 8px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}>{m.nome}</td>
                    <Td v={m.total} c="var(--muted)" />
                    <Td v={m.certas} c={OK_GREEN} />
                    <Td v={erradas} c={ERR_RED} />
                    <Td v={branco} c="var(--muted)" />
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}>{liquida >= 0 ? `+${liquida}` : liquida}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--line)', minWidth: 90 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 2, background: 'var(--track)' }}>
                          <span className={`${P}-bar`} style={{ display: 'block', width: `${aprov}%`, height: '100%', borderRadius: 2, background: barC }} />
                        </div>
                        <b style={{ fontSize: 11.5, color: barC }}>{aprov}%</b>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Td({ v, c }: { v: number; c: string }) {
  return <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, color: c, borderBottom: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' }}>{v}</td>
}

// ── Gráfico líquida × corte ─────────────────────────────────────────────────
function Grafico({ data }: { data: SimMock }) {
  const linhas = data.resultado.porMateria
  const corteFrac = (data.resultado.cortEstimado ?? 0) / data.info.n // proporção ~43%
  const vals = linhas.map((m) => {
    const erradas = m.total - m.certas - Math.max(0, m.total - m.certas - Math.round(m.total * 0.1))
    return m.certas - erradas
  })
  const maxV = Math.max(...vals, 1)
  const ABBR: Record<string, string> = { 'Direito Administrativo': 'D. Adm.', 'Direito Constitucional': 'D. Const.', 'Língua Portuguesa': 'L. Port.', 'Raciocínio Lógico': 'R. Lógico', 'Direito Penal': 'D. Penal', 'Processo Penal': 'P. Penal', 'Informática': 'Inform.', 'Legislação Especial': 'Leg. Esp.' }
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 18, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <b style={{ fontSize: 16, color: 'var(--ink)' }}>Líquida por disciplina × meta do corte</b>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ width: 14, height: 2, background: ERR_RED }} /> meta proporcional ao corte
        </span>
      </div>
      <div className={`${P}-hs`} style={{ overflowX: 'auto' }}>
        <div className={`${P}-bars`} style={{ display: 'flex', gap: 10, minWidth: 520 }}>
          {linhas.map((m, i) => {
            const v = vals[i]
            const h = Math.max(4, Math.round((v / maxV) * 175))
            return (
              <div key={m.nome} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <b style={{ fontSize: 11, color: 'var(--ink)' }}>+{v}</b>
                <div className={`${P}-barbox`} style={{ position: 'relative', width: '100%', height: 175, display: 'flex', alignItems: 'flex-end' }}>
                  <span style={{ position: 'absolute', left: -2, right: -2, bottom: `${Math.round(corteFrac * 175)}px`, height: 2, background: ERR_RED, opacity: 0.8 }} />
                  <span className={`${P}-grow`} style={{ display: 'block', width: '100%', height: h, borderRadius: '4px 4px 1px 1px', background: 'linear-gradient(180deg,#5ECEF0,#3E7FE0)' }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.2 }}>{ABBR[m.nome] ?? m.nome}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Correção questão a questão ──────────────────────────────────────────────
function Correcao({ data, rq, setRq, rf, setRf, jx, setJx }: {
  data: SimMock; rq: number; setRq: (n: number) => void; rf: Filtro; setRf: (f: Filtro) => void; jx: boolean; setJx: (v: boolean) => void
}) {
  const itens = data.resultado.correcao
  const N = itens.length
  const cC = itens.filter((i) => i.status === 'certa').length
  const cE = itens.filter((i) => i.status === 'errada').length
  const cB = itens.filter((i) => i.status === 'branco').length
  const item = itens[rq - 1]

  const matchFilter = (s: SimCorrecaoItem['status']) => rf === 'all' || (rf === 'e' && s === 'errada') || (rf === 'c' && s === 'certa') || (rf === 'b' && s === 'branco')
  const nextErr = () => {
    for (let n = rq + 1; n <= N; n++) if (itens[n - 1].status === 'errada') { setRq(n); return }
    for (let n = 1; n <= rq; n++) if (itens[n - 1].status === 'errada') { setRq(n); return }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 22, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <b style={{ fontSize: 18, color: 'var(--ink)' }}>Correção questão a questão</b>
        <div className={`${P}-hs`} style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          <Pill active={rf === 'all'} onClick={() => setRf('all')} label={`Todas · ${N}`} />
          <Pill active={rf === 'e'} onClick={() => setRf('e')} label={`Erradas · ${cE}`} />
          <Pill active={rf === 'c'} onClick={() => setRf('c')} label={`Certas · ${cC}`} />
          <Pill active={rf === 'b'} onClick={() => setRf('b')} label={`Em branco · ${cB}`} />
        </div>
      </div>

      <div className={`${P}-corr`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 18, alignItems: 'start' }}>
        <CardCorrecao item={item} rq={rq} N={N} jx={jx} setJx={setJx} onPrev={() => setRq(Math.max(1, rq - 1))} onNext={() => setRq(Math.min(N, rq + 1))} onNextErr={nextErr} hasErr={cE > 0} />

        <aside className={`${P}-corrnav`} style={{ alignSelf: 'start', position: 'sticky', top: 90 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 18, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
            <b style={{ display: 'block', fontSize: 15, color: 'var(--ink)', marginBottom: 12 }}>Navegador</b>
            <div className={`${P}-cnavgrid ${P}-nscroll`} style={{ maxHeight: 440, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
              {itens.map((it) => {
                const atual = it.numero === rq
                const dim = !matchFilter(it.status)
                const bg = it.status === 'certa' ? OK_GREEN : it.status === 'errada' ? ERR_RED : 'var(--surface2)'
                const color = it.status === 'branco' ? 'var(--muted)' : '#fff'
                return (
                  <button key={it.numero} type="button" onClick={() => setRq(it.numero)} style={{ height: 34, border: 0, borderRadius: 8, background: bg, color, font: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: dim ? 0.18 : 1, boxShadow: atual ? '0 0 0 2px var(--surface),0 0 0 4px var(--ink)' : undefined, transition: 'opacity .2s' }}>{it.numero}</button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
              <LegC sw={OK_GREEN} label="Certa" /><LegC sw={ERR_RED} label="Errada" /><LegC sw="var(--surface2)" label="Branco" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Pill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} style={{ flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 99, border: `1px solid ${active ? 'var(--selLine)' : 'var(--line)'}`, background: active ? 'var(--selBg)' : 'var(--surface)', color: active ? 'var(--brand)' : 'var(--muted)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
  )
}

function LegC({ sw, label }: { sw: string; label: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: sw }} />{label}</span>
}

function CardCorrecao({ item, rq, N, jx, setJx, onPrev, onNext, onNextErr, hasErr }: {
  item: SimCorrecaoItem; rq: number; N: number; jx: boolean; setJx: (v: boolean) => void; onPrev: () => void; onNext: () => void; onNextErr: () => void; hasErr: boolean
}) {
  const statusPill = item.status === 'certa'
    ? { bg: 'rgba(31,168,104,.12)', color: OK_GREEN, label: 'Acertou', icon: <IconCheck size={13} sw={3} /> }
    : item.status === 'errada'
      ? { bg: 'rgba(229,72,77,.12)', color: ERR_RED, label: 'Errou', icon: <IconX size={13} /> }
      : { bg: 'var(--surface2)', color: 'var(--muted)', label: 'Em branco', icon: null }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 22, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
      <div key={rq} className={`${P}-qin`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ height: 28, padding: '0 11px', borderRadius: 8, background: 'var(--surface2)', fontSize: 13, fontWeight: 800, color: 'var(--ink)', display: 'inline-flex', alignItems: 'center' }}>Questão {item.numero}</span>
          <span style={{ height: 26, padding: '0 10px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{item.materia}</span>
          <span style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 99, background: statusPill.bg, color: statusPill.color, fontSize: 12, fontWeight: 800 }}>{statusPill.icon}{statusPill.label}</span>
        </div>

        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--ink)' }}>{item.enunciado}</p>

        {/* Blocos Certo / Errado */}
        <div className={`${P}-ceblk`} style={{ display: 'flex', gap: 10 }}>
          <BlocoCE letra="C" rotulo="Certo" item={item} />
          <BlocoCE letra="E" rotulo="Errado" item={item} />
        </div>

        {/* Comentário do professor */}
        <div style={{ borderRadius: 14, border: '1px solid var(--line)', overflow: 'hidden' }}>
          <button type="button" onClick={() => setJx(!jx)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', border: 0, background: 'var(--surface2)', font: 'inherit', cursor: 'pointer' }}>
            <span style={{ color: 'var(--brand)' }}><IconBulb /></span>
            <b style={{ flex: 1, textAlign: 'left', fontSize: 14, color: 'var(--ink)' }}>Comentário do professor · gabarito {item.gabarito}</b>
            <span style={{ display: 'inline-flex', transform: jx ? 'rotate(180deg)' : 'none', transition: 'transform .25s', color: 'var(--muted)' }}><IconChevD /></span>
          </button>
          {jx ? <p className={`${P}-qin`} style={{ margin: 0, padding: '14px 16px', fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink)' }}>{item.comentario}</p> : null}
        </div>

        <div style={{ display: 'flex', gap: 8, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <button type="button" className={`${P}-sbtn`} onClick={onPrev} style={{ ...btnGhost(44), width: 'auto', opacity: rq === 1 ? 0.4 : 1, pointerEvents: rq === 1 ? 'none' : 'auto' }}><IconChevL /> Anterior</button>
          <span style={{ flex: 1 }} />
          <button type="button" className={`${P}-sbtn`} onClick={onNextErr} style={{ ...btnGhost(44), width: 'auto', opacity: hasErr ? 1 : 0.4, pointerEvents: hasErr ? 'auto' : 'none' }}><IconX size={14} /> Próxima errada</button>
          <button type="button" className={`${P}-sbtn`} onClick={onNext} style={{ ...btnPrimary(44), width: 'auto' }}>Próxima <IconChevR /></button>
        </div>
      </div>
    </div>
  )
}

function BlocoCE({ letra, rotulo, item }: { letra: string; rotulo: string; item: SimCorrecaoItem }) {
  const isGab = item.gabarito === letra
  const isSua = item.suaResposta === letra
  const borda = isGab ? OK_GREEN : isSua ? ERR_RED : 'var(--line)'
  const bg = isGab ? 'rgba(31,168,104,.08)' : isSua ? 'rgba(229,72,77,.08)' : 'var(--surface)'
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, height: 56, padding: '0 14px', borderRadius: 12, border: `2px solid ${borda}`, background: bg }}>
      <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface2)', color: 'var(--ink)', border: '1.5px solid var(--line2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{letra}</span>
      <b style={{ fontSize: 15, color: 'var(--ink)' }}>{rotulo}</b>
      <span style={{ flex: 1 }} />
      {isGab ? <span style={{ fontSize: 11, fontWeight: 800, color: OK_GREEN }}>GABARITO</span> : null}
      {isSua && !isGab ? <span style={{ fontSize: 11, fontWeight: 800, color: ERR_RED }}>SUA RESPOSTA</span> : null}
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────
function minDur(min: number | null): string {
  if (min == null) return 'sem limite'
  const h = Math.floor(min / 60), m = min % 60
  return `${h}h${String(m).padStart(2, '0')}`
}

function css() {
  return `
.${P}-app{font-synthesis-weight:none}
${baseKeyframes(P)}
@media (max-width:640px){
  .${P}-top{padding:0 14px;gap:12px}
  .${P}-tlab{display:none}
  .${P}-tbtn{padding:0 12px!important}
  .${P}-grid{grid-template-columns:1fr!important}
  /* ordem mobile: boletim → downloads → tabela → gráfico → ritmo → NPS */
  .${P}-left{display:contents}
  .${P}-right{display:contents}
  .${P}-left>*:nth-child(1){order:1}   /* boletim */
  .${P}-right>*:nth-child(1){order:2}  /* downloads */
  .${P}-right>*:nth-child(2){order:3}  /* tabela */
  .${P}-right>*:nth-child(3){order:4}  /* gráfico */
  .${P}-left>*:nth-child(2){order:5}   /* ritmo */
  .${P}-left>*:nth-child(3){order:6}   /* nps */
  .${P}-grid{display:flex!important;flex-direction:column;gap:18px}
  .${P}-dgrid{grid-template-columns:1fr!important}
  .${P}-corr{grid-template-columns:1fr!important}
  .${P}-corrnav{position:static!important;order:-1}
  .${P}-cnavgrid{grid-template-columns:repeat(8,1fr)!important;max-height:300px!important}
  .${P}-barbox{height:130px!important}
}`
}
