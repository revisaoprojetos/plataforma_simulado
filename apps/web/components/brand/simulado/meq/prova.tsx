'use client'

// SIMULADO MEQ — PROVA (spec 06 §2). Certo/Errado (Cebraspe), timer regressivo 3h30.
// Header sticky + grid 1fr/300px; card com callout + 2 botões sólidos; folha C/E;
// navegador; modais rev/conf/ok. Prefixo de CSS: smp-

import { useMemo, useState } from 'react'
import { simTokensStyle } from '../sim-tokens'
import type { SimMock, SimTheme } from '../types'
import {
  AMBER, baseKeyframes, BgfxMeq, btnGhost, btnPrimary, CERTO_GRAD, ERR_RED, ERRADO_GRAD,
  IconChart, IconCheck, IconChevL, IconChevR, IconClock, IconFlag, IconGrid, IconInfo, IconList,
  IconMoon, MarcaMeq, MEQ_BRAND_GRAD, ModalHead, ModalShell, OK_GREEN, SoraLink,
} from './shared'

const P = 'smp'
type ModalProva = null | 'rev' | 'conf' | 'ok'
const FZ = [15, 16.5, 18]
const FZ_LAB = ['A', 'A+', 'A++']

export function Prova({ theme, data, mo = 'cad' }: { theme: SimTheme; data: SimMock; mo?: 'cad' | 'folha' }) {
  const { info, tentativa } = data
  const N = info.n
  const [qi, setQi] = useState(Math.min(13, N))
  const [modo, setModo] = useState<'cad' | 'folha'>(mo)
  const [fz, setFz] = useState(0)
  const [md, setMd] = useState<ModalProva>(null)
  const [ck, setCk] = useState(false)
  const [ns, setNs] = useState(false)
  const [ans, setAns] = useState<Record<number, string | null>>(() => ({ ...tentativa.respostas }))
  const [flags, setFlags] = useState<Set<number>>(() => new Set(tentativa.marcadas))

  const cAns = useMemo(() => Object.values(ans).filter(Boolean).length, [ans])
  const cBl = N - cAns
  const cFl = flags.size
  const cPct = Math.round((cAns / N) * 100)

  const q = data.questoes[(qi - 1) % data.questoes.length]
  const resp = ans[qi] ?? null

  function marcar(n: number, letra: string) {
    setAns((prev) => ({ ...prev, [n]: prev[n] === letra ? null : letra }))
  }
  function toggleFlag(n: number) {
    setFlags((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n); else next.add(n)
      return next
    })
  }
  function openConf() { setCk(false); setMd('conf') }

  return (
    <div className={`${P}-app`} style={{ ...simTokensStyle('meq', theme), position: 'relative', minHeight: '100vh', overflowX: 'hidden' }}>
      <SoraLink />
      <style>{css()}</style>
      <BgfxMeq p={P} />

      {/* Header sticky */}
      <div className={`${P}-head`} style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 14, height: 72, padding: '0 28px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <MarcaMeq size={30} />
        <div className={`${P}-htit`} style={{ lineHeight: 1.2, minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info.titulo}</b>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{info.banca}</span>
        </div>
        <span style={{ flex: 1 }} />
        <b className={`${P}-hcenter`} style={{ fontSize: 14, color: 'var(--ink)' }}>Questão {qi} de {N}</b>
        <span style={{ flex: 1 }} />

        {/* Segmentado Caderno/Folha */}
        <div className={`${P}-seg`} style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 12, background: 'var(--tBg)' }}>
          <SegBtn active={modo === 'cad'} onClick={() => setModo('cad')} icon={<IconList size={14} />} label="Caderno" />
          <SegBtn active={modo === 'folha'} onClick={() => setModo('folha')} icon={<IconGrid size={14} />} label="Folha" />
        </div>

        {/* Timer regressivo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', borderRadius: 11, background: 'var(--surface2)', color: 'var(--brand2)' }}>
          <IconClock size={16} />
          <span style={{ lineHeight: 1.1 }}>
            <b style={{ display: 'block', fontSize: 14, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{tentativa.tempoRestante ?? '02:05'}:40</b>
            <span className={`${P}-tlab`} style={{ fontSize: 10.5, color: 'var(--muted)' }}>restantes</span>
          </span>
        </div>

        <button type="button" aria-label="Tema" className={`${P}-hicon`} style={headIcon}><IconMoon /></button>
        <button type="button" onClick={() => setFz((v) => (v + 1) % 3)} aria-label="Tamanho da letra" className={`${P}-hicon`} style={{ ...headIcon, fontWeight: 800, fontSize: 13 }}>{FZ_LAB[fz]}</button>
        <button type="button" className={`${P}-sbtn`} onClick={() => setMd('rev')} style={{ ...btnPrimary(40), width: 'auto', fontSize: 13, padding: '0 18px' }}>
          <IconCheck size={14} sw={2.8} /> Finalizar
        </button>
      </div>
      <div style={{ position: 'sticky', top: 72, zIndex: 19, height: 3, background: 'var(--track)' }}>
        <div style={{ height: '100%', width: `${cPct}%`, background: MEQ_BRAND_GRAD, transition: 'width .4s cubic-bezier(.22,1,.36,1)' }} />
      </div>

      {/* Conteúdo */}
      <div className={`${P}-wrap`} style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto', padding: 22, display: 'grid', gap: 22, gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
        <div style={{ minWidth: 0 }}>
          {modo === 'cad' ? (
            <CardQuestao q={q} qi={qi} N={N} resp={resp} fz={fz} flagged={flags.has(qi)} onMark={(l) => marcar(qi, l)} onFlag={() => toggleFlag(qi)} onPrev={() => setQi((v) => Math.max(1, v - 1))} onNext={() => (qi >= N ? setMd('rev') : setQi((v) => Math.min(N, v + 1)))} />
          ) : (
            <Folha N={N} ans={ans} cAns={cAns} onMark={marcar} />
          )}
        </div>

        {/* Navegador desktop */}
        <aside className={`${P}-nav`} style={{ alignSelf: 'start', position: 'sticky', top: 96 }}>
          <Navegador N={N} qi={qi} ans={ans} flags={flags} cAns={cAns} cBl={cBl} cFl={cFl} cPct={cPct} onGo={setQi} />
        </aside>
      </div>

      {/* Barra inferior mobile */}
      <div className={`${P}-mbar`} style={{ position: 'sticky', bottom: 0, zIndex: 20, display: 'none', gridTemplateColumns: 'auto auto 1fr', gap: 8, alignItems: 'center', padding: 12, background: 'var(--surface)', borderTop: '1px solid var(--line)' }}>
        <button type="button" onClick={() => setQi((v) => Math.max(1, v - 1))} style={{ ...btnGhost(44), width: 'auto', padding: '0 14px', opacity: qi === 1 ? 0.4 : 1 }}><IconChevL /></button>
        <button type="button" onClick={() => setNs(true)} style={{ ...btnGhost(44), width: 'auto', padding: '0 12px' }}><IconGrid /> {cAns}/{N}</button>
        <button type="button" className={`${P}-sbtn`} onClick={() => (qi >= N ? setMd('rev') : setQi((v) => Math.min(N, v + 1)))} style={btnPrimary(44)}>Próximo <IconChevR /></button>
      </div>

      {/* Sheet navegador mobile */}
      {ns && (
        <>
          <div className={`${P}-mbg`} onClick={() => setNs(false)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(10,10,25,.55)', backdropFilter: 'blur(6px)' }} />
          <div className={`${P}-msh`} style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 81, maxHeight: '76%', overflowY: 'auto', background: 'var(--surface)', borderRadius: '22px 22px 0 0', padding: 18 }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--line2)', margin: '0 auto 14px' }} />
            <b style={{ display: 'block', fontSize: 15, marginBottom: 12, color: 'var(--ink)' }}>Navegador · {cAns}/{N}</b>
            <NavGrid N={N} qi={qi} ans={ans} flags={flags} cols={6} onGo={(n) => { setQi(n); setNs(false) }} />
          </div>
        </>
      )}

      {/* Modais */}
      {md === 'rev' && <ModalRev N={N} cAns={cAns} cBl={cBl} cFl={cFl} ans={ans} flags={flags} onClose={() => setMd(null)} onGo={(n) => { setQi(n); setMd(null) }} onConf={openConf} />}
      {md === 'conf' && <ModalConf N={N} cAns={cAns} cBl={cBl} ck={ck} setCk={setCk} onClose={() => setMd('rev')} onOk={() => setMd('ok')} />}
      {md === 'ok' && <ModalOk />}
    </div>
  )
}

function SegBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} style={{ height: 32, padding: '0 12px', border: 0, borderRadius: 9, background: active ? 'var(--tOn)' : 'transparent', color: active ? 'var(--tOnInk)' : 'var(--muted)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: active ? '0 1px 2px rgba(16,30,70,.12)' : undefined }}>
      {icon}<span className={`${P}-seglab`}>{label}</span>
    </button>
  )
}

// ── Card da questão (Certo/Errado) ──────────────────────────────────────────
function CardQuestao({ q, qi, N, resp, fz, flagged, onMark, onFlag, onPrev, onNext }: {
  q: SimMock['questoes'][number]; qi: number; N: number; resp: string | null; fz: number; flagged: boolean
  onMark: (l: string) => void; onFlag: () => void; onPrev: () => void; onNext: () => void
}) {
  return (
    <div key={qi} className={`${P}-qin`} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 24, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ padding: '6px 11px', borderRadius: 8, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12, fontWeight: 800 }}>{qi} / {N}</span>
        <span style={{ padding: '6px 11px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>{q.materia}</span>
        {flagged ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--flag)' }}><IconFlag size={13} /> Para revisar</span> : null}
      </div>

      <div style={{ padding: '14px 16px', borderLeft: '3px solid var(--selDot)', background: 'var(--surface2)', borderRadius: '0 10px 10px 0', fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>
        Julgue o item a seguir.
      </div>

      <p style={{ margin: '0 0 18px', fontSize: FZ[fz], lineHeight: 1.7, color: 'var(--ink)' }}>{q.enunciado}</p>

      <div className={`${P}-ce`} style={{ display: 'flex', gap: 12 }}>
        <CEBtn label="Certo" grad={CERTO_GRAD} color={OK_GREEN} sel={resp === 'C'} dim={resp === 'E'} onClick={() => onMark('C')} />
        <CEBtn label="Errado" grad={ERRADO_GRAD} color={ERR_RED} sel={resp === 'E'} dim={resp === 'C'} onClick={() => onMark('E')} />
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)', textAlign: 'center' }}>Toque de novo na opção marcada para deixar em branco.</p>

      {/* Ações */}
      <div className={`${P}-acts`} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, paddingTop: 18, borderTop: '1px solid var(--line)', marginTop: 18 }}>
        <div>
          <button type="button" onClick={onPrev} style={{ ...btnGhost(46), width: 'auto', opacity: qi === 1 ? 0.4 : 1, pointerEvents: qi === 1 ? 'none' : 'auto' }}><IconChevL /> Anterior</button>
        </div>
        <button type="button" onClick={onFlag} style={{ height: 46, padding: '0 16px', borderRadius: 12, cursor: 'pointer', font: 'inherit', fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', border: `1.5px solid ${flagged ? '#F2B63B' : 'rgba(242,182,59,.55)'}`, background: flagged ? '#F2B63B' : 'rgba(242,182,59,.14)', color: flagged ? '#3A2A00' : '#C98A0B' }}>
          <IconFlag size={15} />{flagged ? 'Marcada para revisar' : 'Revisar'}
        </button>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className={`${P}-sbtn`} onClick={onNext} style={{ ...btnPrimary(46), width: 'auto' }}>Próximo <IconChevR /></button>
        </div>
      </div>
    </div>
  )
}

function CEBtn({ label, grad, color, sel, dim, onClick }: { label: string; grad: string; color: string; sel: boolean; dim: boolean; onClick: () => void }) {
  const shadow = sel
    ? `0 0 0 3px var(--surface),0 0 0 6px ${color},0 10px 24px -8px ${color}`
    : `0 4px 12px -6px ${color}`
  return (
    <button type="button" onClick={onClick} className={`${P}-cebtn`} style={{ flex: 1, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, border: 0, background: grad, boxShadow: shadow, opacity: dim ? 0.4 : 1, cursor: 'pointer', transition: 'opacity .2s,box-shadow .2s' }}>
      <b style={{ fontSize: 17, fontWeight: 800, letterSpacing: '.02em', color: '#fff' }}>{label}</b>
    </button>
  )
}

// ── Folha de respostas ──────────────────────────────────────────────────────
function Folha({ N, ans, cAns, onMark }: { N: number; ans: Record<number, string | null>; cAns: number; onMark: (n: number, l: string) => void }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 20, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <b style={{ fontSize: 17, color: 'var(--ink)' }}>Folha de respostas</b>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>Marque direto aqui. Tudo fica sincronizado com o caderno.</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>{cAns}/{N} marcadas</span>
      </div>
      <div className={`${P}-folha`} style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: '2px 12px' }}>
        {Array.from({ length: N }, (_, i) => {
          const n = i + 1
          const r = ans[n] ?? null
          const zebra = Math.floor(i / 6) % 2 === 1
          return (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 10, background: zebra ? 'var(--surface2)' : 'transparent' }}>
              <b style={{ width: 24, fontSize: 12.5, color: 'var(--ink)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{String(n).padStart(2, '0')}</b>
              <div style={{ display: 'flex', gap: 5 }}>
                {['C', 'E'].map((L) => (
                  <button key={L} type="button" onClick={() => onMark(n, L)} className={`${P}-bub`} style={{ width: 26, height: 26, flexShrink: 0, padding: 0, borderRadius: '50%', border: `1.5px solid ${r === L ? 'var(--selDot)' : 'var(--line2)'}`, background: r === L ? 'var(--selDot)' : 'transparent', color: r === L ? '#fff' : 'var(--muted)', font: 'inherit', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{L}</button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Navegador ───────────────────────────────────────────────────────────────
function Navegador({ N, qi, ans, flags, cAns, cBl, cFl, cPct, onGo }: {
  N: number; qi: number; ans: Record<number, string | null>; flags: Set<number>; cAns: number; cBl: number; cFl: number; cPct: number; onGo: (n: number) => void
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 18, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <b style={{ fontSize: 15, color: 'var(--ink)' }}>Navegador</b>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)' }}>{cPct}% feito</span>
      </div>
      <div className={`${P}-nscroll`} style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 2 }}>
        <NavGrid N={N} qi={qi} ans={ans} flags={flags} cols={5} onGo={onGo} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
        <Leg sw="var(--selDot)" label="Atual" />
        <Leg sw="var(--nAns)" label={`${cAns} Respondidas`} />
        <Leg sw="var(--surface2)" label={`${cBl} Em branco`} />
        <Leg ring label={`${cFl} Para revisar`} />
      </div>
      <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--surface2)', fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
        <b style={{ display: 'block', color: 'var(--ink)', marginBottom: 4 }}>Nota líquida estimada</b>
        Calculada após o envio: certas − erradas.
      </div>
    </div>
  )
}

function Leg({ sw, ring, label }: { sw?: string; ring?: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 20, height: 20, borderRadius: 5, background: ring ? 'transparent' : sw, boxShadow: ring ? 'inset 0 0 0 2px var(--flag)' : undefined }} />
      <span>{label}</span>
    </div>
  )
}

function NavGrid({ N, qi, ans, flags, cols, onGo }: { N: number; qi: number; ans: Record<number, string | null>; flags: Set<number>; cols: number; onGo: (n: number) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 6 }}>
      {Array.from({ length: N }, (_, i) => {
        const n = i + 1
        const atual = n === qi
        const answered = Boolean(ans[n])
        const flagged = flags.has(n)
        let bg = 'var(--surface2)', color = 'var(--muted)'
        if (answered) { bg = 'var(--nAns)'; color = 'var(--nAnsInk)' }
        if (atual) { bg = 'var(--selDot)'; color = '#fff' }
        return (
          <button key={n} type="button" onClick={() => onGo(n)} style={{ position: 'relative', height: 38, border: 0, borderRadius: 7, background: bg, color, font: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', boxShadow: atual ? '0 0 0 3px var(--surface),0 0 0 5px var(--selDot)' : flagged ? 'inset 0 0 0 2px var(--flag)' : undefined, transition: 'background .2s' }}>
            {n}
            {flagged && !atual ? <span style={{ position: 'absolute', right: 3, top: 3, width: 6, height: 6, borderRadius: '50%', background: 'var(--flag)' }} /> : null}
          </button>
        )
      })}
    </div>
  )
}

// ── Modais ──────────────────────────────────────────────────────────────────
function ModalRev({ N, cAns, cBl, cFl, ans, flags, onClose, onGo, onConf }: {
  N: number; cAns: number; cBl: number; cFl: number; ans: Record<number, string | null>; flags: Set<number>; onClose: () => void; onGo: (n: number) => void; onConf: () => void
}) {
  const hasBl = cBl > 0
  const brancos = Array.from({ length: N }, (_, i) => i + 1).filter((n) => !ans[n])
  const blTxt = brancos.slice(0, 12).join(', ') + (brancos.length > 12 ? ` e mais ${brancos.length - 12}` : '')
  const firstBl = brancos[0]
  return (
    <ModalShell p={P} width={640} onClose={onClose}>
      <ModalHead icon={<IconList size={24} />} iconColor="var(--selDot)" iconBg="color-mix(in srgb,var(--selDot) 14%,transparent)" titulo="Revisão do simulado" sub="Confira suas respostas antes de enviar" onClose={onClose} />
      <div style={{ padding: '16px 24px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Chip v={cAns} l="Respondidas" color="var(--selDot)" />
          <Chip v={cBl} l="Em branco" color="var(--muted)" />
          <Chip v={cFl} l="Para revisar" color="var(--flag)" />
        </div>
        {hasBl ? (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(242,169,59,.14)', borderLeft: `3px solid ${AMBER}`, color: 'var(--ink)', fontSize: 12.5, lineHeight: 1.5 }}>
            Você ainda tem {cBl} itens em branco: {blTxt}. <b>No Cebraspe, deixar em branco não desconta.</b>
          </div>
        ) : (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(31,168,104,.14)', borderLeft: `3px solid ${OK_GREEN}`, color: OK_GREEN, fontSize: 12.5, fontWeight: 700 }}>
            Todas as questões foram respondidas.
          </div>
        )}
        <div className={`${P}-revgrid ${P}-nscroll`} style={{ maxHeight: 250, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gap: 5 }}>
          {Array.from({ length: N }, (_, i) => {
            const n = i + 1
            const answered = Boolean(ans[n])
            const fl = flags.has(n)
            return (
              <button key={n} type="button" onClick={() => onGo(n)} style={{ height: 36, border: 0, borderRadius: 7, font: 'inherit', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', background: fl ? 'var(--flagBg)' : answered ? 'var(--selDot)' : 'var(--surface2)', color: fl ? 'var(--flag)' : answered ? '#fff' : 'var(--muted)' }}>{n}</button>
            )
          })}
        </div>
      </div>
      <div className={`${P}-revacts`} style={{ display: 'grid', gridTemplateColumns: hasBl ? '1fr 1fr' : '1fr', gap: 12, padding: '16px 24px 22px', marginTop: 14, borderTop: '1px solid var(--line)' }}>
        {hasBl ? <button type="button" className={`${P}-sbtn`} onClick={() => onGo(firstBl)} style={btnGhost(48)}>Primeira em branco</button> : null}
        <button type="button" className={`${P}-sbtn`} onClick={onClose} style={btnGhost(48)}>Continuar respondendo</button>
        <button type="button" className={`${P}-sbtn`} onClick={onConf} style={{ ...btnPrimary(48), gridColumn: '1 / -1' }}><IconCheck size={17} /> Finalizar e enviar</button>
      </div>
    </ModalShell>
  )
}

function Chip({ v, l, color }: { v: number; l: string; color: string }) {
  return (
    <div style={{ flex: 1, padding: 12, borderRadius: 12, background: 'var(--surface2)', textAlign: 'center' }}>
      <b style={{ display: 'block', fontSize: 22, color }}>{v}</b>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>{l}</span>
    </div>
  )
}

function ModalConf({ N, cAns, cBl, ck, setCk, onClose, onOk }: { N: number; cAns: number; cBl: number; ck: boolean; setCk: (v: boolean) => void; onClose: () => void; onOk: () => void }) {
  return (
    <ModalShell p={P} width={500} onClose={onClose}>
      <ModalHead icon={<IconInfo size={24} />} iconColor={AMBER} iconBg="rgba(242,169,59,.14)" titulo="Enviar o simulado?" sub="Esta ação não pode ser desfeita" onClose={onClose} />
      <div style={{ padding: '16px 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>
          Você respondeu <b style={{ color: 'var(--ink)' }}>{cAns} de {N}</b> e deixou {cBl} em branco. A correção sai na hora, com nota líquida e posição no ranking.
        </p>
        <button type="button" onClick={() => setCk(!ck)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface2)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, border: `2px solid ${ck ? 'var(--selDot)' : 'var(--line2)'}`, background: ck ? 'var(--selDot)' : 'transparent', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {ck ? <IconCheck size={13} sw={3.2} /> : null}
          </span>
          <span style={{ flex: 1, color: 'var(--ink)', fontSize: 13, lineHeight: 1.6 }}>Entendo que, depois de enviar, <b>não poderei alterar</b> as respostas desta realização.</span>
        </button>
        <div className={`${P}-confacts`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <button type="button" className={`${P}-sbtn`} onClick={onClose} style={btnGhost(48)}>Voltar à revisão</button>
          <button type="button" className={`${P}-sbtn`} onClick={ck ? onOk : undefined} style={{ ...btnPrimary(48), opacity: ck ? 1 : 0.45, pointerEvents: ck ? 'auto' : 'none' }}>Sim, enviar agora</button>
        </div>
      </div>
    </ModalShell>
  )
}

function ModalOk() {
  return (
    <ModalShell p={P} width={420} closeOnBackdrop={false}>
      <div style={{ padding: '34px 26px 26px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
        <span className={`${P}-okpop`} style={{ width: 84, height: 84, borderRadius: '50%', background: 'rgba(31,168,104,.14)', color: OK_GREEN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconCheck size={40} sw={2.6} />
        </span>
        <b style={{ fontSize: 22, letterSpacing: '-0.03em', color: 'var(--ink)' }}>Simulado enviado!</b>
        <span style={{ fontSize: 14, color: 'var(--muted)' }}>Nota líquida e ranking já calculados.</span>
        <button type="button" className={`${P}-sbtn`} style={btnPrimary(52)}><IconChart /> Ver meu resultado</button>
      </div>
    </ModalShell>
  )
}

const headIcon: React.CSSProperties = { height: 40, minWidth: 40, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 11, background: 'var(--surface)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }

function css() {
  return `
.${P}-app{font-synthesis-weight:none}
${baseKeyframes(P)}
@media (max-width:640px){
  .${P}-head{height:62px;padding:0 12px;gap:8px}
  .${P}-htit,.${P}-hcenter,.${P}-tlab,.${P}-seglab{display:none}
  .${P}-hicon{height:36px;min-width:36px}
  .${P}-wrap{grid-template-columns:1fr!important;padding:14px 12px;gap:14px}
  .${P}-nav{display:none}
  .${P}-mbar{display:grid!important}
  .${P}-ce{flex-direction:column}
  .${P}-cebtn{height:58px}
  .${P}-acts{grid-template-columns:1fr 1fr;gap:8px}
  .${P}-acts>:last-child{grid-column:1 / -1}
  .${P}-folha{grid-template-columns:repeat(2,minmax(0,1fr))}
  .${P}-bub{width:34px!important;height:34px!important}
  .${P}-revgrid{grid-template-columns:repeat(7,1fr)!important}
  .${P}-revacts,.${P}-confacts{grid-template-columns:1fr!important}
  .${P}-modal{left:12px!important;right:12px!important;bottom:12px!important;top:auto!important;width:auto!important;max-width:none!important;transform:none!important}
  .${P}-modal.${P}-mpop{animation-name:${P}msh}
}`
}
