'use client'

/**
 * HOME da marca REVISÃO (spec 03 §3.1) — porte FIEL dos mockups
 * `design/HomeRevisao.dc.html` + `HomeRevisaoMobile.dc.html`.
 *
 * Só o CONTEÚDO da Home (a shell — sidebar/top bar/down bar — vive fora).
 *
 * Desktop:
 *  1. Carrossel hero largura total (360px, 5 slides de `data.destaques`):
 *     eyebrow amarelo + ponto verde piscando, H2, chips, CTA amarelo; fundo
 *     gradiente roxo + grade 44px + "pixels" piscando + marca R gigante em
 *     contorno com traço amarelo correndo. Auto-avanço 6s, dots, setas no hover, pausar.
 *  2. Grid minmax(0,1fr) 340px: ESQUERDA saudação + Nível + Continue + Recentes +
 *     Desempenho por matéria; DIREITA (rail) Meta diária + Sequência + Missões + Cronograma.
 *  3. Pastas de simulados (filtros Todas/Federais/Estaduais/Municipais).
 *  4. Outros simulados.
 * Mobile (≤640px): saudação · 3 chips · carrossel 280px raio 22 · atalhos 4col ·
 *  Continue · Sequência · Recentes (scroll H) · Nível · Missões · Pastas (grid 2).
 *
 * Classes/keyframes com prefixo `hrv-` (scoped <style>). Decorativos aria-hidden +
 * pointer-events:none; animações só transform/opacity/stroke-dashoffset/background-position.
 * `prefers-reduced-motion: reduce` desliga loops e fixa o estado final.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Award,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  Download,
  Flame,
  Folder,
  Gavel,
  Lightbulb,
  Pause,
  Play,
  Scale,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { internaTokensStyle } from '../../interna-tokens'
import { useTemaInterno } from '../../use-tema-interno'
import type { HomeContinuar, HomeData, HomeDestaque, HomePasta, HomeSimuladoCard, InternaTheme } from '../types'

// Amarelo fixo da marca (spec §1.1 constantes) + texto legível sobre ele.
const AMARELO = '#F1C232'
const AMARELO_INK = '#2A1A55'

// Gradientes de fundo dos 5 slides do carrossel (mockup).
const SLIDE_BG = [
  'linear-gradient(120deg,#160F33 0%,#241A52 55%,#2E1F6A 100%)',
  'linear-gradient(120deg,#1B1240 0%,#33207A 55%,#4A31B8 100%)',
  'linear-gradient(120deg,#1A1208 0%,#3B2A12 55%,#5C3B12 100%)',
  'linear-gradient(120deg,#2A0F2E 0%,#4A1F5E 55%,#6A2FB0 100%)',
  'linear-gradient(120deg,#160F33 0%,#2A1E5A 55%,#3F2E85 100%)',
]
// Gradientes de capa (determinístico por índice) p/ cards/pastas.
const COVER_BG = [
  'linear-gradient(135deg,#241047,#5B2A9E)',
  'linear-gradient(135deg,#2A1E4A,#4A31B8)',
  'linear-gradient(135deg,#1C1540,#3E2A93)',
  'linear-gradient(135deg,#0D2A8F,#2156E8)',
  'linear-gradient(135deg,#1F3D12,#5B9A22)',
  'linear-gradient(135deg,#0B6E6E,#1EAAA6)',
  'linear-gradient(135deg,#A84A14,#E58B3A)',
  'linear-gradient(135deg,#0C4C7A,#2290BE)',
]

const SVG_R = 'M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z M9.2 9.2H19.2V57.6H9.2Z'

// "Pixels" piscando — posições fixas (determinísticas) por slide.
const PX: { l: number; t: number; c: 'a' | 'y'; d: number }[] = [
  { l: 45, t: 177, c: 'a', d: 4.42 }, { l: 221, t: 309, c: 'y', d: 2.29 }, { l: 485, t: 353, c: 'y', d: 1.62 },
  { l: 529, t: 133, c: 'a', d: 2.28 }, { l: 573, t: 221, c: 'y', d: 1.36 }, { l: 617, t: 177, c: 'a', d: 6.4 },
  { l: 749, t: 353, c: 'y', d: 6.81 }, { l: 837, t: 177, c: 'y', d: 4.69 }, { l: 925, t: 221, c: 'a', d: 4.05 },
  { l: 969, t: 89, c: 'y', d: 1.18 }, { l: 1057, t: 45, c: 'y', d: 5.55 }, { l: 1057, t: 89, c: 'a', d: 5.18 },
  { l: 1101, t: 45, c: 'y', d: 5.5 }, { l: 133, t: 265, c: 'a', d: 3.2 },
]

const DIAS_PT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
const FILTROS = ['Todas', 'Federais', 'Estaduais', 'Municipais'] as const

type Filtro = (typeof FILTROS)[number]

export function HomeRevisao({
  theme: themeProp,
  data,
  preview,
}: {
  theme: InternaTheme
  data: HomeData
  preview?: boolean
}) {
  void preview // tudo renderiza de `data`; carrossel/check-in/filtros são locais (sem rede/nav).
  // Segue o tema REAL (classe .dark) para reagir ao toggle ao vivo, em vez do prop estático do server.
  const theme = useTemaInterno(themeProp)

  // Tokens base + overrides spec-03 §1.1 que o interna-tokens não expõe (muted2/brandLine/accentInk/peachBg).
  const rootStyle = useMemo(() => {
    const dark = theme === 'escuro'
    const base = internaTokensStyle('revisao', theme) as Record<string, string>
    const over: Record<string, string> = {
      // Paleta exata do mockup (§1.1) — vence a do simulado.
      '--bg': dark ? '#18181D' : '#F4F2FA',
      '--surface': dark ? '#232329' : '#FFFFFF',
      '--surface2': dark ? '#2C2C34' : '#F6F4FC',
      '--ink': dark ? '#FFFFFF' : '#1D1933',
      '--muted': dark ? '#BDBBCB' : '#6E6886',
      '--muted2': dark ? '#73717F' : '#B3ADC7',
      '--line': dark ? 'rgba(255,255,255,.1)' : '#EAE6F4',
      '--line2': dark ? 'rgba(255,255,255,.18)' : '#D9D2F0',
      '--track': dark ? 'rgba(255,255,255,.12)' : '#ECE8F6',
      '--brand': dark ? '#B3A1FF' : '#5B3FD0',
      '--brandLine': dark ? 'rgba(179,161,255,.45)' : 'rgba(91,63,208,.3)',
      '--chip': dark ? 'rgba(143,117,255,.2)' : '#EFEBFD',
      '--accentInk': dark ? AMARELO : '#9A7400',
      '--peachBg': dark ? 'rgba(241,194,50,.12)' : '#FDF5D8',
      '--r': '20px',
    }
    return { ...base, ...over } as React.CSSProperties
  }, [theme])

  return (
    <div className="hrv-root" style={rootStyle}>
      <style>{CSS}</style>
      {/* 1 · Carrossel hero (largura total) */}
      <Carrossel destaques={data.destaques} />

      {/* Corpo */}
      <div className="hrv-body">
        {/* === DESKTOP: grid principal (esquerda + rail) === */}
        <div className="hrv-main-grid">
          <div className="hrv-col">
            <Saudacao nome={data.usuario.nome} xp={data.usuario.xpNivelMax - data.usuario.xpNivelAtual} />
            <div className="hrv-two">
              <NivelCard data={data} />
              {data.continuar ? <ContinuarCard c={data.continuar} /> : null}
            </div>
            <Recentes cards={data.recentes} />
            <Desempenho data={data} />
          </div>

          <aside className="hrv-rail">
            <MetaDiaria xpHoje={data.sequenciaMeta.xpHoje} meta={data.sequenciaMeta.metaDiariaXp} />
            <Sequencia data={data} />
            <Missoes data={data} />
            <Agenda data={data} />
          </aside>
        </div>

        {/* === MOBILE: ordem própria (§3.1 mobile) === */}
        <div className="hrv-mobile-flow">
          <Saudacao nome={data.usuario.nome} xp={data.usuario.xpNivelMax - data.usuario.xpNivelAtual} compact />
          <ChipsMobile data={data} />
          <CarrosselMobile destaques={data.destaques} />
          <Atalhos />
          {data.continuar ? <ContinuarCard c={data.continuar} /> : null}
          <Sequencia data={data} />
          <RecentesMobile cards={data.recentes} />
          <NivelCard data={data} />
          <Missoes data={data} />
        </div>

        {/* 3 · Pastas de simulados (desktop grid 3 / mobile grid 2) */}
        <Pastas pastas={data.pastas} />

        {/* 4 · Outros simulados */}
        <Outros cards={data.outros} disponiveis={data.outrosDisponiveis} />
      </div>
    </div>
  )
}

