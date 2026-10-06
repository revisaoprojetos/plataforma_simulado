'use client'

// Simulados realizados — VND (spec 03 §4). FAIXA HERO verde full-bleed (kicker "SEU HISTÓRICO" + H1 40 +
// 4 tiles de vidro + chevrons) + abas + filtros + Em andamento (grid 3, card horizontal capa 96, Continuar
// dourado) + Concluídos (grid 4 com ANEL de nota + Ver correção/Refazer/Baixar) + Personalizados (banner
// verde "MONTE O SEU" + 3 passos + cards). DATA-DRIVEN: tudo de `data`; toda ação é <a>/<Link>. CSS `rlzvn-`.

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { useIsMobile } from '../perfil/use-is-mobile'
import { Ic, PaneTabs, Filtros, SecaoHead, NotaRing, CoverVnd, Segs, type Pane, type Filtro } from './shared'
import type { RealizadosData, RlzEmAndamento, RlzConcluido, RlzPersonalizado, RlzCapa } from './data'

const HERO = 'linear-gradient(120deg,#041A10 0%,#0B4A2E 55%,#12643D 100%)'
const FALLBACK_GRAD = 'linear-gradient(140deg,#062A1B,#16804F)'
const gradOf = (c?: RlzCapa) => c?.cor || FALLBACK_GRAD

const VND_PASSOS: [string, string][] = [
  ['Matérias', 'Escolha as disciplinas'],
  ['Banca', 'Filtre pelo estilo da prova'],
  ['Questões', 'Defina a quantidade'],
]

function vnVars(dark: boolean): CSSProperties {
  return {
    ['--tBg' as string]: dark ? '#1E2A23' : '#E4EDE7',
    ['--tOn' as string]: dark ? '#2A3A31' : '#FFFFFF',
    ['--tOnInk' as string]: dark ? '#FFFFFF' : '#0B1F15',
    ['--cnt' as string]: dark ? 'rgba(79,224,152,.15)' : '#E4F3EA',
    ['--cntInk' as string]: dark ? '#4FE098' : '#0F7A44',
    ['--fOn' as string]: dark ? '#E8C877' : '#0F7A44',
    ['--fOnInk' as string]: dark ? '#2A1F02' : '#FFFFFF',
    ['--hoverLine' as string]: 'rgba(232,200,119,.7)',
    ['--gold' as string]: dark ? '#E8C877' : '#D8B45A',
    ['--goldInk' as string]: dark ? '#F1D48A' : '#9A7414',
    ['--goldBg' as string]: dark ? 'rgba(232,200,119,.14)' : '#FBF4E2',
  } as CSSProperties
}

// botão dourado como LINK
const GoldLink = ({ href, children, h = 32 }: { href: string; children: React.ReactNode; h?: number }) => (
  <Link href={href} className="rlzvn-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: h, padding: '0 14px', borderRadius: 11, color: '#2A1F02', fontSize: 12.5, fontWeight: 800, background: 'linear-gradient(180deg,#F1D48A,#D8B45A)', textDecoration: 'none' }}>{children}</Link>
)

