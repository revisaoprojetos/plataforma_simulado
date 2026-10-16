'use client'

// ÁREA INTERNA da Maratona de Simulados — dentro do portal (mantém sidebar + top bar). Full-bleed, com
// identidade PRÓPRIA do desafio (navy + dourado, fundo claro), abas Percurso/Painel/Ranking/Medalhas e
// "Voltar ao início". Porte do design `MARATONADESIMULADOS-main` (telas estáticas; dados MOCK, admin depois).

import { useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import type { InternaTheme } from '@/components/brand/interna/interna-tokens'
import { ChevronLeft, Map, User, Trophy, Medal, Plane, Check, MapPin, Lock, Flag } from 'lucide-react'
import { PERCURSO, MEDALHAS, rankingSemana, SEMANAS } from './dados'

type Aba = 'percurso' | 'painel' | 'ranking' | 'medalhas'
// Marca (iguais nos 2 temas; superfícies escuras / acento): NAVY/GOLD. INK fica literal p/ FUNDOS escuros
// (dots/chips/botão). As demais cores (fundo da página, cards, texto, borda) viram tokens que o CSS troca
// no tema escuro (.dark .mxi-root) — ver bloco CSS. INK_TX/TEXT = as versões de TEXTO (claras no escuro).
const NAVY = '#071A3F', GOLD = '#F7B500', INK = '#1A367C'
const TEXT = 'var(--mxi-text)', INK_TX = 'var(--mxi-ink)', MUT = 'var(--mxi-mut)', LINE = 'var(--mxi-line)', BG = 'var(--mxi-bg)'
const CARD = 'var(--mxi-card)', CARD_SUB = 'var(--mxi-card-sub)'
const MONO = "'DM Mono', ui-monospace, monospace"

export function MaratonaInterno(_props: { theme: InternaTheme }) {
  const [aba, setAba] = useState<Aba>('painel')
  const TABS: { k: Aba; label: string; icon: React.ReactNode }[] = [
    { k: 'percurso', label: 'Percurso', icon: <Map size={15} /> },
    { k: 'painel', label: 'Painel', icon: <User size={15} /> },
    { k: 'ranking', label: 'Ranking', icon: <Trophy size={15} /> },
    { k: 'medalhas', label: 'Medalhas', icon: <Medal size={15} /> },
  ]
  return (
    // Container de rolagem PRÓPRIO (altura = viewport menos a top bar do shell) → a barra do desafio
    // gruda no topo DELE (top:0), encostando na top bar do sistema, sem gap nem sobreposição.
    <div className="mxi-root" style={{ display: 'flex', flexDirection: 'column', background: BG, fontFamily: 'Archivo, system-ui, Arial, sans-serif', color: TEXT }}>
      <style>{CSS}</style>
      {/* Top bar da maratona: voltar + marca + abas */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: NAVY, borderBottom: `3px solid ${GOLD}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', flexWrap: 'wrap' }}>
          <Link href="/aluno" className="mxi-back" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 9, background: 'rgba(255,255,255,.1)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
            <ChevronLeft size={16} /> Voltar ao início
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: GOLD, color: NAVY, fontWeight: 900, fontStyle: 'italic', fontSize: 15 }}>M</span>
            <div style={{ lineHeight: 1.05 }}>
              <div style={{ fontSize: 10.5, letterSpacing: '.12em', color: '#BCC8E0', fontWeight: 700 }}>MARATONA DE SIMULADOS</div>
              <b style={{ fontSize: 15, fontStyle: 'italic' }}>ENAP + AGU</b>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: 4, marginLeft: 'auto', overflowX: 'auto' }} aria-label="Telas da maratona">
            {TABS.map((t) => (
              <button key={t.k} type="button" onClick={() => setAba(t.k)} aria-current={aba === t.k ? 'page' : undefined}
                className="mxi-tab" data-on={aba === t.k ? '1' : '0'}>
                {t.icon}<span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* main SEM padding lateral → o banner do Painel fica fora a fora; as demais abas usam wrapper com px. */}
      <main style={{ flex: 1, width: '100%' }}>
        {aba === 'percurso' && <div style={{ padding: '20px 24px 32px' }}><Percurso /></div>}
        {aba === 'painel' && <Painel onVerMapa={() => setAba('percurso')} />}
        {aba === 'ranking' && <div style={{ padding: '20px 24px 32px' }}><Ranking /></div>}
        {aba === 'medalhas' && <div style={{ padding: '20px 24px 32px' }}><Medalhas /></div>}
      </main>
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: CARD, borderRadius: 16, boxShadow: '0 1px 3px rgba(7,26,63,.08)', ...style }}>{children}</div>
}
function Kicker({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: INK_TX }}>{children}</div>
}

/* ─────────── PERCURSO (do aeroporto ao Ed. II da AGU) ─────────── */
function Percurso() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card style={{ padding: 22, background: `linear-gradient(120deg, ${NAVY}, #12225f 55%, #24126e)`, color: '#fff' }}>
        <Kicker><span style={{ color: GOLD }}>Do aeroporto ao Ed. II da AGU</span></Kicker>
        <b style={{ display: 'block', margin: '6px 0 4px', fontSize: 26, letterSpacing: '-.02em' }}>Uma maratona por Brasília</b>
        <p style={{ margin: 0, maxWidth: 620, fontSize: 13.5, lineHeight: 1.55, color: '#CFD6EA' }}>
          Largada no Aeroporto (número de peito) e chegada no Ed. II da AGU — onde foi a posse do último concurso. Cada simulado concluído é uma parada e uma medalha de km.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
          <span className="mxi-pill" style={{ background: 'rgba(247,181,0,.16)', border: `1px solid ${GOLD}`, color: GOLD }}>KM 0 · Largada</span>
          <span className="mxi-pill" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.2)' }}>KM 42,195 · Finisher</span>
        </div>
      </Card>

      {/* Linha do percurso */}
      <Card style={{ padding: 20 }}>
        <Kicker>Percurso · 3 simulados</Kicker>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {PERCURSO.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, borderRadius: 12, border: `1px solid ${LINE}`, background: p.km === '0' ? CARD_SUB : CARD }}>
              <div style={{ width: 54, textAlign: 'center', flexShrink: 0 }}>
                <b style={{ display: 'block', fontSize: 18, fontStyle: 'italic', color: INK_TX }}>{p.km}</b>
                <span style={{ fontSize: 10, color: MUT, fontWeight: 700 }}>KM</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 15 }}>{p.name}</b>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: INK_TX, background: 'rgba(26,54,124,.08)', borderRadius: 99, padding: '2px 8px' }}>{p.code}</span>
                </div>
                <span style={{ fontSize: 12, color: MUT }}>{p.local}</span>
              </div>
              {p.medal ? <img src={`/maratona/${p.medal}`} alt="" style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0 }} /> : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ─────────── PAINEL do corredor (PORTE FIEL de painel.html / template "Painel") ─────────── */