/* ============================ Carrossel (desktop) ============================ */

function Carrossel({ destaques }: { destaques: HomeDestaque[] }) {
  const slides = destaques.length ? destaques : []
  const n = slides.length
  const [slide, setSlide] = useState(0)
  const [paused, setPaused] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const go = useCallback((i: number) => setSlide(((i % n) + n) % n), [n])
  const next = useCallback(() => setSlide((s) => (s + 1) % n), [n])
  const prev = useCallback(() => setSlide((s) => (s - 1 + n) % n), [n])

  useEffect(() => {
    if (paused || n <= 1) return
    timer.current = setInterval(() => setSlide((s) => (s + 1) % n), 6000)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [paused, n])

  if (!n) return null

  return (
    <section
      className="hrv-hero hrv-up"
      aria-roledescription="carrossel"
      aria-label="Destaques"
    >
      <div
        className="hrv-track"
        style={{ width: `${n * 100}%`, transform: `translateX(-${slide * (100 / n)}%)` }}
      >
        {slides.map((d, i) => (
          <HeroSlide key={i} d={d} bg={d.cores || SLIDE_BG[i % SLIDE_BG.length]} index={i} ilustra={i === 0} />
        ))}
      </div>

      {/* setas finas (só hover) */}
      <button type="button" aria-label="Anterior" onClick={prev} className="hrv-arr hrv-arr-prev">
        <svg viewBox="0 0 24 48" aria-hidden="true"><path d="M17 4 7 24l10 20" /></svg>
      </button>
      <button type="button" aria-label="Próximo" onClick={next} className="hrv-arr hrv-arr-next">
        <svg viewBox="0 0 24 48" aria-hidden="true"><path d="M7 4l10 20-10 20" /></svg>
      </button>

      {/* dots */}
      <div className="hrv-dots">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Banner ${i + 1}`}
            aria-current={i === slide}
            onClick={() => go(i)}
            className="hrv-dot"
            style={{ background: i === slide ? AMARELO : 'rgba(255,255,255,.4)' }}
          />
        ))}
      </div>

      {/* pausar */}
      <div className="hrv-pausewrap">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? 'Retomar banner' : 'Pausar banner (fixar)'}
          title={paused ? 'Retomar banner' : 'Pausar banner (fixar)'}
          className="hrv-pause"
        >
          {paused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
        </button>
      </div>
    </section>
  )
}

function HeroSlide({ d, bg, index, ilustra }: { d: HomeDestaque; bg: string; index: number; ilustra?: boolean }) {
  const ehImg = !!d.imagem
  // Banner "limpo": sem texto visível (admin ocultou título/mensagem) → só a imagem, sem overlay de
  // texto nem botões. Com texto, os botões só aparecem se o slide não for marcado `semAcoes`.
  const temTexto = !!(d.eyebrow || d.titulo || (d.chips && d.chips.length))
  const mostrarAcoes = temTexto && !d.semAcoes
  return (
    <div className="hrv-slide">
      <div
        className="hrv-slide-bg"
        style={ehImg ? { backgroundImage: `url("${d.imagem}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: bg }}
      >
        {/* Banner real = imagem: overlay p/ legibilidade do texto, sem as decorações do slide. */}
        {ehImg && <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(10,5,35,.72),rgba(10,5,35,.25) 55%,transparent)' }} />}
        {!ehImg && <div className="hrv-grid44" aria-hidden="true" />}
        {!ehImg && <div aria-hidden="true" className="hrv-px-wrap">
          {PX.map((p, k) => (
            <span
              key={k}
              className="hrv-px"
              style={{
                left: p.l,
                top: p.t,
                background: p.c === 'y' ? 'rgba(241,194,50,.2)' : 'rgba(185,168,255,.22)',
                animationDelay: `${(p.d + index) % 7}s`,
              }}
            />
          ))}
        </div>}

        {/* marca R gigante em contorno com traço amarelo correndo */}
        {!ehImg && (
          <svg className="hrv-emb" viewBox="0 0 68 66" aria-hidden="true">
            <path fillRule="evenodd" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.12)" strokeWidth=".25" d={SVG_R} />
            <path className="hrv-run" fill="none" stroke={AMARELO} strokeWidth=".45" strokeLinecap="round" d="M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z" />
          </svg>
        )}

        {/* (pasta "CARREIRAS" removida: slide institucional fica limpo, só com a animação) */}

        {temTexto && (
          <div className="hrv-slide-txt">
            {d.eyebrow ? (
              <span className="hrv-eyebrow">
                <span className="hrv-live" />
                {d.eyebrow}
              </span>
            ) : null}
            {d.titulo ? <h2 className="hrv-slide-h2">{d.titulo}</h2> : null}
            {d.chips.length ? (
              <div className="hrv-chips">
                {d.chips.map((c, i) => (
                  <span key={i} className={cn('hrv-chip', i === d.chips.length - 1 && 'hrv-chip-gold')}>
                    {i === 0 ? <BookOpen size={14} /> : null}
                    {c}
                  </span>
                ))}
              </div>
            ) : null}
            {mostrarAcoes && (
              <div className="hrv-slide-cta">
                <a className="hrv-btn-gold" href={d.cta.url}>
                  <Play size={15} fill="currentColor" />
                  {d.cta.rotulo}
                </a>
                <a className="hrv-btn-ghost" href="#">Todos os destaques</a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================ Carrossel (mobile) ============================ */

function CarrosselMobile({ destaques }: { destaques: HomeDestaque[] }) {
  const slides = destaques.length ? destaques : []
  const n = slides.length
  const [slide, setSlide] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || n <= 1) return
    const t = setInterval(() => setSlide((s) => (s + 1) % n), 6000)
    return () => clearInterval(t)
  }, [paused, n])

  if (!n) return null
  return (
    <section className="hrv-hero-m hrv-up" aria-roledescription="carrossel" aria-label="Destaques">
      <div className="hrv-track" style={{ width: `${n * 100}%`, transform: `translateX(-${slide * (100 / n)}%)` }}>
        {slides.map((d, i) => (
          <div className="hrv-slide" key={i}>
            <div
              className="hrv-slide-bg"
              style={d.imagem ? { backgroundImage: `url("${d.imagem}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: d.cores || SLIDE_BG[i % SLIDE_BG.length] }}
            >
              {d.imagem
                ? <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(10,5,35,.2),rgba(10,5,35,.7))' }} />
                : <div className="hrv-grid44" aria-hidden="true" />}
              {(d.eyebrow || d.titulo) && (
                <div className="hrv-slide-txt hrv-slide-txt-m">
                  {d.eyebrow ? <span className="hrv-eyebrow"><span className="hrv-live" />{d.eyebrow}</span> : null}
                  {d.titulo ? <h2 className="hrv-slide-h2 hrv-slide-h2-m">{d.titulo}</h2> : null}
                  {!d.semAcoes && (
                    <a className="hrv-btn-gold hrv-btn-gold-m" href={d.cta.url}>
                      <Play size={13} fill="currentColor" />{d.cta.rotulo}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="hrv-dots">
        {slides.map((_, i) => (
          <button key={i} type="button" aria-label={`Banner ${i + 1}`} onClick={() => setSlide(i)} className="hrv-dot" style={{ background: i === slide ? AMARELO : 'rgba(255,255,255,.4)' }} />
        ))}
      </div>
      <div className="hrv-pausewrap">
        <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Retomar banner' : 'Pausar banner'} className="hrv-pause">
          {paused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
        </button>
      </div>
    </section>
  )
}

/* ============================ Saudação ============================ */

function Saudacao({ nome, xp, compact }: { nome: string; xp: number; compact?: boolean }) {
  // Privacidade: só primeiro nome.
  const primeiro = nome.trim().split(/\s+/)[0] || nome
  return (
    <div className={cn('hrv-greet hrv-up', compact && 'hrv-greet-m')}>
      <h1 className="hrv-h1">
        Olá,{' '}
        <span className="hrv-name">
          {primeiro}
          <svg className="hrv-uline" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength={1} d="M2 8C60 2 140 2 198 6" fill="none" stroke={AMARELO} strokeWidth={4} strokeLinecap="round" />
          </svg>
        </span>{' '}
        <span className="hrv-wave" aria-hidden="true">👋</span>
      </h1>
      <p className="hrv-greet-sub">
        Continue sua trilha — faltam <b>{xp} XP</b> para o próximo nível.
      </p>
    </div>
  )
}

/* ============================ Chips (mobile) ============================ */

function ChipsMobile({ data }: { data: HomeData }) {
  const { diasSeguidos } = data.sequenciaMeta
  const { xpTotal, liga } = data.usuario
  return (
    <div className="hrv-mchips hrv-up">
      <div className="hrv-mchip">
        <span style={{ color: '#E0A800' }}><Flame size={15} />{diasSeguidos}</span>
        <small>dias seguidos</small>
      </div>
      <div className="hrv-mchip">
        <span style={{ color: 'var(--brand)' }}><Zap size={15} />{xpTotal.toLocaleString('pt-BR')}</span>
        <small>XP total</small>
      </div>
      <div className="hrv-mchip">
        <span style={{ color: '#D99A1E' }}><Trophy size={15} />{liga}</span>
        <small>sua liga</small>
      </div>
    </div>
  )
}

/* ============================ Atalhos (mobile) ============================ */

function Atalhos() {
  const itens = [
    { icon: <Scale size={18} />, label: 'Lei Seca' },
    { icon: <Gavel size={18} />, label: 'Juris' },
    { icon: <CalendarDays size={18} />, label: 'Cronograma' },
    { icon: <BookOpen size={18} />, label: 'Questões' },
  ]
  return (
    <div className="hrv-atalhos hrv-up">
      {itens.map((it) => (
        <a key={it.label} href="#" className="hrv-atalho">
          <span className="hrv-atalho-ic">{it.icon}</span>
          {it.label}
        </a>
      ))}
    </div>
  )
}

/* ============================ Nível ============================ */

function NivelCard({ data }: { data: HomeData }) {
  const u = data.usuario
  const pct = u.xpNivelMax > 0 ? Math.round((u.xpNivelAtual / u.xpNivelMax) * 100) : 0
  const C = 213.6 // 2πr (r=34)
  const dash = C - (C * pct) / 100
  const r = data.resumo
  return (
    <div className="hrv-card hrv-up">
      <div className="hrv-nivel">
        <div className="hrv-ring-wrap">
          <svg viewBox="0 0 80 80" className="hrv-ring-svg">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--track)" strokeWidth="7" />
            <circle
              className="hrv-ring"
              cx="40" cy="40" r="34" fill="none" stroke="url(#hrv-rg)" strokeWidth="7" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={dash} style={{ ['--c' as string]: `${C}` }}
            />
            <defs>
              <linearGradient id="hrv-rg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#8F75FF" />
                <stop offset="1" stopColor={AMARELO} />
              </linearGradient>
            </defs>
          </svg>
          <span className="hrv-ring-txt">
            <b>{u.nivel}</b>
            <span>NÍVEL</span>
          </span>
        </div>
        <div className="hrv-nivel-info">
          <div className="hrv-nivel-row">
            <b>{u.tituloNivel}</b>
            <span><b>{u.xpNivelAtual}</b> / {u.xpNivelMax} XP</span>
          </div>
          <div className="hrv-prog">
            <span className="hrv-bar" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#6449E0,#8F75FF 70%,#F1C232)' }} />
          </div>
          <span className="hrv-nivel-next">
            Faltam <b style={{ color: 'var(--brand)' }}>{Math.max(0, u.xpNivelMax - u.xpNivelAtual)} XP</b> para o nível {u.nivel + 1} · <b style={{ color: 'var(--ink)' }}>{u.proximoTitulo}</b>
          </span>
        </div>
      </div>
      <div className="hrv-ministats">
        <div><b>{r.simuladosFeitos}</b><small>Simulados feitos</small></div>
        <div><b>{r.questoesResolvidas.toLocaleString('pt-BR')}</b><small>Questões resolvidas</small></div>
        <div><b>{r.taxaAcerto}%</b><small>Taxa de acerto</small></div>
      </div>
    </div>
  )
}

/* ============================ Continue de onde parou ============================ */

function ContinuarCard({ c }: { c: HomeContinuar }) {
  const pct = c.totalQuestoes > 0 ? Math.round((c.questaoAtual / c.totalQuestoes) * 100) : 0
  return (
    <div className="hrv-card hrv-up">
      <div className="hrv-card-head">
        <span className="hrv-kicker">CONTINUE DE ONDE PAROU</span>
        <span className="hrv-meta-time"><Clock size={13} />{c.ultimaAtividade}</span>
      </div>
      <div className="hrv-cont-row">
        <div className="hrv-cont-cover">
          <CoverMini bg={c.capa.cores || COVER_BG[1]} rotulo={c.capa.rotulo} />
        </div>
        <div className="hrv-cont-info">
          <b>{c.titulo}</b>
          <span>Questão {c.questaoAtual} de {c.totalQuestoes} · {c.tempoRestante}</span>
          <div className="hrv-prog hrv-prog-sm">
            <span className="hrv-bar" style={{ width: `${pct}%`, background: 'var(--brand)' }} />
          </div>
        </div>
      </div>
      <div className="hrv-cont-actions">
        <a className="hrv-cta" href="#"><Play size={14} fill="currentColor" />Retomar simulado</a>
        <a className="hrv-btn-outline" href={c.cadernoUrl || '#'}><Download size={15} />Caderno</a>
      </div>
    </div>
  )
}

/* ============================ Recentes ============================ */

function Recentes({ cards }: { cards: HomeSimuladoCard[] }) {
  const lista = cards.slice(0, 3)
  if (!lista.length) return null
  return (
    <section className="hrv-up">
      <div className="hrv-sec-head">
        <h3><Play size={16} className="hrv-ic-brand" />Simulados recentes</h3>
        <div className="hrv-sec-arrows">
          <button type="button" aria-label="Anterior"><ChevronLeft size={16} /></button>
          <button type="button" aria-label="Próximo"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="hrv-rtk-grid">
        {lista.map((c, i) => <RecenteCard key={c.id} c={c} i={i} />)}
      </div>
    </section>
  )
}

function RecentesMobile({ cards }: { cards: HomeSimuladoCard[] }) {
  if (!cards.length) return null
  return (
    <section className="hrv-up hrv-only-m">
      <div className="hrv-sec-head"><h3><Play size={16} className="hrv-ic-brand" />Simulados recentes</h3></div>
      <HScrollArrows>
        {cards.map((c, i) => (
          <div className="hrv-hscroll-item" key={c.id}><RecenteCard c={c} i={i} /></div>
        ))}
      </HScrollArrows>
    </section>
  )
}

/** Scroll horizontal com SETAS LATERAIS que aparecem só quando há card pro lado (overflow). As setas
 *  aparecem/somem conforme a posição do scroll e navegam ~85% da largura visível. Reutilizável. */
function HScrollArrows({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [canL, setCanL] = useState(false)
  const [canR, setCanR] = useState(false)
  const update = useCallback(() => {
    const el = ref.current; if (!el) return
    setCanL(el.scrollLeft > 4)
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])
  useEffect(() => {
    const el = ref.current; if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [update])
  const go = (dir: number) => { const el = ref.current; if (el) el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: 'smooth' }) }
  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} className="hrv-hscroll hs">{children}</div>
      {canL && <button type="button" aria-label="Anterior" className="hrv-hscroll-arrow" style={{ left: 2 }} onClick={() => go(-1)}><ChevronLeft size={18} /></button>}
      {canR && <button type="button" aria-label="Próximo" className="hrv-hscroll-arrow" style={{ right: 2 }} onClick={() => go(1)}><ChevronRight size={18} /></button>}
    </div>
  )
}

// MODELO PÔSTER (salvo): layout antigo em pôster (capa no TOPO + corpo abaixo). Mantido p/ referência,
// guardado em `{false && ...}` dentro de RecenteCard; a versão viva é o TICKET (capa à ESQUERDA).
function RecenteCard({ c, i }: { c: HomeSimuladoCard; i: number }) {
  return (
    <>
      {/* === TICKET (vivo): capa à esquerda (fixa, altura cheia) + corpo com título/status + ação + download === */}
      <div className="hrv-lift hrv-rtk">
        <div className="hrv-rtk-cover">
          <CoverFull bg={c.capa.cores || COVER_BG[i % COVER_BG.length]} rotulo={c.capa.rotulo} sub={c.capa.sub} img={c.capa.capa} />
        </div>
        <div className="hrv-rtk-body">
          <div>
            <span className="hrv-recente-tag"><Clock size={12} />{c.status === 'Em andamento' ? 'Em andamento' : 'Sempre disponível'} · {c.tipo}</span>
            <b className="hrv-recente-title">{c.titulo}</b>
          </div>
          <div className="hrv-recente-actions">
            <a className="hrv-cta hrv-cta-sm" href={c.fazerUrl || '#'} style={{ color: '#fff' }}><Play size={12} fill="currentColor" /><span style={{ color: '#fff' }}>{c.status === 'Em andamento' ? 'Continuar' : 'Fazer agora'}</span></a>
            {c.cadernoUrl ? <a className="hrv-dl-btn" href={c.cadernoUrl} download aria-label="Baixar caderno" title="Baixar caderno"><Download size={14} />Baixar</a> : null}
          </div>
        </div>
      </div>

      {/* MODELO PÔSTER (salvo): não apagar — capa no topo + corpo abaixo. */}
      {false && (
        <div className="hrv-lift hrv-recente">
          <div className="hrv-recente-cover">
            <CoverFull bg={c.capa.cores || COVER_BG[i % COVER_BG.length]} rotulo={c.capa.rotulo} sub={c.capa.sub} />
          </div>
          <div className="hrv-recente-body">
            <div>
              <span className="hrv-recente-tag"><Clock size={12} />{c.status === 'Em andamento' ? 'Em andamento' : 'Sempre disponível'} · {c.tipo}</span>
              <b className="hrv-recente-title">{c.titulo}</b>
            </div>
            <div className="hrv-recente-actions">
              <a className="hrv-cta hrv-cta-sm" href="#"><Play size={12} fill="currentColor" />Fazer agora</a>
              <a className="hrv-icon-btn" href={c.cadernoUrl || '#'} aria-label="Baixar caderno" title="Baixar caderno"><Download size={16} /></a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ============================ Desempenho por matéria ============================ */

function Desempenho({ data }: { data: HomeData }) {
  const mats = data.desempenho.slice(0, 5)
  return (
    <div className="hrv-up">
      <div className="hrv-card">
        <div className="hrv-card-head hrv-card-head-tight">
          <h3 className="hrv-h3"><TrendingUp size={18} className="hrv-ic-brand" />Desempenho por matéria</h3>
          <a href="#" className="hrv-link">Ver relatório</a>
        </div>
        <div className="hrv-desemp">
          {mats.map((m) => {
            const baixo = m.pctAcerto < 60
            return (
              <div className="hrv-desemp-row" key={m.materia}>
                <span className="hrv-desemp-mat">{m.materia}</span>
                <div className="hrv-prog">
                  <span className="hrv-bar" style={{ width: `${m.pctAcerto}%`, background: baixo ? AMARELO : 'var(--brand)' }} />
                </div>
                <b className="hrv-desemp-pct" style={{ color: baixo ? 'var(--accentInk)' : 'var(--ink)' }}>{m.pctAcerto}%</b>
              </div>
            )
          })}
        </div>
        <div className="hrv-dica">
          <Lightbulb size={16} style={{ color: 'var(--accentInk)' }} />
          <span>Seu ponto de atenção é <b>{data.pontoAtencao}</b>. Que tal um simulado focado?</span>
          <a href="#" className="hrv-dica-link">Treinar</a>
        </div>
      </div>
    </div>
  )
}

/* ============================ Meta diária ============================ */

function MetaDiaria({ xpHoje, meta }: { xpHoje: number; meta: number }) {
  const pct = meta > 0 ? Math.min(100, Math.round((xpHoje / meta) * 100)) : 0
  return (
    <div className="hrv-card">
      <div className="hrv-card-head hrv-card-head-tight">
        <h3 className="hrv-h3"><Crosshair size={18} className="hrv-ic-brand" />Meta diária</h3>
        <span className="hrv-meta-xp"><b>{xpHoje}</b> / {meta} XP</span>
      </div>
      <div className="hrv-prog" style={{ margin: '14px 0 10px' }}>
        <span className="hrv-bar" style={{ width: `${pct}%`, background: 'var(--brand)' }} />
      </div>
      <span className="hrv-muted-sm">Um simulado hoje garante sua sequência.</span>
    </div>
  )
}

/* ============================ Sequência ============================ */

function Sequencia({ data }: { data: HomeData }) {
  const s = data.sequenciaMeta
  const [checked, setChecked] = useState(s.checkinHoje)
  const streakTxt = s.diasSeguidos === 1 ? '1 dia' : `${s.diasSeguidos} dias`
  // Normaliza semana para 7 dias DOM..SÁB.
  const semana = DIAS_PT.map((d, i) => s.semana[i] ?? { dia: d, estudou: false })
  // "Hoje" = último dia ainda não estudado (destacado com borda da marca); senão o último slot.
  const primeiroPendente = semana.findIndex((d) => !d.estudou)
  const hojeIdx = primeiroPendente === -1 ? semana.length - 1 : primeiroPendente
  const faltamBau = Math.max(0, s.bauDias - s.diasSeguidos)

  return (
    <div className="hrv-card">
      <div className="hrv-card-head">
        <h3 className="hrv-h3"><Flame size={18} style={{ color: '#E8573A' }} />Sequência</h3>
        <span className="hrv-pill-chip">{streakTxt}</span>
      </div>
      <div className="hrv-week">
        {semana.map((d, i) => {
          const estudou = d.estudou
          const hoje = i === hojeIdx && !estudou
          return (
            <div className="hrv-week-day" key={i}>
              <span className="hrv-week-lbl" style={{ color: hoje ? 'var(--ink)' : 'var(--muted)' }}>{d.dia}</span>
              <span
                className={cn('hrv-week-cell', estudou && 'hrv-fire')}
                style={
                  estudou
                    ? { background: 'rgba(232,87,58,.14)' }
                    : hoje
                      ? { border: '2px solid var(--brand)', color: 'var(--brand)' }
                      : { border: '1px solid var(--line)', color: 'var(--muted2)' }
                }
              >
                {estudou ? (
                  <FogoSvg />
                ) : (
                  <svg viewBox="0 0 24 26" aria-hidden="true" className="hrv-drop">
                    <path d="M12 25.4C7.4 25.4 4.1 22.1 4.1 17.7 4.1 14.7 5.5 12.6 6.3 10.7 6.7 9.6 6.7 6.6 7.1 5.3 7.4 4.4 8.4 4.3 8.9 5.1 9.6 6.3 10 7.2 10.6 7.8 11.1 5.7 11.9 2.9 13.4 1.4 14 .8 14.9 .9 15.3 1.6 17.4 5.3 19.9 9.8 19.9 17.4 19.9 22.1 16.6 25.4 12 25.4Z" fill="currentColor" opacity=".6" />
                  </svg>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {checked ? (
        <div className="hrv-checked"><Check size={16} />Check-in feito · +10 XP</div>
      ) : (
        <button type="button" className="hrv-cta hrv-checkin" onClick={() => setChecked(true)}>
          <CalendarDays size={16} />Fazer check-in de hoje
        </button>
      )}

      <div className="hrv-bau">
        <Award size={18} className="hrv-ic-brand" />
        <span>Baú da sequência: <b style={{ color: 'var(--brand)' }}>+{s.bauXp} XP</b> — mantenha {s.bauDias} dias e ganhe. Faltam <b style={{ color: 'var(--ink)' }}>{faltamBau}</b>.</span>
      </div>
    </div>
  )
}

function FogoSvg() {
  return (
    <svg className="hrv-fl" viewBox="0 0 24 30" aria-hidden="true">
      <ellipse className="sh" cx="12" cy="27.6" rx="7" ry="1.7" fill="rgba(150,50,30,.28)" />
      <g className="b">
        <path className="o" d="M12 25.4C7.4 25.4 4.1 22.1 4.1 17.7 4.1 14.7 5.5 12.6 6.3 10.7 6.7 9.6 6.7 6.6 7.1 5.3 7.4 4.4 8.4 4.3 8.9 5.1 9.6 6.3 10 7.2 10.6 7.8 11.1 5.7 11.9 2.9 13.4 1.4 14 .8 14.9 .9 15.3 1.6 17.4 5.3 19.9 9.8 19.9 17.4 19.9 22.1 16.6 25.4 12 25.4Z" fill="#F26B4A" />
        <path className="i" d="M12 23.3C9.9 23.3 8.6 21.8 8.6 20 8.6 17.9 10.5 16.1 11.4 14.3 11.6 13.9 12.4 13.9 12.6 14.3 13.5 16.1 15.4 17.9 15.4 20 15.4 21.8 14.1 23.3 12 23.3Z" fill="#FFC24D" />
      </g>
    </svg>
  )
}

/* ============================ Missões ============================ */

function Missoes({ data }: { data: HomeData }) {
  const miss = data.missoes
  return (
    <div className="hrv-card">
      <div className="hrv-card-head">
        <h3 className="hrv-h3"><Zap size={18} className="hrv-ic-brand" />Missões de hoje</h3>
        <span className="hrv-muted-sm">{data.renovaEm || 'renova à meia-noite'}</span>
      </div>
      <div className="hrv-missoes">
        {miss.map((m, i) => {
          const pct = m.total > 0 ? Math.round((m.progresso / m.total) * 100) : 0
          return (
            <div className="hrv-missao" key={i}>
              <span className="hrv-missao-ic"><Zap size={16} /></span>
              <div className="hrv-missao-body">
                <div className="hrv-missao-top">
                  <span>{m.titulo}</span>
                  <b>+{m.xp} XP</b>
                </div>
                <div className="hrv-missao-prog">
                  <span className="hrv-missao-track"><span className="hrv-missao-fill" style={{ width: `${pct}%` }} /></span>
                  <small>{m.progresso}/{m.total}</small>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ============================ Agenda / Cronograma ============================ */

function Agenda({ data }: { data: HomeData }) {
  const ag = data.agenda.slice(0, 3)
  if (!ag.length) return null
  return (
    <div className="hrv-card">
      <div className="hrv-card-head">
        <h3 className="hrv-h3"><CalendarDays size={18} className="hrv-ic-brand" />Próximos no cronograma</h3>
        <a href="#" className="hrv-link">Abrir</a>
      </div>
      <div className="hrv-agenda">
        {ag.map((a, i) => (
          <div className="hrv-agenda-row" key={i}>
            <span className="hrv-agenda-date">
              <small>{a.diaSemana}</small>
              <b>{a.data}</b>
            </span>
            <div className="hrv-agenda-info">
              <b>{a.titulo}</b>
              <span>{a.detalhe}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ============================ Pastas ============================ */

function Pastas({ pastas }: { pastas: HomePasta[] }) {
  const [filtro, setFiltro] = useState<Filtro>('Todas')
  const lista = useMemo(() => {
    if (filtro === 'Todas') return pastas
    const key = filtro.toLowerCase().replace(/is$/, 'l') // Federais→federal, etc. (fallback)
    return pastas.filter((p) => {
      const cat = (p.categoria || '').toLowerCase()
      if (filtro === 'Federais') return cat.includes('federa')
      if (filtro === 'Estaduais') return cat.includes('estad')
      if (filtro === 'Municipais') return cat.includes('munic')
      return cat.includes(key)
    })
  }, [pastas, filtro])

  return (
    <section className="hrv-up">
      <div className="hrv-sec-head">
        <h3><Folder size={17} className="hrv-ic-brand" />Pastas de simulados</h3>
        <div className="hrv-filtros">
          {FILTROS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={cn('hrv-filtro', filtro === f && 'hrv-filtro-on')}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="hrv-pastas-grid">
        {lista.map((p, i) => (
          <a key={p.id} href={`/aluno?pasta=${encodeURIComponent(p.id)}`} className="hrv-pc hrv-lift">
            <div className="hrv-pc-cover">
              <CoverFull bg={p.cor || COVER_BG[i % COVER_BG.length]} rotulo={p.rotuloCapa} sub={p.subCapa} small img={p.capa} />
            </div>
            <div className="hrv-pc-body">
              <span className="hrv-pc-count"><Folder size={13} />{p.qtdSimulados} {p.qtdSimulados === 1 ? 'simulado' : 'simulados'}</span>
              <b>{p.nome}</b>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}

/* ============================ Outros simulados ============================ */

function Outros({ cards, disponiveis }: { cards: HomeSimuladoCard[]; disponiveis: number }) {
  if (!cards.length) return null
  return (
    <section className="hrv-up">
      <div className="hrv-outros-head">
        <h3>Outros simulados</h3>
        <span className="hrv-selo"><span className="hrv-selo-dot" />Disponíveis · {disponiveis}</span>
      </div>
      <div className="hrv-recentes-grid">
        {cards.map((c, i) => (
          <div className="hrv-rc hrv-lift" key={c.id}>
            <div className="hrv-rc-cover">
              <CoverFull bg={c.capa.cores || COVER_BG[(i + 4) % COVER_BG.length]} rotulo={c.capa.rotulo} sub={c.capa.sub} img={c.capa.capa} />
            </div>
            <div className="hrv-rc-body">
              <span className="hrv-recente-tag"><Clock size={12} />Sempre disponível · {c.tipo}</span>
              <b className="hrv-recente-title">{c.titulo}</b>
              <div className="hrv-recente-actions">
                <a className="hrv-cta hrv-cta-sm" href={c.fazerUrl || '#'} style={{ color: '#fff' }}><Play size={12} fill="currentColor" /><span style={{ color: '#fff' }}>Fazer agora</span></a>
                {c.cadernoUrl ? <a className="hrv-dl-btn" href={c.cadernoUrl} download aria-label="Baixar caderno" title="Baixar caderno"><Download size={14} />Baixar</a> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ============================ Capas (marca R + grade) ============================ */

function CoverFull({ bg, rotulo, sub, small, img }: { bg: string; rotulo: string; sub?: string; small?: boolean; img?: string | null }) {
  // COM IMAGEM real do simulado: a foto preenche a capa (object-cover), SEM texto/decoração sobreposta
  // (a arte já traz o título). Sem imagem: gradiente + grade + marca R + texto (como era).
  if (img) {
    return (
      <div className="hrv-cov" style={{ background: bg, padding: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  return (
    <div className="hrv-cov" style={{ background: bg }}>
      <span className="hrv-cov-grid" aria-hidden="true" />
      <svg viewBox="0 0 68 66" aria-hidden="true" className="hrv-cov-r"><path fill="#FFFFFF" fillRule="evenodd" d={SVG_R} /></svg>
      <span className="hrv-cov-word">R E V I S Ã O</span>
      {sub ? <span className="hrv-cov-sub">{sub}</span> : null}
      <span className="hrv-cov-title" style={{ fontSize: small ? 22 : 26 }}>{rotulo}</span>
    </div>
  )
}

function CoverMini({ bg, rotulo }: { bg: string; rotulo: string }) {
  return (
    <div className="hrv-cov hrv-cov-mini" style={{ background: bg }}>
      <span className="hrv-cov-grid" aria-hidden="true" />
      <svg viewBox="0 0 68 66" aria-hidden="true" className="hrv-cov-r"><path fill="#FFFFFF" fillRule="evenodd" d={SVG_R} /></svg>
      <span className="hrv-cov-title" style={{ fontSize: 17 }}>{rotulo}</span>
    </div>
  )
}

/* ============================ CSS (scoped, prefixo hrv-) ============================ */

const CSS = `
.hrv-root{min-height:100%;position:relative}
.hrv-root *{box-sizing:border-box}
.hrv-root h1,.hrv-root h2,.hrv-root h3{margin:0}
.hrv-root a{text-decoration:none;color:inherit}
.hrv-root button{font:inherit;cursor:pointer}
.hrv-root svg{flex-shrink:0}

/* --- entrada .up --- */
.hrv-up{animation:hrv-up .8s cubic-bezier(.2,.8,.2,1) both}
@keyframes hrv-up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}

/* --- carrossel --- */
.hrv-hero{position:relative;overflow:hidden;height:360px}
.hrv-hero-m{position:relative;overflow:hidden;height:280px;border-radius:22px;margin:0 2px}
.hrv-track{display:flex;height:100%;transition:transform .7s cubic-bezier(.6,.05,.2,1)}
.hrv-slide{position:relative;flex:1 0 0;height:100%;min-width:0}
.hrv-slide-bg{position:relative;overflow:hidden;width:100%;height:100%;color:#fff}
.hrv-grid44{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:44px 44px;pointer-events:none}
.hrv-px-wrap{position:absolute;inset:0;pointer-events:none}
.hrv-px{position:absolute;width:43px;height:43px;opacity:0;animation:hrv-px 7s ease-in-out infinite}
@keyframes hrv-px{0%,100%{opacity:0}12%,30%{opacity:1}44%{opacity:0}}
.hrv-emb{position:absolute;right:40px;top:50%;margin-top:-105px;width:216px;height:210px;pointer-events:none}
.hrv-run{stroke-dasharray:22 400;animation:hrv-run 8s linear infinite}
@keyframes hrv-run{to{stroke-dashoffset:-422}}
.hrv-live{width:7px;height:7px;border-radius:50%;background:#3FD58A;animation:hrv-blink 1.6s ease-in-out infinite}
@keyframes hrv-blink{50%{opacity:.3}}
.hrv-slide-txt{position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;gap:16px;padding:0 92px;max-width:680px}
.hrv-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.22em;color:${AMARELO}}
.hrv-slide-h2{font-size:44px;font-weight:800;letter-spacing:-.04em;line-height:1.04}
.hrv-chips{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.hrv-chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.22);font-size:12.5px;font-weight:700}
.hrv-chip-gold{border:0;background:rgba(241,194,50,.16);color:#F7DA7A}
.hrv-slide-cta{display:flex;gap:10px;margin-top:4px}
.hrv-btn-gold{display:inline-flex;align-items:center;gap:8px;height:48px;padding:0 20px;border-radius:14px;background:${AMARELO};color:${AMARELO_INK};font-weight:800;font-size:14.5px;transition:filter .15s,transform .15s}
.hrv-btn-gold:hover{filter:brightness(1.05);transform:translateY(-1px)}
.hrv-btn-ghost{display:inline-flex;align-items:center;height:48px;padding:0 18px;border-radius:14px;border:1px solid rgba(255,255,255,.22);color:#fff;font-weight:700;font-size:14px}
.hrv-arr{position:absolute;top:50%;transform:translateY(-50%);z-index:4;display:inline-flex;align-items:center;justify-content:center;width:40px;height:60px;border-radius:12px;border:0;background:transparent;color:rgba(255,255,255,.75);opacity:0;transition:opacity .3s ease,transform .45s cubic-bezier(.2,.8,.2,1),color .15s}
.hrv-arr svg{width:22px;height:46px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.hrv-arr-prev{left:20px;transform:translate(-18px,-50%) scale(.8)}
.hrv-arr-next{right:20px;transform:translate(18px,-50%) scale(.8)}
.hrv-hero:hover .hrv-arr,.hrv-arr:focus-visible{opacity:1;transform:translate(0,-50%) scale(1)}
.hrv-hero:hover .hrv-arr-prev:hover{transform:translate(-4px,-50%) scale(1)}
.hrv-hero:hover .hrv-arr-next:hover{transform:translate(4px,-50%) scale(1)}
.hrv-arr:hover{color:${AMARELO}}
.hrv-dots{position:absolute;left:0;right:0;bottom:18px;z-index:3;display:flex;align-items:center;justify-content:center;gap:7px}
.hrv-dot{width:8px;height:8px;padding:0;border:0;border-radius:50%;transition:background .3s,transform .3s}
.hrv-dot[aria-current="true"]{transform:scale(1.05)}
.hrv-pausewrap{position:absolute;right:20px;bottom:10px;z-index:4}
.hrv-pause{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;border:0;background:transparent;color:#fff;transition:color .15s}
.hrv-pause:hover{color:${AMARELO}}
/* ilustração pasta */
.hrv-fold{position:absolute;right:250px;bottom:-6px;width:330px;height:250px;pointer-events:none}
.hrv-fold-tab{position:absolute;left:30px;top:0;width:120px;height:30px;border-radius:10px 10px 0 0;background:#3A2A78}
.hrv-fold-pg1{position:absolute;left:22px;right:40px;top:16px;height:60px;background:#F1ECE0;border-radius:4px;transform:rotate(-2deg)}
.hrv-fold-pg2{position:absolute;left:34px;right:26px;top:26px;height:60px;background:#E5DDCB;border-radius:4px;transform:rotate(1.5deg)}
.hrv-fold-body{position:absolute;left:0;right:0;top:24px;bottom:0;border-radius:6px 14px 6px 6px;background:linear-gradient(170deg,#3F2E85,#21174A);box-shadow:0 30px 50px -20px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.08)}
.hrv-fold-label{position:absolute;left:40px;right:40px;top:74px;height:50px;background:#D9CFB6;border-radius:3px;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;color:#4A3F2A;letter-spacing:.04em;font-size:14px}
.hrv-fold-seal{position:absolute;right:22px;bottom:18px;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#E3A74F,#8A5A1C);box-shadow:0 2px 6px rgba(0,0,0,.4)}

/* --- corpo / grids --- */
.hrv-body{padding:28px 28px 48px;display:flex;flex-direction:column;gap:26px}
.hrv-main-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start}
.hrv-col{display:flex;flex-direction:column;gap:26px;min-width:0}
.hrv-rail{display:flex;flex-direction:column;gap:16px}
.hrv-two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.hrv-mobile-flow{display:none}
.hrv-only-m{display:none}

/* --- cartões base --- */
.hrv-card{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px}
.hrv-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
.hrv-card-head-tight{margin-bottom:0}
.hrv-h3{display:inline-flex;align-items:center;gap:9px;font-size:15.5px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
.hrv-ic-brand{color:var(--brand)}
.hrv-kicker{font-size:11px;font-weight:800;letter-spacing:.2em;color:var(--accentInk)}
.hrv-link{font-size:12.5px;font-weight:700;color:var(--brand)}
.hrv-meta-time{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--muted)}
.hrv-meta-xp{font-size:12.5px;color:var(--muted)}
.hrv-meta-xp b,.hrv-nivel-row b{color:var(--ink)}
.hrv-muted-sm{font-size:12px;color:var(--muted)}
.hrv-pill-chip{height:24px;padding:0 10px;border-radius:99px;background:var(--chip);color:var(--brand);font-size:12px;font-weight:800;display:inline-flex;align-items:center}

/* --- saudação --- */
.hrv-greet{display:flex;flex-direction:column;gap:6px}
.hrv-h1{font-size:38px;font-weight:800;letter-spacing:-.045em;line-height:1.1}
.hrv-name{position:relative;display:inline-block}
.hrv-uline{position:absolute;left:0;bottom:-6px;width:100%;height:10px}
.hrv-uline path{stroke-dasharray:1;stroke-dashoffset:1;animation:hrv-draw .9s cubic-bezier(.6,.1,.2,1) .6s forwards}
@keyframes hrv-draw{to{stroke-dashoffset:0}}
.hrv-wave{display:inline-block;transform-origin:70% 80%;animation:hrv-wv 2.4s ease-in-out 1s 2}
@keyframes hrv-wv{0%,60%,100%{transform:none}10%,30%{transform:rotate(16deg)}20%,40%{transform:rotate(-8deg)}}
.hrv-greet-sub{font-size:15px;color:var(--muted)}
.hrv-greet-sub b{color:var(--ink)}

/* --- nível --- */
.hrv-nivel{display:flex;align-items:center;gap:18px}
.hrv-ring-wrap{position:relative;width:84px;height:84px;flex-shrink:0}
.hrv-ring-svg{width:84px;height:84px;transform:rotate(-90deg)}
.hrv-ring{animation:hrv-ring 1.4s cubic-bezier(.2,.8,.2,1) .4s both}
@keyframes hrv-ring{from{stroke-dashoffset:var(--c)}}
.hrv-ring-txt{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}
.hrv-ring-txt b{font-size:26px;font-weight:800;color:var(--ink);letter-spacing:-.04em}
.hrv-ring-txt span{font-size:9.5px;font-weight:800;letter-spacing:.14em;color:var(--muted);margin-top:3px}
.hrv-nivel-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.hrv-nivel-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.hrv-nivel-row>b{font-size:16px;color:var(--ink)}
.hrv-nivel-row>span{font-size:12.5px;color:var(--muted)}
.hrv-nivel-next{font-size:12.5px;color:var(--muted)}
.hrv-prog{height:8px;border-radius:99px;background:var(--track);overflow:hidden}
.hrv-prog-sm{height:6px;margin-top:10px}
.hrv-bar{display:block;height:100%;border-radius:99px;transform-origin:0 50%;animation:hrv-grow 1.2s cubic-bezier(.2,.8,.2,1) .5s both}
@keyframes hrv-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.hrv-ministats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}
.hrv-ministats>div{padding:12px;border-radius:14px;background:var(--surface2)}
.hrv-ministats b{display:block;font-size:19px;font-weight:800;letter-spacing:-.03em;color:var(--ink)}
.hrv-ministats small{font-size:11.5px;color:var(--muted)}

/* --- continuar --- */
.hrv-cont-row{display:flex;gap:14px;align-items:center}
.hrv-cont-cover{width:74px;height:74px;border-radius:14px;overflow:hidden;flex-shrink:0}
.hrv-cont-info{flex:1;min-width:0}
.hrv-cont-info>b{display:block;font-size:15.5px;color:var(--ink);letter-spacing:-.02em}
.hrv-cont-info>span{font-size:12.5px;color:var(--muted)}
.hrv-cont-actions{display:flex;gap:10px;margin-top:16px}
.hrv-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;border-radius:13px;color:#fff;font-weight:800;font-size:14px;border:0;background:linear-gradient(180deg,#6449E0,#4B30BE);box-shadow:0 10px 20px -12px rgba(75,48,190,.8),inset 0 1px 0 rgba(255,255,255,.2);transition:filter .15s,transform .15s;flex:1;white-space:nowrap}
.hrv-cta:hover{filter:brightness(1.08);transform:translateY(-1px)}
.hrv-cta-sm{height:38px;border-radius:11px;font-size:13px;gap:7px}
.hrv-btn-outline{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:44px;padding:0 14px;border-radius:13px;border:1px solid var(--line);color:var(--ink);font-weight:700;font-size:13px}
.hrv-checkin{width:100%;margin-top:16px;flex:none}
.hrv-checked{margin-top:16px;height:44px;border-radius:13px;background:var(--chip);color:var(--brand);font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px}

/* --- seções com cabeçalho+setas --- */
.hrv-sec-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
.hrv-sec-head h3{display:inline-flex;align-items:center;gap:9px;font-size:16px;font-weight:800;color:var(--ink)}
.hrv-sec-arrows{display:flex;gap:8px}
.hrv-sec-arrows button{width:34px;height:34px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);display:inline-flex;align-items:center;justify-content:center}

/* --- recentes (pôster — MODELO SALVO, ainda usado por "Outros simulados") --- */
.hrv-recentes-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:14px}
.hrv-recente{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.hrv-recente-cover{height:118px}
.hrv-recente-body{padding:14px;display:flex;flex-direction:column;gap:10px}
.hrv-recente-tag{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)}
.hrv-recente-title{display:block;margin-top:4px;font-size:14.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hrv-recente-actions{display:flex;gap:8px}
.hrv-icon-btn{width:38px;height:38px;border-radius:11px;border:1px solid var(--line);color:var(--muted);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.hrv-dl-btn{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:11px;border:1px solid var(--line);color:var(--ink);background:var(--surface);font-size:12.5px;font-weight:700;flex-shrink:0;transition:background .15s,border-color .15s}
.hrv-dl-btn:hover{background:var(--chip);border-color:color-mix(in srgb,var(--brand) 40%,var(--line))}
/* "Fazer agora" branco (igual aos botões de ação de Simulados realizados): fundo surface, borda, texto --ink. */
.hrv-cta-ghost{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;border-radius:11px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:13px;font-weight:800;flex:1;transition:background .15s,border-color .15s}
.hrv-cta-ghost:hover{background:var(--chip);border-color:color-mix(in srgb,var(--brand) 40%,var(--line))}

/* --- recentes (TICKET vivo): capa à esquerda (fixa, altura cheia ~168) + corpo à direita --- */
.hrv-rtk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:14px}
.hrv-rtk{display:flex;background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden;min-height:136px}
.hrv-rtk-cover{width:150px;flex-shrink:0;overflow:hidden}
.hrv-rtk-body{flex:1;min-width:0;padding:14px 16px;display:flex;flex-direction:column;justify-content:space-between;gap:12px}

/* --- desempenho --- */
.hrv-desemp{display:flex;flex-direction:column;gap:12px;margin-top:14px}
.hrv-desemp-row{display:grid;grid-template-columns:170px 1fr 44px;align-items:center;gap:12px}
.hrv-desemp-mat{font-size:13px;font-weight:600;color:var(--ink)}
.hrv-desemp-pct{font-size:13px;text-align:right}
.hrv-dica{margin-top:16px;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;background:var(--peachBg);color:var(--ink);font-size:13px}
.hrv-dica-link{margin-left:auto;font-weight:800;color:var(--accentInk);white-space:nowrap}

/* --- sequência --- */
.hrv-week{display:flex;justify-content:space-between}
.hrv-week-day{display:flex;flex-direction:column;align-items:center;gap:6px}
.hrv-week-lbl{font-size:10px;font-weight:700}
.hrv-week-cell{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;overflow:visible}
.hrv-drop{width:14px;height:15px;display:block}
.hrv-fire{animation:hrv-firepop .7s cubic-bezier(.34,1.56,.64,1) .5s both}
@keyframes hrv-firepop{0%{transform:scale(0)}60%{transform:scale(1.18)}100%{transform:none}}
.hrv-fl{width:22px;height:28px;margin-top:1px;overflow:visible;display:block}
.hrv-fl .b{transform-box:view-box;transform-origin:12px 25.4px;animation:hrv-flb 1.6s cubic-bezier(.45,0,.55,1) 1.2s infinite}
@keyframes hrv-flb{0%,100%{transform:scale(1,1)}18%{transform:scale(1.07,.92)}38%{transform:scale(.95,1.08) translateY(-.6px)}58%{transform:scale(1.02,.98)}76%{transform:scale(.99,1.02)}}
.hrv-fl .o{transform-box:view-box;transform-origin:12px 25px;animation:hrv-flo 2.4s ease-in-out 1.2s infinite}
@keyframes hrv-flo{0%,100%{transform:skewX(0)}30%{transform:skewX(-3deg)}70%{transform:skewX(3deg)}}
.hrv-fl .i{transform-box:view-box;transform-origin:12px 23.3px;animation:hrv-fli 1.1s ease-in-out 1.3s infinite}
@keyframes hrv-fli{0%,100%{transform:scale(1,1)}40%{transform:scale(.88,1.1)}70%{transform:scale(1.06,.94)}}
.hrv-fl .sh{transform-box:view-box;transform-origin:12px 27.6px;animation:hrv-flsh 1.6s cubic-bezier(.45,0,.55,1) 1.2s infinite}
@keyframes hrv-flsh{0%,100%{transform:scaleX(1);opacity:1}18%{transform:scaleX(1.1)}38%{transform:scaleX(.88);opacity:.75}}
.hrv-bau{margin-top:12px;display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:13px;border:1px dashed var(--line2);font-size:12px;color:var(--muted)}

/* --- missões --- */
.hrv-missoes{display:flex;flex-direction:column;gap:14px}
.hrv-missao{display:flex;align-items:center;gap:12px}
.hrv-missao-ic{width:36px;height:36px;border-radius:11px;background:var(--chip);color:var(--brand);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.hrv-missao-body{flex:1;min-width:0}
.hrv-missao-top{display:flex;justify-content:space-between;gap:8px}
.hrv-missao-top span{font-size:13.5px;font-weight:600;color:var(--ink)}
.hrv-missao-top b{font-size:12px;color:var(--brand)}
.hrv-missao-prog{display:flex;align-items:center;gap:8px;margin-top:7px}
.hrv-missao-track{flex:1;height:6px;border-radius:99px;background:var(--track);overflow:hidden}
.hrv-missao-fill{display:block;height:100%;border-radius:99px;background:var(--brand)}
.hrv-missao-prog small{font-size:11px;color:var(--muted)}

/* --- agenda --- */
.hrv-agenda{display:flex;flex-direction:column;gap:10px}
.hrv-agenda-row{display:flex;align-items:center;gap:12px}
.hrv-agenda-date{width:44px;height:48px;border-radius:12px;background:var(--surface2);display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1;flex-shrink:0}
.hrv-agenda-date small{font-size:9.5px;font-weight:800;letter-spacing:.1em;color:var(--accentInk)}
.hrv-agenda-date b{font-size:17px;color:var(--ink)}
.hrv-agenda-info{min-width:0}
.hrv-agenda-info b{display:block;font-size:13.5px;color:var(--ink)}
.hrv-agenda-info span{font-size:12px;color:var(--muted)}

/* --- pastas --- */
.hrv-filtros{display:flex;gap:6px}
.hrv-filtro{height:30px;padding:0 12px;border-radius:99px;font-size:12.5px;font-weight:700;display:inline-flex;align-items:center;border:1px solid var(--line);background:transparent;color:var(--muted)}
.hrv-filtro-on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
/* ADAPTATIVO AO CONTAINER (nao ao viewport) — nao corta em tablet/iframe (Curseduca). O card tem cover
   fixo de 150px, entao repeat(N,1fr) estourava (min-content maior que a track). min(100%,260px) = 1 coluna
   quando estreito; acima, quantas de 260px+ couberem. */
.hrv-pastas-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:14px}
.hrv-pc{display:flex;height:112px;background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.hrv-pc-cover{width:150px;flex-shrink:0}
.hrv-pc-body{flex:1;min-width:0;padding:14px 16px;display:flex;flex-direction:column;justify-content:center;gap:6px}
.hrv-pc-count{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted)}
.hrv-pc-body b{font-size:14.5px;color:var(--ink);line-height:1.3;letter-spacing:-.01em}

/* --- outros --- */
.hrv-outros-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.hrv-outros-head h3{font-size:16px;font-weight:800;color:var(--ink)}
.hrv-selo{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:99px;background:rgba(63,213,138,.14);color:#1F9D60;font-size:12px;font-weight:800}
.hrv-selo-dot{width:6px;height:6px;border-radius:50%;background:#2EC77A}
.hrv-rc{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.hrv-rc-cover{height:118px}
.hrv-rc-body{padding:14px;display:flex;flex-direction:column;gap:8px}

/* --- capas --- */
.hrv-cov{position:relative;overflow:hidden;width:100%;height:100%;color:#fff;display:flex;flex-direction:column;justify-content:center;padding:12px 14px;transition:transform .7s cubic-bezier(.22,1,.36,1)}
.hrv-cov-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px);background-size:18px 18px}
.hrv-cov-r{position:absolute;right:-14px;bottom:-16px;width:92px;height:89px;opacity:.14}
.hrv-cov-word{position:relative;font-family:Montserrat,sans-serif;font-size:8px;font-weight:800;letter-spacing:.5em;opacity:.85}
.hrv-cov-sub{position:relative;font-size:8.5px;font-weight:800;letter-spacing:.14em;opacity:.85;margin-top:4px}
.hrv-cov-title{position:relative;font-family:Montserrat,sans-serif;font-style:italic;font-weight:800;line-height:1;letter-spacing:-.02em;margin-top:4px;text-shadow:0 2px 12px rgba(0,0,0,.25)}
.hrv-cov-mini{padding:12px 14px}
.hrv-cov-mini .hrv-cov-title{margin-top:0}

/* --- lift (hover) + faixa de brilho --- */
.hrv-lift{transition:transform .55s cubic-bezier(.22,1,.36,1),box-shadow .55s cubic-bezier(.22,1,.36,1),border-color .35s ease;will-change:transform}
.hrv-lift:hover{transform:translateY(-6px);box-shadow:0 26px 44px -26px rgba(40,20,110,.55);border-color:var(--brandLine)}
.hrv-lift .hrv-cov{position:relative}
.hrv-lift:hover .hrv-cov{transform:scale(1.07)}
.hrv-cov::after{content:'';position:absolute;top:0;bottom:0;left:-60%;width:40%;background:linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.22),rgba(255,255,255,0));transform:skewX(-18deg);transition:left 0s;pointer-events:none}
.hrv-lift:hover .hrv-cov::after{left:130%;transition:left .9s cubic-bezier(.22,1,.36,1)}

/* --- chips/atalhos mobile --- */
.hrv-mchips{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.hrv-mchip{padding:10px 12px;border-radius:14px;background:var(--surface);border:1px solid var(--line)}
.hrv-mchip span{display:inline-flex;align-items:center;gap:5px;font-size:15px;font-weight:800}
.hrv-mchip small{display:block;font-size:11px;color:var(--muted);margin-top:2px}
.hrv-atalhos{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.hrv-atalho{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 4px;border-radius:16px;background:var(--surface);border:1px solid var(--line);font-size:11px;font-weight:700;color:var(--ink);text-align:center}
.hrv-atalho-ic{width:38px;height:38px;border-radius:12px;background:var(--chip);color:var(--brand);display:inline-flex;align-items:center;justify-content:center}
.hrv-hscroll{display:flex;gap:14px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
.hrv-hscroll::-webkit-scrollbar{display:none}
.hrv-hscroll-item{flex:0 0 380px}
.hs::-webkit-scrollbar{display:none}
/* Setas laterais do scroll horizontal (aparecem só quando ha card pro lado). */
.hrv-hscroll-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:6;width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--surface);border:1px solid var(--line);color:var(--ink);box-shadow:0 6px 18px -6px rgba(0,0,0,.45);cursor:pointer}
.hrv-hscroll-arrow:active{transform:translateY(-50%) scale(.92)}

/* --- responsivo --- */
@media (max-width:980px){
  .hrv-main-grid{grid-template-columns:1fr}
  .hrv-rail{display:none}
}
@media (max-width:640px){
  .hrv-hero{display:none}
  .hrv-body{padding:16px 14px 104px;gap:20px}
  .hrv-main-grid{display:none}
  .hrv-mobile-flow{display:flex;flex-direction:column;gap:20px}
  .hrv-only-m{display:block}
  .hrv-h1{font-size:28px}
  .hrv-greet-sub{font-size:14px}
  .hrv-two{grid-template-columns:1fr}
  /* pastas/recentes já se ajustam ao container (auto-fill) — sem override por viewport. */
  .hrv-rtk-grid{grid-template-columns:1fr}
  .hrv-slide-txt-m{padding:0 22px;gap:12px}
  .hrv-slide-h2-m{font-size:26px}
  .hrv-btn-gold-m{height:40px;padding:0 16px;font-size:13px;align-self:flex-start}
}
@media (min-width:641px){
  .hrv-hero-m{display:none}
}

/* --- reduced motion: desliga loops e fixa estado final --- */
@media (prefers-reduced-motion:reduce){
  .hrv-root *,.hrv-root *::after{animation:none!important;transition:none!important}
  .hrv-bar{transform:none!important}
  .hrv-ring{stroke-dashoffset:inherit!important}
  .hrv-uline path{stroke-dashoffset:0!important}
  .hrv-arr{opacity:1!important;transform:translateY(-50%)!important}
}
`
