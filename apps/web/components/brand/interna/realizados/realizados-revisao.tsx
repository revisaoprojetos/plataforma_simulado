'use client'

// Simulados realizados — REVISÃO (spec 03 §4). 4 stat cards + abas + filtros + Em andamento (grid 3,
// capa 108 + selo "● EM ANDAMENTO" + Continuar) + Concluídos (grid 3, capa 124 + "✓ Concluído · data" +
// pílula de nota §1.4 + Ver correção/Refazer/Baixar) + Personalizados (cartão tracejado "Criar simulado
// personalizado" + grid 3). DATA-DRIVEN: tudo vem de `data`; toda ação é <a>/<Link>. Prefixo CSS `rlzrv-`.

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { useIsMobile } from '../perfil/use-is-mobile'
import { Ic, PaneTabs, Filtros, SecaoHead, NotaPill, CoverRev, BarRev, fnum, type Pane, type Filtro } from './shared'
import type { RealizadosData, RlzEmAndamento, RlzConcluido, RlzPersonalizado, RlzCapa } from './data'

const FALLBACK_GRAD = 'linear-gradient(135deg,#2A1E4A,#4A31B8)'
const gradOf = (c?: RlzCapa) => c?.cor || FALLBACK_GRAD

// Tokens spec-03 §1.1 que o mockup define no wrapper (claro/escuro).
function rvVars(dark: boolean): CSSProperties {
  return {
    ['--tBg' as string]: dark ? '#2C2C34' : '#ECE8F6',
    ['--tOn' as string]: dark ? '#3A3A44' : '#FFFFFF',
    ['--tOnInk' as string]: dark ? '#FFFFFF' : '#2E1F7A',
    ['--cnt' as string]: dark ? 'rgba(143,117,255,.22)' : '#EFEBFD',
    ['--cntInk' as string]: dark ? '#D2C6FF' : '#5B3FD0',
    ['--fOn' as string]: dark ? '#F1C232' : '#2E1F7A',
    ['--fOnInk' as string]: dark ? '#2A1A55' : '#FFFFFF',
    ['--hoverLine' as string]: dark ? 'rgba(179,161,255,.45)' : 'rgba(91,63,208,.35)',
  } as CSSProperties
}

function Stat({ icon, v, l }: { icon: string; v: string; l: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <span style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic n={icon} s={17} /></span>
      <div style={{ lineHeight: 1.2 }}>
        <b style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{v}</b>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l}</span>
      </div>
    </div>
  )
}