// Estado inicial do aluno na maratona = LARGADA (cur=0). Progresso real virá do backend (fase 2);
// a lógica abaixo é a MESMA do protótipo (steps/medalha/parciais por checkpoint).
const B = '/maratona/'
const LAST_STEP = 4
const PAINEL_D = [
  { stage: 0, medal: 0, code: 'LARGADA', stepName: 'Aeroporto', short: 'Aeroporto', name: 'Aeroporto', km: '0', date: 'inscrição', local: 'Aeroporto de Brasília', img: B + 'foto-aeroporto.jpg' },
  { stage: 1, medal: 2, code: 'PC 1 · 17/10', stepName: 'AGU', short: 'PC 1 · AGU', name: 'AGU', km: '21', date: '17/10', local: 'SAS Qd. 3', img: B + 'foto-agu.jpg' },
  { stage: 2, medal: 3, code: 'PC 2 · 24/10', stepName: 'PGF', short: 'PC 2 · PGF', name: 'PGF', km: '28', date: '24/10', local: 'SAUN Qd. 5 [a confirmar]', img: B + 'foto-pgf.jpg' },
  { stage: 3, medal: 4, code: 'PASSAGEM · 31/10', stepName: 'PGFN', short: 'PGFN', name: 'PGFN', km: '35', date: '31/10', local: 'SAUN Qd. 5', img: B + 'foto-pgfn.jpg' },
  { stage: 3, medal: 5, code: 'CHEGADA · 31/10', stepName: 'Ed. II AGU', short: 'Ed. II da AGU', name: 'Ed. II da AGU', km: '42,195', date: '31/10', local: 'SAUN Qd. 5, Lote C', img: B + 'foto-ed-ii-agu.jpg' },
]
const PAINEL_SIM = [
  { label: 'Simulado 1 · 17/10', dest: 'AGU', km: '21', medal: 2 },
  { label: 'Simulado 2 · 24/10', dest: 'PGF', km: '28', medal: 3 },
  { label: 'Simulado 3 · 31/10', dest: 'PGFN e chegada no Ed. II da AGU', km: '42,195', medal: 5 },
]
// Medalha nº → [conquistada, bloqueada] (mesma lista do template "Medalha").
const MEDAL_IMG: Record<number, [string, string]> = {
  2: ['medalha-agu.png', 'medalha-agu-bloqueada.png'],
  3: ['medalha-pgf.png', 'medalha-pgf-bloqueada.png'],
  4: ['medalha-pgfn.png', 'medalha-pgfn-bloqueada.png'],
  5: ['medalha-ed-ii-agu.png', 'medalha-ed-ii-agu-bloqueada.png'],
}
const medalSrc = (n: number, on: boolean) => B + (MEDAL_IMG[n]?.[on ? 0 : 1] ?? MEDAL_IMG[2][1])
const kickerLt: CSSProperties = { fontStretch: '125%', fontWeight: 800, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '3px', fontSize: 13, color: '#CBB8FF' }
const kickerDk: CSSProperties = { fontStretch: '125%', fontWeight: 800, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '3px', fontSize: 13, color: INK_TX }
const chipBase: CSSProperties = { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontStretch: '125%', fontWeight: 800, fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase' }
const panelCard: CSSProperties = { background: CARD, borderRadius: 16, boxShadow: '0 10px 30px rgba(7,26,63,.12)' }

function Painel({ onVerMapa }: { onVerMapa: () => void }) {
  const cur: number = 0 // LARGADA (mock). Trocar por progresso real (0..3) quando ligar o backend.
  const finished = cur === 3
  const st = (i: number): 'done' | 'now' | 'locked' => { const g = PAINEL_D[i].stage; return (finished || g < cur) ? 'done' : (g === cur ? 'now' : 'locked') }
  const lastIdx = finished ? LAST_STEP : cur

  const steps = PAINEL_D.map((d, i) => {
    const s = st(i); const isLast = i === LAST_STEP
    let dot: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', width: 38, height: 38, borderRadius: '50%', boxSizing: 'border-box' }
    if (isLast && s !== 'now') dot = { ...dot, background: GOLD, border: `2px solid ${GOLD}`, ...(s === 'locked' ? { opacity: 0.55 } : {}) }
    else if (s === 'now') dot = { ...dot, background: '#53308F', border: '2px solid #53308F', boxShadow: '0 0 0 5px #CBB8FF' }
    else if (i === 0) dot = { ...dot, background: NAVY, border: `2px solid ${NAVY}` }
    else if (s === 'done') dot = { ...dot, background: INK, border: `2px solid ${INK}` }
    else dot = { ...dot, background: CARD, border: '2px dashed #C9D1E0' }
    const lineBase: CSSProperties = { flex: '1 1 auto', height: 4, borderRadius: 2 }
    const isStart = i === 0 && s !== 'now'
    const icon: ReactNode = isStart ? <Plane size={16} color="#fff" />
      : (isLast && s !== 'now') ? <Flag size={16} color={NAVY} />
        : (i > 0 && i < LAST_STEP && s === 'done') ? <Check size={16} color="#fff" />
          : s === 'now' ? <MapPin size={16} color="#fff" />
            : (i > 0 && i < LAST_STEP && s === 'locked') ? <Lock size={14} color="#3B4866" /> : null
    return {
      codeLabel: d.code + (s === 'now' ? ' · VOCÊ' : ''), stepName: d.stepName, dot, icon,
      lineL: { ...lineBase, background: i === 0 ? 'transparent' : (s !== 'locked' ? GOLD : '#CBD4E4') } as CSSProperties,
      lineR: { ...lineBase, background: isLast ? 'transparent' : (st(i + 1) !== 'locked' ? GOLD : '#CBD4E4') } as CSSProperties,
    }
  })

  const c = PAINEL_D[lastIdx]
  const nx = PAINEL_SIM[Math.min(cur, 2)]
  const h = cur === 0
    ? { rotulo: 'Largada · KM 0', titulo: 'Aeroporto', resumo: 'Seu número de peito está pronto. Primeiro simulado em 17/10: ele leva você até a AGU.' }
    : finished
      ? { rotulo: 'Chegada · KM 42,195', titulo: 'Você cruzou a chegada no Ed. II da AGU', resumo: '3 de 3 simulados concluídos. Passou pela PGFN e chegou onde foi a posse do último concurso. Confira sua classificação, o selo Finisher e o certificado.' }
      : { rotulo: 'Você está no · KM ' + c.km, titulo: PAINEL_D[lastIdx].code.split(' · ')[0] + ' · ' + c.stepName, resumo: cur + ' de 3 simulados concluídos. Próximo: ' + nx.label + ', até ' + nx.dest + '.' }
  const p = cur === 0
    ? { n: 2, on: false, codeLabel: 'LARGADA', local: c.local, img: c.img, chip: 'Largada', chipStyle: { ...chipBase, background: NAVY, color: '#fff' } as CSSProperties, medalTitle: 'Primeira medalha: KM 21 · AGU', medalText: 'São três simulados e quatro medalhas: AGU (17/10), PGF (24/10) e, em 31/10, PGFN e a chegada no Ed. II da AGU.' }
    : finished
      ? { n: 5, on: true, codeLabel: 'CHEGADA', local: c.local, img: c.img, chip: 'Chegada', chipStyle: { ...chipBase, background: GOLD, color: NAVY } as CSSProperties, medalTitle: 'Medalhas KM 35 e KM 42,195', medalText: 'O simulado de 31/10 levou você pela PGFN até a chegada. As quatro medalhas e o selo Finisher estão no seu perfil.' }
      : { n: c.medal, on: true, codeLabel: PAINEL_D[lastIdx].code, local: c.local, img: c.img, chip: 'Parcial registrada · ' + c.date, chipStyle: { ...chipBase, background: INK, color: '#fff' } as CSSProperties, medalTitle: 'Medalha KM ' + c.km + ' · ' + c.short, medalText: PAINEL_SIM[cur - 1].label + ' concluído. Você já correu ' + c.km + ' km do percurso.' }
  const n = finished
    ? { trecho: 'Percurso concluído', chip: 'Chegada', chipStyle: { ...chipBase, background: GOLD, color: NAVY } as CSSProperties, titulo: 'Classificação final', meta: 'Nº 0001 · [posição] · [pts]', botao: 'Ver classificação' }
    : { trecho: (cur === 0 ? 'Aeroporto' : c.short) + ' → ' + nx.dest + ' · vale a medalha KM ' + nx.km, chip: 'Novo simulado', chipStyle: { ...chipBase, background: BG, color: TEXT } as CSSProperties, titulo: nx.label, meta: '[nº] questões · [tempo] min · libera em ' + nx.label.split(' · ')[1], botao: cur === 2 ? 'Correr até a chegada →' : 'Correr até o PC ' + (cur + 1) + ' →' }
  const parciais = PAINEL_SIM.map((s, i) => {
    const done = i < cur, now = i === cur
    let row: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 40, padding: '0 14px', borderRadius: 8, boxSizing: 'border-box' }
    let v = '--'
    if (done) { row = { ...row, background: BG, color: TEXT }; v = '[00:00:00]' }
    else if (now) { row = { ...row, background: '#53308F', color: '#fff' }; v = 'próximo' }
    else { row = { ...row, background: CARD, border: `1px solid ${LINE}`, color: MUT } }
    return { label: s.label + ' · ' + s.dest.split(' e ')[0], val: v, rowStyle: row }
  })

  return (
    <div>
      {/* HEADER navy com faixas diagonais + peito + tempo — FULL-BLEED (fora a fora), sem bordas arredondadas */}
      <header style={{ position: 'relative', overflow: 'hidden', background: NAVY, color: '#fff' }}>
        <svg aria-hidden="true" viewBox="0 0 1440 460" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <g transform="rotate(-8 720 240)">
            <rect x="-200" y="150" width="1900" height="26" fill="#1A367C" />
            <rect x="-200" y="190" width="1900" height="26" fill="#1A367C" />
            <rect x="-200" y="230" width="1900" height="26" fill="#53308F" />
          </g>
        </svg>
        <div style={{ position: 'relative', padding: '24px 24px 72px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span style={kickerLt}>Maratona de simulados · ENAP + AGU</span>
            <img src="/maratona/logo-revisao.png" alt="Revisão Ensino Jurídico" style={{ height: 28, width: 'auto' }} />
          </div>
          <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 32 }}>
            <img src="/maratona/peito-compacto.png" alt="Número de peito · Nº 0001" style={{ width: 200, height: 200, maxWidth: '42vw', transform: 'rotate(-4deg)', filter: 'drop-shadow(0 16px 26px rgba(0,0,0,.35))' }} />
            <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={kickerLt}>{h.rotulo}</span>
              <h1 style={{ margin: 0, fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 52, lineHeight: 0.98 }}>{h.titulo}</h1>
              <p style={{ margin: 0, maxWidth: 560, fontSize: 15.5, lineHeight: 1.55, color: '#BCC8E0' }}>{h.resumo}</p>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: 13, color: '#BCC8E0' }}>Tempo de prova acumulado</span>
                <span style={{ fontFamily: MONO, fontSize: 34, lineHeight: 1 }}>[00:00:00]</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* conteúdo sobreposto ao header (como no protótipo: margin-top negativo) + padding lateral próprio */}
      <div style={{ position: 'relative', marginTop: -48, padding: '0 24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Percurso em etapas */}
        <section style={{ ...panelCard, padding: '22px 26px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
            <span style={kickerDk}>Percurso</span>
            <button type="button" onClick={onVerMapa} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: INK_TX }}>Ver mapa completo</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            {steps.map((s, i) => (
              <div key={i} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <span style={s.lineL} />
                  <span style={s.dot}>{s.icon}</span>
                  <span style={s.lineR} />
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: MUT, whiteSpace: 'nowrap' }}>{s.codeLabel}</span>
                <span className="pn-step-name" style={{ fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 14, textAlign: 'center' }}>{s.stepName}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Parada atual: foto + medalha */}
        <section style={{ ...panelCard, overflow: 'hidden', display: 'flex', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 380px', minHeight: 260, position: 'relative', background: NAVY }}>
            <img src={p.img} alt={'Foto ilustrativa · ' + c.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <span style={{ position: 'absolute', left: 14, top: 14, padding: '5px 10px', borderRadius: 8, background: NAVY, color: '#fff', fontFamily: MONO, fontSize: 12 }}>{p.codeLabel} · {p.local}</span>
          </div>
          <div style={{ flex: '1 1 380px', minWidth: 0, padding: 28, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <img src={medalSrc(p.n, p.on)} alt="Medalha" style={{ display: 'block', width: 150, height: 206, flexShrink: 0 }} />
            <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={p.chipStyle}>{p.chip}</span>
              <h2 style={{ margin: 0, fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 26, lineHeight: 1.05 }}>{p.medalTitle}</h2>
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55, color: MUT }}>{p.medalText}</p>
            </div>
          </div>
        </section>

        {/* Próximo simulado + Parciais */}
        <section style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
          <div style={{ ...panelCard, flex: '999 1 480px', minWidth: 0, padding: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 13, color: MUT }}>{n.trecho}</span>
              <span style={n.chipStyle}>{n.chip}</span>
            </div>
            <h3 style={{ margin: 0, fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 28, lineHeight: 1.05 }}>{n.titulo}</h3>
            <span style={{ fontFamily: MONO, fontSize: 14, color: MUT }}>{n.meta}</span>
            <button type="button" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', minHeight: 48, padding: '0 22px', borderRadius: 10, border: 0, cursor: 'pointer', background: INK, color: '#fff', fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 15, letterSpacing: '0.5px' }}>{n.botao}</button>
          </div>
          <div style={{ ...panelCard, flex: '1 1 280px', minWidth: 0, padding: 26, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ ...kickerDk, marginBottom: 6 }}>Parciais</span>
            {parciais.map((r, i) => (
              <div key={i} style={r.rowStyle}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{r.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 13 }}>{r.val}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

/* ─────────── RANKING (semanas + geral) ─────────── */
function Ranking() {
  const [wk, setWk] = useState(0)
  const isGeral = wk === 3
  const lista = rankingSemana(wk)
  const head = isGeral
    ? { rotulo: 'Ranking geral · acumulado', resumo: 'Soma dos pontos de todas as semanas fechadas. Empate: mais acertos e, depois, menor tempo total de prova.' }
    : { rotulo: `Ranking da ${SEMANAS[wk].nome.toLowerCase()} · ${SEMANAS[wk].pontos}`, resumo: 'Pontos dos simulados liberados nesta semana. A classificação zera a cada semana; o acumulado fica no geral.' }
  const tabs = [...SEMANAS.map((s, i) => ({ label: s.nome, i })), { label: 'Geral', i: 3 }]
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card style={{ padding: 20 }}>
        <Kicker>{head.rotulo}</Kicker>
        <b style={{ display: 'block', margin: '6px 0 4px', fontSize: 22 }}>{isGeral ? 'Quem lidera a maratona' : 'Ranking da semana'}</b>
        <p style={{ margin: 0, fontSize: 12.5, color: MUT, maxWidth: 640 }}>{head.resumo}</p>
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button key={t.i} type="button" onClick={() => setWk(t.i)} className="mxi-wk" data-on={t.i === wk ? '1' : '0'}>{t.label}</button>
          ))}
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 72px 80px', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${LINE}`, fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: MUT }}>
          <span>#</span><span>Corredor (peito)</span><span style={{ textAlign: 'right' }}>Var.</span><span style={{ textAlign: 'right' }}>Pontos</span>
        </div>
        {lista.map((r, i) => (
          <div key={r.n} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 72px 80px', gap: 8, alignItems: 'center', padding: '11px 16px', borderBottom: `1px solid ${LINE}`, background: i < 3 ? 'rgba(247,181,0,.06)' : CARD }}>
            <span style={{ fontWeight: 900, fontStyle: 'italic', color: i < 3 ? GOLD : INK_TX }}>{i + 1}º</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: TEXT }}>#{r.n}</span>
            <span style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: r.v > 0 ? '#1A8F4C' : r.v < 0 ? '#C0392B' : MUT }}>{r.v > 0 ? `▲ ${r.v}` : r.v < 0 ? `▼ ${Math.abs(r.v)}` : '='}</span>
            <b style={{ textAlign: 'right', fontStyle: 'italic', color: INK_TX }}>{r.pts}</b>
          </div>
        ))}
      </Card>

      <Card style={{ padding: 20 }}>
        <Kicker>Como a pontuação funciona</Kicker>
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: MUT }}>
          <li>Cada simulado da semana dá pontos pela quantidade de acertos.</li>
          <li>A classificação <b>zera a cada semana</b>; o acumulado fica no <b>Ranking geral</b>.</li>
          <li>Empate: mais acertos e, depois, menor tempo total de prova.</li>
        </ul>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: MUT, fontStyle: 'italic' }}>Regra proposta — a validar com o Pedagógico. Números de exemplo.</p>
      </Card>
    </div>
  )
}

