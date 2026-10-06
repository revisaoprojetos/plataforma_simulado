'use client'

// HOME do aluno — marca VND (spec 03 §3.2). Composição PRÓPRIA da VND:
// carrossel hero (slide 0 boas-vindas + anel de nível + 3 tiles de vidro, slides 1–4 de destaque),
// Continue de onde parou + Meta & sequência, Missões/Desempenho/Sua semana, Recentes/Pastas/Outros.
// Uma única árvore responsiva (desktop ≥ md, mobile < md). Só consome `data` — sem rede/navegação.
//
// Tokens via interna-tokens + extras (--gold/--goldInk/--goldBg/--brandLine/--muted2) setados inline
// da tabela spec §1.2 (claro/escuro). Acentos de marca fixos (CTA verde, ouro, hero verde) por design.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Play, Calendar, Clock, Check, FileDown, Zap, Flame, Gift, BarChart3,
  ChevronRight, ChevronLeft, ArrowRight, Scale, BookText, Lightbulb, Trophy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HomeData, InternaTheme } from '../types'
import { internaTokensStyle } from '../../interna-tokens'
import { useTemaInterno } from '../../use-tema-interno'

const VND_SVG =
  'M1.00 5.90L11.51 5.77Q12.20 5.76 12.53 6.13L21.21 15.98Q21.47 16.25 21.57 15.86L21.60 8.10C21.60 7.05 20.81 6.30 19.76 5.88L30.57 5.90Q31.00 5.91 30.74 6.33L23.18 14.49C22.26 15.55 21.80 16.65 21.73 18.23L21.67 25.45Q21.60 26.24 20.95 25.96L6.03 8.31C4.78 6.96 3.14 6.19 1.00 5.90Z'

const SLIDE_BG = [
  'linear-gradient(120deg,#062A1B 0%,#16804F 100%)',
  'linear-gradient(120deg,#0B3340 0%,#1C7A8C 100%)',
  'linear-gradient(120deg,#0F2A45 0%,#2A6FB0 100%)',
  'linear-gradient(120deg,#2E250A 0%,#9A7A22 100%)',
]
const COVER_BG = ['#062A1B,#0F5A36', '#0B3340,#1C7A8C', '#0A2E22,#1E8A64', '#0F2A45,#2A6FB0', '#2E250A,#9A7A22']

// Extras de tokens não garantidos pela interna-tokens (spec §1.2).
function vndExtras(theme: InternaTheme): React.CSSProperties {
  const dark = theme === 'escuro'
  return {
    '--gold': dark ? '#E8C877' : '#D8B45A',
    '--goldInk': dark ? '#F1D48A' : '#9A7414',
    '--goldBg': dark ? 'rgba(232,200,119,.14)' : '#FBF4E2',
    '--brandLine': dark ? 'rgba(79,224,152,.4)' : 'rgba(15,122,68,.3)',
    '--muted2': dark ? '#71907F' : '#B5C4BB',
  } as React.CSSProperties
}

function dotsOverlay(size = 14, op = 0.22) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `radial-gradient(circle,rgba(185,245,212,${op}) 1px,transparent 1.6px)`,
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  )
}

/** Capa de simulado/pasta reutilizável (gradiente verde + marca V + rótulo). */
function Cover({ rotulo, sub, grad, big = 28 }: { rotulo: string; sub: string; grad: string; big?: number }) {
  return (
    <div
      className="hvn-cov"
      style={{
        position: 'relative', overflow: 'hidden', width: '100%', height: '100%',
        background: `linear-gradient(140deg,${grad})`, color: '#FFFFFF',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '12px 14px',
      }}
    >
      {dotsOverlay(14, 0.22)}
      <svg viewBox="0 0 32 32" aria-hidden style={{ position: 'absolute', right: -18, top: -14, width: 110, height: 110, opacity: 0.16 }}>
        <path fill="#B9F5D4" d={VND_SVG} />
      </svg>
      <span style={{ position: 'absolute', left: 14, top: 12, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8.5, fontWeight: 800, letterSpacing: '.2em', color: '#F1D48A' }}>
        <svg viewBox="0 0 32 32" style={{ width: 11, height: 11 }}><path fill="#F1D48A" d={VND_SVG} /></svg>SIMULA VND
      </span>
      <span style={{ position: 'relative', fontSize: 8.5, fontWeight: 800, letterSpacing: '.16em', color: '#CFE3D7' }}>{sub}</span>
      <span style={{ position: 'relative', fontWeight: 800, fontSize: big, lineHeight: 1.02, letterSpacing: '-0.04em' }}>{rotulo}</span>
      <span aria-hidden style={{ position: 'relative', display: 'block', width: 34, height: 3, borderRadius: 3, background: '#D8B45A', marginTop: 6 }} />
    </div>
  )
}

const CARD: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 24, padding: 22 }

function CardHead({ icon, title, color, right }: { icon: React.ReactNode; title: string; color?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
      <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--chip)', color: color ?? 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
        {title}
      </h3>
      {right}
    </div>
  )
}

function SecHeaderLink({ label }: { label: string }) {
  return (
    <a href="#" onClick={(e) => e.preventDefault()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 800, color: 'var(--brand)' }}>
      {label}<ChevronRight size={13} />
    </a>
  )
}

// ---------- Carrossel (estado local) ----------
const FLAME_ICON = (
  <svg viewBox="0 0 24 26" aria-hidden style={{ width: 16, height: 17, display: 'block' }}>
    <path d="M12 25.4C7.4 25.4 4.1 22.1 4.1 17.7 4.1 14.7 5.5 12.6 6.3 10.7 6.7 9.6 6.7 6.6 7.1 5.3 7.4 4.4 8.4 4.3 8.9 5.1 9.6 6.3 10 7.2 10.6 7.8 11.1 5.7 11.9 2.9 13.4 1.4 14 .8 14.9 .9 15.3 1.6 17.4 5.3 19.9 9.8 19.9 17.4 19.9 22.1 16.6 25.4 12 25.4Z" fill="currentColor" opacity=".6" />
    <path d="M12 23.3C9.9 23.3 8.6 21.8 8.6 20 8.6 17.9 10.5 16.1 11.4 14.3 11.6 13.9 12.4 13.9 12.6 14.3 13.5 16.1 15.4 17.9 15.4 20 15.4 21.8 14.1 23.3 12 23.3Z" fill="#FFFFFF" opacity=".45" />
  </svg>
)

