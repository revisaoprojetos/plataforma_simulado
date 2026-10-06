'use client'

// SIMULADO — VND · Resultado (spec 06 §3, coluna VND). Gamificado "missão cumprida":
// banner + confete + medalha prata + barra XP + tiles 3D + conquistas + matérias (estrelas)
// + vizinhança + NPS + downloads + correção questão a questão.

import { useMemo, useState } from 'react'
import {
  Award,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Flame,
  FileDown,
  Home,
  Lightbulb,
  List,
  Lock,
  Medal,
  RotateCcw,
  Star,
  Target,
  TrendingUp,
  X,
} from 'lucide-react'
import { simTokensStyle } from '../sim-tokens'
import type { SimCorrecaoItem, SimScreenProps } from '../types'
import {
  Bgfx,
  card3d,
  Confetti,
  ghostBtnStyle,
  MarcaVND,
  primaryBtnStyle,
  sharedKeyframes,
  C_ERR,
  C_OK,
  C_STAR,
  C_WARN,
  VND_GOLD,
  VND_GOLD_INK,
  VND_GOLD_SHADOW,
  VND_HERO_BG,
} from './shared'

const P = 'svr'
type Filtro = 'all' | 'e' | 'c' | 'b'

export function ResultadoVND({ theme, data }: SimScreenProps) {
  const r = data.resultado
  const { info, aluno } = data
  const [rq, setRq] = useState(1)
  const [rf, setRf] = useState<Filtro>('all')
  const [jx, setJx] = useState(true)
  const [np, setNp] = useState(-1)
  const [npSent, setNpSent] = useState(false)

  const statuses = useMemo(() => r.correcao.map((c) => (c.status === 'certa' ? 'c' : c.status === 'errada' ? 'e' : 'b')), [r.correcao])
  const cur = r.correcao[rq - 1]

  function gotoCorr(n: number) {
    setRq(n)
    setJx(false)
  }
  function nextErr() {
    for (let i = rq + 1; i <= r.correcao.length; i++) {
      if (statuses[i - 1] === 'e') {
        gotoCorr(i)
        return
      }
    }
  }
  const hasErr = statuses.includes('e')

  const xpBar = 86 // nível 27→28 (spec)
  const biz = r.vizinhanca ?? []

  return (
    <div className={`${P}-app`} style={{ ...simTokensStyle('vnd', theme), minHeight: '100vh', position: 'relative' }}>
      <style>{css}</style>
      <Bgfx prefix={P} variant="soft" />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* HEADER */}
        <header className={`${P}-header`}>
          <MarcaVND size={17} radius={11} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 800, color: C_OK }}>
            <Check size={16} strokeWidth={2.6} /> Simulado finalizado
          </span>
          <span style={{ flex: 1 }} />
          <a href="#" className={`${P}-sbtn ${P}-htxt`} style={ghostBtnStyle({ height: 40, padding: '0 16px', borderRadius: 11, fontSize: 13, textDecoration: 'none' })}>
            <RotateCcw size={15} /> <span className={`${P}-hlbl`}>Refazer como treino</span>
          </a>
          <a href="#" className={`${P}-sbtn`} style={{ ...primaryBtnStyle({ height: 40, padding: '0 16px', borderRadius: 11, fontSize: 13 }), textDecoration: 'none' }}>
            <Home size={15} /> <span className={`${P}-hlbl`}>Início da plataforma</span>
          </a>
        </header>

        <div className={`${P}-wrap`}>
          {/* HERÓI */}
          <div className={`${P}-hero`}>
            <span aria-hidden="true" className={`${P}-herodots`} />
            <Confetti prefix={P} />
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.24em', color: '#F1D48A' }}>MISSÃO CUMPRIDA</span>
              <div className={`${P}-okpop ${P}-medal`}>
                <Medal size={50} />
                <b style={{ fontSize: 12, letterSpacing: '.14em', marginTop: 4 }}>PRATA</b>
              </div>
              <h1 style={{ margin: '4px 0 0', fontSize: 34, fontWeight: 800, letterSpacing: '-0.045em' }} className={`${P}-heroh1`}>
                Mandou bem, {aluno.primeiroNome}!
              </h1>
              <span style={{ fontSize: 14, color: '#CFE3D7' }}>
                {r.certas} de {info.n} acertos · {r.nota} · {info.curto.replace('SIMULADO NACIONAL', 'Simulado Nacional')}
              </span>
              <div style={{ width: '100%', maxWidth: 460 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#CFE3D7', marginBottom: 6 }}>
                  <span>Nível 27 → 28</span>
                  <span style={{ color: '#F1D48A' }}>+{r.xpGanho ?? 120} XP</span>
                </div>
                <div style={{ height: 14, borderRadius: 99, background: 'rgba(255,255,255,.14)', boxShadow: 'inset 0 2px 0 rgba(0,0,0,.2)', overflow: 'hidden' }}>
                  <span className={`${P}-bar`} style={{ display: 'block', width: `${xpBar}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#3FD58A,#F1D48A)' }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                <HeroChip icon={<Award size={14} />} text={`${r.posicao}º de ${fmtN(r.total)}`} />
                <HeroChip icon={<TrendingUp size={14} />} text="subiu 4 posições na liga" />
                <HeroChip icon={<Clock size={14} />} text={`${r.tempo} de ${Math.round((info.duracaoMin ?? 240) / 60)}h`} />
              </div>
            </div>
          </div>

          {/* TILES 3D */}
          <div className={`${P}-tiles`}>
            <Tile value={String(r.certas)} label="acertos" color={C_OK} />
            <Tile value={String(r.erradas)} label="erros" color={C_ERR} />
            <Tile value={String(r.branco)} label="em branco" color="var(--muted)" />
            <Tile value={`+${r.xpGanho ?? 120}`} label="XP ganhos" color="var(--goldInk)" />
          </div>

          {/* CONQUISTAS */}
          <div style={card3d({ padding: 20 })}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <b style={{ fontSize: 17, color: 'var(--ink)' }}>Conquistas desta rodada</b>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--goldInk)' }}>3 de 4</span>
            </div>
            <div className={`${P}-hs`} style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
              <Conquista icon={<Flag size={22} />} title="Rodada completa" sub="Respondeu todas as questões" />
              <Conquista icon={<Flame size={22} />} title="Sem pausa" sub="Terminou antes das 4h" />
              <Conquista icon={<Target size={22} />} title="Mira certa" sub="8/10 em Direitos Humanos" />
              <Conquista icon={<Lock size={22} />} title="Liga Ouro" sub="Faltaram 5 acertos" locked />
            </div>
          </div>

          {/* MATÉRIAS ‖ (VIZINHANÇA + NPS) */}
          <div className={`${P}-cols`}>
            <div style={card3d({ padding: 20, display: 'flex', flexDirection: 'column' })}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <b style={{ fontSize: 17, color: 'var(--ink)' }}>Desempenho por matéria</b>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>3 estrelas = 75%+</span>
              </div>
              <div className={`${P}-matwrap`}>
                <div className={`${P}-matscroll`}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                    {r.porMateria.map((m) => (
                      <MateriaRow key={m.nome} nome={m.nome} total={m.total} certas={m.certas} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* VIZINHANÇA */}
              <div style={card3d({ padding: 20 })}>
                <b style={{ display: 'block', fontSize: 17, color: 'var(--ink)', marginBottom: 12 }}>Sua vizinhança no ranking</b>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {biz.map((l) => {
                    const eu = !!l.eu
                    return (
                      <div
                        key={l.pos}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 12px',
                          borderRadius: 14,
                          background: eu ? VND_GOLD : 'transparent',
                          color: eu ? VND_GOLD_INK : 'var(--ink)',
                          boxShadow: eu ? '0 3px 0 #9A7414' : 'none',
                        }}
                      >
                        <b style={{ width: 44, fontSize: 13 }}>{l.pos}º</b>
                        <span
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: '50%',
                            background: eu ? '#0B4A2E' : 'var(--chip)',
                            color: eu ? '#F1D48A' : 'var(--brand)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          {l.iniciais}
                        </span>
                        <b style={{ flex: 1, fontSize: 13 }}>{eu ? 'Você' : `Aluno ${l.iniciais}`}</b>
                        <b style={{ fontSize: 13 }}>{fmtPct(l.pct)}</b>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* NPS */}
              <div style={card3d({ padding: 20 })}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Star size={19} />
                  </span>
                  <div>
                    <b style={{ display: 'block', fontSize: 16, color: 'var(--ink)' }}>Como foi sua experiência?</b>
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>De 0 a 10, o quanto você recomendaria este simulado?</span>
                  </div>
                </div>
                {npSent ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, background: 'rgba(31,168,104,.1)', color: C_OK, fontSize: 14, fontWeight: 700 }}>
                    <Check size={20} /> Obrigado! Sua avaliação ajuda a melhorar os próximos simulados.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {Array.from({ length: 11 }, (_, i) => {
                        const on = i === np
                        const c = i <= 6 ? C_ERR : i <= 8 ? C_WARN : C_OK
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setNp(i)}
                            style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 10, border: `1.5px solid ${on ? c : 'var(--line2)'}`, background: on ? c : 'var(--surface)', color: on ? '#fff' : 'var(--ink)', font: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer', transition: 'all .15s' }}
                          >
                            {i}
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0 14px', fontSize: 11.5, color: 'var(--muted)' }}>
                      <span>Não recomendaria</span>
                      <span>Recomendaria muito</span>
                    </div>
                    <textarea placeholder="Quer contar o porquê? (opcional)" style={{ width: '100%', height: 76, padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--line2)', background: 'var(--surface)', font: 'inherit', fontSize: 13.5, color: 'var(--ink)', resize: 'none' }} />
                    <div style={{ marginTop: 12, opacity: np >= 0 ? 1 : 0.45 }}>
                      <button type="button" onClick={() => np >= 0 && setNpSent(true)} className={`${P}-sbtn`} style={primaryBtnStyle({ height: 46, padding: '0 20px', borderRadius: 16, fontSize: 14.5, pointerEvents: np >= 0 ? 'auto' : 'none' })}>
                        <Check size={17} /> Enviar avaliação
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* DOWNLOADS */}
          <div style={card3d({ padding: 20 })}>
            <b style={{ display: 'block', fontSize: 16, color: 'var(--ink)', marginBottom: 14 }}>Materiais e downloads</b>
            {r.downloads.map((grp, gi) => (
              <div key={grp.grupo}>
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: gi ? 8 : 0 }}>{grp.grupo}</span>
                <div className={gi === 0 ? `${P}-dl2` : `${P}-dl3`} style={{ margin: '8px 0 16px' }}>
                  {grp.itens.map((it) => (
                    <a
                      key={it.nome}
                      href="#"
                      className={`${P}-doc`}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, border: `1.5px solid ${it.destaque ? 'var(--selLine)' : 'var(--line)'}`, background: it.destaque ? 'var(--selBg)' : 'var(--surface)' }}
                    >
                      <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {it.destaque ? <Lightbulb size={18} /> : gi === 0 ? <List size={18} /> : <BookOpenCheck size={18} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                        <b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>{it.nome.split(' · ')[0]}</b>
                        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>PDF</span>
                      </span>
                      <span style={{ color: 'var(--muted)' }}>
                        <FileDown size={16} />
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* CORREÇÃO QUESTÃO A QUESTÃO */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 18, color: 'var(--ink)' }}>Correção questão a questão</b>
              <div className={`${P}-hs`} style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                {(
                  [
                    ['all', `Todas · ${r.correcao.length}`],
                    ['e', `Erradas · ${r.erradas}`],
                    ['c', `Certas · ${r.certas}`],
                    ['b', `Em branco · ${r.branco}`],
                  ] as [Filtro, string][]
                ).map(([k, label]) => {
                  const on = rf === k
                  return (
                    <button key={k} type="button" onClick={() => setRf(k)} style={{ flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 99, border: '1px solid var(--line)', background: on ? 'var(--fOn)' : 'transparent', color: on ? 'var(--fOnInk)' : 'var(--muted)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className={`${P}-corrgrid`}>
              {/* card */}
              <div style={card3d({ padding: 22 })}>
                <CorrecaoCard item={cur} jx={jx} onToggleJx={() => setJx((v) => !v)} />
                <div className={`${P}-corractions`}>
                  <button type="button" onClick={() => gotoCorr(Math.max(1, rq - 1))} className={`${P}-sbtn`} style={ghostBtnStyle({ height: 44, padding: '0 20px', borderRadius: 16, fontSize: 14.5 })}>
                    <ChevronLeft size={17} /> Anterior
                  </button>
                  <span style={{ flex: 1 }} />
                  <button type="button" onClick={nextErr} disabled={!hasErr} className={`${P}-sbtn`} style={ghostBtnStyle({ height: 44, padding: '0 20px', borderRadius: 16, fontSize: 14.5, opacity: hasErr ? 1 : 0.4 })}>
                    <X size={17} /> Próxima errada
                  </button>
                  <button type="button" onClick={() => gotoCorr(Math.min(r.correcao.length, rq + 1))} className={`${P}-sbtn`} style={primaryBtnStyle({ height: 44, padding: '0 20px', borderRadius: 16, fontSize: 14.5 })}>
                    <ChevronRight size={17} /> Próxima
                  </button>
                </div>
              </div>

              {/* nav correção */}
              <div className={`${P}-corrside`}>
                <div style={card3d({ padding: 18 })}>
                  <b style={{ display: 'block', fontSize: 15, color: 'var(--ink)', marginBottom: 12 }}>Navegador</b>
                  <div className={`${P}-corrnavscroll`}>
                    <div className={`${P}-corrnav`}>
                      {statuses.map((s, i) => {
                        const n = i + 1
                        const inF = rf === 'all' || rf === s
                        const curCell = n === rq
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => gotoCorr(n)}
                            style={{ height: 34, border: 0, borderRadius: 8, background: s === 'c' ? C_OK : s === 'e' ? C_ERR : 'var(--surface2)', color: s === 'b' ? 'var(--muted)' : '#fff', boxShadow: curCell ? '0 0 0 2px var(--surface), 0 0 0 4px var(--ink)' : 'none', opacity: inF ? 1 : 0.18, font: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer', transition: 'opacity .2s' }}
                          >
                            {n}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
                    <LegendDot color={C_OK} label="Certa" />
                    <LegendDot color={C_ERR} label="Errada" />
                    <LegendDot color="var(--surface2)" border label="Branco" />
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

/* ─── peças ─── */
function HeroChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 99, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(185,245,212,.25)', fontSize: 12.5, fontWeight: 700 }}>
      {icon}
      {text}
    </span>
  )
}

function Tile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ padding: 16, borderRadius: 20, border: '2px solid var(--line)', borderBottomWidth: 5, background: 'var(--surface)', textAlign: 'center' }}>
      <b style={{ display: 'block', fontSize: 30, fontWeight: 800, color }}>{value}</b>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>{label}</span>
    </div>
  )
}

function Conquista({ icon, title, sub, locked }: { icon: React.ReactNode; title: string; sub: string; locked?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 10px', borderRadius: 18, border: '2px solid var(--line)', borderBottomWidth: 4, background: locked ? 'var(--surface2)' : 'var(--goldBg)', textAlign: 'center', opacity: locked ? 0.6 : 1 }}>
      <span style={{ width: 48, height: 48, borderRadius: 15, background: locked ? 'var(--surface)' : VND_GOLD, color: locked ? 'var(--muted)' : '#2A1F02', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: locked ? '0 3px 0 var(--line2)' : '0 3px 0 #9A7414' }}>
        {icon}
      </span>
      <b style={{ fontSize: 13, color: 'var(--ink)' }}>{title}</b>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sub}</span>
    </div>
  )
}

function MateriaRow({ nome, total, certas }: { nome: string; total: number; certas: number }) {
  const pct = (certas / total) * 100
  const stars = pct >= 75 ? 3 : pct >= 60 ? 2 : pct >= 40 ? 1 : 0
  const segs = Math.min(10, total)
  const filled = Math.round((certas / total) * segs)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, border: '2px solid var(--line)', background: 'var(--surface)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>{nome}</b>
        <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
          {Array.from({ length: segs }, (_, i) => (
            <span key={i} style={{ flex: 1, height: 8, borderRadius: 3, background: i < filled ? C_OK : 'var(--track)' }} />
          ))}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 1 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} style={{ color: i < stars ? C_STAR : 'var(--line2)' }}>
              <Star size={16} fill={i < stars ? C_STAR : 'none'} />
            </span>
          ))}
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>
          {certas}/{total}
        </span>
      </div>
    </div>
  )
}

function CorrecaoCard({ item, jx, onToggleJx }: { item: SimCorrecaoItem; jx: boolean; onToggleJx: () => void }) {
  const pill =
    item.status === 'certa' ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 99, background: 'rgba(31,168,104,.12)', color: C_OK, fontSize: 12, fontWeight: 800 }}>
        <Check size={13} strokeWidth={3} /> Acertou
      </span>
    ) : item.status === 'errada' ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 99, background: 'rgba(229,72,77,.12)', color: C_ERR, fontSize: 12, fontWeight: 800 }}>
        <X size={13} strokeWidth={3} /> Errou
      </span>
    ) : (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 99, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}>Em branco</span>
    )

  return (
    <div key={item.numero} className={`${P}-qin`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ height: 28, padding: '0 11px', borderRadius: 8, background: 'var(--surface2)', fontSize: 13, fontWeight: 800, color: 'var(--ink)', display: 'inline-flex', alignItems: 'center' }}>
          Questão {item.numero}
        </span>
        <span style={{ height: 26, padding: '0 10px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{item.materia}</span>
        <span style={{ flex: 1 }} />
        {pill}
      </div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--ink)' }}>{item.enunciado}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(item.alternativas ?? []).map((a) => {
          const isG = !!a.correta
          const isY = !!a.suaResposta && !a.correta
          return (
            <div
              key={a.letra}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 12,
                border: `1.5px solid ${isG ? C_OK : isY ? C_ERR : 'var(--line)'}`,
                background: isG ? 'rgba(31,168,104,.1)' : isY ? 'rgba(229,72,77,.08)' : 'var(--surface)',
              }}
            >
              <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: '1.5px solid var(--line2)', background: isG ? C_OK : isY ? C_ERR : 'transparent', color: isG || isY ? '#fff' : 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                {a.letra}
              </span>
              <span style={{ flex: 1, fontSize: 14, lineHeight: 1.55, color: 'var(--ink)' }}>{a.texto}</span>
              {isG && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: C_OK }}>GABARITO</span>}
              {isY && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: C_ERR }}>SUA RESPOSTA</span>}
            </div>
          )
        })}
      </div>
      <div style={{ borderRadius: 14, border: '1px solid var(--line)', overflow: 'hidden' }}>
        <button type="button" onClick={onToggleJx} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', border: 0, background: 'var(--surface2)', font: 'inherit', cursor: 'pointer' }}>
          <span style={{ color: 'var(--brand)' }}>
            <Lightbulb size={17} />
          </span>
          <b style={{ flex: 1, textAlign: 'left', fontSize: 14, color: 'var(--ink)' }}>Comentário do professor · gabarito {item.gabarito}</b>
          <span style={{ display: 'inline-flex', transform: `rotate(${jx ? 180 : 0}deg)`, transition: 'transform .25s' }}>
            <ChevronDown size={16} />
          </span>
        </button>
        {jx && (
          <p className={`${P}-qin`} style={{ margin: 0, padding: '14px 16px', fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink)' }}>
            {item.comentario}
          </p>
        )}
      </div>
    </div>
  )
}

function LegendDot({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, border: border ? '1px solid var(--line2)' : undefined }} />
      {label}
    </span>
  )
}

/* ─── util ─── */
function fmtN(n: number) {
  return n.toLocaleString('pt-BR')
}
function fmtPct(p: number) {
  return `${p.toFixed(1).replace('.', ',')}%`
}

const css = `
${sharedKeyframes(P)}
.${P}-app{background:var(--bg);color:var(--ink);font-family:var(--ff,'Plus Jakarta Sans',sans-serif)}
.${P}-hs{scrollbar-width:none}.${P}-hs::-webkit-scrollbar{display:none}
.${P}-header{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:10px;height:70px;padding:0 32px;background:var(--surface);border-bottom:1px solid var(--line)}
.${P}-wrap{max-width:1180px;margin:0 auto;padding:28px 32px 60px;display:flex;flex-direction:column;gap:18px}
.${P}-hero{position:relative;overflow:hidden;border-radius:30px;padding:40px 36px;background:${VND_HERO_BG};color:#fff;text-align:center}
.${P}-herodots{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(185,245,212,.16) 1.2px,transparent 1.8px);background-size:22px 22px}
.${P}-medal{position:relative;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFFFFF,#C9D1D9 40%,#8A96A3);box-shadow:0 8px 0 #5E6A76,0 0 0 8px rgba(255,255,255,.12),0 0 60px rgba(241,212,138,.35);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#1E2A36}
.${P}-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.${P}-cols{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:18px;align-items:stretch}
.${P}-matwrap{position:relative;flex:1;min-height:320px}
.${P}-matscroll{position:absolute;inset:0;overflow-y:auto;padding-right:4px;scrollbar-width:thin}
.${P}-dl2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.${P}-dl3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.${P}-corrgrid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}
.${P}-corrside{position:sticky;top:90px}
.${P}-corractions{display:flex;gap:8px;padding-top:16px;margin-top:16px;border-top:1px solid var(--line)}
.${P}-corrnavscroll{max-height:440px;overflow-y:auto;padding:4px;scrollbar-width:thin}
.${P}-corrnav{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
@media (max-width:980px){
  .${P}-cols{grid-template-columns:1fr}
  .${P}-matwrap{min-height:0}
  .${P}-matscroll{position:relative;inset:auto;max-height:420px}
  .${P}-corrgrid{grid-template-columns:1fr}
  .${P}-corrside{position:static;order:-1}
  .${P}-corrnav{grid-template-columns:repeat(8,1fr)}
  .${P}-corrnavscroll{max-height:300px}
}
@media (max-width:640px){
  .${P}-header{padding:0 14px}
  .${P}-wrap{padding:14px;gap:14px}
  .${P}-hero{margin:0 -14px;border-radius:0;padding:28px 18px}
  .${P}-heroh1{font-size:26px}
  .${P}-medal{width:120px;height:120px}
  .${P}-tiles{grid-template-columns:repeat(2,1fr)}
  .${P}-dl2,.${P}-dl3{grid-template-columns:1fr}
  .${P}-hlbl{display:none}
  .${P}-corractions{flex-wrap:wrap}
}
`

export { ResultadoVND as default }