/* ─────────── MEDALHAS + selos ─────────── */
function Medalhas() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card style={{ padding: 20 }}>
        <Kicker>Uma medalha a cada parada</Kicker>
        <b style={{ display: 'block', margin: '6px 0 12px', fontSize: 22 }}>Suas medalhas de km</b>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {MEDALHAS.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '22px 12px 18px', borderRadius: 16, background: i === 3 ? NAVY : CARD_SUB, border: `1px solid ${LINE}` }}>
              <img src={`/maratona/${m.img}`} alt="" style={{ width: 96, height: 96, objectFit: 'contain', opacity: 0.45, filter: 'grayscale(.4)' }} />
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, textAlign: 'center', color: i === 3 ? '#CBB8FF' : MUT }}>{m.txt}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ padding: 20 }}>
        <Kicker>Selo da maratona e selo finisher</Kicker>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {[{ img: 'selo-maratona.png', t: 'Selo Maratona', d: 'Participou da maratona' }, { img: 'selo-finisher-42k.png', t: 'Finisher 42k', d: 'Completou os 42,195 km' }].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, border: `1px solid ${LINE}`, background: CARD_SUB, minWidth: 220, flex: '1 1 220px' }}>
              <img src={`/maratona/${s.img}`} alt="" style={{ width: 64, height: 64, objectFit: 'contain', opacity: 0.5 }} />
              <div><b style={{ display: 'block', fontSize: 14 }}>{s.t}</b><span style={{ fontSize: 12, color: MUT }}>{s.d}</span></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

