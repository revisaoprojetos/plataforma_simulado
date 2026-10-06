'use client'

// SIMULADO REVISÃO — PROVA AO VIVO. Versão CONTROLADA do visual Revisão aplicada
// sobre o MOTOR REAL (ProvaClient): auto-save/timer/servidor continuam no ProvaClient,
// este componente é puramente apresentacional e recebe tudo por props.
//
// É um drop-in do ProvaMeqLive: aceita EXATAMENTE o mesmo contrato (ProvaMeqLiveProps),
// só muda o VISUAL (marca Revisão via simTokensStyle('revisao', theme) + look de
// revisao/prova.tsx/shared.tsx). Prefixo de CSS: srpl- (p/ não colidir com smpl- do MEQ).

import { useMemo, type ReactNode, type CSSProperties } from 'react'
import { MarkdownContent } from '@/components/markdown-content'
import { simTokensStyle } from '../sim-tokens'
import {
  Bgfx, MarcaR, Ic, P as RIC, primaryBtnStyle, ghostBtnStyle, baseKeyframes,
  REV_GRAD, REV_GRAD_SHADOW, OK, ERR, WARN,
} from './shared'
import { ModalShell } from './prova'
// Reutiliza o CONTRATO de props do MEQ — ProvaRevisaoLive é um drop-in replacement.
import type { ProvaLiveQuestao, ProvaMeqLiveProps, ModalProva } from '../meq/prova-live'

export type { ProvaLiveAlt, ProvaLiveQuestao, ProvaMeqLiveProps, ModalProva } from '../meq/prova-live'

const P = 'srpl'
const FZ = [15, 16.5, 18]
const FZ_LAB = ['A', 'A+', 'A++']
const LETRA = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/** Respondida: objetiva = tem alternativa; discursiva = ≥1 foto; bloqueada = conta como resolvida. */
function respondida(q: ProvaLiveQuestao, respostas: Record<string, string>, disc: Record<string, number>) {
  if (q.bloqueada) return true
  if (q.tipo === 'discursiva') return (disc[q.id] ?? 0) > 0
  return !!respostas[q.id]
}
/** C/E = questão objetiva (não discursiva) com exatamente 2 alternativas. */
function ehCE(q: ProvaLiveQuestao) {
  return q.tipo !== 'discursiva' && !q.bloqueada && q.alternativas.length === 2
}

