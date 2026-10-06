'use client'

// SIMULADO — VND · Prova (spec 06 §2, coluna VND, A–E). Caderno/folha, tesoura,
// navegador caixa ouro, timer regressivo 4h, modais rev/conf/ok.

import { useMemo, useState } from 'react'
import {
  BookOpenCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Flag,
  Info,
  LayoutGrid,
  List,
  Moon,
  Scissors,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { simTokensStyle } from '../sim-tokens'
import type { SimScreenProps } from '../types'
import {
  Bgfx,
  card3d,
  ghostBtnStyle,
  MarcaVND,
  ModalShell,
  modalSheetCss,
  primaryBtnStyle,
  sharedKeyframes,
  C_OK,
  C_TIMER,
} from './shared'

const P = 'svp'
const LETTERS = ['A', 'B', 'C', 'D', 'E']
type Modal = null | 'rev' | 'conf' | 'ok'

export function ProvaVND({ theme, data, mo = 'cad' }: SimScreenProps) {
  const { info, questoes, tentativa } = data
  const N = info.n

  const [qi, setQi] = useState(Math.min(tentativa.ultimaQuestao, N))
  const [modo, setModo] = useState<'cad' | 'folha'>(mo)
  const [answers, setAnswers] = useState<Record<number, string | null>>(() => ({ ...tentativa.respostas }))
  const [flags, setFlags] = useState<Set<number>>(() => new Set(tentativa.marcadas))
  const [cut, setCut] = useState<Record<string, boolean>>({}) // key `${n}${L}`
  const [fz, setFz] = useState(0)
  const [md, setMd] = useState<Modal>(null)
  const [ck, setCk] = useState(false)
  const [ns, setNs] = useState(false)

  const qFs = ['15px', '16.5px', '18px'][fz]
  const fzLab = ['A', 'A+', 'A++'][fz]

  const cAns = useMemo(() => Object.values(answers).filter(Boolean).length, [answers])
  const cBl = N - cAns
  const cFl = flags.size
  const cPct = Math.round((cAns / N) * 100)
  const blList = useMemo(() => {
    const out: number[] = []
    for (let n = 1; n <= N; n++) if (!answers[n]) out.push(n)
    return out
  }, [answers, N])
  const blTxt =
    blList.length <= 12 ? blList.join(', ') : `${blList.slice(0, 12).join(', ')} e mais ${blList.length - 12}`
  const hasBl = cBl > 0

  const q = questoes[qi - 1]

  function pick(n: number, L: string) {
    if (cut[`${n}${L}`]) return
    setAnswers((a) => ({ ...a, [n]: a[n] === L ? null : L }))
  }
  function toggleCut(n: number, L: string) {
    const key = `${n}${L}`
    setCut((c) => ({ ...c, [key]: !c[key] }))
    if (answers[n] === L) setAnswers((a) => ({ ...a, [n]: null })) // eliminar a marcada limpa
  }
  function toggleFlag(n: number) {
    setFlags((f) => {
      const nf = new Set(f)
      nf.has(n) ? nf.delete(n) : nf.add(n)
      return nf
    })
  }
  function goto(n: number) {
    setQi(n)
    setMd(null)
    setNs(false)
  }

  const timer = info.duracaoMin ? '02:47:15' : '00:42'

  return (
    <div className={`${P}-app`} style={{ ...simTokensStyle('vnd', theme), minHeight: '100vh', position: 'relative' }}>
      <style>{css}</style>
      <Bgfx prefix={P} variant="soft" />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* HEADER sticky */}
        <header className={`${P}-header`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <MarcaVND size={20} radius={11} />
            <div className={`${P}-title`} style={{ lineHeight: 1.2, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{info.titulo}</b>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{info.banca} · objetiva A–E</span>
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <b className={`${P}-counter`} style={{ fontSize: 14, color: 'var(--ink)' }}>
            Questão {qi} de {N}
          </b>
          <span style={{ flex: 1 }} />

          <div className={`${P}-seg`}>
            <button type="button" onClick={() => setModo('cad')} style={segStyle(modo === 'cad')}>
              <BookOpenCheck size={14} /> <span className={`${P}-seglbl`}>Caderno</span>
            </button>
            <button type="button" onClick={() => setModo('folha')} style={segStyle(modo === 'folha')}>
              <List size={14} /> <span className={`${P}-seglbl`}>Folha</span>
            </button>
          </div>

          <div className={`${P}-timer`}>
            <Clock size={16} />
            <span style={{ lineHeight: 1.1 }}>
              <b style={{ display: 'block', fontSize: 14, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{timer}</b>
              <span className={`${P}-timerlbl`} style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                {info.duracaoMin ? 'restantes' : 'decorridos'}
              </span>
            </span>
          </div>

          <button type="button" aria-label="Tema" className={`${P}-iconbtn`}>
            <Moon size={16} />
          </button>
          <button type="button" aria-label="Tamanho da letra" className={`${P}-iconbtn`} onClick={() => setFz((f) => (f + 1) % 3)}>
            <span style={{ fontSize: 13 }}>{fzLab}</span>
          </button>
          <button type="button" onClick={() => setMd('rev')} className={`${P}-sbtn ${P}-finbtn`} style={primaryBtnStyle({ height: 40, padding: '0 16px', borderRadius: 11, fontSize: 13.5 })}>
            <Check size={15} /> <span className={`${P}-finlbl`}>Finalizar</span>
          </button>

          <div style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, background: 'var(--track)' }}>
            <span style={{ display: 'block', height: '100%', width: `${cPct}%`, background: 'var(--selDot)', transition: 'width .4s' }} />
          </div>
        </header>

        <div className={`${P}-grid`}>
          {/* COLUNA PRINCIPAL */}
          <div>
            {modo === 'cad' ? (
              <div style={card3d({ padding: 28 })}>
                <div key={qi} className={`${P}-qin`} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className={`${P}-qnum`}>
                      {qi}
                      <span style={{ color: 'var(--muted)', fontWeight: 600 }}>&nbsp;/ {N}</span>
                    </span>
                    <span className={`${P}-qmat`}>{q.materia}</span>
                    <span style={{ flex: 1 }} />
                    {flags.has(qi) && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--flag)' }}>
                        <Flag size={13} /> Para revisar
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: qFs, lineHeight: 1.7, color: 'var(--ink)' }}>{q.enunciado}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(q.alternativas ?? []).map((alt) => {
                      const sel = answers[qi] === alt.letra
                      const elim = !!cut[`${qi}${alt.letra}`]
                      return (
                        <div key={alt.letra} style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => toggleCut(qi, alt.letra)}
                            title="Eliminar alternativa"
                            aria-label={`Eliminar alternativa ${alt.letra}`}
                            className={`${P}-cut`}
                            style={{
                              flexShrink: 0,
                              width: 38,
                              border: '1px dashed var(--line2)',
                              borderRadius: 10,
                              background: elim ? 'var(--flagBg)' : 'transparent',
                              color: elim ? 'var(--flag)' : 'var(--muted)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <Scissors size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => pick(qi, alt.letra)}
                            className={`${P}-alt`}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 12,
                              padding: '14px 16px',
                              borderRadius: 14,
                              border: `1.5px solid ${sel ? 'var(--selLine)' : 'var(--line)'}`,
                              background: sel ? 'var(--selBg)' : 'var(--surface)',
                              boxShadow: sel ? '0 0 0 3px color-mix(in srgb,var(--selDot) 18%,transparent)' : 'none',
                              font: 'inherit',
                              textAlign: 'left',
                              cursor: 'pointer',
                              opacity: elim ? 0.42 : 1,
                              transition: 'border-color .2s, background .2s',
                            }}
                          >
                            <span
                              style={{
                                flexShrink: 0,
                                width: 28,
                                height: 28,
                                borderRadius: 8, // quadrado raio 8 (VND)
                                border: '1.5px solid var(--line2)',
                                background: sel ? 'var(--selDot)' : 'transparent',
                                color: sel ? '#fff' : 'var(--ink)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 13,
                                fontWeight: 800,
                              }}
                            >
                              {alt.letra}
                            </span>
                            <span style={{ fontSize: qFs, lineHeight: 1.55, color: 'var(--ink)', textDecoration: elim ? 'line-through' : 'none' }}>
                              {alt.texto}
                            </span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* barra de ações (desktop dentro do card) */}
                <div className={`${P}-actions`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setQi((v) => Math.max(1, v - 1))}
                      disabled={qi === 1}
                      style={{ height: 46, padding: '0 16px', borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: qi === 1 ? 0.4 : 1 }}
                    >
                      <ChevronLeft size={15} /> <span className={`${P}-navlbl`}>Anterior</span>
                    </button>
                  </div>
                  <button type="button" onClick={() => toggleFlag(qi)} style={flagBtnStyle(flags.has(qi))}>
                    <Flag size={15} /> <span className={`${P}-navlbl`}>{flags.has(qi) ? 'Marcada para revisar' : 'Revisar'}</span>
                  </button>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => (qi === N ? setMd('rev') : setQi((v) => Math.min(N, v + 1)))}
                      className={`${P}-sbtn`}
                      style={primaryBtnStyle({ height: 46, padding: '0 20px', borderRadius: 12, fontSize: 14 })}
                    >
                      Próximo <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <FolhaMode answers={answers} onPick={pick} N={N} cAns={cAns} />
            )}
          </div>

          {/* SIDEBAR navegador (desktop) */}
          <aside className={`${P}-side`}>
            <div style={card3d({ padding: 18 })}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <b style={{ fontSize: 15, color: 'var(--ink)' }}>Navegador</b>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)' }}>{cPct}% feito</span>
              </div>
              <div className={`${P}-navscroll`}>
                <NavGrid N={N} qi={qi} answers={answers} flags={flags} onGo={goto} cols={5} />
              </div>
              <div style={{ margin: '14px 0', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: 12, color: 'var(--muted)' }}>
                  <Legend color="var(--selDot)" label="Atual" />
                  <Legend color="var(--nAns)" label="Respondidas" count={cAns} />
                  <Legend color="var(--surface2)" border label="Em branco" count={cBl} />
                  <Legend color="var(--flag)" label="Para revisar" count={cFl} />
                </div>
              </div>
              {/* caixa ouro VND */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, background: 'var(--goldBg)' }}>
                <span style={{ color: 'var(--goldInk)' }}>
                  <Zap size={18} />
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                  <b>+120 XP</b> ao enviar · faltam {cBl} questões
                </span>
              </div>
            </div>
          </aside>
        </div>

        {/* BARRA INFERIOR (mobile) */}
        <div className={`${P}-bottombar`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setQi((v) => Math.max(1, v - 1))}
              disabled={qi === 1}
              aria-label="Anterior"
              style={{ height: 46, width: 46, borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: qi === 1 ? 0.4 : 1 }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setNs(true)}
              aria-label="Grade de questões"
              style={{ height: 46, padding: '0 12px', borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 800, fontSize: 13 }}
            >
              <LayoutGrid size={16} /> {cAns}/{N}
            </button>
          </div>
          <button type="button" onClick={() => toggleFlag(qi)} style={flagBtnStyle(flags.has(qi), true)}>
            <Flag size={15} /> Revisar
          </button>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => (qi === N ? setMd('rev') : setQi((v) => Math.min(N, v + 1)))}
              className={`${P}-sbtn`}
              style={primaryBtnStyle({ height: 46, padding: '0 13px', borderRadius: 12, fontSize: 14 })}
            >
              Próximo <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* SHEET navegador (mobile) */}
      {ns && (
        <>
          <div className={`${P}-mbg`} onClick={() => setNs(false)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(10,10,25,.55)', backdropFilter: 'blur(6px)' }} />
          <div className={`${P}-msh`} style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 71, maxHeight: '76%', overflowY: 'auto', padding: '18px 16px 24px', borderRadius: '22px 22px 0 0', background: 'var(--surface)' }}>
            <span style={{ display: 'block', width: 40, height: 4, borderRadius: 99, background: 'var(--line2)', margin: '0 auto 14px' }} />
            <b style={{ display: 'block', marginBottom: 12, fontSize: 16, color: 'var(--ink)' }}>
              Navegador · {cAns}/{N}
            </b>
            <NavGrid N={N} qi={qi} answers={answers} flags={flags} onGo={goto} cols={6} />
          </div>
        </>
      )}

      {/* MODAL rev */}
      {md === 'rev' && (
        <ModalShell prefix={P} width={640} onClose={() => setMd(null)} icon={<List size={24} />} title="Revisão do simulado" subtitle="Confira suas respostas antes de enviar">
          <div style={{ padding: '16px 24px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <RevStat value={cAns} label="Respondidas" color="var(--selDot)" />
              <RevStat value={cBl} label="Em branco" color="var(--muted)" />
              <RevStat value={cFl} label="Para revisar" color="var(--flag)" />
            </div>
            {hasBl ? (
              <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(242,169,59,.12)', fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink)' }}>
                <CircleAlert size={17} style={{ color: '#F2A93B', flexShrink: 0 }} />
                <span>
                  <b>Você ainda tem {cBl} questões em branco:</b> {blTxt}. Questões em branco contam como erro.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(31,168,104,.1)', fontSize: 13, color: C_OK, fontWeight: 700 }}>
                <Check size={17} /> Todas as questões foram respondidas.
              </div>
            )}
            <div style={{ maxHeight: 250, overflowY: 'auto', padding: 2 }}>
              <RevGrid N={N} answers={answers} flags={flags} onGo={goto} />
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Toque em um número para ir direto à questão.</span>
          </div>
          <div className={`${P}-revactions`}>
            {hasBl && (
              <button type="button" onClick={() => blList[0] && goto(blList[0])} className={`${P}-sbtn`} style={ghostBtnStyle({ height: 48, padding: '0 20px', borderRadius: 16, fontSize: 14.5, flex: '1 1 auto' })}>
                <ChevronRight size={17} /> Primeira em branco
              </button>
            )}
            <button type="button" onClick={() => setMd(null)} className={`${P}-sbtn`} style={ghostBtnStyle({ height: 48, padding: '0 20px', borderRadius: 16, fontSize: 14.5, flex: '1 1 auto' })}>
              Continuar respondendo
            </button>
            <button type="button" onClick={() => { setCk(false); setMd('conf') }} className={`${P}-sbtn`} style={primaryBtnStyle({ height: 48, padding: '0 20px', borderRadius: 16, fontSize: 14.5, flex: '1 1 auto' })}>
              <Check size={17} /> Finalizar e enviar
            </button>
          </div>
        </ModalShell>
      )}

      {/* MODAL conf */}
      {md === 'conf' && (
        <ModalShell prefix={P} width={500} onClose={() => setMd(null)} accent="#F2A93B" icon={<Info size={24} />} title="Enviar o simulado?" subtitle="Esta ação não pode ser desfeita">
          <div style={{ padding: '16px 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>
              Você respondeu <b style={{ color: 'var(--ink)' }}>{cAns} de {N}</b> e deixou {cBl} em branco. Você ganha +120 XP e vê sua posição na liga.
            </p>
            <button type="button" onClick={() => setCk((v) => !v)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface2)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, border: `2px solid ${ck ? 'var(--selDot)' : 'var(--line2)'}`, background: ck ? 'var(--selDot)' : 'transparent', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {ck && <Check size={13} strokeWidth={3.2} />}
              </span>
              <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink)' }}>
                Entendo que, depois de enviar, <b>não poderei alterar</b> as respostas desta realização.
              </span>
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setMd('rev')} className={`${P}-sbtn`} style={ghostBtnStyle({ height: 50, borderRadius: 16, fontSize: 14.5, flex: 1 })}>
                <ChevronLeft size={17} /> Voltar à revisão
              </button>
              <button
                type="button"
                onClick={() => ck && setMd('ok')}
                className={`${P}-sbtn`}
                style={primaryBtnStyle({ height: 50, borderRadius: 16, fontSize: 14.5, flex: 1, opacity: ck ? 1 : 0.45, pointerEvents: ck ? 'auto' : 'none', transition: 'opacity .2s' })}
              >
                <Check size={16} /> Sim, enviar agora
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* MODAL ok */}
      {md === 'ok' && (
        <ModalShell prefix={P} width={420} onClose={() => setMd(null)} plain closeOnBackdrop={false}>
          <div style={{ padding: '34px 26px 26px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
            <span className={`${P}-okpop`} style={{ width: 84, height: 84, borderRadius: '50%', background: 'rgba(31,168,104,.14)', color: C_OK, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={40} strokeWidth={2.6} />
            </span>
            <b style={{ fontSize: 22, letterSpacing: '-0.03em', color: 'var(--ink)' }}>Simulado enviado!</b>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>+120 XP creditados na sua liga!</span>
            <a href="#" className={`${P}-sbtn`} style={{ ...primaryBtnStyle({ width: '100%', height: 52, borderRadius: 16, fontSize: 15 }), textDecoration: 'none' }}>
              <TrendingUp size={16} /> Ver meu resultado
            </a>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

/* ─── folha mode ─── */
function FolhaMode({ answers, onPick, N, cAns }: { answers: Record<number, string | null>; onPick: (n: number, L: string) => void; N: number; cAns: number }) {
  return (
    <div style={card3d({ padding: 20 })}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <b style={{ fontSize: 17, color: 'var(--ink)' }}>Folha de respostas</b>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>Marque direto aqui. Tudo fica sincronizado com o caderno.</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>{cAns}/{N} marcadas</span>
      </div>
      <div className={`${P}-folhagrid`}>
        {Array.from({ length: N }, (_, i) => {
          const n = i + 1
          const row = Math.floor(i / 4) // zebra a cada outra linha de 4
          return (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 10, background: row % 2 === 1 ? 'var(--surface2)' : 'transparent' }}>
              <b style={{ width: 28, fontSize: 12.5, color: 'var(--ink)', textAlign: 'right' }}>{String(n).padStart(2, '0')}</b>
              <div style={{ display: 'flex', gap: 5 }}>
                {LETTERS.map((L) => {
                  const on = answers[n] === L
                  return (
                    <button
                      key={L}
                      type="button"
                      onClick={() => onPick(n, L)}
                      aria-label={`${n}${L}`}
                      style={{ width: 26, height: 26, flexShrink: 0, padding: 0, borderRadius: '50%', border: `1.5px solid ${on ? 'var(--selDot)' : 'var(--line2)'}`, background: on ? 'var(--selDot)' : 'transparent', color: on ? '#fff' : 'var(--muted)', font: 'inherit', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                    >
                      {L}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── navegador ─── */
function NavGrid({ N, qi, answers, flags, onGo, cols }: { N: number; qi: number; answers: Record<number, string | null>; flags: Set<number>; onGo: (n: number) => void; cols: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 6 }}>
      {Array.from({ length: N }, (_, i) => {
        const n = i + 1
        const cur = n === qi
        const ans = !!answers[n]
        const flag = flags.has(n)
        return (
          <button
            key={n}
            type="button"
            onClick={() => onGo(n)}
            style={{
              position: 'relative',
              height: 38,
              border: 0,
              borderRadius: 9,
              background: cur ? 'var(--selDot)' : ans ? 'var(--nAns)' : 'var(--surface2)',
              color: cur ? '#fff' : ans ? 'var(--nAnsInk)' : 'var(--muted)',
              boxShadow: cur ? '0 0 0 3px var(--surface), 0 0 0 5px var(--selDot)' : flag ? 'inset 0 0 0 2px var(--flag)' : 'none',
              font: 'inherit',
              fontSize: 12.5,
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'background .2s',
            }}
          >
            {n}
            {flag && <span style={{ position: 'absolute', right: 3, top: 3, width: 6, height: 6, borderRadius: '50%', background: 'var(--flag)' }} />}
          </button>
        )
      })}
    </div>
  )
}

function RevGrid({ N, answers, flags, onGo }: { N: number; answers: Record<number, string | null>; flags: Set<number>; onGo: (n: number) => void }) {
  return (
    <div className={`${P}-revgrid`}>
      {Array.from({ length: N }, (_, i) => {
        const n = i + 1
        const ans = !!answers[n]
        const flag = flags.has(n)
        return (
          <button
            key={n}
            type="button"
            onClick={() => onGo(n)}
            style={{ height: 36, border: 0, borderRadius: 9, background: ans ? 'var(--selDot)' : flag ? 'var(--flagBg)' : 'var(--surface2)', color: ans ? '#fff' : flag ? 'var(--flag)' : 'var(--muted)', font: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

function Legend({ color, label, count, border }: { color: string; label: string; count?: number; border?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 12, height: 12, borderRadius: 4, background: color, border: border ? '1px solid var(--line2)' : undefined }} />
      {label}
      {count !== undefined && <> · <b style={{ color: 'var(--ink)' }}>{count}</b></>}
    </span>
  )
}

function RevStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ flex: 1, padding: 12, borderRadius: 12, background: 'var(--surface2)', textAlign: 'center' }}>
      <b style={{ display: 'block', fontSize: 22, color }}>{value}</b>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>{label}</span>
    </div>
  )
}

function segStyle(active: boolean): React.CSSProperties {
  return { height: 32, padding: '0 12px', border: 0, borderRadius: 9, background: active ? 'var(--tOn)' : 'transparent', color: active ? 'var(--tOnInk)' : 'var(--muted)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }
}

function flagBtnStyle(on: boolean, mobile?: boolean): React.CSSProperties {
  return {
    height: 46,
    padding: mobile ? '0 12px' : '0 16px',
    borderRadius: 12,
    border: `1.5px solid ${on ? '#F2B63B' : 'rgba(242,182,59,.55)'}`,
    background: on ? '#F2B63B' : 'rgba(242,182,59,.14)',
    color: on ? '#3A2A00' : '#C98A0B',
    font: 'inherit',
    fontSize: 13.5,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

const css = `
${sharedKeyframes(P)}
${modalSheetCss(P)}
.${P}-app{background:var(--bg);color:var(--ink);font-family:var(--ff,'Plus Jakarta Sans',sans-serif)}
.${P}-header{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;height:72px;padding:0 28px;background:var(--surface);border-bottom:1px solid var(--line)}
.${P}-seg{display:inline-flex;gap:3px;padding:3px;border-radius:12px;background:var(--tBg)}
.${P}-timer{display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border-radius:11px;background:var(--surface2);color:${C_TIMER}}
.${P}-iconbtn{height:40px;min-width:40px;padding:0 10px;border:1px solid var(--line);border-radius:11px;background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:4px;cursor:pointer}
.${P}-grid{max-width:1280px;margin:0 auto;padding:26px 28px 40px;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:22px;align-items:start}
.${P}-side{position:sticky;top:96px}
.${P}-qnum{height:28px;padding:0 11px;border-radius:8px;background:var(--surface2);color:var(--ink);font-size:13px;font-weight:800;display:inline-flex;align-items:center}
.${P}-qmat{height:26px;padding:0 10px;border-radius:99px;background:var(--chip);color:var(--brand);font-size:12px;font-weight:700;display:inline-flex;align-items:center}
.${P}-actions{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding-top:18px;margin-top:18px;border-top:1px solid var(--line)}
.${P}-navscroll{max-height:420px;overflow-y:auto;padding:6px 6px 6px 2px;scrollbar-width:thin}
.${P}-revgrid{display:grid;grid-template-columns:repeat(10,1fr);gap:6px}
.${P}-revactions{display:flex;flex-wrap:wrap;gap:8px;padding:16px 24px 22px;margin-top:14px;border-top:1px solid var(--line)}
.${P}-folhagrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px 12px}
.${P}-bottombar{display:none}
@media (max-width:980px){
  .${P}-grid{grid-template-columns:1fr}
  .${P}-side{display:none}
}
@media (max-width:640px){
  .${P}-header{height:62px;padding:0 12px;gap:8px}
  .${P}-title,.${P}-counter,.${P}-iconbtn,.${P}-seglbl,.${P}-timerlbl,.${P}-finlbl{display:none}
  .${P}-timer{padding:0 10px}
  .${P}-grid{padding:14px 12px 96px}
  .${P}-actions{display:none}
  .${P}-navlbl{display:none}
  .${P}-revgrid{grid-template-columns:repeat(7,1fr)}
  .${P}-folhagrid{grid-template-columns:1fr}
  .${P}-bottombar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;position:sticky;bottom:0;z-index:15;padding:12px;background:var(--surface);border-top:1px solid var(--line)}
  .${P}-revactions{flex-direction:column}
  .${P}-revactions>button{width:100%}
}
`

export { ProvaVND as default }
