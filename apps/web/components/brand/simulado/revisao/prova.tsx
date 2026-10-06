'use client'

// SIMULADO · Prova — marca REVISÃO (spec 06 §2). Caderno + folha de respostas,
// tesoura, navegador, timer crescente, modais rev/conf/ok. Porte fiel de
// design/SimProvaRevisao*.dc.html.

import { useMemo, useState } from 'react'
import type { SimScreenProps } from '../types'
import { simTokensStyle } from '../sim-tokens'
import {
  Bgfx, MarcaR, Ic, P, cardStyle, primaryBtnStyle, ghostBtnStyle, baseKeyframes,
  REV_GRAD, REV_GRAD_SHADOW, REV_GOLD, OK, WARN,
} from './shared'

const PFX = 'srp'
const LETRAS = ['A', 'B', 'C', 'D', 'E']
const FONT_SIZES = ['15px', '16.5px', '18px']
const FONT_LABELS = ['A', 'A+', 'A++']

type Md = null | 'rev' | 'conf' | 'ok'

export function ProvaRevisao({ theme, data, mo: moInit = 'cad' }: SimScreenProps) {
  const { info, questoes, tentativa } = data
  const N = info.n

  const [qi, setQi] = useState(Math.min(tentativa.ultimaQuestao || 13, N))
  const [respostas, setRespostas] = useState<Record<number, string | null>>({ ...tentativa.respostas })
  const [flags, setFlags] = useState<Record<number, boolean>>(() => {
    const f: Record<number, boolean> = {}
    tentativa.marcadas.forEach((n) => { f[n] = true })
    return f
  })
  const [elim, setElim] = useState<Record<string, boolean>>({}) // `${n}${L}` -> true
  const [mo, setMo] = useState<'cad' | 'folha'>(moInit)
  const [fz, setFz] = useState(0)
  const [md, setMd] = useState<Md>(null)
  const [ck, setCk] = useState(false)
  const [ns, setNs] = useState(false)

  const qFs = FONT_SIZES[fz]

  // Derivados
  const { cAns, cBl, cFl, blList } = useMemo(() => {
    let a = 0, f = 0
    const bl: number[] = []
    for (let n = 1; n <= N; n++) {
      if (respostas[n]) a++
      else bl.push(n)
      if (flags[n]) f++
    }
    return { cAns: a, cBl: N - a, cFl: f, blList: bl }
  }, [respostas, flags, N])
  const cPct = Math.round((cAns / N) * 100)
  const blTxt = blList.slice(0, 12).join(', ') + (blList.length > 12 ? ` e mais ${blList.length - 12}` : '')

  const quest = questoes[(qi - 1) % questoes.length]
  const materia = quest.materia
  const enunciado = quest.enunciado
  const alts = quest.alternativas ?? []

  const curAns = respostas[qi] ?? null
  const curFlag = !!flags[qi]

  function setAns(n: number, letra: string) {
    setRespostas((r) => ({ ...r, [n]: r[n] === letra ? null : letra }))
  }
  function toggleFlag(n: number) {
    setFlags((f) => ({ ...f, [n]: !f[n] }))
  }
  function toggleElim(n: number, letra: string) {
    const key = `${n}${letra}`
    const was = elim[key]
    setElim((e) => ({ ...e, [key]: !was }))
    if (!was && respostas[n] === letra) setRespostas((r) => ({ ...r, [n]: null }))
  }
  function goto(n: number) { setQi(n); setMd(null); setNs(false) }
  function firstBl() { if (blList.length) goto(blList[0]) }

  return (
    <div className={`${PFX}-root`} style={{ ...simTokensStyle('revisao', theme), minHeight: '100vh' }}>
      <style>{css()}</style>
      <Bgfx prefix={PFX} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* HEADER sticky */}
        <header className={`${PFX}-header`} style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, height: 72, padding: '0 28px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ color: 'var(--brand)', display: 'inline-flex' }}><MarcaR size={30} /></span>
            <div className={`${PFX}-htitle`} style={{ lineHeight: 1.2, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{info.titulo}</b>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{info.banca}</span>
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <b className={`${PFX}-hcount`} style={{ fontSize: 14, color: 'var(--ink)' }}>Questão {qi} de {N}</b>
          <span style={{ flex: 1 }} />
          {/* Segmentado Caderno/Folha */}
          <div style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 12, background: 'var(--tBg)' }}>
            <Seg active={mo === 'cad'} onClick={() => setMo('cad')} icon={P.book} label="Caderno" />
            <Seg active={mo === 'folha'} onClick={() => setMo('folha')} icon={P.list} label="Folha" />
          </div>
          {/* Timer crescente */}
          <div className={`${PFX}-timer`} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', borderRadius: 11, background: 'var(--surface2)', color: 'var(--brand)' }}>
            <Ic size={16}><circle cx="12" cy="12" r="9" /><path d={P.clock} /></Ic>
            <span style={{ lineHeight: 1.1 }}>
              <b style={{ display: 'block', fontSize: 14, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>Sem limite</b>
              <span className={`${PFX}-timersub`} style={{ fontSize: 10.5, color: 'var(--muted)' }}>00:42 decorridos</span>
            </span>
          </div>
          <button type="button" aria-label="Tema" className={`${PFX}-hbtn`} style={hbtn()}><Ic d={P.moon} size={16} /></button>
          <button type="button" aria-label="Tamanho da letra" onClick={() => setFz((v) => (v + 1) % 3)} className={`${PFX}-hbtn`} style={hbtn()}>
            <span style={{ fontSize: 13 }}>{FONT_LABELS[fz]}</span>
          </button>
          <button type="button" onClick={() => setMd('rev')} className={`${PFX}-sbtn ${PFX}-hfin`} style={{ height: 40, padding: '0 16px', border: 0, borderRadius: 11, background: REV_GRAD, color: '#fff', boxShadow: REV_GRAD_SHADOW, font: 'inherit', fontSize: 13.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
            <Ic d={P.check} size={15} />Finalizar
          </button>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, background: 'var(--track)' }}>
            <span style={{ display: 'block', height: '100%', width: `${cPct}%`, background: 'var(--selDot)', transition: 'width .4s' }} />
          </div>
        </header>

        {/* GRID */}
        <div className={`${PFX}-grid`} style={{ maxWidth: 1280, margin: '0 auto', padding: '26px 28px 40px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 22, alignItems: 'start' }}>
          <div>
            {mo === 'cad' ? (
              <div style={cardStyle({ padding: 28 })}>
                <div key={qi} className={`${PFX}-qin`} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ height: 28, padding: '0 11px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--ink)', fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{qi}<span style={{ color: 'var(--muted)', fontWeight: 600 }}>&nbsp;/ {N}</span></span>
                    <span style={{ height: 26, padding: '0 10px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{materia}</span>
                    <span style={{ flex: 1 }} />
                    {curFlag && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--flag)' }}><Ic d={P.flag} size={13} />Para revisar</span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: qFs, lineHeight: 1.7, color: 'var(--ink)' }}>{enunciado}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {alts.map((alt) => {
                      const on = curAns === alt.letra
                      const cut = !!elim[`${qi}${alt.letra}`]
                      return (
                        <div key={alt.letra} style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
                          <button type="button" onClick={() => toggleElim(qi, alt.letra)} title="Eliminar alternativa" aria-label={`Eliminar alternativa ${alt.letra}`} className={`${PFX}-cut`}
                            style={{ flexShrink: 0, width: 38, border: '1px dashed var(--line2)', borderRadius: 10, background: cut ? 'var(--flagBg)' : 'transparent', color: cut ? 'var(--flag)' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <Ic size={15}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" /></Ic>
                          </button>
                          <button type="button" onClick={() => { if (!cut) setAns(qi, alt.letra) }} className={`${PFX}-alt`}
                            style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${on ? 'var(--selLine)' : 'var(--line)'}`, background: on ? 'var(--selBg)' : 'var(--surface)', boxShadow: on ? '0 0 0 3px color-mix(in srgb,var(--selDot) 18%,transparent)' : 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', opacity: cut ? 0.42 : 1, transition: 'border-color .2s, background .2s' }}>
                            <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', border: '1.5px solid var(--line2)', background: on ? 'var(--selDot)' : 'transparent', color: on ? '#fff' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{alt.letra}</span>
                            <span style={{ fontSize: qFs, lineHeight: 1.55, color: 'var(--ink)', textDecoration: cut ? 'line-through' : 'none' }}>{alt.texto}</span>
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {/* Ações desktop (dentro do cartão) */}
                  <div className={`${PFX}-actions`} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button type="button" onClick={() => setQi((v) => Math.max(1, v - 1))} disabled={qi === 1} style={{ height: 46, padding: '0 16px', borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: qi === 1 ? 0.4 : 1 }}>
                        <Ic d={P.back} size={15} />Anterior
                      </button>
                    </div>
                    <RevisarBtn on={curFlag} onClick={() => toggleFlag(qi)} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => (qi === N ? setMd('rev') : setQi((v) => Math.min(N, v + 1)))} className={`${PFX}-sbtn`} style={{ height: 46, padding: '0 20px', border: 0, borderRadius: 12, background: REV_GRAD, color: '#fff', boxShadow: REV_GRAD_SHADOW, font: 'inherit', fontSize: 14, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        Próximo<Ic d={P.fwd} size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <FolhaCard N={N} cAns={cAns} respostas={respostas} setAns={setAns} />
            )}
          </div>

          {/* Navegador desktop */}
          <div className={`${PFX}-navdesk`} style={{ position: 'sticky', top: 96 }}>
            <div style={cardStyle({ padding: 18 })}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <b style={{ fontSize: 15, color: 'var(--ink)' }}>Navegador</b>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)' }}>{cPct}% feito</span>
              </div>
              <div className={`${PFX}-nscroll`} style={{ maxHeight: 420, overflowY: 'auto', padding: '6px 6px 6px 2px' }}>
                <Navegador N={N} qi={qi} respostas={respostas} flags={flags} onGo={goto} cols={5} cell={38} />
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
                <span style={{ color: '#E5A800' }}><Ic size={16}><path d={P.bulb} /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" /></Ic></span>
                <span>Use a tesoura para eliminar alternativas e o marcador para voltar depois.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Barra inferior MOBILE */}
        <div className={`${PFX}-bottombar`} style={{ display: 'none', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 6, position: 'sticky', bottom: 0, zIndex: 15, padding: 12, background: 'var(--surface)', borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={() => setQi((v) => Math.max(1, v - 1))} disabled={qi === 1} style={{ height: 46, padding: '0 12px', borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', opacity: qi === 1 ? 0.4 : 1, display: 'inline-flex', alignItems: 'center' }}><Ic d={P.back} size={15} /></button>
            <button type="button" onClick={() => setNs(true)} style={{ height: 46, padding: '0 10px', borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 12.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <Ic size={15}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Ic>{cAns}/{N}
            </button>
          </div>
          <button type="button" onClick={() => toggleFlag(qi)} style={revisarMiniStyle(curFlag)}><Ic d={P.flag} size={15} />Revisar</button>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => (qi === N ? setMd('rev') : setQi((v) => Math.min(N, v + 1)))} className={`${PFX}-sbtn`} style={{ height: 46, padding: '0 13px', border: 0, borderRadius: 12, background: REV_GRAD, color: '#fff', boxShadow: REV_GRAD_SHADOW, font: 'inherit', fontSize: 14, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>Próximo<Ic d={P.fwd} size={15} /></button>
          </div>
        </div>
      </div>

      {/* Sheet navegador mobile */}
      {ns && (
        <>
          <div onClick={() => setNs(false)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(10,10,25,.5)' }} />
          <div className={`${PFX}-msh`} style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 71, maxHeight: '76%', overflowY: 'auto', padding: '18px 16px 24px', borderRadius: '22px 22px 0 0', background: 'var(--surface)' }}>
            <span style={{ display: 'block', width: 40, height: 4, margin: '0 auto 14px', borderRadius: 99, background: 'var(--line2)' }} />
            <b style={{ display: 'block', marginBottom: 12, fontSize: 16, color: 'var(--ink)' }}>Navegador · {cAns}/{N}</b>
            <Navegador N={N} qi={qi} respostas={respostas} flags={flags} onGo={goto} cols={6} cell={40} />
          </div>
        </>
      )}

      {/* MODAL rev */}
      {md === 'rev' && (
        <ModalShell onClose={() => setMd(null)} width={640} prefix={PFX} icon={P.list} titulo="Revisão do simulado" sub="Confira suas respostas antes de enviar">
          <div style={{ padding: '16px 24px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <CountChip n={cAns} label="Respondidas" color="var(--selDot)" />
              <CountChip n={cBl} label="Em branco" color="var(--muted)" />
              <CountChip n={cFl} label="Para revisar" color="var(--flag)" />
            </div>
            {cBl > 0 ? (
              <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(242,169,59,.12)', fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink)' }}>
                <span style={{ color: WARN }}><Ic size={17}><circle cx="12" cy="12" r="9" /><path d={P.info} /></Ic></span>
                <span><b>Você ainda tem {cBl} questões em branco:</b> {blTxt}. Questões em branco contam como erro.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(31,168,104,.1)', fontSize: 13, color: OK, fontWeight: 700 }}>
                <Ic d={P.check} size={17} />Todas as questões foram respondidas.
              </div>
            )}
            <div style={{ maxHeight: 250, overflowY: 'auto', padding: 2 }}>
              <RevGrid N={N} qi={qi} respostas={respostas} flags={flags} onGo={goto} />
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Toque em um número para ir direto à questão.</span>
          </div>
          <div className={`${PFX}-revact`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '16px 24px 22px', marginTop: 14, borderTop: '1px solid var(--line)' }}>
            {cBl > 0 && (
              <button type="button" onClick={firstBl} className={`${PFX}-sbtn`} style={{ ...ghostBtnStyle(48), flex: '1 1 auto' }}><Ic d={P.fwd} size={17} />Primeira em branco</button>
            )}
            <button type="button" onClick={() => setMd(null)} className={`${PFX}-sbtn`} style={{ ...ghostBtnStyle(48), flex: '1 1 auto' }}>Continuar respondendo</button>
            <button type="button" onClick={() => { setCk(false); setMd('conf') }} className={`${PFX}-sbtn`} style={{ ...primaryBtnStyle(48), flex: '1 1 auto' }}><Ic d={P.check} size={17} />Finalizar e enviar</button>
          </div>
        </ModalShell>
      )}

      {/* MODAL conf */}
      {md === 'conf' && (
        <ModalShell onClose={() => setMd(null)} width={500} prefix={PFX} icon={P.info} iconColor={WARN} titulo="Enviar o simulado?" sub="Esta ação não pode ser desfeita">
          <div style={{ padding: '16px 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>Você respondeu <b style={{ color: 'var(--ink)' }}>{cAns} de {N}</b> e deixou {cBl} em branco. O relatório e o gabarito comentado ficam disponíveis assim que você enviar.</p>
            <button type="button" onClick={() => setCk((v) => !v)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface2)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, border: `2px solid ${ck ? 'var(--selDot)' : 'var(--line2)'}`, background: ck ? 'var(--selDot)' : 'transparent', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{ck && <Ic d={P.check} size={13} strokeWidth={3.2} />}</span>
              <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink)' }}>Entendo que, depois de enviar, <b>não poderei alterar</b> as respostas desta realização.</span>
            </button>
            <div className={`${PFX}-confact`} style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setMd('rev')} className={`${PFX}-sbtn`} style={{ ...ghostBtnStyle(50), flex: 1 }}><Ic d={P.back} size={17} />Voltar à revisão</button>
              <button type="button" onClick={() => { if (ck) setMd('ok') }} className={`${PFX}-sbtn`} style={{ ...primaryBtnStyle(50), flex: 1, opacity: ck ? 1 : 0.45, pointerEvents: ck ? 'auto' : 'none', transition: 'opacity .2s' }}><Ic d={P.check} size={16} />Sim, enviar agora</button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* MODAL ok */}
      {md === 'ok' && (
        <>
          <div className={`${PFX}-mbg`} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(10,10,25,.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />
          <div role="dialog" className={`${PFX}-mpop ${PFX}-sheet`} style={{ position: 'fixed', left: '50%', top: '50%', width: 420, transform: 'translate(-50%,-50%)', zIndex: 81, borderRadius: 22, background: 'var(--surface)', boxShadow: '0 40px 80px -30px rgba(0,0,0,.6)' }}>
            <div style={{ padding: '34px 26px 26px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
              <span className={`${PFX}-okpop`} style={{ width: 84, height: 84, borderRadius: '50%', background: 'rgba(31,168,104,.14)', color: OK, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic d={P.check} size={40} strokeWidth={2.6} /></span>
              <b style={{ fontSize: 22, letterSpacing: '-0.03em', color: 'var(--ink)' }}>Simulado enviado!</b>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>Seu relatório completo está pronto.</span>
              <a href="#" className={`${PFX}-sbtn`} style={{ ...primaryBtnStyle(52), width: '100%' }}><Ic size={16}><path d="M3 3v18h18" /><path d={P.chart} /></Ic>Ver meu resultado</a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Subcomponentes ───────────────────────────────────────────────────────────

function hbtn(): React.CSSProperties {
  return { height: 40, minWidth: 40, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 11, background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 12.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }
}

function Seg({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button type="button" onClick={onClick} style={{ height: 32, padding: '0 12px', border: 0, borderRadius: 9, background: active ? 'var(--tOn)' : 'transparent', color: active ? 'var(--tOnInk)' : 'var(--muted)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Ic d={icon} size={14} /><span className={`${PFX}-seglabel`}>{label}</span>
    </button>
  )
}

function RevisarBtn({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ height: 46, padding: '0 16px', borderRadius: 12, border: `1.5px solid ${on ? '#F2B63B' : 'rgba(242,182,59,.55)'}`, background: on ? '#F2B63B' : 'rgba(242,182,59,.14)', color: on ? '#3A2A00' : '#C98A0B', font: 'inherit', fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      <Ic d={P.flag} size={15} />{on ? 'Marcada para revisar' : 'Revisar'}
    </button>
  )
}

function revisarMiniStyle(on: boolean): React.CSSProperties {
  return { height: 46, padding: '0 11px', borderRadius: 12, border: `1.5px solid ${on ? '#F2B63B' : 'rgba(242,182,59,.55)'}`, background: on ? '#F2B63B' : 'rgba(242,182,59,.14)', color: on ? '#3A2A00' : '#C98A0B', font: 'inherit', fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', whiteSpace: 'nowrap' }
}

function Navegador({ N, qi, respostas, flags, onGo, cols, cell }: { N: number; qi: number; respostas: Record<number, string | null>; flags: Record<number, boolean>; onGo: (n: number) => void; cols: number; cell: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 6 }}>
      {Array.from({ length: N }, (_, i) => i + 1).map((n) => {
        const cur = n === qi
        const ans = !!respostas[n]
        const fl = !!flags[n]
        const bg = cur ? 'var(--selDot)' : ans ? 'var(--nAns)' : 'var(--surface2)'
        const col = cur ? '#fff' : ans ? 'var(--nAnsInk)' : 'var(--muted)'
        const ring = cur ? '0 0 0 3px var(--surface), 0 0 0 5px var(--selDot)' : fl ? 'inset 0 0 0 2px var(--flag)' : 'none'
        return (
          <button key={n} type="button" onClick={() => onGo(n)} style={{ position: 'relative', height: cell, border: 0, borderRadius: 9, background: bg, color: col, boxShadow: ring, font: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', transition: 'background .2s' }}>
            {n}
            {fl && <span style={{ position: 'absolute', right: 3, top: 3, width: 6, height: 6, borderRadius: '50%', background: 'var(--flag)' }} />}
          </button>
        )
      })}
    </div>
  )
}

function RevGrid({ N, qi, respostas, flags, onGo }: { N: number; qi: number; respostas: Record<number, string | null>; flags: Record<number, boolean>; onGo: (n: number) => void }) {
  return (
    <div className={`${PFX}-revgrid`} style={{ display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gap: 6 }}>
      {Array.from({ length: N }, (_, i) => i + 1).map((n) => {
        const ans = !!respostas[n]
        const fl = !!flags[n]
        const bg = ans ? 'var(--selDot)' : fl ? 'var(--flagBg)' : 'var(--surface2)'
        const col = ans ? '#fff' : fl ? 'var(--flag)' : 'var(--muted)'
        return (
          <button key={n} type="button" onClick={() => onGo(n)} style={{ height: 36, border: 0, borderRadius: 9, background: bg, color: col, font: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{n}</button>
        )
      })}
    </div>
  )
}

function Leg({ color, border, label }: { color: string; border?: boolean; label: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 12, height: 12, borderRadius: 4, background: color, border: border ? '1px solid var(--line2)' : undefined }} />{label}
    </span>
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

function FolhaCard({ N, cAns, respostas, setAns }: { N: number; cAns: number; respostas: Record<number, string | null>; setAns: (n: number, l: string) => void }) {
  return (
    <div style={cardStyle({ padding: 20 })}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <b style={{ fontSize: 17, color: 'var(--ink)' }}>Folha de respostas</b>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>Marque direto aqui. Tudo fica sincronizado com o caderno.</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>{cAns}/{N} marcadas</span>
      </div>
      <div className={`${PFX}-folhagrid`} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '4px 12px' }}>
        {Array.from({ length: N }, (_, i) => i + 1).map((n) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 10 }}>
            <b style={{ width: 28, fontSize: 12.5, color: 'var(--ink)', textAlign: 'right' }}>{String(n).padStart(2, '0')}</b>
            <div style={{ display: 'flex', gap: 5 }}>
              {LETRAS.map((L) => {
                const on = respostas[n] === L
                return (
                  <button key={L} type="button" onClick={() => setAns(n, L)} aria-label={`${n}${L}`} className={`${PFX}-bubble`} style={{ width: 26, height: 26, flexShrink: 0, padding: 0, borderRadius: '50%', border: `1.5px solid ${on ? 'var(--selDot)' : 'var(--line2)'}`, background: on ? 'var(--selDot)' : 'transparent', color: on ? '#fff' : 'var(--muted)', font: 'inherit', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{L}</button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ModalShell({ onClose, width, prefix, icon, iconColor, titulo, sub, children }: { onClose: () => void; width: number; prefix: string; icon: string; iconColor?: string; titulo: string; sub: string; children: React.ReactNode }) {
  const clr = iconColor
  return (
    <>
      <div onClick={onClose} className={`${prefix}-mbg`} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(10,10,25,.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />
      <div role="dialog" className={`${prefix}-mpop ${prefix}-sheet`} style={{ position: 'fixed', left: '50%', top: '50%', width, transform: 'translate(-50%,-50%)', zIndex: 81, maxHeight: 'calc(100% - 24px)', overflowY: 'auto', borderRadius: 22, background: 'var(--surface)', boxShadow: '0 40px 80px -30px rgba(0,0,0,.6)' }}>
        <span style={{ display: 'block', height: 5, background: `linear-gradient(90deg,#5B3FD0,#8F75FF 60%,${REV_GOLD})` }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '22px 24px 4px' }}>
          <span style={{ width: 50, height: 50, borderRadius: 16, background: clr ? 'color-mix(in srgb,' + clr + ' 14%,transparent)' : 'color-mix(in srgb,var(--selDot) 14%,transparent)', color: clr ?? 'var(--selDot)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {icon === P.info ? <Ic size={24}><circle cx="12" cy="12" r="9" /><path d={P.info} /></Ic> : <Ic d={icon} size={24} />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{titulo}</b>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{sub}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ alignSelf: 'flex-start', width: 34, height: 34, border: 0, borderRadius: 10, background: 'var(--surface2)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ic d={P.close} size={16} /></button>
        </div>
        {children}
      </div>
    </>
  )
}

function css() {
  return baseKeyframes(PFX) + `
.${PFX}-timer{min-width:0}
@media (max-width:640px){
  .${PFX}-header{height:62px!important;padding:0 12px!important;gap:8px!important}
  .${PFX}-htitle,.${PFX}-hcount,.${PFX}-timersub,.${PFX}-seglabel{display:none!important}
  .${PFX}-hbtn{display:none!important}
  .${PFX}-hfin span,.${PFX}-hfin{font-size:0}
  .${PFX}-grid{grid-template-columns:1fr!important;padding:14px 12px 18px!important}
  .${PFX}-navdesk{display:none!important}
  .${PFX}-actions{display:none!important}
  .${PFX}-bottombar{display:grid!important}
  .${PFX}-folhagrid{grid-template-columns:1fr!important}
  .${PFX}-revgrid{grid-template-columns:repeat(7,1fr)!important}
  .${PFX}-revact,.${PFX}-confact{flex-direction:column}
  .${PFX}-confact{flex-direction:column-reverse}
  .${PFX}-sheet{left:12px!important;right:12px!important;top:auto!important;bottom:12px!important;width:auto!important;transform:none!important}
  .${PFX}-sheet.${PFX}-mpop{animation:${PFX}msh .35s cubic-bezier(.22,1,.36,1) both}
}
`
}
