'use client'

/**
 * HOME do aluno — marca MEQ (spec 03 §3.3). Porte FIEL dos mockups
 * design/HomeMEQ{Claro,Azul,Escuro}[Mobile].dc.html.
 *
 * UMA composição responsiva, TRÊS temas (claro | azul | escuro). Azul = cards brancos
 * sobre fundo gradiente azul, títulos de seção em --head BRANCO. Fonte Sora injetada
 * localmente (como loading-meq-circuito). Prefixo CSS único `hmq-` em <style> local.
 *
 * Só consome `data` (sem fetch/nav). Carrossel/check-in/abas de pasta são estado local.
 * prefers-reduced-motion desliga loops (regra global no <style>).
 */

import { useEffect, useMemo, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Clock, Download, Gift, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { internaTokensStyle } from '../../interna-tokens'
import { useTemaInterno } from '../../use-tema-interno'
import type { HomeData, HomeSimuladoCard, InternaTheme } from '../types'
import { Capa, CircuitHero, Fogo, Gota, MarcaBarras, Segs } from './circuit'

// ── Overrides de tokens por tema (spec §1.3). interna-tokens não expõe --head/--sub/
// --muted2/--okBg/--okInk/--shadow e, no azul, dá --bg sólido — então fixamos aqui os
// valores exatos dos mockups (class="app" style="…"). --cyan fixo #5ECEF0 em todos.
const ROOT_VARS: Record<InternaTheme, Record<string, string>> = {
  claro: {
    '--bg': '#F2F5FA',
    '--surface': '#FFFFFF',
    '--surface2': '#F6F8FC',
    '--ink': '#171E3B',
    '--head': '#171E3B',
    '--sub': '#66729A',
    '--muted': '#66729A',
    '--muted2': '#B7C0D8',
    '--line': '#E3E8F2',
    '--line2': '#CDD6E8',
    '--track': '#E4EAF5',
    '--brand': '#306AB5',
    '--brand2': '#3E7FE0',
    '--cyan': '#5ECEF0',
    '--chip': '#EAF1FB',
    '--shadow': '0 1px 2px rgba(16,30,70,.04)',
    '--okBg': 'rgba(46,199,122,.14)',
    '--okInk': '#1FA868',
  },
  azul: {
    '--bg': 'linear-gradient(170deg,#2B5FA8 0%,#306AB5 30%,#3B82CC 70%,#4497DB 100%)',
    '--surface': '#FFFFFF',
    '--surface2': '#F5F8FD',
    '--ink': '#171E3B',
    '--head': '#FFFFFF',
    '--sub': '#DCEBFF',
    '--muted': '#66729A',
    '--muted2': '#B7C0D8',
    '--line': '#E3E8F2',
    '--line2': '#CDD6E8',
    '--track': '#E4EAF5',
    '--brand': '#306AB5',
    '--brand2': '#3E7FE0',
    '--cyan': '#5ECEF0',
    '--chip': '#EAF1FB',
    '--shadow': '0 20px 40px -30px rgba(10,30,80,.6)',
    '--okBg': 'rgba(255,255,255,.2)',
    '--okInk': '#FFFFFF',
  },
  escuro: {
    '--bg': '#0B1124',
    '--surface': '#121A3A',
    '--surface2': '#172146',
    '--ink': '#FFFFFF',
    '--head': '#FFFFFF',
    '--sub': '#8E9BC4',
    '--muted': '#8E9BC4',
    '--muted2': '#3E4A78',
    '--line': 'rgba(140,170,255,.13)',
    '--line2': 'rgba(140,170,255,.24)',
    '--track': 'rgba(140,170,255,.13)',
    '--brand': '#7FB2FF',
    '--brand2': '#5E9BFF',
    '--cyan': '#5ECEF0',
    '--chip': 'rgba(94,155,255,.14)',
    '--shadow': 'none',
    '--okBg': 'rgba(46,199,122,.16)',
    '--okInk': '#4FDB98',
  },
}

const LARANJA = '#F2A93B' // acento fixo p/ desempenho < 60%
const LARANJA_INK = '#D9871A'

// Gradientes das capas por índice (variações do mockup) — cores fixas.
const CAPA_GRADS = [
  'linear-gradient(150deg,#1F2A55,#306AB5)',
  'linear-gradient(150deg,#121A3A,#2B4A8F)',
  'linear-gradient(150deg,#0F3A5A,#2B86B8)',
  'linear-gradient(150deg,#14304F,#3E7FE0)',
]
// Gradientes dos slides do carrossel.
const SLIDE_GRADS = [
  'linear-gradient(120deg,#171E3B 0%,#1F3A78 50%,#306AB5 100%)',
  'linear-gradient(120deg,#14204A 0%,#1F4C8F 50%,#3E7FE0 100%)',
  'linear-gradient(120deg,#0F2A3F 0%,#1A5A86 50%,#2B86B8 100%)',
  'linear-gradient(120deg,#1B2F6B 0%,#2B4FA8 50%,#4A7BE0 100%)',
]

const SEMANA_LABELS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

const svg = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function primeiroNome(nome: string) {
  return (nome || '').trim().split(/\s+/)[0] || nome
}

function statusCor(status: string) {
  if (status === 'Concluído') return '#2EC77A'
  if (status === 'Em andamento') return LARANJA
  return 'var(--muted)'
}

function acaoLabel(status: string) {
  if (status === 'Concluído') return 'Revisar'
  if (status === 'Em andamento') return 'Continuar'
  return 'Fazer agora'
}

// Conjunto padrão de palavras da saudação rotativa (MEQ = concursos / área jurídica). Editável/
// substituível por data.rotativo quando houver fonte real (foco/objetivo do aluno).
const ROTATIVO_PADRAO_MEQ = ['Concursos', 'Tribunais', 'a Magistratura', 'o Ministério Público', 'carreiras jurídicas']

export function HomeMeq({ theme, data }: { theme: InternaTheme; data: HomeData; preview?: boolean }) {
  // Tema RESOLVIDO no cliente (reage ao toggle do shell AO VIVO: .dark / .theme-azul), usando o `theme`
  // do servidor (cookie) como fallback no 1º paint. Sem isto a Início só trocava de tema ao navegar.
  const resolvido = useTemaInterno(theme)
  const tema: InternaTheme = resolvido === 'azul' || resolvido === 'escuro' ? resolvido : 'claro'
  const rootStyle = { ...internaTokensStyle('meq', tema), ...ROOT_VARS[tema] } as React.CSSProperties

  const u = data.usuario
  const nome = primeiroNome(u.nome)
  // Palavras que giram na saudação. Quando houver fonte real (foco/objetivo do aluno) vem em
  // data.rotativo; sem ela, usa um conjunto padrão do MEQ (área jurídica) para a animação girar.
  const rotativo = data.rotativo && data.rotativo.length ? data.rotativo : ROTATIVO_PADRAO_MEQ
  const obj = data.meqObjetivo
  // Gamificação desligada p/ este tenant/aluno → esconde XP, nível, sequência, missões e liga.
  const gamOn = data.gamAtivo !== false

  // ── Carrossel (estado local, auto-avanço 6s) — LOOP INFINITO SEMPRE P/ FRENTE ─────────────
  // Renderiza um CLONE do 1º slide no fim. O avanço vai 0→…→total (o clone) e, ao fim da transição no
  // clone, "snapa" instantâneo (sem animação) p/ o 1º real → o último→primeiro desliza SEMPRE para a
  // direita, como se recomeçasse (sem o "rebobinar" para trás).
  const slides = data.destaques.slice(0, 4)
  const total = slides.length || 1
  const loop = total > 1
  const seq = loop ? [...slides, slides[0]] : slides
  const nSeq = seq.length
  const [slide, setSlide] = useState(0) // 0..total (total = clone do 1º)
  const [anim, setAnim] = useState(true)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || !loop) return
    const t = setInterval(() => { setAnim(true); setSlide((s) => s + 1) }, 6000)
    return () => clearInterval(t)
  }, [paused, loop])
  // Reabilita a animação após um reset instantâneo (2x rAF p/ o 'none' ser aplicado antes de voltar).
  useEffect(() => {
    if (anim) return
    let r2 = 0
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setAnim(true)) })
    return () => { cancelAnimationFrame(r1); if (r2) cancelAnimationFrame(r2) }
  }, [anim])
  const onTrackEnd = () => { if (loop && slide >= total) { setAnim(false); setSlide(0) } }
  const next = () => { setAnim(true); setSlide((s) => s + 1) }
  const prev = () => { setAnim(true); setSlide((s) => ((s - 1) % total + total) % total) }
  const irPara = (i: number) => { setAnim(true); setSlide(((i % total) + total) % total) }

  // ── Check-in local ────────────────────────────────────────────────────────
  const [checked, setChecked] = useState(data.sequenciaMeta.checkinHoje)
  const streakTxt = checked ? (data.sequenciaMeta.diasSeguidos <= 1 ? '1 dia' : `${data.sequenciaMeta.diasSeguidos} dias`) : '0 dias'

  // ── Abas das pastas (filtro local por categoria) ─────────────────────────
  const categorias = useMemo(() => {
    const set: string[] = []
    for (const p of data.pastas) if (p.categoria && !set.includes(p.categoria)) set.push(p.categoria)
    return set
  }, [data.pastas])
  const [aba, setAba] = useState<string>('Todas')
  const pastasFiltradas = aba === 'Todas' ? data.pastas : data.pastas.filter((p) => p.categoria === aba)

  // Meta diária
  const meta = data.sequenciaMeta
  const metaSegsTotal = 10
  const metaPreench = meta.metaDiariaXp > 0 ? Math.round((meta.xpHoje / meta.metaDiariaXp) * metaSegsTotal) : 0

  return (
    <div className="hmq-root" style={rootStyle}>
      {/* Sora: fonte da marca MEQ, não carregada globalmente */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap" />
      <style>{CSS}</style>

      <main className="hmq-main">
        {/* ══ 1. Saudação/Nível + SEU OBJETIVO ══ */}
        {/* Sem objetivo real (backend ainda não tem cargo-alvo/data-prova por aluno): a Saudação
            ocupa a largura toda em vez de deixar um buraco na coluna direita. */}
        <div className={cn('hmq-grid-top up', !obj && 'hmq-grid-top-solo')}>
          {/* Saudação / Nível */}
          <section className="hmq-card" style={card()}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <h1 className="hmq-h1">
                    Olá, {nome}. Treino de verdade para{' '}
                    <span style={{ display: 'inline-block', height: '1.15em', overflow: 'hidden', verticalAlign: 'bottom' }}>
                      <Rotativo itens={rotativo} />
                    </span>
                  </h1>
                  {gamOn ? (
                    <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                      Faltam <b style={{ color: 'var(--ink)' }}>{Math.max(0, u.xpNivelMax - u.xpNivelAtual)} XP</b> para o nível {u.nivel + 1}.
                    </span>
                  ) : (
                    <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>Bons estudos! Explore os simulados e questões abaixo.</span>
                  )}
                </div>
              </div>
              {gamOn && (
                <>
                  {/* barra 16 segmentos */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                      <span>
                        <b style={{ color: 'var(--ink)' }}>Nível {u.nivel}</b> · {u.tituloNivel}
                      </span>
                      <span>
                        {u.xpNivelAtual} / {u.xpNivelMax} XP
                      </span>
                    </div>
                    <Segs total={16} preenchidos={segmentos(u.xpNivelAtual, u.xpNivelMax, 16)} altura={10} />
                  </div>
                  {/* 4 KPIs */}
                  <div className="hmq-kpis">
                    <Kpi rotulo="Nível" valor={`${u.nivel}`} sub={u.tituloNivel} />
                    <Kpi rotulo="XP total" valor={u.xpTotal.toLocaleString('pt-BR')} sub={`+${meta.xpHoje} hoje`} />
                    <Kpi rotulo="Sequência" valor={`${meta.diasSeguidos} dias`} sub={`recorde ${meta.recordeDias}`} />
                    <Kpi rotulo="Liga" valor={u.liga} sub={`${u.posicaoLiga}º lugar`} />
                  </div>
                </>
              )}
            </div>
          </section>

          {/* SEU OBJETIVO */}
          {obj ? (
            <section className="hmq-card" style={{ ...card(), display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.2em', color: 'var(--brand2)' }}>SEU OBJETIVO</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand)', cursor: 'default' }}>Alterar</span>
              </div>
              <b style={{ display: 'block', fontSize: 17, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{obj.cargoAlvo}</b>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                Prova prevista · {obj.dataProva} · {obj.banca}
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '16px 0 10px' }}>
                <b style={{ fontSize: 54, fontWeight: 800, letterSpacing: '-0.06em', lineHeight: 0.9, color: 'var(--ink)' }}>{obj.diasRestantes}</b>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>dias para a prova</span>
              </div>
              <Segs total={12} preenchidos={Math.round((obj.pctPlano / 100) * 12)} altura={6} cor="var(--cyan)" gap={3} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
                <span>Plano de estudos</span>
                <b style={{ color: 'var(--ink)' }}>{obj.pctPlano}% concluído</b>
              </div>
              <span className="hmq-cta" style={{ marginTop: 16, height: 44, borderRadius: 12, fontSize: 13.5 }}>
                <Calendar className="hmq-i" style={{ width: 16, height: 16 }} />
                Ver cronograma da semana
              </span>
            </section>
          ) : null}
        </div>

        {/* ══ 2. Carrossel — só quando há banner (admin → Banners & Pop-ups). Sem banner, nada de hero vazio. ══ */}
        {slides.length > 0 && (
        <section className="hmq-hero up u1" aria-roledescription="carrossel" aria-label="Destaques">
          <div
            className="hmq-track"
            style={{ display: 'flex', width: `${nSeq * 100}%`, height: '100%', transform: `translateX(-${slide * (100 / nSeq)}%)`, transition: anim ? 'transform .7s cubic-bezier(.6,.05,.2,1)' : 'none' }}
            onTransitionEnd={onTrackEnd}
          >
            {seq.map((d, i) => {
              // Link do banner (só vira clicável se apontar p/ algo real, não '#').
              const link = d.cta?.url && d.cta.url !== '#' ? d.cta.url : null
              // Miolo do slide: BANNER DE IMAGEM (ex.: "Outubro Rosa" vindo do admin) → imagem full-bleed
              // (cover). Sem imagem (boas-vindas / banner de simulado) → fundo gradiente + texto como antes.
              const miolo = d.imagem ? (
                // eslint-disable-next-line @next/next/no-img-element
                // object-fit:cover = preenche a faixa SEM distorcer (igual Revisão/VND); recorta o excedente.
                <img src={d.imagem} alt={d.titulo || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
              ) : (
                <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', background: SLIDE_GRADS[i % SLIDE_GRADS.length], color: '#FFFFFF' }}>
                  <div className="hmq-glow" style={{ position: 'absolute', right: '-10%', top: '-60%', width: 700, height: 600, borderRadius: '50%', background: 'radial-gradient(closest-side,rgba(94,206,240,.4),rgba(94,206,240,0))' }} aria-hidden="true" />
                  <CircuitHero />
                  <div className="hmq-hero-body">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: '.2em', color: '#8BEAEA' }}>
                      <span className="hmq-live" style={{ width: 7, height: 7, borderRadius: '50%', background: '#5ECEF0' }} aria-hidden="true" />
                      {d.eyebrow}
                    </span>
                    <h2 style={{ margin: 0, fontSize: 36, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1.08 }}>{d.titulo}</h2>
                    <p style={{ margin: 0, fontSize: 14.5, color: '#CFE6FF' }}>{d.subtitulo}</p>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                      <span className="hmq-ctaw hmq-seghov">
                        {d.cta.rotulo}
                        <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 3, height: 14 }} aria-hidden="true">
                          <span className="sgm" style={{ display: 'block', width: 4, height: 7, borderRadius: 1, background: '#306AB5', opacity: 0.45 }} />
                          <span className="sgm" style={{ display: 'block', width: 4, height: 10, borderRadius: 1, background: '#306AB5', opacity: 0.7 }} />
                          <span className="sgm" style={{ display: 'block', width: 4, height: 14, borderRadius: 1, background: '#306AB5', opacity: 1 }} />
                        </span>
                      </span>
                      {d.chips[0] ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', height: 46, padding: '0 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.25)', fontSize: 13, fontWeight: 600 }}>
                          {d.chips.join(' · ')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
              return (
                <div key={i} style={{ position: 'relative', flex: `0 0 ${100 / nSeq}%`, height: '100%', overflow: 'hidden' }}>
                  {d.imagem && link
                    ? <a href={link} aria-label={d.titulo || 'Abrir'} style={{ display: 'block', width: '100%', height: '100%' }}>{miolo}</a>
                    : miolo}
                </div>
              )
            })}
          </div>

          {/* setas quadradas */}
          <button type="button" aria-label="Anterior" onClick={prev} className="hmq-arr" style={{ left: 20 }}>
            <ChevronLeft className="hmq-i" style={{ width: 18, height: 18, strokeWidth: 2.2 }} />
          </button>
          <button type="button" aria-label="Próximo" onClick={next} className="hmq-arr" style={{ right: 20 }}>
            <ChevronRight className="hmq-i" style={{ width: 18, height: 18, strokeWidth: 2.2 }} />
          </button>

          {/* dots retangulares */}
          <div className="hmq-cctrl">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Banner ${i + 1}`}
                onClick={() => irPara(i)}
                className="hmq-cdot"
                style={{ width: i === (slide % total) ? 30 : 14, height: 5, padding: 0, border: 0, borderRadius: 1, background: i === (slide % total) ? '#5ECEF0' : 'rgba(255,255,255,.4)' }}
              />
            ))}
          </div>

          {/* pausa */}
          <div style={{ position: 'absolute', right: 20, bottom: 10, zIndex: 4 }}>
            <button
              type="button"
              className="hmq-cpause"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Retomar banner' : 'Pausar banner (fixar)'}
              title={paused ? 'Retomar banner' : 'Pausar banner (fixar)'}
            >
              {paused ? <Play style={{ width: 14, height: 14, fill: 'currentColor' }} /> : <Pause style={{ width: 14, height: 14, fill: 'currentColor' }} />}
            </button>
          </div>
        </section>
        )}

        {/* ══ 3. Esquerda (recentes + desempenho) · Direita (meta + missões) ══ */}
        <div className={cn('hmq-grid-mid', !gamOn && 'hmq-grid-mid-solo')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Simulados recentes — TABELA (desktop) / lista (mobile) */}
            <div className="up u2">
              <section className="hmq-card" style={card()}>
                <HeaderSecao titulo="Simulados recentes" acao="Ver histórico" comBarras />
                {data.recentes.length ? (
                  <>
                    {/* cabeçalho da tabela (só desktop) */}
                    <div className="hmq-trow hmq-thead">
                      <span>Simulado</span>
                      <span>Banca</span>
                      <span>Status</span>
                      <span>Progresso</span>
                      <span style={{ textAlign: 'right' }}>Ações</span>
                    </div>
                    {data.recentes.map((r, i) => (
                      <LinhaRecente key={r.id} r={r} grad={CAPA_GRADS[i % CAPA_GRADS.length]} />
                    ))}
                  </>
                ) : (
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted)' }}>Nenhum simulado por aqui ainda. Comece por uma das pastas abaixo.</p>
                )}
              </section>
            </div>

            {/* Desempenho por matéria — só quando há dados reais (senão fica um card vazio). */}
            {data.desempenho.length > 0 ? (
            <div className="up u3">
              <section className="hmq-card" style={card()}>
                <HeaderSecao titulo="Desempenho por matéria" acao="Relatório completo" comBarras />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {data.desempenho.map((m) => {
                    const baixo = m.pctAcerto < 60
                    return (
                      <div key={m.materia} className="hmq-perf">
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{m.materia}</span>
                        <Segs total={20} preenchidos={Math.round((m.pctAcerto / 100) * 20)} altura={10} cor={baixo ? LARANJA : 'var(--brand2)'} />
                        <b style={{ fontSize: 13, textAlign: 'right', color: baixo ? LARANJA_INK : 'var(--ink)' }}>{m.pctAcerto}%</b>
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>
            ) : null}
          </div>

          {/* Direita (gamificação) — só quando ligada. */}
          {gamOn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Meta diária & sequência */}
            <section className="hmq-card" style={card()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
                <h3 className="hmq-h3">
                  <MarcaBarras />
                  Meta diária &amp; sequência
                </h3>
                <span style={{ height: 24, padding: '0 9px', borderRadius: 6, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{streakTxt}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>
                <span>Meta de hoje</span>
                <span>
                  <b style={{ color: 'var(--ink)' }}>{meta.xpHoje}</b> / {meta.metaDiariaXp} XP
                </span>
              </div>
              <Segs total={metaSegsTotal} preenchidos={Math.min(metaSegsTotal, metaPreench)} altura={8} gap={3} />
              {/* 7 dias */}
              <div style={{ display: 'flex', gap: 5, marginTop: 16 }}>
                {Array.from({ length: 7 }).map((_, i) => {
                  const dia = meta.semana[i]
                  const label = dia?.dia || SEMANA_LABELS[i]
                  const estudou = !!dia?.estudou
                  const hoje = i === 6 // SÁB no mock = hoje (borda)
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <span
                        className={cn(estudou && 'hmq-fire')}
                        style={
                          estudou
                            ? { width: '100%', height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(62,127,224,.14)' }
                            : hoje
                              ? { width: '100%', height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--brand2)', color: 'var(--brand2)' }
                              : { width: '100%', height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface2)', color: 'var(--muted2)' }
                        }
                      >
                        {estudou ? <Fogo /> : <Gota ativo={hoje} />}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: hoje ? 'var(--ink)' : 'var(--muted)' }}>{label}</span>
                    </div>
                  )
                })}
              </div>
              {checked ? (
                <div style={{ marginTop: 14, height: 42, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg className="hmq-i" viewBox="0 0 24 24" style={{ width: 15, height: 15 }} {...svg} aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Check-in feito · +{meta.bauXp} XP
                </div>
              ) : (
                <button className="hmq-cta" type="button" onClick={() => setChecked(true)} style={{ marginTop: 14, width: '100%', height: 42, border: 0, borderRadius: 11, fontSize: 13.5 }}>
                  <Calendar className="hmq-i" style={{ width: 15, height: 15 }} />
                  Fazer check-in de hoje
                </button>
              )}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
                <Gift className="hmq-i" style={{ width: 16, height: 16, color: 'var(--brand2)' }} />
                Baú da sequência: <b style={{ color: 'var(--brand)' }}>+{meta.bauXp} XP</b> em {meta.bauDias} dias.
              </div>
            </section>

            {/* Missões de hoje */}
            <section className="hmq-card" style={card()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
                <h3 className="hmq-h3">
                  <MarcaBarras />
                  Missões de hoje
                </h3>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>renova 00:00</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data.missoes.map((m, i) => {
                  const done = m.progresso >= m.total
                  const segN = Math.max(1, Math.min(10, m.total))
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i === 0 ? undefined : '1px solid var(--line)' }}>
                      <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: done ? 'none' : '2px solid var(--line2)', background: done ? 'var(--brand2)' : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {done ? (
                          <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, stroke: '#fff', fill: 'none', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden="true">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        ) : null}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{m.titulo}</span>
                        <div style={{ marginTop: 6 }}>
                          <Segs total={segN} preenchidos={Math.round((m.progresso / Math.max(1, m.total)) * segN)} altura={4} />
                        </div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand2)', whiteSpace: 'nowrap' }}>+{m.xp} XP</span>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
          )}
        </div>

        {/* ══ 4. Pastas ══ */}
        <div className="up u4">
          <section>
            <div className="hmq-sec-head">
              <h3 className="hmq-sec-title">Pastas de simulados</h3>
              <div className="hmq-tabs">
                {['Todas', ...categorias].map((c) => (
                  <button key={c} type="button" onClick={() => setAba(c)} className={cn('hmq-tab', aba === c && 'hmq-tab-on')}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="hmq-pastas">
              {pastasFiltradas.map((p, i) => {
                const done = p.concluidos ?? 0
                return (
                  <a key={p.id} href="#" className="hmq-tile hmq-lift" onClick={(e) => e.preventDefault()}>
                    <div style={{ width: 70, height: 70, borderRadius: 11, overflow: 'hidden', flexShrink: 0 }}>
                      <Capa rotulo={p.rotuloCapa} grad={CAPA_GRADS[i % CAPA_GRADS.length]} radius={11} fs={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--brand2)' }}>{p.categoria}</span>
                      <b style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</b>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <div style={{ flex: 1 }}>
                          <Segs total={Math.max(1, p.qtdSimulados)} preenchidos={done} altura={5} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {done}/{p.qtdSimulados}
                        </span>
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          </section>
        </div>

        {/* ══ 4b. Outros simulados ══ */}
        {data.outros.length ? (
          <div className="up u5">
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <h3 className="hmq-sec-title">Outros simulados</h3>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 6, background: 'var(--okBg)', color: 'var(--okInk)', fontSize: 12, fontWeight: 700 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2EC77A' }} aria-hidden="true" />
                  Disponíveis · {data.outrosDisponiveis}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.outros.map((o, i) => (
                  <div key={o.id} className="hmq-outro hmq-lift">
                    <div style={{ width: 64, height: 64, borderRadius: 11, overflow: 'hidden', flexShrink: 0 }}>
                      <Capa rotulo={o.capa.rotulo} grad={CAPA_GRADS[(i + 1) % CAPA_GRADS.length]} radius={11} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--muted)' }}>
                        <Clock className="hmq-i" style={{ width: 12, height: 12 }} />
                        Sempre disponível · {o.tipo}
                      </span>
                      <b style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{o.titulo}</b>
                    </div>
                    <span className="hmq-cta" style={{ height: 38, borderRadius: 10, fontSize: 13, padding: '0 16px' }}>
                      <Play className="hmq-i" style={{ width: 12, height: 12, fill: 'currentColor', stroke: 'none' }} />
                      Fazer agora
                    </span>
                    <span className="hmq-ghost">
                      <Download className="hmq-i" style={{ width: 14, height: 14 }} />
                      Caderno
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  )
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function card(): React.CSSProperties {
  return { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow)' }
}

function segmentos(atual: number, max: number, total: number) {
  if (max <= 0) return 0
  return Math.max(0, Math.min(total, Math.round((atual / max) * total)))
}

function Rotativo({ itens }: { itens: string[] }) {
  // Rotação DISCRETA, robusta a QUALQUER quantidade (inclusive 1 item → estático). O ticker por
  // keyframe fixo (hmqTick) assumia 4 itens e rolava para linhas inexistentes quando havia menos,
  // deixando o texto "piscar vazio". Aqui o item é estado e reanimamos (rise-in) a cada troca.
  const lista = itens.length ? itens : ['Concursos']
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (lista.length <= 1) return
    const id = setInterval(() => setIdx((p) => (p + 1) % lista.length), 2400)
    return () => clearInterval(id)
  }, [lista.length])
  const atual = lista[Math.min(idx, lista.length - 1)]
  return (
    <span key={`${idx}-${atual}`} className="hmq-hl hmq-rot-in" style={{ display: 'inline-block' }}>
      {atual}.
    </span>
  )
}

function Kpi({ rotulo, valor, sub }: { rotulo: string; valor: string; sub: string }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--line)' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{rotulo}</span>
      <b style={{ display: 'block', fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '2px 0' }}>{valor}</b>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sub}</span>
    </div>
  )
}

function HeaderSecao({ titulo, acao, comBarras }: { titulo: string; acao: string; comBarras?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
      <h3 className="hmq-h3">
        {comBarras ? <MarcaBarras /> : null}
        {titulo}
      </h3>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--brand)', cursor: 'default' }}>{acao}</span>
    </div>
  )
}

function LinhaRecente({ r, grad }: { r: HomeSimuladoCard; grad: string }) {
  const cor = statusCor(r.status)
  const label = acaoLabel(r.status)
  const segsPreench = Math.round((r.progresso / 100) * 10)
  return (
    <div className="hmq-trow hmq-row">
      {/* Simulado (capa + título) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{ width: 54, height: 54, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
          <Capa rotulo={r.capa.rotulo} grad={grad} />
        </div>
        <div style={{ minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.titulo}</b>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--muted)' }}>
            <Clock className="hmq-i" style={{ width: 12, height: 12 }} />
            Sempre disponível
          </span>
        </div>
      </div>
      {/* Banca */}
      <span className="hmq-tcell-banca" style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{r.banca}</span>
      {/* Status */}
      <span className="hmq-tcell-status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: cor }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: cor }} aria-hidden="true" />
        {r.status}
      </span>
      {/* Progresso */}
      <div className="hmq-tcell-prog">
        <Segs total={10} preenchidos={segsPreench} altura={6} />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{r.progresso}%</span>
      </div>
      {/* Ações */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <span className="hmq-cta" style={{ height: 34, borderRadius: 10, fontSize: 12.5, padding: '0 12px' }}>{label}</span>
        <span className="hmq-icobtn" aria-label="Baixar caderno" title="Baixar caderno">
          <Download className="hmq-i" style={{ width: 15, height: 15 }} />
        </span>
      </div>
    </div>
  )
}

// ── CSS escopado (prefixo hmq-) ─────────────────────────────────────────────
const CSS = `
.hmq-root{min-height:100%;font-family:'Sora',sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
.hmq-root *{box-sizing:border-box}
.hmq-i{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.hmq-main{padding:20px 20px 48px;display:flex;flex-direction:column;gap:20px;max-width:1600px;margin:0 auto}

.hmq-grid-top{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:20px}
.hmq-grid-top-solo{grid-template-columns:minmax(0,1fr)}
.hmq-grid-mid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:20px;align-items:start}
.hmq-grid-mid-solo{grid-template-columns:minmax(0,1fr)}
.hmq-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}

.hmq-card{border-radius:16px}
.hmq-h1{margin:0 0 4px;font-size:32px;font-weight:700;letter-spacing:-0.045em;line-height:1.1;color:var(--ink)}
.hmq-h3{margin:0;display:inline-flex;align-items:center;gap:10px;font-size:15px;font-weight:700;letter-spacing:-0.02em;color:var(--ink)}
.hmq-hl{color:var(--brand2)}

.hmq-cta{background:linear-gradient(180deg,#4A8BEA,#2F64C8);box-shadow:0 10px 22px -14px rgba(62,127,224,.9),inset 0 1px 0 rgba(255,255,255,.22);transition:filter .15s,transform .15s;display:inline-flex;align-items:center;justify-content:center;gap:8px;color:#FFFFFF;font-weight:700;text-decoration:none;cursor:pointer}
.hmq-cta:hover{filter:brightness(1.06);transform:translateY(-1px)}
.hmq-ctaw{display:inline-flex;align-items:center;gap:10px;height:46px;padding:0 18px;border-radius:12px;background:#FFFFFF;color:#171E3B;font-weight:700;font-size:14px;cursor:pointer;transition:filter .15s,transform .15s}
.hmq-ctaw:hover{filter:brightness(1.06);transform:translateY(-1px)}
.hmq-ghost{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:10px;border:1px solid var(--line);color:var(--muted);font-size:12.5px;font-weight:600;cursor:pointer}
.hmq-icobtn{width:34px;height:34px;border-radius:10px;border:1px solid var(--line);color:var(--muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.hmq-seghov .sgm{transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.hmq-seghov:hover .sgm:nth-child(1){transform:translateY(-4px)}.hmq-seghov:hover .sgm:nth-child(2){transform:translateY(-2px)}

/* carrossel */
/* HERO com a PROPORÇÃO DO MOLDE do admin (1920x500 = banner-edit-modal). Assim o banner desenhado no
   molde aparece EXATO no aluno (WYSIWYG): largura cheia, sem recorte e sem distorção (cover casando a proporção). */
.hmq-hero{position:relative;overflow:hidden;width:100%;aspect-ratio:1920/500;border-radius:18px}
.hmq-hero-body{position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:0 84px 34px;max-width:720px}
.hmq-arr{position:absolute;top:50%;transform:translateY(-50%);z-index:4;display:inline-flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);width:40px;height:40px;border-radius:8px;border:0;background:#FFFFFF;color:#171E3B;box-shadow:0 6px 16px -8px rgba(10,20,60,.6);cursor:pointer;transition:background .15s,color .15s}
.hmq-arr:hover{background:#5ECEF0;color:#171E3B}
.hmq-cctrl{position:absolute;left:84px;bottom:14px;z-index:3;display:flex;align-items:center;gap:7px}
.hmq-cdot{transition:width .3s,background .3s;cursor:pointer}
.hmq-cpause{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;border:1.5px solid #5ECEF0;background:rgba(23,30,59,.55);color:#5ECEF0;cursor:pointer;transition:background .15s,color .15s}
.hmq-cpause:hover{background:#5ECEF0;color:#171E3B}

/* tabela recentes */
.hmq-trow{display:grid;grid-template-columns:minmax(0,2.2fr) 0.8fr 1fr 1.1fr 168px;align-items:center;gap:14px;padding:12px 8px}
.hmq-thead{padding:0 8px 10px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.hmq-row{border-top:1px solid var(--line);transition:background .35s ease,box-shadow .35s ease}
.hmq-row:hover{background:var(--surface2);box-shadow:inset 3px 0 0 var(--brand2)}
.hmq-tcell-prog span{display:block;margin-top:4px}
.hmq-perf{display:grid;grid-template-columns:150px 1fr 40px;align-items:center;gap:12px}

/* pastas / outros */
.hmq-sec-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
.hmq-sec-title{margin:0;font-size:17px;font-weight:700;letter-spacing:-0.03em;color:var(--head)}
.hmq-tabs{display:flex;gap:4px;padding:3px;border-radius:11px;background:var(--surface2);border:1px solid var(--line)}
.hmq-tab{height:30px;padding:0 12px;border:0;border-radius:8px;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;background:transparent;color:var(--muted);cursor:pointer;font-family:inherit}
.hmq-tab-on{background:var(--surface);color:var(--ink);box-shadow:0 1px 3px rgba(10,20,60,.12)}
/* adaptativo ao container (não ao viewport) — não corta em tablet/iframe. */
.hmq-pastas{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:12px}
.hmq-tile{display:flex;align-items:center;gap:12px;padding:10px;border-radius:14px;background:var(--surface);border:1px solid var(--line);text-decoration:none}
.hmq-outro{display:flex;align-items:center;gap:14px;padding:10px;border-radius:14px;background:var(--surface);border:1px solid var(--line)}

/* lift / cover shine */
.hmq-lift{transition:transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s cubic-bezier(.22,1,.36,1),border-color .3s ease;will-change:transform}
.hmq-lift:hover{transform:translateY(-4px);border-color:var(--brand2);box-shadow:0 18px 32px -22px rgba(30,70,150,.65),inset 3px 0 0 var(--cyan)}
.hmq-cov{transition:transform .6s cubic-bezier(.22,1,.36,1)}
.hmq-lift:hover .hmq-cov,.hmq-row:hover .hmq-cov{transform:scale(1.1)}
.hmq-cov::after{content:'';position:absolute;top:0;bottom:0;left:-60%;width:40%;background:linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.22),rgba(255,255,255,0));transform:skewX(-18deg);transition:left 0s;pointer-events:none}
.hmq-lift:hover .hmq-cov::after,.hmq-row:hover .hmq-cov::after{left:130%;transition:left .9s cubic-bezier(.22,1,.36,1)}

/* animações */
.hmq-circ .hmq-ol{stroke-dasharray:1000;stroke-dashoffset:1000;animation:hmqDraw 3s cubic-bezier(.6,.1,.2,1) .2s forwards}
.hmq-circ .hmq-pl{stroke-dasharray:46 954;stroke-dashoffset:1000;opacity:0;animation:hmqFade .6s ease-out 2.6s forwards,hmqPulse 9s linear 2.6s infinite}
.hmq-circ .hmq-pl2{animation-delay:3s,3s;animation-duration:.6s,11s}
.hmq-circ .hmq-pl3{animation-delay:3.4s,3.4s;animation-duration:.6s,7s}
.hmq-cc .hmq-ol{stroke-dasharray:1000;stroke-dashoffset:1000;animation:hmqDraw 3s cubic-bezier(.6,.1,.2,1) .2s forwards}
@keyframes hmqDraw{to{stroke-dashoffset:0}}
@keyframes hmqPulse{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
@keyframes hmqFade{from{opacity:0}to{opacity:1}}
.hmq-glow{animation:hmqGlow 7s ease-in-out infinite alternate}
@keyframes hmqGlow{from{opacity:.7;transform:translateX(-3%)}to{opacity:1;transform:translateX(3%)}}
.hmq-rot-in{animation:hmqRotIn .5s cubic-bezier(.22,1,.36,1)}
@keyframes hmqRotIn{from{opacity:0;transform:translateY(.7em)}to{opacity:1;transform:translateY(0)}}
.hmq-live{animation:hmqBlink 1.6s ease-in-out infinite}
@keyframes hmqBlink{50%{opacity:.3}}
.hmq-sg{animation:hmqSegIn .5s cubic-bezier(.2,.8,.2,1) both}
@keyframes hmqSegIn{from{opacity:0;transform:scaleY(.2)}to{opacity:1;transform:none}}
.up{animation:hmqUp .7s cubic-bezier(.2,.8,.2,1) both}
.u1{animation-delay:.08s}.u2{animation-delay:.16s}.u3{animation-delay:.24s}.u4{animation-delay:.32s}.u5{animation-delay:.4s}
@keyframes hmqUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.hmq-fire{animation:hmqFirepop .7s cubic-bezier(.34,1.56,.64,1) .5s both}
@keyframes hmqFirepop{0%{transform:scale(0)}60%{transform:scale(1.18)}100%{transform:none}}
.hmq-fl{display:block;overflow:visible}
.hmq-fl .b{transform-box:view-box;transform-origin:12px 25.4px;animation:hmqFlb 1.6s cubic-bezier(.45,0,.55,1) 1.2s infinite}
@keyframes hmqFlb{0%,100%{transform:scale(1,1)}18%{transform:scale(1.07,.92)}38%{transform:scale(.95,1.08) translateY(-.6px)}58%{transform:scale(1.02,.98)}76%{transform:scale(.99,1.02)}}
.hmq-fl .i{transform-box:view-box;transform-origin:12px 23.3px;animation:hmqFli 1.1s ease-in-out 1.3s infinite}
@keyframes hmqFli{0%,100%{transform:scale(1,1)}40%{transform:scale(.88,1.1)}70%{transform:scale(1.06,.94)}}
.hmq-fl .sh{transform-box:view-box;transform-origin:12px 27.6px;animation:hmqFlsh 1.6s cubic-bezier(.45,0,.55,1) 1.2s infinite}
@keyframes hmqFlsh{0%,100%{transform:scaleX(1);opacity:1}18%{transform:scaleX(1.1)}38%{transform:scaleX(.88);opacity:.75}}

/* células só-desktop viram linha no mobile */
.hmq-tcell-banca,.hmq-tcell-status,.hmq-tcell-prog{min-width:0}

/* ── Mobile (spec §3.3) ── */
@media (max-width:860px){
  .hmq-main{padding:14px 12px 92px;gap:16px}
  .hmq-grid-top{grid-template-columns:1fr}
  .hmq-grid-mid{grid-template-columns:1fr}
  .hmq-kpis{grid-template-columns:repeat(2,1fr)}
  .hmq-h1{font-size:24px}
  .hmq-hero{border-radius:14px}
  .hmq-hero-body{padding:0 20px 34px}
  .hmq-hero-body h2{font-size:26px}
  .hmq-perf{grid-template-columns:110px 1fr 36px}
  /* recentes: tabela -> lista (capa 50, banca·%, segmentos, play) */
  .hmq-thead{display:none}
  .hmq-trow{grid-template-columns:1fr auto;grid-auto-rows:auto;gap:8px 12px;align-items:center}
  .hmq-tcell-banca{grid-column:1;font-size:11.5px !important;color:var(--muted) !important;font-weight:600}
  .hmq-tcell-status{grid-column:1}
  .hmq-tcell-prog{grid-column:1 / -1}
}

@media (prefers-reduced-motion:reduce){
  .hmq-root *{animation:none !important;transition:none !important}
  .hmq-circ .hmq-ol,.hmq-cc .hmq-ol{stroke-dashoffset:0}
  .hmq-circ .hmq-pl{opacity:0}
}
`