export function ProvaRevisaoLive(p: ProvaMeqLiveProps) {
  const { questoes, qi, respostas, marcadas, eliminadas, discPaginas } = p
  const N = questoes.length
  const q = questoes[qi - 1]

  const cAns = useMemo(() => questoes.filter((qq) => respondida(qq, respostas, discPaginas)).length, [questoes, respostas, discPaginas])
  const cBl = N - cAns
  const cFl = marcadas.size
  const cPct = N > 0 ? Math.round((cAns / N) * 100) : 0

  const timerColor = p.timerWarning ? ERR : 'var(--brand)'

  return (
    <div className={`${P}-root`} style={{ ...simTokensStyle('revisao', p.theme), position: 'relative', minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{css()}</style>
      <Bgfx prefix={P} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* HEADER sticky */}
        <header className={`${P}-header`} style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, height: 72, padding: '0 28px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--brand)', display: 'inline-flex' }}><MarcaR size={30} /></span>
          <div className={`${P}-htitle`} style={{ lineHeight: 1.2, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.titulo}</b>
            {p.banca ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{p.banca}</span> : null}
          </div>
          <span style={{ flex: 1 }} />
          <b className={`${P}-hcount`} style={{ fontSize: 14, color: 'var(--ink)' }}>Questão {qi} de {N}</b>
          <span style={{ flex: 1 }} />

          {/* Segmentado Caderno/Folha */}
          <div style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 12, background: 'var(--tBg)' }}>
            <Seg active={p.modo === 'cad'} onClick={() => p.onSetModo('cad')} icon={RIC.book} label="Caderno" />
            <Seg active={p.modo === 'folha'} onClick={() => p.onSetModo('folha')} icon={RIC.list} label="Folha" />
          </div>

          {/* Timer (servidor) */}
          {p.tempoLabel !== null ? (
            <div className={`${P}-timer ${p.timerWarning ? `${P}-pulse` : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', borderRadius: 11, background: p.timerWarning ? 'color-mix(in srgb,var(--flag) 14%,var(--surface2))' : 'var(--surface2)', color: timerColor }}>
              <Ic size={16}><circle cx="12" cy="12" r="9" /><path d={RIC.clock} /></Ic>
              <span style={{ lineHeight: 1.1 }}>
                <b style={{ display: 'block', fontSize: 14, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{p.tempoLabel}</b>
                <span className={`${P}-timersub`} style={{ fontSize: 10.5, color: 'var(--muted)' }}>{p.tempoRegressivo ? 'restantes' : 'decorridos'}</span>
              </span>
            </div>
          ) : null}

          <button type="button" onClick={p.onToggleDark} aria-label="Tema" className={`${P}-hbtn`} style={hbtn()}><Ic d={RIC.moon} size={16} /></button>
          <button type="button" onClick={p.onCycleFz} aria-label="Tamanho da letra" className={`${P}-hbtn`} style={hbtn()}><span style={{ fontSize: 13 }}>{FZ_LAB[p.fz]}</span></button>
          <button type="button" onClick={() => p.onSetMd('rev')} className={`${P}-sbtn ${P}-hfin`} style={{ height: 40, padding: '0 16px', border: 0, borderRadius: 11, background: REV_GRAD, color: '#fff', boxShadow: REV_GRAD_SHADOW, font: 'inherit', fontSize: 13.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
            <Ic d={RIC.check} size={15} />Finalizar
          </button>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, background: 'var(--track)' }}>
            <span style={{ display: 'block', height: '100%', width: `${cPct}%`, background: 'var(--selDot)', transition: 'width .4s' }} />
          </div>
        </header>

        {/* GRID */}
        <div className={`${P}-grid`} style={{ maxWidth: 1280, margin: '0 auto', padding: '26px 28px 40px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 22, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>
            {p.modo === 'cad' ? (
              <CardQuestao
                q={q} qi={qi} N={N} resp={respostas[q.id] ?? null} fz={p.fz} flagged={marcadas.has(q.id)}
                elim={eliminadas[q.id] ?? []}
                slotDiscursiva={p.slotDiscursiva}
                onMark={(altId) => p.onResponder(q.id, altId)}
                onFlag={() => p.onToggleFlag(q.id)}
                onEliminar={(altId) => p.onToggleEliminar(q.id, altId)}
                onPrev={() => p.onGoto(Math.max(1, qi - 1))}
                onNext={() => (qi >= N ? p.onSetMd('rev') : p.onGoto(Math.min(N, qi + 1)))}
              />
            ) : (
              <Folha questoes={questoes} respostas={respostas} discPaginas={discPaginas} cAns={cAns} N={N} onMark={p.onResponder} />
            )}
          </div>

          {/* Navegador desktop */}
          <aside className={`${P}-navdesk`} style={{ position: 'sticky', top: 96 }}>
            <Navegador questoes={questoes} qi={qi} respostas={respostas} discPaginas={discPaginas} marcadas={marcadas} cAns={cAns} cBl={cBl} cFl={cFl} cPct={cPct} onGo={p.onGoto} />
          </aside>
        </div>

        {/* Barra inferior MOBILE */}
        <div className={`${P}-bottombar`} style={{ display: 'none', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 6, position: 'sticky', bottom: 0, zIndex: 15, padding: 12, background: 'var(--surface)', borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={() => p.onGoto(Math.max(1, qi - 1))} disabled={qi === 1} style={{ height: 46, padding: '0 12px', borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', opacity: qi === 1 ? 0.4 : 1, display: 'inline-flex', alignItems: 'center' }}><Ic d={RIC.back} size={15} /></button>
            <button type="button" onClick={() => p.onSetNs(true)} style={{ height: 46, padding: '0 10px', borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 12.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <Ic size={15}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Ic>{cAns}/{N}
            </button>
          </div>
          <button type="button" onClick={() => p.onToggleFlag(q.id)} style={revisarMiniStyle(marcadas.has(q.id))}><Ic d={RIC.flag} size={15} />Revisar</button>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => (qi >= N ? p.onSetMd('rev') : p.onGoto(Math.min(N, qi + 1)))} className={`${P}-sbtn`} style={{ height: 46, padding: '0 13px', border: 0, borderRadius: 12, background: REV_GRAD, color: '#fff', boxShadow: REV_GRAD_SHADOW, font: 'inherit', fontSize: 14, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>Próximo<Ic d={RIC.fwd} size={15} /></button>
          </div>
        </div>
      </div>

      {/* Sheet navegador mobile */}
      {p.ns && (
        <>
          <div onClick={() => p.onSetNs(false)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(10,10,25,.5)' }} />
          <div className={`${P}-msh`} style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 71, maxHeight: '76%', overflowY: 'auto', padding: '18px 16px 24px', borderRadius: '22px 22px 0 0', background: 'var(--surface)' }}>
            <span style={{ display: 'block', width: 40, height: 4, margin: '0 auto 14px', borderRadius: 99, background: 'var(--line2)' }} />
            <b style={{ display: 'block', marginBottom: 12, fontSize: 16, color: 'var(--ink)' }}>Navegador · {cAns}/{N}</b>
            <NavGrid questoes={questoes} qi={qi} respostas={respostas} discPaginas={discPaginas} marcadas={marcadas} cols={6} onGo={(n) => { p.onGoto(n); p.onSetNs(false) }} />
          </div>
        </>
      )}

      {/* Modais */}
      {p.md === 'rev' && <ModalRev questoes={questoes} respostas={respostas} discPaginas={discPaginas} marcadas={marcadas} N={N} cAns={cAns} cBl={cBl} cFl={cFl} onClose={() => p.onSetMd(null)} onGo={(n) => { p.onGoto(n); p.onSetMd(null) }} onConf={() => { p.onSetCk(false); p.onSetMd('conf') }} />}
      {p.md === 'conf' && <ModalConf N={N} cAns={cAns} cBl={cBl} ck={p.ck} isFinalizando={p.isFinalizando} setCk={p.onSetCk} onClose={() => p.onSetMd('rev')} onOk={p.onFinalizar} />}
    </div>
  )
}

// ── Subcomponentes ───────────────────────────────────────────────────────────

function hbtn(): CSSProperties {
  return { height: 40, minWidth: 40, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 11, background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 12.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }
}

function Seg({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button type="button" onClick={onClick} style={{ height: 32, padding: '0 12px', border: 0, borderRadius: 9, background: active ? 'var(--tOn)' : 'transparent', color: active ? 'var(--tOnInk)' : 'var(--muted)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Ic d={icon} size={14} /><span className={`${P}-seglabel`}>{label}</span>
    </button>
  )
}

// ── Card da questão ───────────────────────────────────────────────────────────
function CardQuestao({ q, qi, N, resp, fz, flagged, elim, slotDiscursiva, onMark, onFlag, onEliminar, onPrev, onNext }: {
  q: ProvaLiveQuestao; qi: number; N: number; resp: string | null; fz: number; flagged: boolean; elim: string[]
  slotDiscursiva?: ReactNode
  onMark: (altId: string) => void; onFlag: () => void; onEliminar: (altId: string) => void; onPrev: () => void; onNext: () => void
}) {
  const ce = ehCE(q)
  const alts = [...q.alternativas].sort((a, b) => a.ordem - b.ordem)
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', boxShadow: '0 24px 50px -36px rgba(40,20,110,.45)', padding: 28 }}>
      <div key={qi} className={`${P}-qin`} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ height: 28, padding: '0 11px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--ink)', fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{qi}<span style={{ color: 'var(--muted)', fontWeight: 600 }}>&nbsp;/ {N}</span></span>
          {q.disciplina ? <span style={{ height: 26, padding: '0 10px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{q.disciplina}</span> : null}
          <span style={{ flex: 1 }} />
          {flagged && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--flag)' }}><Ic d={RIC.flag} size={13} />Para revisar</span>
          )}
        </div>

        {q.aviso ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'color-mix(in srgb,var(--flag) 12%,var(--surface2))', color: q.aviso.cor ?? 'var(--flag)', fontSize: 12.5, fontWeight: 700 }}>
            {q.aviso.nome}
          </div>
        ) : null}

        {ce ? (
          <div style={{ padding: '14px 16px', borderLeft: '3px solid var(--selDot)', background: 'var(--surface2)', borderRadius: '0 10px 10px 0', fontSize: 12.5, color: 'var(--muted)' }}>
            Julgue o item a seguir.
          </div>
        ) : null}

        <div style={{ margin: 0, fontSize: FZ[fz], lineHeight: 1.7, color: 'var(--ink)' }}>
          <MarkdownContent>{q.enunciado}</MarkdownContent>
          {q.imagem_url ? (
            <div style={{ marginTop: 14, overflow: 'hidden', borderRadius: 10, border: '1px solid var(--line)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={q.imagem_url} alt="" style={{ display: 'block', maxHeight: '50vh', width: 'auto', margin: '0 auto', objectFit: 'contain' }} />
            </div>
          ) : null}
        </div>

        {q.bloqueada ? (
          <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 13 }}>
            {q.aviso?.nome ?? 'Questão anulada'} — não é necessário responder.
          </div>
        ) : q.tipo === 'discursiva' ? (
          <div>{slotDiscursiva}</div>
        ) : ce ? (
          <>
            <div className={`${P}-ce`} style={{ display: 'flex', gap: 12 }}>
              {alts.map((a) => {
                const isCerto = /certo|verdad/i.test(a.texto)
                const sel = resp === a.id
                const dim = !!resp && resp !== a.id
                const cor = isCerto ? OK : ERR
                const grad = isCerto ? 'linear-gradient(180deg,#27C07E,#1FA868)' : 'linear-gradient(180deg,#F0565B,#E5484D)'
                return (
                  <button key={a.id} type="button" onClick={() => onMark(a.id)} className={`${P}-cebtn`} style={{ flex: 1, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, border: 0, background: grad, boxShadow: sel ? `0 0 0 3px var(--surface),0 0 0 6px ${cor},0 10px 24px -8px ${cor}` : `0 4px 12px -6px ${cor}`, opacity: dim ? 0.4 : 1, cursor: 'pointer', transition: 'opacity .2s,box-shadow .2s' }}>
                    <b style={{ fontSize: 17, fontWeight: 800, letterSpacing: '.02em', color: '#fff' }}>{a.texto}</b>
                  </button>
                )
              })}
            </div>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', textAlign: 'center' }}>Toque de novo na opção marcada para deixar em branco.</p>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {alts.map((a, idx) => {
              const letra = LETRA[idx] ?? String(idx + 1)
              const eliminada = elim.includes(a.id)
              const sel = resp === a.id
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
                  <button type="button" onClick={() => onEliminar(a.id)} title="Eliminar alternativa" aria-label={`Eliminar alternativa ${letra}`} className={`${P}-cut`}
                    style={{ flexShrink: 0, width: 38, border: '1px dashed var(--line2)', borderRadius: 10, background: eliminada ? 'var(--flagBg)' : 'transparent', color: eliminada ? 'var(--flag)' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Ic size={15}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" /></Ic>
                  </button>
                  <button type="button" onClick={() => { if (!eliminada) onMark(a.id) }} className={`${P}-alt`}
                    style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${sel ? 'var(--selLine)' : 'var(--line)'}`, background: sel ? 'var(--selBg)' : 'var(--surface)', boxShadow: sel ? '0 0 0 3px color-mix(in srgb,var(--selDot) 18%,transparent)' : 'none', font: 'inherit', textAlign: 'left', cursor: eliminada ? 'default' : 'pointer', opacity: eliminada ? 0.42 : 1, transition: 'border-color .2s, background .2s' }}>
                    <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', border: '1.5px solid var(--line2)', background: sel ? 'var(--selDot)' : 'transparent', color: sel ? '#fff' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{letra}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: FZ[fz], lineHeight: 1.55, color: 'var(--ink)', textDecoration: eliminada ? 'line-through' : 'none' }}>
                      <MarkdownContent inline>{a.texto}</MarkdownContent>
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Ações desktop (dentro do cartão) */}
        <div className={`${P}-actions`} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={onPrev} disabled={qi === 1} style={{ height: 46, padding: '0 16px', borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: qi === 1 ? 0.4 : 1 }}>
              <Ic d={RIC.back} size={15} />Anterior
            </button>
          </div>
          <RevisarBtn on={flagged} onClick={onFlag} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onNext} className={`${P}-sbtn`} style={{ height: 46, padding: '0 20px', border: 0, borderRadius: 12, background: REV_GRAD, color: '#fff', boxShadow: REV_GRAD_SHADOW, font: 'inherit', fontSize: 14, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              Próximo<Ic d={RIC.fwd} size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RevisarBtn({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ height: 46, padding: '0 16px', borderRadius: 12, border: `1.5px solid ${on ? '#F2B63B' : 'rgba(242,182,59,.55)'}`, background: on ? '#F2B63B' : 'rgba(242,182,59,.14)', color: on ? '#3A2A00' : '#C98A0B', font: 'inherit', fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      <Ic d={RIC.flag} size={15} />{on ? 'Marcada para revisar' : 'Revisar'}
    </button>
  )
}

function revisarMiniStyle(on: boolean): CSSProperties {
  return { height: 46, padding: '0 11px', borderRadius: 12, border: `1.5px solid ${on ? '#F2B63B' : 'rgba(242,182,59,.55)'}`, background: on ? '#F2B63B' : 'rgba(242,182,59,.14)', color: on ? '#3A2A00' : '#C98A0B', font: 'inherit', fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', whiteSpace: 'nowrap' }
}

// ── Folha de respostas ──────────────────────────────────────────────────────
function Folha({ questoes, respostas, discPaginas, cAns, N, onMark }: {
  questoes: ProvaLiveQuestao[]; respostas: Record<string, string>; discPaginas: Record<string, number>; cAns: number; N: number; onMark: (qid: string, altId: string) => void
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', boxShadow: '0 24px 50px -36px rgba(40,20,110,.45)', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <b style={{ fontSize: 17, color: 'var(--ink)' }}>Folha de respostas</b>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>Marque direto aqui. Tudo fica sincronizado com o caderno.</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>{cAns}/{N} marcadas</span>
      </div>
      <div className={`${P}-folhagrid`} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '4px 12px' }}>
        {questoes.map((q, i) => {
          const alts = [...q.alternativas].sort((a, b) => a.ordem - b.ordem)
          const discEnviada = q.tipo === 'discursiva' && (discPaginas[q.id] ?? 0) > 0
          return (
            <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 10 }}>
              <b style={{ width: 28, fontSize: 12.5, color: 'var(--ink)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</b>
              {q.bloqueada ? (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>anulada</span>
              ) : q.tipo === 'discursiva' ? (
                <span style={{ fontSize: 11, color: discEnviada ? OK : 'var(--muted)' }}>{discEnviada ? 'enviada' : 'discursiva'}</span>
              ) : (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {alts.map((a, idx) => {
                    const on = respostas[q.id] === a.id
                    const lab = alts.length === 2 ? (/certo|verdad/i.test(a.texto) ? 'C' : 'E') : (LETRA[idx] ?? String(idx + 1))
                    return (
                      <button key={a.id} type="button" onClick={() => onMark(q.id, a.id)} className={`${P}-bubble`} style={{ width: 26, height: 26, flexShrink: 0, padding: 0, borderRadius: '50%', border: `1.5px solid ${on ? 'var(--selDot)' : 'var(--line2)'}`, background: on ? 'var(--selDot)' : 'transparent', color: on ? '#fff' : 'var(--muted)', font: 'inherit', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{lab}</button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Navegador ───────────────────────────────────────────────────────────────
function Navegador({ questoes, qi, respostas, discPaginas, marcadas, cAns, cBl, cFl, cPct, onGo }: {
  questoes: ProvaLiveQuestao[]; qi: number; respostas: Record<string, string>; discPaginas: Record<string, number>; marcadas: Set<string>; cAns: number; cBl: number; cFl: number; cPct: number; onGo: (n: number) => void
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', boxShadow: '0 24px 50px -36px rgba(40,20,110,.45)', padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <b style={{ fontSize: 15, color: 'var(--ink)' }}>Navegador</b>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)' }}>{cPct}% feito</span>
      </div>
      <div className={`${P}-nscroll`} style={{ maxHeight: 420, overflowY: 'auto', padding: '6px 6px 6px 2px' }}>
        <NavGrid questoes={questoes} qi={qi} respostas={respostas} discPaginas={discPaginas} marcadas={marcadas} cols={5} onGo={onGo} />
      </div>
      <div style={{ margin: '14px 0', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: 12, color: 'var(--muted)' }}>
          <Leg color="var(--selDot)" label="Atual" />
          <Leg color="var(--nAns)" label={<>Respondidas · <b style={{ color: 'var(--ink)' }}>{cAns}</b></>} />
          <Leg color="var(--surface2)" border label={<>Em branco · <b style={{ color: 'var(--ink)' }}>{cBl}</b></>} />
          <Leg color="var(--flag)" label={<>Para revisar · <b style={{ color: 'var(--ink)' }}>{cFl}</b></>} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 12, background: 'var(--peachBg)', fontSize: 12, lineHeight: 1.45, color: 'var(--ink)' }}>
        <span style={{ color: '#E5A800' }}><Ic size={16}><path d={RIC.bulb} /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" /></Ic></span>
        <span>Use a tesoura para eliminar alternativas e o marcador para voltar depois.</span>
      </div>
    </div>
  )
}

function NavGrid({ questoes, qi, respostas, discPaginas, marcadas, cols, onGo }: {
  questoes: ProvaLiveQuestao[]; qi: number; respostas: Record<string, string>; discPaginas: Record<string, number>; marcadas: Set<string>; cols: number; onGo: (n: number) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 6 }}>
      {questoes.map((q, i) => {
        const n = i + 1
        const cur = n === qi
        const ans = respondida(q, respostas, discPaginas)
        const fl = marcadas.has(q.id)
        const bg = cur ? 'var(--selDot)' : ans ? 'var(--nAns)' : 'var(--surface2)'
        const col = cur ? '#fff' : ans ? 'var(--nAnsInk)' : 'var(--muted)'
        const ring = cur ? '0 0 0 3px var(--surface), 0 0 0 5px var(--selDot)' : fl ? 'inset 0 0 0 2px var(--flag)' : 'none'
        return (
          <button key={q.id} type="button" onClick={() => onGo(n)} style={{ position: 'relative', height: 38, border: 0, borderRadius: 9, background: bg, color: col, boxShadow: ring, font: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', transition: 'background .2s' }}>
            {n}
            {fl && !cur && <span style={{ position: 'absolute', right: 3, top: 3, width: 6, height: 6, borderRadius: '50%', background: 'var(--flag)' }} />}
          </button>
        )
      })}
    </div>
  )
}

function Leg({ color, border, label }: { color: string; border?: boolean; label: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 12, height: 12, borderRadius: 4, background: color, border: border ? '1px solid var(--line2)' : undefined }} />{label}
    </span>
  )
}

// ── Modais ──────────────────────────────────────────────────────────────────
function ModalRev({ questoes, respostas, discPaginas, marcadas, N, cAns, cBl, cFl, onClose, onGo, onConf }: {
  questoes: ProvaLiveQuestao[]; respostas: Record<string, string>; discPaginas: Record<string, number>; marcadas: Set<string>; N: number; cAns: number; cBl: number; cFl: number; onClose: () => void; onGo: (n: number) => void; onConf: () => void
}) {
  const hasBl = cBl > 0
  const blList = questoes.map((q, i) => (respondida(q, respostas, discPaginas) ? -1 : i + 1)).filter((n) => n > 0)
  const blTxt = blList.slice(0, 12).join(', ') + (blList.length > 12 ? ` e mais ${blList.length - 12}` : '')
  const firstBl = blList[0]
  return (
    <ModalShell onClose={onClose} width={640} prefix={P} icon={RIC.list} titulo="Revisão do simulado" sub="Confira suas respostas antes de enviar">
      <div style={{ padding: '16px 24px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <CountChip n={cAns} label="Respondidas" color="var(--selDot)" />
          <CountChip n={cBl} label="Em branco" color="var(--muted)" />
          <CountChip n={cFl} label="Para revisar" color="var(--flag)" />
        </div>
        {hasBl ? (
          <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(242,169,59,.12)', fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink)' }}>
            <span style={{ color: WARN }}><Ic size={17}><circle cx="12" cy="12" r="9" /><path d={RIC.info} /></Ic></span>
            <span><b>Você ainda tem {cBl} questões em branco:</b> {blTxt}.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(31,168,104,.1)', fontSize: 13, color: OK, fontWeight: 700 }}>
            <Ic d={RIC.check} size={17} />Todas as questões foram respondidas.
          </div>
        )}
        <div className={`${P}-nscroll`} style={{ maxHeight: 250, overflowY: 'auto', padding: 2 }}>
          <div className={`${P}-revgrid`} style={{ display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gap: 6 }}>
            {questoes.map((q, i) => {
              const n = i + 1
              const ans = respondida(q, respostas, discPaginas)
              const fl = marcadas.has(q.id)
              const bg = ans ? 'var(--selDot)' : fl ? 'var(--flagBg)' : 'var(--surface2)'
              const col = ans ? '#fff' : fl ? 'var(--flag)' : 'var(--muted)'
              return (
                <button key={q.id} type="button" onClick={() => onGo(n)} style={{ height: 36, border: 0, borderRadius: 9, background: bg, color: col, font: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{n}</button>
              )
            })}
          </div>
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Toque em um número para ir direto à questão.</span>
      </div>
      <div className={`${P}-revact`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '16px 24px 22px', marginTop: 14, borderTop: '1px solid var(--line)' }}>
        {hasBl && (
          <button type="button" onClick={() => onGo(firstBl)} className={`${P}-sbtn`} style={{ ...ghostBtnStyle(48), flex: '1 1 auto' }}><Ic d={RIC.fwd} size={17} />Primeira em branco</button>
        )}
        <button type="button" onClick={onClose} className={`${P}-sbtn`} style={{ ...ghostBtnStyle(48), flex: '1 1 auto' }}>Continuar respondendo</button>
        <button type="button" onClick={onConf} className={`${P}-sbtn`} style={{ ...primaryBtnStyle(48), flex: '1 1 auto' }}><Ic d={RIC.check} size={17} />Finalizar e enviar</button>
      </div>
    </ModalShell>
  )
}

function CountChip({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div style={{ flex: 1, padding: 12, borderRadius: 12, background: 'var(--surface2)', textAlign: 'center' }}>
      <b style={{ display: 'block', fontSize: 22, color }}>{n}</b>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>{label}</span>
    </div>
  )
}

function ModalConf({ N, cAns, cBl, ck, isFinalizando, setCk, onClose, onOk }: { N: number; cAns: number; cBl: number; ck: boolean; isFinalizando: boolean; setCk: (v: boolean) => void; onClose: () => void; onOk: () => void }) {
  return (
    <ModalShell onClose={isFinalizando ? () => {} : onClose} width={500} prefix={P} icon={RIC.info} iconColor={WARN} titulo="Enviar o simulado?" sub="Esta ação não pode ser desfeita">
      <div style={{ padding: '16px 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>Você respondeu <b style={{ color: 'var(--ink)' }}>{cAns} de {N}</b> e deixou {cBl} em branco. O relatório e o gabarito comentado ficam disponíveis assim que você enviar.</p>
        <button type="button" onClick={() => setCk(!ck)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface2)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, border: `2px solid ${ck ? 'var(--selDot)' : 'var(--line2)'}`, background: ck ? 'var(--selDot)' : 'transparent', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{ck && <Ic d={RIC.check} size={13} strokeWidth={3.2} />}</span>
          <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink)' }}>Entendo que, depois de enviar, <b>não poderei alterar</b> as respostas desta realização.</span>
        </button>
        <div className={`${P}-confact`} style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={isFinalizando} className={`${P}-sbtn`} style={{ ...ghostBtnStyle(50), flex: 1, opacity: isFinalizando ? 0.6 : 1 }}><Ic d={RIC.back} size={17} />Voltar à revisão</button>
          <button type="button" onClick={ck && !isFinalizando ? onOk : undefined} className={`${P}-sbtn`} style={{ ...primaryBtnStyle(50), flex: 1, opacity: ck && !isFinalizando ? 1 : 0.45, pointerEvents: ck && !isFinalizando ? 'auto' : 'none', transition: 'opacity .2s' }}><Ic d={RIC.check} size={16} />{isFinalizando ? 'Enviando…' : 'Sim, enviar agora'}</button>
        </div>
      </div>
    </ModalShell>
  )
}

function css() {
  return baseKeyframes(P) + `
.${P}-timer{min-width:0}
.${P}-pulse{animation:${P}pulsered 1.4s ease-in-out infinite}
@keyframes ${P}pulsered{0%,100%{opacity:1}50%{opacity:.55}}
.${P}-cebtn{transition:opacity .2s,box-shadow .2s,filter .15s}
.${P}-cebtn:hover{filter:brightness(1.05)}
@media (max-width:640px){
  .${P}-header{height:62px!important;padding:0 12px!important;gap:8px!important}
  .${P}-htitle,.${P}-hcount,.${P}-timersub,.${P}-seglabel{display:none!important}
  .${P}-hbtn{display:none!important}
  .${P}-hfin span,.${P}-hfin{font-size:0}
  .${P}-grid{grid-template-columns:1fr!important;padding:14px 12px 18px!important}
  .${P}-navdesk{display:none!important}
  .${P}-actions{display:none!important}
  .${P}-bottombar{display:grid!important}
  .${P}-ce{flex-direction:column}
  .${P}-cebtn{height:58px}
  .${P}-folhagrid{grid-template-columns:1fr!important}
  .${P}-revgrid{grid-template-columns:repeat(7,1fr)!important}
  .${P}-revact,.${P}-confact{flex-direction:column}
  .${P}-confact{flex-direction:column-reverse}
  .${P}-sheet{left:12px!important;right:12px!important;top:auto!important;bottom:12px!important;width:auto!important;transform:none!important}
  .${P}-sheet.${P}-mpop{animation:${P}msh .35s cubic-bezier(.22,1,.36,1) both}
}
`
}