const CSS = `
.mxi-tab { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 14px; border-radius:9px; border:0; background:transparent; color:#BCC8E0; font:inherit; font-size:12.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; cursor:pointer; white-space:nowrap; }
.mxi-tab:hover { color:#fff; }
.mxi-tab[data-on="1"] { background:#53308F; color:#fff; }
.mxi-back:hover { background:rgba(255,255,255,.2)!important; }
.mxi-pill { display:inline-flex; align-items:center; height:28px; padding:0 12px; border-radius:99px; font-size:12px; font-weight:800; letter-spacing:.04em; }
.mxi-wk { min-height:40px; padding:0 16px; border-radius:10px; cursor:pointer; font:inherit; font-weight:800; font-style:italic; text-transform:uppercase; font-size:12.5px; letter-spacing:1px; background:#fff; color:#071A3F; border:2px solid #CBD4E4; }
.mxi-wk[data-on="1"] { background:#1A367C; color:#fff; border-color:#1A367C; }
/* Container de rolagem próprio: altura = viewport menos a top bar do shell (72px desktop / 64px mobile).
   Assim a barra do desafio gruda no topo deste container, logo abaixo da barra do sistema. */
.mxi-root { height:calc(100dvh - 72px); overflow-y:auto;
  --mxi-bg:#E9EDF3; --mxi-card:#fff; --mxi-card-sub:#F4F7FC; --mxi-text:#071A3F; --mxi-ink:#1A367C; --mxi-mut:#3B4866; --mxi-line:#CBD4E4; }
/* Tema ESCURO: fundo/cards/texto/borda trocam; navy+dourado (marca) permanecem. */
.dark .mxi-root { --mxi-bg:#0a1122; --mxi-card:#121a30; --mxi-card-sub:#19233d; --mxi-text:#e7ebf5; --mxi-ink:#9db2e8; --mxi-mut:#9aa6c2; --mxi-line:#2a3450; }
.dark .mxi-root .mxi-wk { background:var(--mxi-card); color:var(--mxi-text); border-color:var(--mxi-line); }
.dark .mxi-root .mxi-wk[data-on="1"] { background:#1A367C; color:#fff; border-color:#1A367C; }
@media (max-width:720px){ .pn-step-name{display:none} }
@media (max-width:640px){ .mxi-root{ height:calc(100dvh - 64px); } }
`