export function HomeVnd({ theme: themeProp, data, preview }: { theme: InternaTheme; data: HomeData; preview?: boolean }) {
  // Tema REAL resolvido no cliente (reage ao toggle claro/escuro; o `theme` do servidor é só o fallback).
  const theme = useTemaInterno(themeProp)
  const { usuario, sequenciaMeta, missoes, continuar, resumo, desempenho, agenda, destaques, recentes, pastas, outros, outrosDisponiveis } = data
  // Gamificação (config do tenant p/ este aluno). off → esconde nível/XP/sequência/missões/liga.
  const gamOn = data.gamAtivo !== false
  // Texto rotativo "Rumo a …": só cargos REAIS (sem fabricar). O keyframe era fixo p/ 3 itens e
  // quebrava com 1 (no portal real `data.rotativo` não vem → caía no título do nível/vazio). Agora:
  // filtra vazios, gera o keyframe p/ a quantidade EXATA e só anima com ≥2 (senão fica estático).
  const rotativo = (() => {
    const base = (data.rotativo ?? []).map((r) => (r ?? '').trim()).filter(Boolean)
    if (base.length) return base
    const tn = (usuario.tituloNivel ?? '').trim()
    return tn ? [tn] : ['sua aprovação']
  })()
  const nRot = rotativo.length
  const animaRot = nRot >= 2
  const tickCss = animaRot
    ? (() => {
        const seg = 100 / nRot
        const hold = seg * 0.72
        let kf = ''
        for (let k = 0; k < nRot; k++) {
          const y = (-k * 1.2).toFixed(2)
          kf += `${(k * seg).toFixed(2)}%{transform:translateY(${y}em)}${(k * seg + hold).toFixed(2)}%{transform:translateY(${y}em)}`
        }
        kf += `100%{transform:translateY(${(-nRot * 1.2).toFixed(2)}em)}`
        return `@keyframes hvnTickDyn{${kf}}.hvn-root .hvn-tick{animation:hvnTickDyn ${(nRot * 2.6).toFixed(1)}s cubic-bezier(.6,.1,.2,1) 1.2s infinite}`
      })()
    : '.hvn-root .hvn-tick{animation:none}'

  // Slides: 0 = boas-vindas + 4 destaques (máx 4).
  const slideDest = destaques.slice(0, 4)
  const nSlides = 1 + slideDest.length
  const [slide, setSlide] = useState(0)
  const [paused, setPaused] = useState(false)
  const [checked, setChecked] = useState(sequenciaMeta.checkinHoje)
  const [cat, setCat] = useState<string>('Todas')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (paused || nSlides <= 1) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    timer.current = setTimeout(() => setSlide((s) => (s + 1) % nSlides), 6000)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [slide, paused, nSlides])

  const go = useCallback((i: number) => setSlide(((i % nSlides) + nSlides) % nSlides), [nSlides])

  const metaPct = sequenciaMeta.metaDiariaXp > 0 ? Math.min(1, sequenciaMeta.xpHoje / sequenciaMeta.metaDiariaXp) : 0
  const metaR = 25, metaC = 2 * Math.PI * metaR
  const nivelPct = usuario.xpNivelMax > 0 ? Math.min(1, usuario.xpNivelAtual / usuario.xpNivelMax) : 0
  const nivelR = 68.5, nivelC = 2 * Math.PI * nivelR
  const nivelRmob = 29, nivelCmob = 2 * Math.PI * nivelRmob
  const streakTxt = `${sequenciaMeta.diasSeguidos} ${sequenciaMeta.diasSeguidos === 1 ? 'dia' : 'dias'}`
  const faltamXp = Math.max(0, usuario.xpNivelMax - usuario.xpNivelAtual)

  // Barra de 20 segmentos p/ "Continue" (1 dourado = posição atual).
  const segTotal = 20
  const segAtual = continuar ? Math.round((continuar.questaoAtual / continuar.totalQuestoes) * segTotal) : 0
  const segDourado = Math.max(0, segAtual - 1)

  const cats = ['Todas', ...Array.from(new Set(pastas.map((p) => p.categoria)))]
  const pastasFilt = cat === 'Todas' ? pastas : pastas.filter((p) => p.categoria === cat)

  const onClickSafe = (e: React.MouseEvent) => e.preventDefault()
  // Link REAL fora do preview (no preview tudo é no-op). Usado nos banners do carrossel, que
  // navegam p/ o link configurado no admin (b.link → cta.url). Sem url válida, fica no-op.
  const linkReal = (url?: string): { href: string; onClick?: (e: React.MouseEvent) => void } =>
    !preview && url && url !== '#' ? { href: url } : { href: '#', onClick: onClickSafe }
  // Banner tem link REAL clicável? (fora do preview). Banner só-imagem sem link = puramente decorativo.
  const temLink = (url?: string) => !preview && !!url && url !== '#'

  // `color: var(--ink)` garante que textos SEM cor explícita (ex.: títulos <h3>) não herdem o cinza do shell.
  const style = { ...internaTokensStyle('vnd', theme), ...vndExtras(theme), color: 'var(--ink)', minHeight: '100%' } as React.CSSProperties

  const resumoStats = [
    { v: resumo.simuladosFeitos, l: 'simulados feitos' },
    { v: resumo.questoesResolvidas.toLocaleString('pt-BR'), l: 'questões resolvidas' },
    { v: `${resumo.taxaAcerto}%`, l: 'taxa de acerto' },
    { v: resumo.pendentes, l: 'pendentes' },
  ]

  return (
    <div className={cn('hvn-root', 'app')} style={style}>
      <style>{CSS}</style>
      <style>{tickCss}</style>

      {/* ===================== DESKTOP ===================== */}
      <div className="hvn-desk">
        {/* Hero carrossel */}
        <section className="hvn-hero up" aria-roledescription="carrossel" aria-label="Destaques" style={{ position: 'relative', overflow: 'hidden', height: 360 }}>
          <div
            className="hvn-track"
            style={{ display: 'flex', height: '100%', width: `${nSlides * 100}%`, transform: `translateX(-${(slide * 100) / nSlides}%)`, transition: 'transform .7s cubic-bezier(.6,.05,.2,1)' }}
          >
            {/* Slide 0 — boas-vindas */}
            <div style={{ position: 'relative', flex: `0 0 ${100 / nSlides}%`, height: '100%' }}>
              <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'linear-gradient(120deg,#041A10 0%,#0B4A2E 55%,#12643D 100%)', color: '#FFFFFF' }}>
                <div className="hvn-dotsbg" style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(185,245,212,.18) 1.2px,transparent 1.8px)', backgroundSize: '22px 22px', WebkitMaskImage: 'linear-gradient(90deg,#000 30%,rgba(0,0,0,.4))', maskImage: 'linear-gradient(90deg,#000 30%,rgba(0,0,0,.4))' }} />
                <div className="hvn-glow" aria-hidden style={{ position: 'absolute', right: 120, top: -120, width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(closest-side,rgba(63,213,138,.35),rgba(63,213,138,0))' }} />
                <svg className="hvn-chev hvn-c1" viewBox="0 0 200 120" aria-hidden preserveAspectRatio="none" style={{ position: 'absolute', right: '-4%', width: '62%', height: 220, bottom: -90, pointerEvents: 'none' }}><path d="M0 0 L100 112 L200 0" fill="none" stroke="rgba(232,200,119,.55)" strokeWidth={2} vectorEffect="non-scaling-stroke" /></svg>
                <svg className="hvn-chev hvn-c2" viewBox="0 0 200 120" aria-hidden preserveAspectRatio="none" style={{ position: 'absolute', right: '-4%', width: '62%', height: 220, bottom: -50, pointerEvents: 'none' }}><path d="M0 0 L100 112 L200 0" fill="none" stroke="rgba(185,245,212,.14)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" /></svg>
                <svg className="hvn-chev hvn-c3" viewBox="0 0 200 120" aria-hidden preserveAspectRatio="none" style={{ position: 'absolute', right: '-4%', width: '62%', height: 220, bottom: -10, pointerEvents: 'none' }}><path d="M0 0 L100 112 L200 0" fill="none" stroke="rgba(185,245,212,.1)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" /></svg>
                <span className="hvn-sweep" aria-hidden />
                <div style={{ position: 'relative', height: '100%', maxWidth: 1376, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40, padding: '0 80px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
                    <h1 style={{ margin: 0, fontSize: 50, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, color: '#FFFFFF' }}>Olá, {usuario.nome}</h1>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: '#CFE3D7', lineHeight: '1.2em' }}>
                      Rumo a{' '}
                      <span style={{ display: 'inline-block', height: '1.2em', overflow: 'hidden', verticalAlign: 'bottom' }}>
                        <span className="hvn-tick" style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2em', color: '#F1D48A' }}>
                          {rotativo.map((r, i) => <span key={i}>{r}.</span>)}
                          {animaRot && <span>{rotativo[0]}.</span>}
                        </span>
                      </span>
                    </div>
                  </div>
                  {gamOn && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <div style={{ position: 'relative', width: 150, height: 150, flexShrink: 0 }}>
                        <svg viewBox="0 0 150 150" style={{ width: 150, height: 150, transform: 'rotate(-90deg)' }}>
                          <defs><linearGradient id="hvn-vr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5BE39E" /><stop offset="1" stopColor="#E8C877" /></linearGradient></defs>
                          <circle cx="75" cy="75" r={nivelR} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={11} />
                          <circle className="hvn-ring" cx="75" cy="75" r={nivelR} fill="none" stroke="url(#hvn-vr)" strokeWidth={11} strokeLinecap="round" strokeDasharray={nivelC} strokeDashoffset={nivelC * (1 - nivelPct)} style={{ ['--c' as string]: nivelC }} />
                        </svg>
                        <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1, color: '#FFFFFF' }}>
                          <b style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-0.05em' }}>{usuario.nivel}</b>
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.2em', color: '#B9F5D4', marginTop: 4 }}>NÍVEL</span>
                        </span>
                      </div>
                      <span style={{ fontSize: 13, color: '#CFE3D7' }}><b style={{ color: '#FFFFFF' }}>{usuario.tituloNivel}</b> · {usuario.xpNivelAtual}/{usuario.xpNivelMax} XP</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { ic: <Flame size={18} />, c: '#FFB38A', v: streakTxt, l: 'sequência atual' },
                        { ic: <Zap size={18} />, c: '#B9F5D4', v: `${usuario.xpTotal.toLocaleString('pt-BR')} XP`, l: 'total acumulado' },
                        { ic: <Trophy size={18} />, c: '#F1D48A', v: `Liga ${usuario.liga}`, l: `${usuario.posicaoLiga}º lugar` },
                      ].map((t, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 16, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(185,245,212,.16)', minWidth: 190 }}>
                          <span style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,.08)', color: t.c, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{t.ic}</span>
                          <div style={{ lineHeight: 1.2 }}>
                            <b style={{ display: 'block', fontSize: 18, fontWeight: 800 }}>{t.v}</b>
                            <span style={{ fontSize: 11.5, color: '#B7D3C3' }}>{t.l}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  )}
                </div>
              </div>
            </div>

            {/* Slides 1–4 — destaques */}
            {slideDest.map((d, i) => (
              <div key={i} style={{ position: 'relative', flex: `0 0 ${100 / nSlides}%`, height: '100%' }}>
                <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: SLIDE_BG[i % SLIDE_BG.length], color: '#FFFFFF' }}>
                  {d.imagem ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.imagem} alt={d.titulo || 'Banner'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      {d.titulo ? <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(0,0,0,.58),rgba(0,0,0,.18) 52%,transparent)' }} /> : null}
                    </>
                  ) : (
                    <>
                      {dotsOverlay(22, 0.2)}
                      <svg viewBox="0 0 32 32" aria-hidden style={{ position: 'absolute', right: '6%', top: -60, width: 460, height: 460, opacity: 0.12 }}><path fill="#B9F5D4" d={VND_SVG} /></svg>
                      {d.fundoTexto ? <span aria-hidden style={{ position: 'absolute', right: '12%', top: '50%', transform: 'translateY(-50%)', fontSize: 150, fontWeight: 800, letterSpacing: '-0.06em', color: 'rgba(255,255,255,.1)' }}>{d.fundoTexto}</span> : null}
                    </>
                  )}
                  {(!d.imagem || d.titulo) && (
                  <div style={{ position: 'relative', zIndex: 1, height: '100%', maxWidth: 1376, margin: '0 auto', padding: '0 112px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
                    {d.eyebrow ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: '#F1D48A' }}>
                        <span className="hvn-live" style={{ width: 7, height: 7, borderRadius: '50%', background: '#5BE39E' }} />EM DESTAQUE · {d.eyebrow}
                      </span>
                    ) : null}
                    <h2 style={{ margin: 0, maxWidth: 640, fontSize: 46, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.04 }}>{d.titulo}</h2>
                    {d.subtitulo ? <p style={{ margin: 0, fontSize: 16, color: '#CFE3D7' }}>{d.subtitulo}</p> : null}
                    {/* Botão só em slides de TEXTO (sem imagem). Banner de imagem não tem botão. */}
                    {!d.imagem && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                      <a className="hvn-gold" {...linkReal(d.cta.url)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 48, padding: '0 22px', borderRadius: 14, color: '#2A1F02', fontWeight: 800, fontSize: 14.5 }}>{d.cta.rotulo}<ArrowRight size={15} /></a>
                    </div>
                    )}
                  </div>
                  )}
                  {/* Banner de imagem: slide inteiro clicável (sem botão) SÓ quando há link configurado. */}
                  {d.imagem && temLink(d.cta.url) ? <a href={d.cta.url} aria-label={d.cta.rotulo || 'Abrir banner'} style={{ position: 'absolute', inset: 0, zIndex: 3 }} /> : null}
                </div>
              </div>
            ))}
          </div>

          <button type="button" aria-label="Anterior" onClick={() => go(slide - 1)} className="hvn-arr" style={{ position: 'absolute', top: '50%', left: 24, transform: 'translateY(-50%)', zIndex: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', width: 46, height: 46, borderRadius: '50%', border: '1.5px solid rgba(232,200,119,.7)', background: 'rgba(4,26,16,.45)', color: '#F1D48A', boxShadow: '0 8px 20px -10px rgba(0,0,0,.6)' }}><ChevronLeft size={18} strokeWidth={2.2} /></button>
          <button type="button" aria-label="Próximo" onClick={() => go(slide + 1)} className="hvn-arr" style={{ position: 'absolute', top: '50%', right: 24, transform: 'translateY(-50%)', zIndex: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', width: 46, height: 46, borderRadius: '50%', border: '1.5px solid rgba(232,200,119,.7)', background: 'rgba(4,26,16,.45)', color: '#F1D48A', boxShadow: '0 8px 20px -10px rgba(0,0,0,.6)' }}><ChevronRight size={18} strokeWidth={2.2} /></button>

          <div style={{ position: 'absolute', left: 0, right: 0, justifyContent: 'center', bottom: 18, zIndex: 3, display: 'flex', alignItems: 'center', gap: 7 }}>
            {Array.from({ length: nSlides }).map((_, i) => (
              <button key={i} type="button" aria-label={`Banner ${i + 1}`} onClick={() => go(i)} className="hvn-cdot" style={{ width: i === slide ? 28 : 8, height: 8, padding: 0, border: 0, borderRadius: 99, background: i === slide ? '#E8C877' : 'rgba(255,255,255,.45)' }} />
            ))}
          </div>
          <div style={{ position: 'absolute', right: 24, bottom: 10, zIndex: 4 }}>
            <button type="button" className="hvn-cpause" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Retomar banner' : 'Pausar banner (fixar)'} title={paused ? 'Retomar banner' : 'Pausar banner (fixar)'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', border: 0, background: 'linear-gradient(180deg,#F1D48A,#D8B45A)', color: '#2A1F02', boxShadow: '0 8px 18px -8px rgba(216,180,90,.8)' }}>
              {paused
                ? <svg viewBox="0 0 24 24" aria-hidden style={{ width: 14, height: 14 }}><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></svg>
                : <svg viewBox="0 0 24 24" aria-hidden style={{ width: 14, height: 14 }}><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" /></svg>}
            </button>
          </div>
        </section>

        <main style={{ maxWidth: 1376, margin: '0 auto', padding: '24px 32px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Continue + Meta & sequência */}
          <div className="up hvn-u2" style={{ display: 'grid', gridTemplateColumns: gamOn ? '2fr 1fr' : '1fr', gap: 18 }}>
            {continuar ? (
              <div style={CARD}>
                <div style={{ display: 'flex', gap: 18, alignItems: 'stretch' }}>
                  <div style={{ width: 150, borderRadius: 18, overflow: 'hidden', flexShrink: 0 }}>
                    <Cover rotulo={continuar.capa.rotulo} sub={continuar.capa.sub} grad="#0B3340,#1C7A8C" big={26} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.2em', color: 'var(--goldInk)' }}>CONTINUE DE ONDE PAROU</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{continuar.ultimaAtividade}</span>
                    </div>
                    <b style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{continuar.titulo}</b>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {Array.from({ length: segTotal }).map((_, i) => (
                        <span key={i} style={{ flex: 1, height: 8, borderRadius: 3, background: i < segDourado ? 'var(--brand)' : i === segDourado ? 'var(--gold)' : 'var(--track)' }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12.5, color: 'var(--muted)', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><FileDown size={14} />Questão {continuar.questaoAtual} de {continuar.totalQuestoes}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Clock size={14} />{continuar.tempoRestante} restantes</span>
                      {typeof continuar.acertos === 'number' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--brand)', fontWeight: 700 }}><Check size={14} />{continuar.acertos} acertos</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
                      <a className="hvn-cta" href="#" onClick={onClickSafe} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, color: '#FFFFFF', fontWeight: 800, fontSize: 14 }}><Play size={14} fill="currentColor" stroke="none" />Retomar simulado</a>
                      <a href="#" onClick={onClickSafe} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 46, padding: '0 16px', borderRadius: 14, border: '1px solid var(--line)', color: 'var(--ink)', fontWeight: 700, fontSize: 13 }}><FileDown size={15} />Caderno</a>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
                  {resumoStats.map((s, i) => (
                    <div key={i}>
                      <b style={{ display: 'block', fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{s.v}</b>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{s.l}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 14 }}>Nenhum simulado em andamento.</div>
            )}

            {/* Meta & sequência (gamificação) */}
            {gamOn && (
            <div style={CARD}>
              <CardHead icon={<Flame size={16} />} title="Meta & sequência" color="#F0773A" right={<span style={{ height: 26, padding: '0 11px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{streakTxt}</span>} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{ position: 'relative', width: 58, height: 58, flexShrink: 0 }}>
                  <svg viewBox="0 0 58 58" style={{ width: 58, height: 58, transform: 'rotate(-90deg)' }}>
                    <defs><linearGradient id="hvn-vm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5BE39E" /><stop offset="1" stopColor="#E8C877" /></linearGradient></defs>
                    <circle cx="29" cy="29" r={metaR} fill="none" stroke="var(--track)" strokeWidth={6} />
                    <circle className="hvn-ring" cx="29" cy="29" r={metaR} fill="none" stroke="url(#hvn-vm)" strokeWidth={6} strokeLinecap="round" strokeDasharray={metaC} strokeDashoffset={metaC * (1 - metaPct)} style={{ ['--c' as string]: metaC }} />
                  </svg>
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1, color: 'var(--ink)' }}>
                    <b style={{ fontSize: 13 }}>{sequenciaMeta.xpHoje}</b>
                    <span style={{ fontSize: 9, color: 'var(--muted)' }}>/{sequenciaMeta.metaDiariaXp}</span>
                  </span>
                </div>
                <div>
                  <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)' }}>Meta diária · {sequenciaMeta.xpHoje}/{sequenciaMeta.metaDiariaXp} XP</b>
                  <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Um simulado hoje garante sua sequência.</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {sequenciaMeta.semana.map((d, i) => {
                  const hoje = i === sequenciaMeta.semana.length - 1
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                      <span className={cn(d.estudou && 'hvn-fire')} style={{ width: '100%', height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(d.estudou ? { background: 'rgba(240,119,58,.15)', color: '#FF9600' } : hoje ? { background: 'var(--chip)', color: 'var(--brand)', boxShadow: 'inset 0 0 0 2px var(--brand)' } : { background: 'var(--surface2)', color: 'var(--muted2)' }) }}>
                        {FLAME_ICON}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: hoje ? 'var(--ink)' : 'var(--muted)' }}>{d.dia}</span>
                    </div>
                  )
                })}
              </div>
              {checked ? (
                <div style={{ marginTop: 16, height: 46, borderRadius: 14, background: 'var(--chip)', color: 'var(--brand)', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Check size={16} />Check-in feito · +{sequenciaMeta.bauXp} XP</div>
              ) : (
                <button className="hvn-gold" type="button" onClick={() => setChecked(true)} style={{ marginTop: 16, width: '100%', height: 46, border: 0, borderRadius: 14, color: '#2A1F02', fontWeight: 800, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Calendar size={16} />Fazer check-in de hoje</button>
              )}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
                <Gift size={18} style={{ color: 'var(--goldInk)' }} />
                <span>Baú da sequência: <b style={{ color: 'var(--goldInk)' }}>+{sequenciaMeta.bauXp} XP</b> ao completar {sequenciaMeta.bauDias} dias.</span>
              </div>
            </div>
            )}
          </div>

          {/* Missões · Desempenho · Sua semana */}
          <div className="up hvn-u3" style={{ display: 'grid', gridTemplateColumns: gamOn ? 'repeat(3,1fr)' : 'repeat(2,1fr)', gap: 18 }}>
            {gamOn && (
            <div style={CARD}>
              <CardHead icon={<Zap size={16} />} title="Missões de hoje" right={<span style={{ fontSize: 11.5, color: 'var(--muted)' }}>renova à {data.renovaEm}</span>} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {missoes.map((m, i) => {
                  const done = m.progresso >= m.total
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, background: 'var(--surface2)' }}>
                      <span style={{ width: 22, height: 22, borderRadius: 7, border: '2px solid var(--line2)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...(done ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff' } : {}) }}>{done && <Check size={13} />}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{m.titulo}</span>
                        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{m.progresso}/{m.total} concluído</span>
                      </div>
                      <span style={{ height: 26, padding: '0 10px', borderRadius: 99, background: 'var(--goldBg)', color: 'var(--goldInk)', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>+{m.xp} XP</span>
                    </div>
                  )
                })}
              </div>
            </div>
            )}

            <div style={CARD}>
              <CardHead icon={<BarChart3 size={16} />} title="Desempenho por matéria" right={<SecHeaderLink label="Relatório" />} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {desempenho.slice(0, 5).map((d, i) => {
                  const baixo = d.pctAcerto < 60
                  return (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{d.materia}</span>
                        <b style={{ color: baixo ? 'var(--goldInk)' : 'var(--brand)' }}>{d.pctAcerto}%</b>
                      </div>
                      <div style={{ height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                        <span className="hvn-bar" style={{ display: 'block', height: '100%', width: `${d.pctAcerto}%`, borderRadius: 99, background: baixo ? 'linear-gradient(90deg,#E8C877,#D8A23A)' : 'linear-gradient(90deg,#1E9E5E,#3FD58A)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={CARD}>
              <CardHead icon={<Calendar size={16} />} title="Sua semana" right={<SecHeaderLink label="Cronograma" />} />
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 18 }}>
                <span style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: 'var(--line2)', borderRadius: 2 }} />
                {agenda.map((a, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: -18, top: 4, width: 12, height: 12, borderRadius: '50%', background: i === 0 ? 'var(--gold)' : 'var(--surface)', border: `2px solid ${i === 0 ? 'var(--gold)' : 'var(--line2)'}` }} />
                    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', color: 'var(--goldInk)' }}>{a.diaSemana} · {a.data}</span>
                    <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)', marginTop: 2 }}>{a.titulo}</b>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{a.detalhe}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Simulados recentes */}
          <section className="up hvn-u4">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em' }}>Simulados recentes</h3>
              <SecHeaderLink label="Ver todos" />
            </div>
            <div className="hvn-grid4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
              {recentes.map((s, i) => <RecenteCard key={s.id} s={s} grad={COVER_BG[i % COVER_BG.length]} />)}
            </div>
          </section>

          {/* Pastas */}
          <section className="up hvn-u5">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em' }}>Pastas de simulados</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {cats.map((c) => {
                  const on = c === cat
                  return (
                    <button key={c} type="button" onClick={() => setCat(c)} style={{ height: 32, padding: '0 13px', borderRadius: 99, fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', cursor: 'pointer', ...(on ? { background: 'var(--brand)', color: '#FFFFFF', border: '1px solid var(--brand)' } : { border: '1px solid var(--line)', color: 'var(--muted)', background: 'var(--surface)' }) }}>{c}</button>
                  )
                })}
              </div>
            </div>
            <div className="hvn-grid4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
              {pastasFilt.map((p, i) => (
                <a key={p.id} href="#" onClick={onClickSafe} className="hvn-lift" style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 22, overflow: 'hidden' }}>
                  <div style={{ height: 120 }}><Cover rotulo={p.rotuloCapa} sub={p.subCapa} grad={COVER_BG[i % COVER_BG.length]} big={26} /></div>
                  <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</b>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{p.qtdSimulados} simulados</span>
                    </div>
                    <span style={{ width: 30, height: 30, borderRadius: 10, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ArrowRight size={14} /></span>
                  </div>
                </a>
              ))}
            </div>
          </section>

          {/* Outros simulados */}
          <section className="up hvn-u6">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Outros simulados</h3>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12, fontWeight: 800 }}><span className="hvn-live" style={{ width: 6, height: 6, borderRadius: '50%', background: '#2EC77A' }} />Disponíveis · {outrosDisponiveis}</span>
            </div>
            <div className="hvn-grid4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
              {outros.map((s, i) => <RecenteCard key={s.id} s={s} grad={COVER_BG[(i + 2) % COVER_BG.length]} />)}
            </div>
          </section>
        </main>
      </div>

      {/* ===================== MOBILE ===================== */}
      <div className="hvn-mob" style={{ padding: '14px 18px 96px', flexDirection: 'column', gap: 20 }}>
        {/* Hero saudação (sem carrossel) */}
        <section style={{ position: 'relative', overflow: 'hidden', margin: '0 -18px', padding: '18px 18px 22px', background: 'linear-gradient(165deg,#062A1B 0%,#0B4A2E 60%,#12643D 100%)', color: '#FFFFFF' }}>
          <div className="hvn-dotsbg" style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(185,245,212,.18) 1.2px,transparent 1.8px)', backgroundSize: '20px 20px' }} />
          <span className="hvn-sweep" aria-hidden />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.045em', color: '#FFFFFF' }}>Olá, {usuario.nome}</h1>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#CFE3D7', marginTop: 2, lineHeight: '1.2em' }}>
                Rumo a{' '}
                <span style={{ display: 'inline-block', height: '1.2em', overflow: 'hidden', verticalAlign: 'bottom' }}>
                  <span className="hvn-tick" style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2em', color: '#F1D48A' }}>
                    {rotativo.map((r, i) => <span key={i}>{r}.</span>)}
                    {animaRot && <span>{rotativo[0]}.</span>}
                  </span>
                </span>
              </div>
            </div>
            {gamOn && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, borderRadius: 18, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(185,245,212,.16)' }}>
              <div style={{ position: 'relative', width: 66, height: 66, flexShrink: 0 }}>
                <svg viewBox="0 0 66 66" style={{ width: 66, height: 66, transform: 'rotate(-90deg)' }}>
                  <defs><linearGradient id="hvn-vrm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5BE39E" /><stop offset="1" stopColor="#E8C877" /></linearGradient></defs>
                  <circle cx="33" cy="33" r={nivelRmob} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={6} />
                  <circle className="hvn-ring" cx="33" cy="33" r={nivelRmob} fill="none" stroke="url(#hvn-vrm)" strokeWidth={6} strokeLinecap="round" strokeDasharray={nivelCmob} strokeDashoffset={nivelCmob * (1 - nivelPct)} style={{ ['--c' as string]: nivelCmob }} />
                </svg>
                <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1, color: '#FFFFFF' }}>
                  <b style={{ fontSize: 21, fontWeight: 800 }}>{usuario.nivel}</b>
                  <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '.14em', color: '#B9F5D4', marginTop: 2 }}>NÍVEL</span>
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b>{usuario.tituloNivel}</b><span style={{ color: '#B9F5D4' }}>{usuario.xpNivelAtual}/{usuario.xpNivelMax} XP</span></div>
                <div style={{ height: 7, borderRadius: 99, background: 'rgba(255,255,255,.14)', margin: '8px 0 6px', overflow: 'hidden' }}><span className="hvn-bar" style={{ display: 'block', width: `${nivelPct * 100}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#3FD58A,#E8C877)' }} /></div>
                <span style={{ fontSize: 12, color: '#CFE3D7' }}>Faltam <b style={{ color: '#F1D48A' }}>{faltamXp} XP</b> para o nível {usuario.nivel + 1}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {[
                { ic: <Flame size={15} />, c: '#FFB38A', v: sequenciaMeta.diasSeguidos, l: 'dias seguidos' },
                { ic: <Zap size={15} />, c: '#B9F5D4', v: usuario.xpTotal.toLocaleString('pt-BR'), l: 'XP total' },
                { ic: <Trophy size={15} />, c: '#F1D48A', v: usuario.liga, l: 'sua liga' },
              ].map((t, i) => (
                <div key={i} style={{ padding: 10, borderRadius: 14, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(185,245,212,.14)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 15, fontWeight: 800, color: t.c }}>{t.ic}{t.v}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: '#B7D3C3' }}>{t.l}</span>
                </div>
              ))}
            </div>
            </>)}
          </div>
        </section>

        {/* Carrossel de destaques 196px */}
        <section aria-roledescription="carrossel" aria-label="Destaques" style={{ position: 'relative', overflow: 'hidden', height: 196, borderRadius: 20 }}>
          <div className="hvn-track" style={{ display: 'flex', height: '100%', width: `${slideDest.length * 100}%`, transform: `translateX(-${(Math.min(slide, slideDest.length - 1) * 100) / slideDest.length}%)`, transition: 'transform .7s cubic-bezier(.6,.05,.2,1)' }}>
            {slideDest.map((d, i) => (
              <div key={i} style={{ position: 'relative', flex: `0 0 ${100 / slideDest.length}%`, height: '100%' }}>
                <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 20, background: SLIDE_BG[i % SLIDE_BG.length], color: '#FFFFFF' }}>
                  {d.imagem ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.imagem} alt={d.titulo || 'Banner'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      {d.titulo ? <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg,rgba(0,0,0,.6),rgba(0,0,0,.1) 55%,transparent)' }} /> : null}
                    </>
                  ) : (
                    <>
                      {dotsOverlay(18, 0.2)}
                      <svg viewBox="0 0 32 32" aria-hidden style={{ position: 'absolute', right: -30, top: -40, width: 170, height: 170, opacity: 0.13 }}><path fill="#B9F5D4" d={VND_SVG} /></svg>
                    </>
                  )}
                  {(!d.imagem || d.titulo) && (
                  <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '0 18px 44px' }}>
                    <div style={{ minWidth: 0 }}>
                      {d.eyebrow ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10.5, fontWeight: 800, letterSpacing: '.2em', color: '#F1D48A' }}><span className="hvn-live" style={{ width: 6, height: 6, borderRadius: '50%', background: '#5BE39E' }} />{d.eyebrow}</span> : null}
                      <b style={{ display: 'block', fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, margin: '6px 0 4px' }}>{d.titulo}</b>
                      {d.subtitulo ? <span style={{ fontSize: 12, color: '#CFE3D7' }}>{d.subtitulo}</span> : null}
                    </div>
                    {!d.imagem && (
                    <a className="hvn-gold" {...linkReal(d.cta.url)} style={{ flexShrink: 0, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 14px', borderRadius: 13, color: '#2A1F02', fontWeight: 800, fontSize: 13 }}>{d.cta.rotulo}<ArrowRight size={15} /></a>
                    )}
                  </div>
                  )}
                  {d.imagem && temLink(d.cta.url) ? <a href={d.cta.url} aria-label={d.cta.rotulo || 'Abrir banner'} style={{ position: 'absolute', inset: 0, zIndex: 3 }} /> : null}
                </div>
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', left: 18, bottom: 12, zIndex: 3, display: 'flex', alignItems: 'center', gap: 7 }}>
            {slideDest.map((_, i) => (
              <button key={i} type="button" aria-label={`Banner ${i + 1}`} onClick={() => setSlide(i)} className="hvn-cdot" style={{ width: Math.min(slide, slideDest.length - 1) === i ? 28 : 8, height: 8, padding: 0, border: 0, borderRadius: 99, background: Math.min(slide, slideDest.length - 1) === i ? '#E8C877' : 'rgba(255,255,255,.45)' }} />
            ))}
          </div>
          <div style={{ position: 'absolute', right: 16, bottom: 10, zIndex: 4 }}>
            <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Retomar banner' : 'Pausar banner (fixar)'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', border: 0, background: 'linear-gradient(180deg,#F1D48A,#D8B45A)', color: '#2A1F02', boxShadow: '0 8px 18px -8px rgba(216,180,90,.8)' }}>
              {paused
                ? <svg viewBox="0 0 24 24" aria-hidden style={{ width: 14, height: 14 }}><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></svg>
                : <svg viewBox="0 0 24 24" aria-hidden style={{ width: 14, height: 14 }}><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" /></svg>}
            </button>
          </div>
        </section>

        {/* Atalhos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {[
            { ic: <BookText size={18} />, l: 'Lei Seca' },
            { ic: <Scale size={18} />, l: 'Juris' },
            { ic: <Calendar size={18} />, l: 'Cronograma' },
            { ic: <Lightbulb size={18} />, l: 'Para você' },
          ].map((a, i) => (
            <a key={i} href="#" onClick={onClickSafe} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '12px 4px', borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>
              <span style={{ width: 40, height: 40, borderRadius: 13, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{a.ic}</span>{a.l}
            </a>
          ))}
        </div>

        {/* Continue (sem capa/stats) */}
        {continuar && (
          <div style={{ ...CARD, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.2em', color: 'var(--goldInk)' }}>CONTINUE DE ONDE PAROU</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{continuar.ultimaAtividade}</span>
            </div>
            <b style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)', display: 'block', marginBottom: 10 }}>{continuar.titulo}</b>
            <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
              {Array.from({ length: segTotal }).map((_, i) => (
                <span key={i} style={{ flex: 1, height: 7, borderRadius: 3, background: i < segDourado ? 'var(--brand)' : i === segDourado ? 'var(--gold)' : 'var(--track)' }} />
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Questão {continuar.questaoAtual} de {continuar.totalQuestoes} · {continuar.tempoRestante} restantes</div>
            <a className="hvn-cta" href="#" onClick={onClickSafe} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 14, color: '#FFFFFF', fontWeight: 800, fontSize: 14, width: '100%' }}><Play size={14} fill="currentColor" stroke="none" />Retomar simulado</a>
          </div>
        )}

        {/* Meta & sequência (mobile, gamificação) */}
        {gamOn && (
        <div style={CARD}>
          <CardHead icon={<Flame size={16} />} title="Meta & sequência" color="#F0773A" right={<span style={{ height: 26, padding: '0 11px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{streakTxt}</span>} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {sequenciaMeta.semana.map((d, i) => {
              const hoje = i === sequenciaMeta.semana.length - 1
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span className={cn(d.estudou && 'hvn-fire')} style={{ width: '100%', height: 36, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(d.estudou ? { background: 'rgba(240,119,58,.15)', color: '#FF9600' } : hoje ? { background: 'var(--chip)', color: 'var(--brand)', boxShadow: 'inset 0 0 0 2px var(--brand)' } : { background: 'var(--surface2)', color: 'var(--muted2)' }) }}>{FLAME_ICON}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: hoje ? 'var(--ink)' : 'var(--muted)' }}>{d.dia}</span>
                </div>
              )
            })}
          </div>
          {checked ? (
            <div style={{ height: 44, borderRadius: 14, background: 'var(--chip)', color: 'var(--brand)', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Check size={16} />Check-in feito · +{sequenciaMeta.bauXp} XP</div>
          ) : (
            <button className="hvn-gold" type="button" onClick={() => setChecked(true)} style={{ width: '100%', height: 44, border: 0, borderRadius: 14, color: '#2A1F02', fontWeight: 800, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Calendar size={16} />Fazer check-in de hoje</button>
          )}
        </div>
        )}

        {/* Missões (mobile, gamificação) */}
        {gamOn && (
        <div style={CARD}>
          <CardHead icon={<Zap size={16} />} title="Missões de hoje" right={<span style={{ fontSize: 11.5, color: 'var(--muted)' }}>renova à {data.renovaEm}</span>} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {missoes.map((m, i) => {
              const done = m.progresso >= m.total
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, background: 'var(--surface2)' }}>
                  <span style={{ width: 22, height: 22, borderRadius: 7, border: '2px solid var(--line2)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...(done ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff' } : {}) }}>{done && <Check size={13} />}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{m.titulo}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{m.progresso}/{m.total} concluído</span>
                  </div>
                  <span style={{ height: 26, padding: '0 10px', borderRadius: 99, background: 'var(--goldBg)', color: 'var(--goldInk)', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>+{m.xp} XP</span>
                </div>
              )
            })}
          </div>
        </div>
        )}

        {/* Recentes (scroll horizontal) */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em' }}>Simulados recentes</h3>
            <SecHeaderLink label="Ver todos" />
          </div>
          <div className="hvn-hs" style={{ display: 'flex', gap: 14, overflowX: 'auto', margin: '0 -18px', padding: '0 18px' }}>
            {recentes.map((s, i) => (
              <div key={s.id} style={{ flex: '0 0 228px' }}><RecenteCard s={s} grad={COVER_BG[i % COVER_BG.length]} /></div>
            ))}
          </div>
        </section>

        {/* Pastas (2 col) */}
        <section>
          <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em' }}>Pastas de simulados</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
            {pastas.map((p, i) => (
              <a key={p.id} href="#" onClick={onClickSafe} className="hvn-lift" style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden' }}>
                <div style={{ height: 96 }}><Cover rotulo={p.rotuloCapa} sub={p.subCapa} grad={COVER_BG[i % COVER_BG.length]} big={22} /></div>
                <div style={{ padding: '10px 12px' }}>
                  <b style={{ display: 'block', fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</b>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.qtdSimulados} simulados</span>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

/** Card de simulado (recentes/outros) — card VND 3D. */
function RecenteCard({ s, grad }: { s: HomeData['recentes'][number]; grad: string }) {
  const emAndamento = s.status === 'Em andamento'
  return (
    <div className="hvn-lift" style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 22, overflow: 'hidden', height: '100%' }}>
      <div style={{ height: 120 }}><Cover rotulo={s.capa.rotulo} sub={s.capa.sub || 'SIMULADO'} grad={grad} /></div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}><Clock size={12} />{s.status} · {s.tipo}</span>
          <b style={{ display: 'block', marginTop: 4, fontSize: 14.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.titulo}</b>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
          <a className="hvn-cta" href="#" onClick={(e) => e.preventDefault()} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 40, borderRadius: 12, color: '#FFFFFF', fontSize: 13, fontWeight: 800 }}>
            <Play size={12} fill="currentColor" stroke="none" />{emAndamento ? 'Continuar' : s.status === 'Concluído' ? 'Refazer' : 'Fazer agora'}
          </a>
          {s.cadernoUrl && (
            <a href="#" onClick={(e) => e.preventDefault()} aria-label="Baixar caderno" title="Baixar caderno" style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--line)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><FileDown size={16} /></a>
          )}
        </div>
      </div>
    </div>
  )
}

const CSS = `
.hvn-root{position:relative}
.hvn-root svg.lucide{stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.hvn-root .hvn-cta{background:linear-gradient(180deg,#14924F,#0C6E3C);box-shadow:0 12px 24px -14px rgba(15,122,68,.9),inset 0 1px 0 rgba(255,255,255,.2);transition:filter .15s,transform .15s;cursor:pointer}
.hvn-root .hvn-cta:hover,.hvn-root .hvn-gold:hover{filter:brightness(1.08);transform:translateY(-1px)}
.hvn-root .hvn-gold{background:linear-gradient(180deg,#F1D48A,#D8B45A);box-shadow:0 12px 24px -14px rgba(216,180,90,.9),inset 0 1px 0 rgba(255,255,255,.4);transition:filter .15s,transform .15s;cursor:pointer}
.hvn-root .hvn-lift{transition:transform .6s cubic-bezier(.22,1,.36,1),box-shadow .6s cubic-bezier(.22,1,.36,1),border-color .35s ease;will-change:transform;backface-visibility:hidden;cursor:pointer}
.hvn-root .hvn-lift:hover{transform:translateY(-8px) scale(1.015);box-shadow:0 30px 50px -28px rgba(6,60,35,.6),0 0 0 1px rgba(232,200,119,.45);border-color:transparent}
.hvn-root .hvn-lift .hvn-cov{transition:transform .8s cubic-bezier(.22,1,.36,1)}
.hvn-root .hvn-lift:hover .hvn-cov{transform:scale(1.08) rotate(-.6deg)}
.hvn-root .hvn-cov::after{content:'';position:absolute;top:0;bottom:0;left:-60%;width:40%;background:linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.22),rgba(255,255,255,0));transform:skewX(-18deg);transition:left 0s;pointer-events:none}
.hvn-root .hvn-lift:hover .hvn-cov::after{left:130%;transition:left .9s cubic-bezier(.22,1,.36,1)}
.hvn-root .hvn-dotsbg{animation:hvnDrift 30s linear infinite}
@keyframes hvnDrift{to{background-position:0 -110px}}
.hvn-root .hvn-glow{animation:hvnBreathe 5s ease-in-out infinite alternate}
@keyframes hvnBreathe{from{opacity:.6;transform:scale(.95)}to{opacity:1;transform:scale(1.05)}}
.hvn-root .hvn-chev{opacity:0;animation:hvnChevIn 1.2s cubic-bezier(.2,.8,.2,1) both,hvnFloat 8s ease-in-out infinite alternate}
.hvn-root .hvn-c1{animation-delay:.4s,1.6s}.hvn-root .hvn-c2{animation-delay:.55s,2.1s}.hvn-root .hvn-c3{animation-delay:.7s,2.6s}
@keyframes hvnChevIn{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
@keyframes hvnFloat{from{translate:0 0}to{translate:0 -14px}}
.hvn-root .hvn-sweep{position:absolute;top:-20%;bottom:-20%;width:24%;left:-30%;background:linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.07),rgba(255,255,255,0));transform:skewX(-18deg);pointer-events:none;animation:hvnSweep 8s ease-in-out 1.5s infinite}
@keyframes hvnSweep{0%{left:-30%}45%,100%{left:130%}}
.hvn-root .hvn-tick{animation:hvnTick 7.5s cubic-bezier(.6,.1,.2,1) 1.5s infinite}
@keyframes hvnTick{0%,22%{transform:translateY(0)}30%,55%{transform:translateY(-1.2em)}63%,88%{transform:translateY(-2.4em)}96%,100%{transform:translateY(-3.6em)}}
.hvn-root .hvn-live{animation:hvnBlink 1.6s ease-in-out infinite}
@keyframes hvnBlink{50%{opacity:.3}}
.hvn-root .up{animation:hvnUp .8s cubic-bezier(.2,.8,.2,1) both}
.hvn-root .hvn-u2{animation-delay:.1s}.hvn-root .hvn-u3{animation-delay:.2s}.hvn-root .hvn-u4{animation-delay:.3s}.hvn-root .hvn-u5{animation-delay:.4s}.hvn-root .hvn-u6{animation-delay:.5s}
@keyframes hvnUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.hvn-root .hvn-bar{transform-origin:0 50%;animation:hvnGrow 1.2s cubic-bezier(.2,.8,.2,1) .5s both}
@keyframes hvnGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.hvn-root .hvn-ring{animation:hvnRing 1.4s cubic-bezier(.2,.8,.2,1) .4s both}
@keyframes hvnRing{from{stroke-dashoffset:var(--c)}}
.hvn-root .hvn-fire{animation:hvnFirepop .7s cubic-bezier(.34,1.56,.64,1) .5s both}
@keyframes hvnFirepop{0%{transform:scale(0)}60%{transform:scale(1.18)}100%{transform:none}}
.hvn-root .hvn-cdot{transition:width .3s,background .3s;cursor:pointer}
.hvn-root .hvn-cpause,.hvn-root .hvn-arr{transition:transform .15s,filter .15s}
.hvn-root .hvn-cpause:hover{filter:brightness(1.12)}
.hvn-root .hvn-arr:hover{transform:translateY(-50%) scale(1.06)}
.hvn-root .hvn-hs::-webkit-scrollbar{display:none}
.hvn-root .hvn-hs{scrollbar-width:none}
.hvn-mob{display:none}
@media (max-width:900px){.hvn-desk{display:none}.hvn-mob{display:flex}}
@media (max-width:1180px) and (min-width:901px){.hvn-root .hvn-grid4{grid-template-columns:repeat(2,1fr)!important}.hvn-root .hvn-u2{grid-template-columns:1fr!important}.hvn-root .hvn-u3{grid-template-columns:1fr!important}}
@media (prefers-reduced-motion: reduce){.hvn-root *{animation:none!important;transition:none!important}}
`
