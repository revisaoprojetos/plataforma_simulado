'use client'

// SIMULADO · Resultado — marca REVISÃO (spec 06 §3). Relatório limpo em coluna.
// Herói arco-íris + dica pêssego + downloads + NPS + matérias + posição +
// correção questão a questão. Porte fiel de design/SimResultadoRevisao*.dc.html.

import { useMemo, useState } from 'react'
import type { SimScreenProps, SimCorrecaoItem } from '../types'
import { simTokensStyle } from '../sim-tokens'
import {
  Bgfx, MarcaR, Ic, P, cardStyle, primaryBtnStyle, ghostBtnStyle, baseKeyframes,
  REV_GOLD, RAINBOW, OK, ERR, WARN,
} from './shared'

const PFX = 'srr'
type Filtro = 'all' | 'c' | 'e' | 'b'
const STATUS_TO_F: Record<SimCorrecaoItem['status'], Filtro> = { certa: 'c', errada: 'e', branco: 'b' }

export function ResultadoRevisao({ theme, data }: SimScreenProps) {
  const { info, resultado, aluno } = data
  const r = resultado
  const N = info.n

  const [rq, setRq] = useState(1)
  const [rf, setRf] = useState<Filtro>('all')
  const [jx, setJx] = useState(true)
  const [np, setNp] = useState(-1)
  const [npSent, setNpSent] = useState(false)

  const cur = r.correcao[rq - 1]

  const nextErr = () => {
    for (let i = rq + 1; i <= N; i++) if (r.correcao[i - 1]?.status === 'errada') { setRq(i); setJx(false); return }
  }

  const totalCertas = r.certas, totalErradas = r.erradas, totalBranco = r.branco

  return (
    <div className={`${PFX}-root`} style={{ ...simTokensStyle('revisao', theme), minHeight: '100vh' }}>
      <style>{css()}</style>
      <Bgfx prefix={PFX} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* HEADER */}
        <header className={`${PFX}-header`} style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, height: 70, padding: '0 24px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--brand)', display: 'inline-flex' }}><MarcaR size={26} /></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: OK }}><Ic d={P.check} size={15} />Simulado finalizado</span>
          <span style={{ flex: 1 }} />
          <button type="button" className={`${PFX}-sbtn ${PFX}-hbtn`} style={ghostBtnStyle(44)}><Ic d={P.refresh} size={16}><path d={P.refresh} /><path d="M21 3v5h-5" /></Ic><span className={`${PFX}-hlabel`}>Refazer como treino</span></button>
          <a href="#" className={`${PFX}-sbtn ${PFX}-hbtn`} style={primaryBtnStyle(44)}><Ic size={16}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /></Ic><span className={`${PFX}-hlabel`}>Início da plataforma</span></a>
        </header>

        <div className={`${PFX}-col`} style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 24px 60px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* HERÓI */}
          <div style={cardStyle({ borderRadius: 22, overflow: 'hidden' })}>
            <span style={{ display: 'block', height: 5, background: RAINBOW }} />
            <div style={{ padding: '28px 32px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: 'var(--muted)', textTransform: 'uppercase' }}>Simulado finalizado</span>
              <h1 className={`${PFX}-h1`} style={{ margin: '6px 0 2px', fontSize: 34, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--brand)' }}>{info.titulo}</h1>
              <span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 700 }}>{aluno.primeiroNome}</span>

              <div className={`${PFX}-meta`} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '18px 0', paddingTop: 18, borderTop: '1px solid var(--line)' }}>
                <Meta label="Data" valor={r.data} />
                <Meta label="Início" valor={r.inicio} />
                <Meta label="Término" valor={r.termino} />
                <Meta label="Tempo utilizado" valor={r.tempo} />
              </div>

              <div className={`${PFX}-kpis`} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                <Kpi valor={totalCertas} label="Acertos" color={OK} bg="rgba(31,168,104,.1)" bd="rgba(31,168,104,.35)" />
                <Kpi valor={totalErradas} label="Erros" color={ERR} bg="rgba(229,72,77,.08)" bd="rgba(229,72,77,.35)" />
                <Kpi valor={totalBranco} label="Em branco" color="var(--muted)" bg="var(--surface2)" bd="var(--line)" />
                <Kpi valor={r.nota} label="Nota final" color="var(--brand)" bg="var(--chip)" bd="color-mix(in srgb,var(--brand) 30%,transparent)" />
              </div>

              <div className={`${PFX}-pos`} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 14 }}>
                <PosTile label="Posição" valor={`${r.posicao}º de ${r.total.toLocaleString('pt-BR')}`} />
                {r.mediaTurma != null && <PosTile label="Média geral" valor={`${r.mediaTurma}%`} />}
                {r.deltaMedia != null && <PosTile label={r.deltaMedia >= 0 ? 'Acima da média' : 'Abaixo da média'} valor={`${r.deltaMedia >= 0 ? '+' : ''}${r.deltaMedia} p.p.`} color={r.deltaMedia >= 0 ? OK : ERR} />}
                {r.percentil != null ? <PosTile label="Top" valor={`${100 - r.percentil}%`} color="var(--brand)" /> : <PosTile label="Top" valor="16%" color="var(--brand)" />}
              </div>
            </div>
          </div>

          {/* DICA pêssego */}
          <div style={{ display: 'flex', gap: 12, padding: '16px 18px', borderRadius: 18, background: 'var(--peachBg)', border: '1px solid rgba(241,194,50,.45)' }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: REV_GOLD, color: '#2A1A55', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic size={18}><path d={P.bulb} /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" /></Ic></span>
            <div>
              <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)' }}>Próximo passo sugerido pela Revisão</b>
              <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>Você ficou acima da média em 11 de 15 matérias. Monte um cronograma focado em Direito Financeiro e Urbanístico.</span>
            </div>
          </div>

          {/* DOWNLOADS */}
          <div style={cardStyle({ padding: 20 })}>
            <b style={{ display: 'block', fontSize: 16, color: 'var(--ink)', marginBottom: 14 }}>Materiais e downloads</b>
            {r.downloads.map((grupo, gi) => (
              <div key={gi}>
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: gi ? 0 : 0 }}>{grupo.grupo}</span>
                <div className={`${PFX}-docgrid`} style={{ display: 'grid', gridTemplateColumns: `repeat(${grupo.itens.length >= 3 ? 3 : 2},1fr)`, gap: 10, margin: '8px 0 16px' }}>
                  {grupo.itens.map((it, ii) => (
                    <a key={ii} href="#" className={`${PFX}-doc`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, border: `1.5px solid ${it.destaque ? 'var(--selLine)' : 'var(--line)'}`, background: it.destaque ? 'var(--selBg)' : 'var(--surface)' }}>
                      <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic size={18}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></Ic></span>
                      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                        <b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>{it.nome}</b>
                      </span>
                      <span style={{ color: 'var(--muted)' }}><Ic d={P.fwd} size={16} /></span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* NPS */}
          <div style={cardStyle({ padding: 20 })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic size={18}><path d="M12 17.3 6.2 20l1.1-6.3L2.7 9.2l6.4-.9L12 2.5l2.9 5.8 6.4.9-4.6 4.5 1.1 6.3z" /></Ic></span>
              <div>
                <b style={{ display: 'block', fontSize: 16, color: 'var(--ink)' }}>Como foi sua experiência?</b>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>De 0 a 10, o quanto você recomendaria este simulado?</span>
              </div>
            </div>
            {npSent ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, background: 'rgba(31,168,104,.1)', color: OK, fontSize: 14, fontWeight: 700 }}>
                <Ic d={P.check} size={18} />Obrigado! Sua avaliação ajuda a Revisão a melhorar os próximos simulados.
              </div>
            ) : (
              <>
                <div className={`${PFX}-nps`} style={{ display: 'flex', gap: 6 }}>
                  {Array.from({ length: 11 }, (_, i) => i).map((i) => {
                    const on = i === np
                    const c = i <= 6 ? ERR : i <= 8 ? WARN : OK
                    return (
                      <button key={i} type="button" onClick={() => setNp(i)} style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 10, border: `1.5px solid ${on ? c : 'var(--line)'}`, background: on ? c : 'var(--surface)', color: on ? '#fff' : 'var(--ink)', font: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer', transition: 'all .15s' }}>{i}</button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0 14px', fontSize: 11.5, color: 'var(--muted)' }}>
                  <span>Não recomendaria</span><span>Recomendaria muito</span>
                </div>
                <textarea placeholder="Quer contar o porquê? (opcional)" style={{ width: '100%', height: 76, padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--line2)', background: 'var(--surface)', font: 'inherit', fontSize: 13.5, color: 'var(--ink)', resize: 'none' }} />
                <div style={{ marginTop: 12, opacity: np >= 0 ? 1 : 0.45 }}>
                  <button type="button" onClick={() => { if (np >= 0) setNpSent(true) }} className={`${PFX}-sbtn`} style={{ ...primaryBtnStyle(46), pointerEvents: np >= 0 ? 'auto' : 'none' }}><Ic d={P.check} size={16} />Enviar avaliação</button>
                </div>
              </>
            )}
          </div>

          {/* DESEMPENHO POR MATÉRIA */}
          <div style={cardStyle({ padding: 20 })}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <b style={{ fontSize: 16, color: 'var(--ink)' }}>Desempenho por matéria</b>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                <span style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--ink)', opacity: 0.55 }} />média geral dos alunos
              </span>
            </div>
            <div className={`${PFX}-nscroll`} style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 6 }}>
              {r.porMateria.map((m, i) => {
                const pct = Math.round((m.certas / m.total) * 100)
                const col = pct >= 70 ? OK : pct >= 50 ? WARN : ERR
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '6px 12px', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{m.nome}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{m.certas}/{m.total}</span>
                      <b style={{ width: 44, textAlign: 'right', fontSize: 13, color: col }}>{pct}%</b>
                    </span>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ position: 'relative', height: 8, borderRadius: 99, background: 'var(--track)' }}>
                        <span className={`${PFX}-bar`} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 99, background: col }} />
                        {m.mediaPct != null && <span title="Média geral" style={{ position: 'absolute', left: `${m.mediaPct}%`, top: -4, bottom: -4, width: 3, borderRadius: 2, background: 'var(--ink)', opacity: 0.55 }} />}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <span style={{ display: 'block', marginTop: 10, fontSize: 11.5, color: 'var(--muted)' }}>Role para ver todas as matérias</span>
          </div>

          {/* POSIÇÃO / HISTOGRAMA */}
          <div style={cardStyle({ padding: 20 })}>
            <b style={{ display: 'block', fontSize: 16, color: 'var(--ink)' }}>Sua posição entre os alunos</b>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Distribuição das notas · alunos aparecem só com as iniciais</span>
            <Histograma bins={r.histograma} faixa={r.faixaAluno} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--muted)' }}>
              <span>menor nota</span><span>maior nota</span>
            </div>
            <div style={{ marginTop: 14 }}>
              {r.top3.map((t) => (
                <div key={t.pos} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line)' }}>
                  <b style={{ width: 28, fontSize: 13, color: 'var(--brand)' }}>{t.pos}º</b>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{t.iniciais}</span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>Aluno {t.iniciais}</span>
                  <b style={{ fontSize: 13, color: 'var(--ink)' }}>{t.pct}%</b>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, marginTop: 6, borderRadius: 12, background: 'var(--selBg)' }}>
                <b style={{ width: 28, fontSize: 13, color: 'var(--brand)' }}>{r.posicao}º</b>
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--selDot)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>EU</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Você</span>
                <b style={{ fontSize: 13, color: 'var(--ink)' }}>{r.nota}</b>
              </div>
            </div>
          </div>

          {/* CORREÇÃO QUESTÃO A QUESTÃO */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 18, color: 'var(--ink)' }}>Correção questão a questão</b>
              <div className={`${PFX}-filtros`} style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                <FiltroPill active={rf === 'all'} onClick={() => setRf('all')} label={`Todas · ${N}`} />
                <FiltroPill active={rf === 'e'} onClick={() => setRf('e')} label={`Erradas · ${totalErradas}`} />
                <FiltroPill active={rf === 'c'} onClick={() => setRf('c')} label={`Certas · ${totalCertas}`} />
                <FiltroPill active={rf === 'b'} onClick={() => setRf('b')} label={`Em branco · ${totalBranco}`} />
              </div>
            </div>

            <div className={`${PFX}-corrgrid`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 18, alignItems: 'start' }}>
              {/* Cartão da questão */}
              <div style={cardStyle({ padding: 22 })}>
                {cur && (
                  <div key={rq} className={`${PFX}-qin`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ height: 28, padding: '0 11px', borderRadius: 8, background: 'var(--surface2)', fontSize: 13, fontWeight: 800, color: 'var(--ink)', display: 'inline-flex', alignItems: 'center' }}>{rq}</span>
                      <span style={{ height: 26, padding: '0 10px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{cur.materia}</span>
                      <span style={{ flex: 1 }} />
                      {cur.status === 'certa' && <StatusPill color={OK} bg="rgba(31,168,104,.12)" label="Acertou" />}
                      {cur.status === 'errada' && <StatusPill color={ERR} bg="rgba(229,72,77,.12)" label="Errou" />}
                      {cur.status === 'branco' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 99, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}>Em branco</span>}
                    </div>
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--ink)' }}>{cur.enunciado}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(cur.alternativas ?? []).map((a) => {
                        const isG = a.letra === cur.gabarito
                        const isY = a.letra === cur.suaResposta && !isG
                        const bd = isG ? OK : isY ? ERR : 'var(--line)'
                        const bg = isG ? 'rgba(31,168,104,.1)' : isY ? 'rgba(229,72,77,.08)' : 'var(--surface)'
                        const dot = isG ? OK : isY ? ERR : 'transparent'
                        const ink = isG || isY ? '#fff' : 'var(--muted)'
                        return (
                          <div key={a.letra} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${bd}`, background: bg }}>
                            <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: '1.5px solid var(--line2)', background: dot, color: ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{a.letra}</span>
                            <span style={{ flex: 1, fontSize: 14, lineHeight: 1.55, color: 'var(--ink)' }}>{a.texto}</span>
                            {isG && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: OK }}>GABARITO</span>}
                            {isY && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: ERR }}>SUA RESPOSTA</span>}
                          </div>
                        )
                      })}
                    </div>
                    {/* Acordeão comentário */}
                    <div style={{ borderRadius: 14, border: '1px solid var(--line)', overflow: 'hidden' }}>
                      <button type="button" onClick={() => setJx((v) => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', border: 0, background: 'var(--surface2)', font: 'inherit', cursor: 'pointer' }}>
                        <span style={{ color: 'var(--brand)' }}><Ic size={17}><path d={P.bulb} /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" /></Ic></span>
                        <b style={{ flex: 1, textAlign: 'left', fontSize: 14, color: 'var(--ink)' }}>Comentário do professor · gabarito {cur.gabarito}</b>
                        <span style={{ display: 'inline-flex', transform: `rotate(${jx ? 180 : 0}deg)`, transition: 'transform .25s' }}><Ic d={P.chevDown} size={16} /></span>
                      </button>
                      {jx && <p className={`${PFX}-qin`} style={{ margin: 0, padding: '14px 16px', fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink)' }}>{cur.comentario}</p>}
                    </div>
                    {/* Ações */}
                    <div style={{ display: 'flex', gap: 8, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                      <button type="button" onClick={() => { setRq((v) => Math.max(1, v - 1)); setJx(false) }} className={`${PFX}-sbtn`} style={ghostBtnStyle(44)}><Ic d={P.back} size={17} />Anterior</button>
                      <span style={{ flex: 1 }} />
                      <button type="button" onClick={nextErr} disabled={totalErradas === 0} className={`${PFX}-sbtn`} style={{ ...ghostBtnStyle(44), opacity: totalErradas === 0 ? 0.4 : 1 }}><Ic d={P.fwd} size={17} />Próxima errada</button>
                      <button type="button" onClick={() => { setRq((v) => Math.min(N, v + 1)); setJx(false) }} className={`${PFX}-sbtn`} style={primaryBtnStyle(44)}>Próxima<Ic d={P.fwd} size={17} /></button>
                    </div>
                  </div>
                )}
              </div>

              {/* Navegador correção */}
              <div className={`${PFX}-corrnav`} style={{ position: 'sticky', top: 90 }}>
                <div style={cardStyle({ padding: 18 })}>
                  <b style={{ display: 'block', fontSize: 15, color: 'var(--ink)', marginBottom: 12 }}>Navegador</b>
                  <div className={`${PFX}-nscroll`} style={{ maxHeight: 440, overflowY: 'auto', padding: 4 }}>
                    <div className={`${PFX}-navgrid`} style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
                      {r.correcao.map((item) => {
                        const n = item.numero
                        const f = STATUS_TO_F[item.status]
                        const inF = rf === 'all' || rf === f
                        const bg = item.status === 'certa' ? OK : item.status === 'errada' ? ERR : 'var(--surface2)'
                        const col = item.status === 'branco' ? 'var(--muted)' : '#fff'
                        const ring = n === rq ? '0 0 0 2px var(--surface), 0 0 0 4px var(--ink)' : 'none'
                        return (
                          <button key={n} type="button" onClick={() => { setRq(n); setJx(false) }} style={{ height: 34, border: 0, borderRadius: 8, background: bg, color: col, boxShadow: ring, opacity: inF ? 1 : 0.18, font: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer', transition: 'opacity .2s' }}>{n}</button>
                        )
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
                    <LegDot color={OK} label="Certa" />
                    <LegDot color={ERR} label="Errada" />
                    <LegDot color="var(--surface2)" border label="Branco" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Subcomponentes ───────────────────────────────────────────────────────────

function Meta({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
      <b style={{ fontSize: 15, color: 'var(--ink)' }}>{valor}</b>
    </div>
  )
}

function Kpi({ valor, label, color, bg, bd }: { valor: number | string; label: string; color: string; bg: string; bd: string }) {
  return (
    <div style={{ padding: 16, borderRadius: 16, background: bg, border: `1px solid ${bd}`, textAlign: 'center' }}>
      <b style={{ display: 'block', fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color }}>{valor}</b>
      <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{label}</span>
    </div>
  )
}

function PosTile({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--surface2)' }}>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{label}</span>
      <b style={{ display: 'block', fontSize: 18, color: color ?? 'var(--ink)' }}>{valor}</b>
    </div>
  )
}

function Histograma({ bins, faixa }: { bins: number[]; faixa: number }) {
  const max = Math.max(...bins, 1)
  return (
    <div style={{ display: 'flex', gap: 6, margin: '16px 0 6px' }}>
      {bins.map((v, i) => {
        const h = Math.max(16, Math.round((v / max) * 120))
        const eu = i === faixa
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: '100%', height: 120, display: 'flex', alignItems: 'flex-end' }}>
              <span className={`${PFX}-grow`} style={{ display: 'block', width: '100%', height: h, borderRadius: '6px 6px 2px 2px', background: eu ? 'var(--selDot)' : 'var(--track)' }} />
            </div>
            <span style={{ fontSize: 10.5, fontWeight: eu ? 800 : 500, color: eu ? 'var(--ink)' : 'var(--muted)', minHeight: 14 }}>{eu ? 'você' : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

function FiltroPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} style={{ flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 99, border: '1px solid var(--line)', background: active ? 'var(--fOn)' : 'transparent', color: active ? 'var(--fOnInk)' : 'var(--muted)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
  )
}

function StatusPill({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 99, background: bg, color, fontSize: 12, fontWeight: 800 }}>
      <Ic d={label === 'Acertou' ? P.check : P.close} size={13} strokeWidth={2.6} />{label}
    </span>
  )
}

function LegDot({ color, border, label }: { color: string; border?: boolean; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, border: border ? '1px solid var(--line2)' : undefined }} />{label}
    </span>
  )
}

function css() {
  return baseKeyframes(PFX) + `
@media (max-width:640px){
  .${PFX}-h1{font-size:26px}
  .${PFX}-hlabel{display:none}
  .${PFX}-hbtn{min-width:44px;padding:0 10px!important}
  .${PFX}-col{padding:20px 14px 40px!important}
  .${PFX}-meta{grid-template-columns:repeat(2,1fr)!important}
  .${PFX}-kpis,.${PFX}-pos{grid-template-columns:repeat(2,1fr)!important}
  .${PFX}-docgrid{grid-template-columns:1fr!important}
  .${PFX}-nps button{height:38px}
  .${PFX}-corrgrid{grid-template-columns:1fr!important}
  .${PFX}-corrnav{position:static!important;order:-1}
  .${PFX}-corrnav .${PFX}-navgrid{grid-template-columns:repeat(8,1fr)!important}
  .${PFX}-corrnav .${PFX}-nscroll{max-height:300px}
}
`
}