function Hero({ mobile, S }: { mobile: boolean; S: RealizadosData['stats'] }) {
  const tiles: [string, string][] = [[String(S.feitos), 'realizados'], [String(S.concluidos), 'concluídos'], [S.mediaGeral != null ? `${S.mediaGeral}%` : '—', 'média geral'], [S.melhorNota != null ? String(S.melhorNota) : '—', 'melhor nota']]
  return (
    <section style={{ position: 'relative', overflow: 'hidden', background: HERO, color: '#FFF', padding: mobile ? '22px 16px 20px' : '34px 24px 30px', margin: mobile ? '-14px -14px 0' : '-24px -24px 0' }}>
      <span aria-hidden className="rlzvn-dots" style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(185,245,212,.18) 1.2px,transparent 1.8px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
      {[['-90px', 'rgba(232,200,119,.55)', 2], ['-50px', 'rgba(185,245,212,.14)', 1.2], ['-10px', 'rgba(185,245,212,.1)', 1.2]].map(([bottom, stroke, sw], i) => (
        <svg key={i} className={`rlzvn-chev rlzvn-c${i + 1}`} viewBox="0 0 200 120" aria-hidden preserveAspectRatio="none" style={{ position: 'absolute', right: '-4%', width: '62%', height: 220, bottom: bottom as string, pointerEvents: 'none' }}><path d="M0 0 L100 112 L200 0" fill="none" stroke={stroke as string} strokeWidth={sw as number} vectorEffect="non-scaling-stroke" /></svg>
      ))}
      <div style={{ position: 'relative', display: 'flex', alignItems: mobile ? 'flex-start' : 'flex-end', justifyContent: 'space-between', gap: 30, flexDirection: mobile ? 'column' : 'row' }}>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: '#86CFA6' }}><Ic n="clip" s={14} c="#D8B45A" />SEU HISTÓRICO</span>
          <h1 style={{ margin: '8px 0 4px', fontSize: mobile ? 28 : 40, fontWeight: 800, letterSpacing: '-0.045em' }}>Simulados realizados</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#CFE3D7' }}>Notas, correções e o que ainda falta terminar.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(4,auto)', gap: 10, width: mobile ? '100%' : undefined }}>
          {tiles.map(([v, l]) => (
            <div key={l} style={{ padding: '10px 16px', borderRadius: 16, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(185,245,212,.16)', minWidth: mobile ? 0 : 110 }}>
              <b style={{ display: 'block', fontSize: 20, fontWeight: 800 }}>{v}</b>
              <span style={{ fontSize: 11.5, color: '#B7D3C3' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CardAndamento({ it }: { it: RlzEmAndamento }) {
  return (
    <Link href={it.continuarHref} className="rlzvn-card" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 22, color: 'inherit', textDecoration: 'none' }}>
      <div style={{ width: 96, height: 96, borderRadius: 16, overflow: 'hidden', flexShrink: 0 }}><CoverVnd titulo={it.capa.rotulo} sub={it.capa.sub} grad={gradOf(it.capa)} img={it.capa.capa} big={18} /></div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 14.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.titulo}</b>
          {it.banca ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{it.banca}</span> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
            <span>Questão {it.questaoAtual} de {it.total}</span>
            <b style={{ color: 'var(--ink)' }}>{it.pct}%</b>
          </div>
          <Segs n={10} lit={Math.round(it.pct / 10)} h={6} on="var(--gold)" gap={2} rad={3} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <span className="rlzvn-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 11, color: '#2A1F02', fontSize: 12.5, fontWeight: 800, background: 'linear-gradient(180deg,#F1D48A,#D8B45A)' }}><Ic n="play" s={12} />Continuar</span>
        </div>
      </div>
    </Link>
  )
}

function CardConcluido({ it }: { it: RlzConcluido }) {
  const nota = it.notaLiberada && it.nota != null ? it.nota : null
  return (
    <Link href={it.href} className="rlzvn-card" style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 22, overflow: 'hidden', color: 'inherit', textDecoration: 'none' }}>
      <div style={{ position: 'relative', height: 168, overflow: 'hidden' }}>
        <CoverVnd titulo={it.capa.rotulo} sub={it.capa.sub} grad={gradOf(it.capa)} img={it.capa.capa} big={26} showKicker />
        {nota != null ? <span style={{ position: 'absolute', right: 10, bottom: 10 }}><NotaRing v={nota} /></span> : null}
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#1FA868' }}><Ic n="check" s={13} />Concluído</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{it.data}</span>
        </div>
        <span style={{ fontSize: 14, lineHeight: 1.3, color: 'var(--ink)', fontWeight: 700 }}>{it.titulo}</span>
        {nota == null ? <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>Nota em breve</span> : null}
      </div>
    </Link>
  )
}

function CardPersonalizado({ it }: { it: RlzPersonalizado }) {
  const rascunho = it.status === 'rascunho'
  return (
    <div className="rlzvn-card" style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 22, overflow: 'hidden' }}>
      <Link href={it.href} style={{ position: 'relative', height: 108, background: 'linear-gradient(140deg,#0B3A24,#16804F)', color: '#FFF', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '12px 14px', textDecoration: 'none' }}>
        <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(185,245,212,.22) 1px,transparent 1.6px)', backgroundSize: '14px 14px' }} />
        <span style={{ position: 'relative', fontSize: 8.5, fontWeight: 800, letterSpacing: '.2em', color: '#F1D48A' }}>PERSONALIZADO</span>
        <b style={{ position: 'relative', fontSize: 16, letterSpacing: '-0.03em' }}>{it.nome}</b>
        {rascunho
          ? <span style={{ position: 'absolute', right: 10, top: 10, height: 22, padding: '0 9px', borderRadius: 99, background: 'rgba(0,0,0,.35)', color: '#F1D48A', fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>Rascunho</span>
          : (it.nota != null ? <span style={{ position: 'absolute', right: 10, top: 10 }}><NotaRing v={it.nota} size={44} /></span> : null)}
      </Link>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {it.nQuestoes != null ? <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.nQuestoes} questões</span> : null}
        {rascunho
          ? <GoldLink href={it.href} h={34}><Ic n="edit" s={13} />Continuar editando</GoldLink>
          : <Link href={it.href} className="rlzvn-ibtn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, borderRadius: 11, border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}><Ic n="play" s={13} />Refazer</Link>}
      </div>
    </div>
  )
}

const CSS = `
.rlzvn-pv{animation:rlzvnpv .45s cubic-bezier(.22,1,.36,1) both}
@keyframes rlzvnpv{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.rlzvn-tab{transition:background .25s,color .25s}.rlzvn-fbtn{transition:background .2s,color .2s,border-color .2s}
.rlzvn-card{transition:transform .55s cubic-bezier(.22,1,.36,1),box-shadow .55s cubic-bezier(.22,1,.36,1),border-color .3s}
.rlzvn-card:hover{transform:translateY(-8px) scale(1.012);border-color:var(--hoverLine);box-shadow:0 26px 44px -28px rgba(10,40,25,.6)}
.rlzvn-card .rlz-cov{transition:transform .7s cubic-bezier(.22,1,.36,1)}.rlzvn-card:hover .rlz-cov{transform:scale(1.06)}
.rlzvn-ibtn{transition:background .15s,color .15s,border-color .15s}.rlz-ibtn:hover,.rlzvn-ibtn:hover{background:var(--chip);color:var(--brand);border-color:var(--brand)}
.rlzvn-gold{transition:filter .2s,transform .2s}.rlzvn-gold:hover{filter:brightness(1.06);transform:translateY(-1px)}
.rlzvn-newc{transition:transform .4s cubic-bezier(.22,1,.36,1),border-color .25s}.rlzvn-newc:hover{transform:translateY(-3px)}
.rlzvn-ring{animation:rlzvnring 1.4s cubic-bezier(.2,.8,.2,1) .4s both}@keyframes rlzvnring{from{stroke-dashoffset:var(--c)}}
.rlzvn-dots{animation:rlzvndrift 30s linear infinite}@keyframes rlzvndrift{to{background-position:220px 220px}}
.rlzvn-chev{animation:rlzvnfloat 7s ease-in-out infinite}.rlzvn-c2{animation-delay:.6s}.rlzvn-c3{animation-delay:1.2s}
@keyframes rlzvnfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@media (prefers-reduced-motion:reduce){.rlzvn-pv,.rlzvn-ring,.rlzvn-dots,.rlzvn-chev{animation:none!important}}
`

export function RealizadosVnd({ theme: themeProp, data }: { theme: InternaTheme; data: RealizadosData }) {
  const theme = useTemaInterno(themeProp)
  const dark = theme === 'escuro'
  const mobile = useIsMobile()
  const [pt, setPt] = useState<Pane>('main')
  const [f, setF] = useState<Filtro>('all')
  const showAnd = f !== 'done'
  const showDone = f !== 'and'
  const S = data.stats
  const nAnd = data.emAndamento.length
  const nDone = data.concluidos.length
  const pers = data.personalizados
  const doneCols = mobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)'
  const andCols = mobile ? '1fr' : 'repeat(3,1fr)'
  const doneList = mobile ? data.concluidos.slice(0, 6) : data.concluidos

  return (
    <div className="min-h-full" style={{ ...internaTokensStyle('vnd', theme), ...vnVars(dark), minHeight: '100%' }}>
      <style>{CSS}</style>
      <div style={{ padding: mobile ? '14px' : '24px', display: 'flex', flexDirection: 'column', gap: 24, background: 'var(--bg)', minHeight: '100%' }}>
        <Hero mobile={mobile} S={S} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <PaneTabs marca="VND" pt={pt} onPane={setPt} nMain={S.feitos} nPers={pers.itens.length} />
          {pt === 'main' ? <Filtros f={f} onFilter={setF} nAll={nAnd + nDone} nAnd={nAnd} nDone={nDone} /> : null}
        </div>

        {pt === 'main' ? (
          <div className="rlzvn-pv" key={`main-${f}`} style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            {showAnd && nAnd > 0 ? (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SecaoHead icon="clock" title="Em andamento" count={nAnd} color="#D8B45A" bg="#D8B45A22" />
                <div style={{ display: 'grid', gridTemplateColumns: andCols, gap: 14 }}>{data.emAndamento.map((it) => <CardAndamento key={it.id} it={it} />)}</div>
              </section>
            ) : null}
            {showDone && nDone > 0 ? (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SecaoHead icon="check" title="Concluídos" count={nDone} color="#1FA868" bg="#1FA86822" />
                <div style={{ display: 'grid', gridTemplateColumns: doneCols, gap: 16 }}>{doneList.map((it) => <CardConcluido key={it.id} it={it} />)}</div>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="rlzvn-pv" key="pers" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* banner verde MONTE O SEU + 3 passos */}
            <Link href={pers.criarHref} className="rlzvn-newc" style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, background: HERO, color: '#FFF', padding: mobile ? '20px 18px' : '24px 26px', display: 'flex', alignItems: mobile ? 'flex-start' : 'center', gap: 20, flexDirection: mobile ? 'column' : 'row', textDecoration: 'none' }}>
              <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(185,245,212,.14) 1.2px,transparent 1.8px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', width: mobile ? '100%' : 280, flexShrink: 0 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.2em', color: '#F1D48A' }}>MONTE O SEU</span>
                <b style={{ display: 'block', fontSize: 24, letterSpacing: '-0.03em', marginTop: 4 }}>Novo simulado personalizado</b>
              </div>
              <div style={{ position: 'relative', flex: 1, display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,1fr)', gap: 10, width: mobile ? '100%' : undefined }}>
                {VND_PASSOS.map(([t, d], i) => (
                  <div key={t} style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(185,245,212,.16)' }}>
                    <span style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: 7, background: 'rgba(241,212,138,.2)', color: '#F1D48A', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{i + 1}</span>
                    <b style={{ display: 'block', marginTop: 6, fontSize: 14 }}>{t}</b>
                    <span style={{ fontSize: 11.5, color: '#CFE3D7' }}>{d}</span>
                  </div>
                ))}
              </div>
              <div style={{ position: 'relative', flexShrink: 0 }}><span className="rlzvn-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 14px', borderRadius: 11, color: '#2A1F02', fontSize: 12.5, fontWeight: 800, background: 'linear-gradient(180deg,#F1D48A,#D8B45A)' }}><Ic n="plus" s={15} />Criar simulado</span></div>
            </Link>
            <SecaoHead icon="clip" title="Seus simulados" count={pers.itens.length} color="var(--brand)" bg="var(--chip)" />
            <div style={{ display: 'grid', gridTemplateColumns: doneCols, gap: 16 }}>{pers.itens.map((it) => <CardPersonalizado key={it.id} it={it} />)}</div>
          </div>
        )}
      </div>
    </div>
  )
}