// TICKET (igual ao Concluído): capa à ESQUERDA (altura cheia) + corpo com tag EM ANDAMENTO,
// título, barra de % e botão Continuar. O card inteiro leva ao runner (continuarHref).
function CardAndamento({ it }: { it: RlzEmAndamento }) {
  return (
    <Link href={it.continuarHref} className="rlzrv-card" style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden', minHeight: 168, color: 'inherit', textDecoration: 'none' }}>
      <div style={{ position: 'relative', width: 210, flexShrink: 0, overflow: 'hidden' }}>
        <CoverRev titulo={it.capa.rotulo} sub={it.capa.sub} grad={gradOf(it.capa)} img={it.capa.capa} big={13} />
        <span style={{ position: 'absolute', right: 10, top: 10, height: 24, padding: '0 10px', borderRadius: 99, background: 'rgba(241,194,50,.95)', color: '#2A1A55', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span className="rlzrv-live" style={{ width: 6, height: 6, borderRadius: '50%', background: '#2A1A55' }} />EM ANDAMENTO
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <b style={{ fontSize: 14.5, lineHeight: 1.3, color: 'var(--ink)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.titulo}</b>
          {it.banca ? <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--muted)' }}>{it.banca}</span> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
            <span>Questão {it.questaoAtual} de {it.total}</span>
            <b style={{ color: 'var(--ink)' }}>{it.pct}%</b>
          </div>
          <BarRev pct={it.pct} />
        </div>
        <span className="rlzrv-cta" style={{ marginTop: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, borderRadius: 12, color: '#FFF', fontSize: 13.5, fontWeight: 800, background: 'linear-gradient(180deg,#6449E0,#4B30BE)', boxShadow: '0 10px 20px -12px rgba(75,48,190,.8), inset 0 1px 0 rgba(255,255,255,.2)' }}><Ic n="play" s={13} />Continuar</span>
      </div>
    </Link>
  )
}

function CardConcluido({ it }: { it: RlzConcluido }) {
  return (
    <Link href={it.href} className="rlzrv-card" style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden', minHeight: 168, color: 'inherit', textDecoration: 'none' }}>
      <div style={{ width: 210, flexShrink: 0, overflow: 'hidden' }}><CoverRev titulo={it.capa.rotulo} sub={it.capa.sub} grad={gradOf(it.capa)} img={it.capa.capa} big={13} /></div>
      <div style={{ flex: 1, minWidth: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#1FA868' }}><Ic n="check" s={13} />Concluído</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{it.data}</span>
        </div>
        <span style={{ fontSize: 14.5, lineHeight: 1.3, color: 'var(--ink)', fontWeight: 700, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.titulo}</span>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {it.notaLiberada && it.nota != null
            ? <NotaPill v={it.nota} />
            : <span style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 10px', borderRadius: 9, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 11.5, fontWeight: 700 }}>Nota em breve</span>}
        </div>
      </div>
    </Link>
  )
}

function CardPersonalizado({ it }: { it: RlzPersonalizado }) {
  const rascunho = it.status === 'rascunho'
  return (
    <Link href={it.href} className="rlzrv-card" style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden', minHeight: 124, color: 'inherit', textDecoration: 'none' }}>
      <div style={{ position: 'relative', width: 116, flexShrink: 0, background: 'linear-gradient(140deg,#3C4458,#5B6478)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.9)', overflow: 'hidden' }}>
        <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px)', backgroundSize: '16px 16px' }} />
        <span style={{ position: 'relative', width: 48, height: 48, borderRadius: 15, background: 'rgba(255,255,255,.16)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic n={rascunho ? 'edit' : 'star'} s={22} /></span>
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {rascunho
            ? <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>Rascunho</span>
            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#1FA868' }}><Ic n="check" s={13} />Concluído</span>}
          {it.nQuestoes != null ? <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{it.nQuestoes} questões</span> : null}
        </div>
        <b style={{ fontSize: 14.5, lineHeight: 1.3, color: 'var(--ink)' }}>{it.nome}</b>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {rascunho
            ? <span className="rlzrv-ibtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700 }}><Ic n="edit" s={13} />Continuar editando</span>
            : <>{it.nota != null ? <NotaPill v={it.nota} /> : <span />}<span className="rlzrv-ibtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700 }}><Ic n="play" s={13} />Refazer</span></>}
        </div>
      </div>
    </Link>
  )
}

const CSS = `
.rlzrv-pv{animation:rlzrvpv .45s cubic-bezier(.22,1,.36,1) both}
@keyframes rlzrvpv{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.rlzrv-tab{transition:background .25s,color .25s,box-shadow .25s}
.rlzrv-fbtn{transition:background .2s,color .2s,border-color .2s}
.rlzrv-card{transition:transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s cubic-bezier(.22,1,.36,1),border-color .3s}
.rlzrv-card:hover{transform:translateY(-4px);border-color:var(--hoverLine);box-shadow:0 22px 40px -28px rgba(0,0,0,.45)}
.rlzrv-card .rlz-cov{transition:transform .7s cubic-bezier(.22,1,.36,1)}.rlzrv-card:hover .rlz-cov{transform:scale(1.06)}
.rlzrv-ibtn{transition:background .15s,color .15s,border-color .15s}.rlz-ibtn:hover,.rlzrv-ibtn:hover{background:var(--chip);color:var(--brand);border-color:var(--brandLine)}
.rlzrv-newc{transition:transform .4s cubic-bezier(.22,1,.36,1),border-color .25s,background .25s}.rlzrv-newc:hover{transform:translateY(-3px);border-color:var(--brand)}
.rlzrv-cta{transition:filter .3s,transform .3s}.rlzrv-cta:hover{filter:brightness(1.1);transform:translateY(-1px)}
.rlzrv-live{animation:rlzrvblink 1.6s ease-in-out infinite}@keyframes rlzrvblink{50%{opacity:.3}}
@media (prefers-reduced-motion:reduce){.rlzrv-pv,.rlzrv-live{animation:none!important}}
`

export function RealizadosRevisao({ theme: themeProp, data }: { theme: InternaTheme; data: RealizadosData }) {
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
  const gridCols = mobile ? '1fr' : 'repeat(3,1fr)'
  const doneList = mobile ? data.concluidos.slice(0, 6) : data.concluidos

  return (
    <div className="min-h-full" style={{ ...internaTokensStyle('revisao', theme), ...rvVars(dark), minHeight: '100%' }}>
      <style>{CSS}</style>
      <div style={{ padding: mobile ? '14px' : '24px', display: 'flex', flexDirection: 'column', gap: 24, background: 'var(--bg)', minHeight: '100%' }}>
        {/* cabeçalho */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: mobile ? 24 : 32, fontWeight: 800, letterSpacing: '-0.045em', color: 'var(--ink)' }}>Simulados realizados</h1>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--muted)' }}>Revise suas notas, refaça simulados e acompanhe o que ainda está em andamento.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10 }}>
            <Stat icon="clip" v={String(S.feitos)} l="simulados feitos" />
            <Stat icon="check" v={String(S.concluidos)} l="concluídos" />
            <Stat icon="chart" v={S.mediaGeral != null ? `${S.mediaGeral}%` : '—'} l="média de acertos" />
            <Stat icon="star" v={S.melhorNota != null ? fnum(S.melhorNota) : '—'} l="melhor nota" />
          </div>
        </div>
        {/* abas + filtros */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <PaneTabs marca="Revisão" pt={pt} onPane={setPt} nMain={S.feitos} nPers={pers.itens.length} />
          {pt === 'main' ? <Filtros f={f} onFilter={setF} nAll={nAnd + nDone} nAnd={nAnd} nDone={nDone} /> : null}
        </div>

        {pt === 'main' ? (
          <div className="rlzrv-pv" key={`main-${f}`} style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            {showAnd && nAnd > 0 ? (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SecaoHead icon="clock" title="Em andamento" count={nAnd} color="#D99A1E" bg="#D99A1E22" />
                <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
                  {data.emAndamento.map((it) => <CardAndamento key={it.id} it={it} />)}
                </div>
              </section>
            ) : null}
            {showDone && nDone > 0 ? (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SecaoHead icon="check" title="Concluídos" count={nDone} color="#1FA868" bg="#1FA86822" />
                <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
                  {doneList.map((it) => <CardConcluido key={it.id} it={it} />)}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="rlzrv-pv" key="pers" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* cartão tracejado criar */}
            <Link href={pers.criarHref} className="rlzrv-newc" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 22px', borderRadius: 20, border: '1.5px dashed var(--line2)', background: 'linear-gradient(120deg,var(--chip),transparent 70%)', color: 'var(--ink)', textDecoration: 'none', flexWrap: mobile ? 'wrap' : undefined }}>
              <span style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(160deg,#6449E0,#4B30BE)', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 12px 24px -12px rgba(75,48,190,.8)' }}><Ic n="plus" s={24} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 18, letterSpacing: '-0.02em' }}>Criar simulado personalizado</b>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Escolha matérias, bancas e quantidade de questões.</span>
              </div>
              {!mobile ? <span style={{ display: 'flex', gap: 6 }}>{M_CRIAR_CHIPS.map((c) => <span key={c} style={{ height: 30, padding: '0 12px', borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center' }}>{c}</span>)}</span> : null}
              <span style={{ width: 40, height: 40, borderRadius: 12, background: '#F1C232', color: '#2A1A55', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="arrow" s={18} /></span>
            </Link>
            <SecaoHead icon="clip" title="Seus simulados" count={pers.itens.length} color="var(--brand)" bg="var(--chip)" />
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
              {pers.itens.map((it) => <CardPersonalizado key={it.id} it={it} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// chips estáticos do criador (rótulos de passo — decorativos)
const M_CRIAR_CHIPS = ['Matérias', 'Banca', 'Nº de questões']
