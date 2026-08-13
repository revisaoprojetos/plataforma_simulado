'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X, Megaphone, ChevronLeft, ChevronRight, Play, BookOpen, Clock, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Link do banner: se for URL externa (http/https), abre em NOVA aba (mantém o simulado aberto);
 *  se for rota interna, navega no app normalmente. */
function Alvo({ href, className, style, children, onClick, 'aria-label': ariaLabel }: { href: string; className?: string; style?: React.CSSProperties; children: React.ReactNode; onClick?: () => void; 'aria-label'?: string }) {
  if (/^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} aria-label={ariaLabel} className={className} style={style}>{children}</a>
  return <Link href={href} onClick={onClick} aria-label={ariaLabel} className={className} style={style}>{children}</Link>
}

export type PopupEstilo = 'classico' | 'sobre' | 'compacto' | 'cartaz' | 'lado' | 'faixa'
export type PopupPontas = 'arredondado' | 'quadrado'
export type BannerTextoPos =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
export type BannerTextoCor = 'claro' | 'escuro'
export type BannerTextoTam = 'pequeno' | 'medio' | 'grande'

/** Classes de fonte do texto do banner por tamanho (título | mensagem). */
const BANNER_TAM: Record<BannerTextoTam, { t: string; m: string }> = {
  pequeno: { t: 'text-lg sm:text-2xl', m: 'text-xs sm:text-sm' },
  medio: { t: 'text-2xl sm:text-4xl', m: 'text-sm sm:text-base' },
  grande: { t: 'text-3xl sm:text-5xl', m: 'text-base sm:text-lg' },
}

/** As 9 âncoras de posição do texto sobre o banner (grade 3×3). */
export const BANNER_POSICOES: BannerTextoPos[] = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

export type BannerPortal = {
  id: string; tipo: 'banner' | 'popup' | 'hero'; titulo: string | null; mensagem: string | null
  imagem_url: string | null; link: string | null; cor: string | null; ordem?: number
  estilo?: PopupEstilo | null; pontas?: PopupPontas | null // só p/ pop-up
  textoPos?: BannerTextoPos | null; textoCor?: BannerTextoCor | null; textoTam?: BannerTextoTam | null // texto sobre o banner (banner/destaque)
  textoX?: number | null; textoY?: number | null // posição livre do texto (0–100%), sobrepõe textoPos
  ocultarTitulo?: boolean | null; ocultarMensagem?: boolean | null // esconder título/mensagem no banner (mantém o valor)
  freq?: 'login' | 'sempre' | 'uma_vez' | null // frequência do pop-up
}

/** Âncora 3×3 → coordenadas X/Y (0–100%). Base para as barras de posição livre. */
export function posParaXY(pos: BannerTextoPos): { x: number; y: number } {
  const [v, h] = pos === 'center' ? ['center', 'center'] : pos.split('-')
  const x = h === 'left' ? 0 : h === 'right' ? 100 : 50
  const y = v === 'top' ? 0 : v === 'bottom' ? 100 : 50
  return { x, y }
}

/** Chip informativo do banner de simulado (ex.: disponibilidade, nº de questões, tipo, contagem). */
export type BannerChip = { label: string; tone?: 'ok' | 'muted'; icon?: 'book' | 'clock' }

/** KPIs do aluno exibidos no canto do banner de simulado. */
export type BannerStats = { simulados: number; notaMedia: number | null; melhorNota: number | null }

/** Slide de um simulado em destaque, renderizado COMO banner (fundo do próprio simulado). */
export type HeroSimSlide = {
  id: string
  kind: 'sim'
  capa: string | null
  cor: string
  titulo: string
  descricao: string | null
  link: string | null
  acao: string
  detalhesLink?: string | null // "Ver detalhes" (simulado único); ausente em banner de pasta
  chips?: BannerChip[] // disponibilidade + nº de questões + objetiva/discursiva (simulado) ou "N simulados" (pasta)
  stats?: BannerStats | null // KPIs do aluno ESPECÍFICOS deste alvo (simulado/pasta); cai no global se ausente
  destaqueAtivo?: boolean // mostrar o rótulo "Em destaque para você" acima do título (default true)
  destaqueTexto?: string | null // texto desse rótulo (default "Em destaque para você")
  fadeAtivo?: boolean // aplicar o degradê escuro sobre a imagem (default true)
  fadeNivel?: number // intensidade do degradê, 0–150 (100 = padrão)
  ordem?: number // posição global no carrossel (respeita a ordenação do console)
}

type Slide = ({ kind: 'img' } & BannerPortal) | HeroSimSlide

/**
 * Área de banners do topo da home do aluno. Um ÚNICO carrossel (estilo propaganda/Netflix,
 * um por vez) que reúne: banners de imagem (tipo 'banner'/'hero') E simulados em destaque
 * (fundo do próprio simulado + CTA). Também exibe o pop-up (modal 1x por navegador).
 */
export function BannersPortal({ banners, simulados = [], stats }: { banners: BannerPortal[]; simulados?: HeroSimSlide[]; stats?: BannerStats | null }) {
  const [popup, setPopup] = useState<BannerPortal | null>(null)

  // Frequência do pop-up (config por-aviso):
  //  'login'    → só logo após o login (marcador 'popup-login'), não a cada visita à home (padrão);
  //  'sempre'   → toda vez que a home carrega;
  //  'uma_vez'  → uma vez por navegador (localStorage).
  useEffect(() => {
    const pop = banners.find((b) => b.tipo === 'popup')
    if (!pop) return
    const freq = pop.freq ?? 'login'
    try {
      if (freq === 'uma_vez') {
        if (localStorage.getItem('popup-visto-' + pop.id)) return
        setPopup(pop)
      } else if (freq === 'sempre') {
        setPopup(pop)
      } else {
        const fresh = sessionStorage.getItem('popup-login') === '1'
        if (fresh) { sessionStorage.removeItem('popup-login'); setPopup(pop) }
      }
    } catch { /* SSR/priv */ }
  }, [banners])

  function fecharPopup() {
    if (popup && (popup.freq ?? 'login') === 'uma_vez') { try { localStorage.setItem('popup-visto-' + popup.id, '1') } catch {} }
    setPopup(null)
    // Avisa a celebração de XP/level-up para só aparecer DEPOIS do pop-up de entrada.
    try { window.dispatchEvent(new CustomEvent('portal:popup-fechado')) } catch {}
  }

  // Fecha no Esc enquanto o pop-up estiver aberto.
  useEffect(() => {
    if (!popup) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fecharPopup() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popup])

  // Um carrossel só: banners de imagem (banner/destaque) + simulados em destaque,
  // ORDENADOS pela ordem global do console (campo `ordem`), não agrupados por tipo.
  const slides: Slide[] = [
    ...banners.filter((b) => b.tipo === 'banner' || b.tipo === 'hero').map((b) => ({ kind: 'img' as const, ...b })),
    ...simulados,
  ].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))

  return (
    <>
      {slides.length > 0 && (
        // FULL-BLEED: cancela o padding do <main> (p-6) → ocupa até as laterais e cola no topo.
        <div className="-mx-6 -mt-6 mb-5">
          <Carrossel slides={slides} stats={stats} />
        </div>
      )}

      {popup && typeof document !== 'undefined' && createPortal(
        <div role="dialog" aria-modal="true" aria-label={popup.titulo ?? 'Aviso'} data-portal-popup
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={fecharPopup}>
          <PopupCard banner={popup} onFechar={fecharPopup} />
        </div>,
        document.body,
      )}
    </>
  )
}

/** Carrossel único (um slide por vez), auto-rotativo, molde 1920×500. Slides = imagem ou simulado. */
function Carrossel({ slides, stats }: { slides: Slide[]; stats?: BannerStats | null }) {
  const n = slides.length
  const [i, setI] = useState(0)
  const ir = (idx: number) => setI(((idx % n) + n) % n)

  // Reinicia a contagem a cada mudança de slide (manual ou automática): setTimeout + dep [i]
  // garante 6s cheios após passar a folha (evita "pular" logo depois de avançar na mão).
  useEffect(() => {
    if (n <= 1) return
    const t = setTimeout(() => setI((p) => (p + 1) % n), 6000)
    return () => clearTimeout(t)
  }, [n, i])

  return (
    <div className="group relative aspect-[1920/500] w-full overflow-hidden">
      {slides.map((s, idx) => (
        <div key={s.id} className={cn('absolute inset-0 transition-opacity duration-700 ease-out', idx === i ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0')}>
          {s.kind === 'sim' ? <SimSlide s={s} stats={stats} /> : <ImgSlide b={s} />}
        </div>
      ))}

      {n > 1 && (
        <>
          <button type="button" onClick={() => ir(i - 1)} aria-label="Anterior"
            className="absolute left-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur transition hover:bg-black/55 group-hover:opacity-100">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => ir(i + 1)} aria-label="Próximo"
            className="absolute right-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur transition hover:bg-black/55 group-hover:opacity-100">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-1.5">
            {slides.map((s, idx) => (
              <button key={s.id} type="button" onClick={() => ir(idx)} aria-label={`Ir para ${idx + 1}`}
                className={cn('h-1.5 rounded-full bg-white/60 transition-all', idx === i ? 'w-6 bg-white' : 'w-1.5 hover:bg-white/80')} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Banner de imagem (ou faixa colorida com texto quando não há imagem).
 *  Com imagem + título/mensagem, sobrepõe o texto na posição escolhida (`textoPos`). */
export function ImgSlide({ b, preview }: { b: BannerPortal; preview?: boolean }) {
  const cor = b.cor ?? '#6366f1'
  const mostraTitulo = !!b.titulo && !b.ocultarTitulo
  const mostraMsg = !!b.mensagem && !b.ocultarMensagem
  const temTexto = mostraTitulo || mostraMsg
  const claro = (b.textoCor ?? 'claro') === 'claro'
  const tam = BANNER_TAM[b.textoTam ?? 'medio']
  const base = posParaXY(b.textoPos ?? 'center')
  const x = Math.max(0, Math.min(100, b.textoX ?? base.x))
  const y = Math.max(0, Math.min(100, b.textoY ?? base.y))
  const talign = x < 34 ? 'text-left' : x > 66 ? 'text-right' : 'text-center'
  const scrim = y > 66
    ? 'linear-gradient(to top, rgba(0,0,0,.62), transparent 55%)'
    : y < 34
      ? 'linear-gradient(to bottom, rgba(0,0,0,.62), transparent 55%)'
      : 'radial-gradient(ellipse at center, rgba(0,0,0,.5), transparent 72%)'
  const conteudo = b.imagem_url ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={b.imagem_url} alt={b.titulo ?? ''} className="absolute inset-0 h-full w-full object-cover" />
      {temTexto && (
        <>
          {claro && <div className="pointer-events-none absolute inset-0" style={{ background: scrim }} />}
          <div className="pointer-events-none absolute inset-0 p-5 sm:p-8">
            <div className="relative h-full w-full">
              <div className={cn('absolute max-w-[80%]', talign)} style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-${x}%, -${y}%)` }}>
                {mostraTitulo && <p className={cn(tam.t, 'whitespace-pre-wrap font-extrabold leading-tight tracking-tight', claro ? 'text-white [text-shadow:0_2px_12px_rgba(0,0,0,.75)]' : 'text-slate-900')}>{b.titulo}</p>}
                {mostraMsg && <p className={cn('mt-1.5 whitespace-pre-wrap', tam.m, claro ? 'text-white/90 [text-shadow:0_1px_8px_rgba(0,0,0,.7)]' : 'text-slate-800')}>{b.mensagem}</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  ) : (
    <div className="absolute inset-0 flex items-center gap-3 p-4" style={{ background: cor + '14' }}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: cor + '22', color: cor }}><Megaphone className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        {mostraTitulo && <p className="text-sm font-semibold">{b.titulo}</p>}
        {mostraMsg && <p className="text-xs text-muted-foreground">{b.mensagem}</p>}
      </div>
    </div>
  )
  return b.link && !preview ? <Alvo href={b.link} aria-label={b.titulo ?? 'Abrir'} className="absolute inset-0">{conteudo}</Alvo> : <>{conteudo}</>
}

/** Simulado em destaque como banner: capa/cor de fundo + overlay com título, descrição, chips,
 *  ações (Fazer agora / Ver detalhes / favorito) e — no canto — os KPIs do aluno. */
export function SimSlide({ s, stats }: { s: HeroSimSlide; stats?: BannerStats | null }) {
  // Degradê escuro sobre a imagem (dá legibilidade ao texto à esquerda). Configurável por banner:
  // liga/desliga e intensidade (0–150; 100 = padrão). As alfas do padrão são escaladas pelo nível.
  const fadeAtivo = s.fadeAtivo !== false
  const f = Math.max(0, s.fadeNivel ?? 100) / 100
  const a = (base: number) => Math.min(1, base * f).toFixed(3)
  return (
    <div className="absolute inset-0">
      {s.capa
        ? <img src={s.capa} alt="" className="absolute inset-0 h-full w-full object-cover" /> // eslint-disable-line @next/next/no-img-element
        : <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${s.cor} 0%, #1a1030 75%, #0f0a1e 120%)` }} />}
      {fadeAtivo && <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, rgba(10,7,20,${a(0.94)}) 2%, rgba(10,7,20,${a(0.7)}) 42%, rgba(10,7,20,${a(0.14)}) 78%, rgba(10,7,20,${a(0.5)}) 100%)` }} />}

      {/* Conteúdo — recuado à esquerda p/ não ficar atrás da seta "anterior". */}
      <div className="relative flex h-full max-w-2xl flex-col justify-center py-5 pl-14 pr-6 sm:py-7 sm:pl-16 md:pl-20">
        {s.destaqueAtivo !== false && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 10px 1px rgba(52,211,153,.7)' }} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] sm:text-[11px]" style={{ color: 'var(--brand-accent)' }}>{s.destaqueTexto || 'Em destaque para você'}</span>
          </div>
        )}
        <h2 className="line-clamp-2 text-xl font-extrabold leading-[1.05] tracking-tight text-white drop-shadow-sm sm:text-3xl md:text-4xl">{s.titulo}</h2>
        {s.descricao && <p className="mt-1.5 line-clamp-2 max-w-lg text-xs text-white/75 sm:text-sm">{s.descricao}</p>}

        {s.chips && s.chips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {s.chips.map((c, k) => (
              <span key={k} className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur',
                c.tone === 'ok' ? 'border-emerald-400/35 bg-emerald-400/15 text-emerald-200' : 'border-white/18 bg-white/10 text-white/90',
              )}>
                {c.icon === 'book' && <BookOpen className="h-3.5 w-3.5" />}
                {c.icon === 'clock' && <Clock className="h-3.5 w-3.5" />}
                {c.label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {s.link && (
            <Alvo href={s.link} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold shadow-lg ring-1 ring-white/15 transition-transform hover:scale-[1.03]"
              style={{ background: `linear-gradient(135deg, ${s.cor}, color-mix(in oklab, ${s.cor} 62%, #f5e6b8))`, color: '#1b1036' }}>
              <Play className="h-4 w-4 fill-current" /> {s.acao}
            </Alvo>
          )}
          {s.detalhesLink && (
            <Alvo href={s.detalhesLink} className="inline-flex items-center gap-1.5 rounded-xl border border-white/16 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20">
              Ver detalhes <ArrowRight className="h-4 w-4" />
            </Alvo>
          )}
        </div>
      </div>

      {/* KPIs do aluno — canto inferior direito (some em telas estreitas).
          Usa as estatísticas ESPECÍFICAS do alvo (simulado/pasta) deste slide; sem elas, cai no global. */}
      {(() => {
        const kpi = s.stats ?? stats
        if (!kpi || kpi.simulados <= 0) return null
        return (
          <div className="pointer-events-none absolute bottom-4 right-5 hidden items-stretch gap-0 rounded-2xl border border-white/12 bg-black/25 backdrop-blur md:flex">
            <Kpi valor={kpi.simulados.toLocaleString('pt-BR')} rotulo="Simulados" />
            <Kpi valor={kpi.notaMedia != null ? kpi.notaMedia.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'} rotulo="Nota média" divisor />
            <Kpi valor={kpi.melhorNota != null ? kpi.melhorNota.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'} rotulo="Melhor nota" divisor />
          </div>
        )
      })()}
    </div>
  )
}

function Kpi({ valor, rotulo, divisor }: { valor: string; rotulo: string; divisor?: boolean }) {
  return (
    <div className={cn('px-4 py-3 text-center', divisor && 'border-l border-white/12')}>
      <div className="text-lg font-extrabold leading-none text-white sm:text-xl">{valor}</div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-white/60">{rotulo}</div>
    </div>
  )
}

/** Texto legível (claro/escuro) sobre uma cor de fundo, pela luminância. */
export function textoContraste(hex: string): string {
  const h = (hex || '').replace('#', '')
  if (h.length !== 6) return '#ffffff'
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.62 ? '#1b1036' : '#ffffff'
}

export type PopupDados = { titulo: string | null; mensagem: string | null; imagem_url: string | null; cor: string | null; link: string | null; estilo?: PopupEstilo | null; pontas?: PopupPontas | null }

export const POPUP_ESTILOS: { v: PopupEstilo; label: string }[] = [
  { v: 'classico', label: 'Clássico' },
  { v: 'sobre', label: 'Sobre a imagem' },
  { v: 'compacto', label: 'Compacto' },
  { v: 'cartaz', label: 'Cartaz (grande)' },
  { v: 'lado', label: 'Lado a lado' },
  { v: 'faixa', label: 'Faixa larga' },
]

/** Card do pop-up (visual reutilizado no portal do aluno e na prévia do admin).
 *  Estilos: 'classico' (imagem no topo + texto), 'sobre' (texto sobre a imagem),
 *  'compacto' (ícone + texto, sem imagem grande). Pontas arredondadas ou quadradas.
 *  `preview` = estático (CTA não navega, fechar é opcional). */
export function PopupCard({ banner, onFechar, preview }: { banner: PopupDados; onFechar?: () => void; preview?: boolean }) {
  const cor = banner.cor || '#6366f1'
  const txt = textoContraste(cor)
  const estilo: PopupEstilo = banner.estilo ?? 'classico'
  const quad = banner.pontas === 'quadrado'
  const rCard = quad ? 'rounded-none' : 'rounded-3xl'
  const rBtn = quad ? 'rounded-none' : 'rounded-xl'
  const rChip = quad ? 'rounded-none' : 'rounded-full'
  const anim = 'popup-in'
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const mostrarCTA = !!banner.link || preview
  const ctaStyle: React.CSSProperties = { background: `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 78%, #000))`, color: txt }
  const botaoCTA = (full?: boolean) => {
    if (!mostrarCTA) return null
    const cls = cn('inline-flex items-center justify-center gap-1.5 text-sm font-semibold shadow-md transition hover:opacity-95', rBtn, full ? 'w-full px-5 py-3' : 'px-5 py-2.5')
    return preview || !banner.link
      ? <span className={cls} style={ctaStyle}>Ver mais <ArrowRight className="h-4 w-4" /></span>
      : <Alvo href={banner.link} onClick={onFechar} className={cls} style={ctaStyle}>Ver mais <ArrowRight className="h-4 w-4" /></Alvo>
  }
  const CTA = botaoCTA()
  const Fechar = (dark?: boolean) => (
    <button type="button" onClick={onFechar}
      className={cn('px-4 py-2.5 text-sm font-medium transition-colors', rBtn, dark ? 'text-white/85 hover:bg-white/10' : 'border text-muted-foreground hover:bg-muted')}>Fechar</button>
  )
  const CloseX = (sobre?: boolean) => (
    <button type="button" onClick={onFechar} aria-label="Fechar"
      className={cn('absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center transition', quad ? 'rounded-none' : 'rounded-full',
        sobre ? 'bg-black/40 text-white ring-1 ring-white/25 backdrop-blur hover:bg-black/60' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
      <X className="h-4 w-4" />
    </button>
  )
  const Eyebrow = (dark?: boolean) => (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide', rChip)}
      style={dark ? { background: 'rgba(255,255,255,.16)', color: '#fff' } : { background: `color-mix(in oklab, ${cor} 16%, var(--card))`, color: cor }}>
      <Megaphone className="h-3.5 w-3.5" /> Aviso
    </span>
  )

  // ---- SOBRE A IMAGEM: texto e ações por cima da imagem, com degradê escuro ----
  if (estilo === 'sobre') {
    return (
      <div onClick={stop} className={cn('relative flex min-h-[22rem] w-full max-w-md flex-col justify-end overflow-hidden text-white shadow-2xl', rCard, anim)}>
        {banner.imagem_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={banner.imagem_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${cor}, #14101f)` }} />}
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(8,6,16,.92) 8%, rgba(8,6,16,.55) 42%, rgba(8,6,16,.06) 80%)' }} />
        {CloseX(true)}
        <div className="relative space-y-2 p-6">
          {Eyebrow(true)}
          {banner.titulo && <h3 className="whitespace-pre-wrap text-2xl font-bold leading-tight tracking-tight drop-shadow">{banner.titulo}</h3>}
          {banner.mensagem && <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{banner.mensagem}</p>}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">{Fechar(true)}{CTA}</div>
        </div>
      </div>
    )
  }

  // ---- COMPACTO: barra de cor + ícone + texto (sem imagem grande) ----
  if (estilo === 'compacto') {
    return (
      <div onClick={stop} className={cn('relative w-full max-w-md overflow-hidden bg-card text-foreground shadow-2xl', rCard, anim)}>
        <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: cor }} />
        {CloseX(false)}
        <div className="flex items-start gap-4 p-5 pl-6">
          <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center', quad ? 'rounded-none' : 'rounded-2xl')} style={{ background: `color-mix(in oklab, ${cor} 18%, var(--card))`, color: cor }}>
            <Megaphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            {banner.titulo && <h3 className="pr-6 text-lg font-bold whitespace-pre-wrap leading-snug tracking-tight">{banner.titulo}</h3>}
            {banner.mensagem && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{banner.mensagem}</p>}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{Fechar(false)}{CTA}</div>
          </div>
        </div>
      </div>
    )
  }

  // ---- CARTAZ: versão GRANDE (imagem alta no topo, texto centralizado, CTA em destaque) ----
  if (estilo === 'cartaz') {
    return (
      <div onClick={stop} className={cn('relative w-full max-w-lg overflow-hidden bg-card text-foreground shadow-2xl', rCard, anim)}>
        <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${cor}, color-mix(in oklab, ${cor} 45%, #ffffff))` }} />
        {CloseX(!!banner.imagem_url)}
        {banner.imagem_url && (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={banner.imagem_url} alt="" className="max-h-80 w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
          </div>
        )}
        <div className={cn('px-7 pb-7 text-center', banner.imagem_url ? 'pt-4' : 'pt-7')}>
          <div className="flex justify-center">{Eyebrow(false)}</div>
          {banner.titulo && <h3 className="mt-3 whitespace-pre-wrap text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{banner.titulo}</h3>}
          {banner.mensagem && <p className="mx-auto mt-2 max-w-md whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground sm:text-base">{banner.mensagem}</p>}
          <div className="mt-6 flex flex-col gap-2">
            {botaoCTA(true)}
            <button type="button" onClick={onFechar} className={cn('px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground', rBtn)}>Agora não</button>
          </div>
        </div>
      </div>
    )
  }

  // ---- LADO A LADO: imagem numa metade, texto + CTA na outra (mais largo) ----
  if (estilo === 'lado') {
    return (
      <div onClick={stop} className={cn('relative flex w-full max-w-2xl flex-col overflow-hidden bg-card text-foreground shadow-2xl sm:flex-row', rCard, anim)}>
        {CloseX(true)}
        <div className="relative shrink-0 sm:w-1/2">
          {banner.imagem_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={banner.imagem_url} alt="" className="h-44 w-full object-cover sm:h-full" />
            : <div className="h-44 w-full sm:h-full" style={{ background: `linear-gradient(135deg, ${cor}, #14101f)` }} />}
        </div>
        <div className="flex flex-1 flex-col justify-center p-6">
          {Eyebrow(false)}
          {banner.titulo && <h3 className="mt-3 whitespace-pre-wrap text-xl font-bold leading-snug tracking-tight sm:text-2xl">{banner.titulo}</h3>}
          {banner.mensagem && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{banner.mensagem}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">{Fechar(false)}{botaoCTA()}</div>
        </div>
      </div>
    )
  }

  // ---- FAIXA LARGA: banner largo (imagem de fundo) com texto + CTA sobrepostos à esquerda ----
  if (estilo === 'faixa') {
    return (
      <div onClick={stop} className={cn('relative w-full max-w-5xl overflow-hidden text-white shadow-2xl', rCard, anim)}>
        <div className="relative aspect-[1920/560] w-full sm:aspect-[1920/460]">
          {banner.imagem_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={banner.imagem_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            : <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${cor}, #14101f)` }} />}
          <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(8,6,16,.9) 2%, rgba(8,6,16,.55) 42%, rgba(8,6,16,.05) 78%)' }} />
          {CloseX(true)}
          <div className="absolute inset-0 flex max-w-2xl flex-col justify-center gap-2 p-6 sm:p-10">
            {Eyebrow(true)}
            {banner.titulo && <h3 className="whitespace-pre-wrap text-xl font-extrabold leading-tight tracking-tight drop-shadow sm:text-3xl">{banner.titulo}</h3>}
            {banner.mensagem && <p className="line-clamp-2 whitespace-pre-wrap text-sm text-white/85 drop-shadow sm:text-base">{banner.mensagem}</p>}
            {mostrarCTA && <div className="mt-2">{botaoCTA()}</div>}
          </div>
        </div>
      </div>
    )
  }

  // ---- CLÁSSICO (padrão): faixa de cor + imagem no topo + conteúdo ----
  return (
    <div onClick={stop} className={cn('relative w-full max-w-md overflow-hidden bg-card text-foreground shadow-2xl', rCard, anim)}>
      <div className={cn('h-1.5 w-full')} style={{ background: `linear-gradient(90deg, ${cor}, color-mix(in oklab, ${cor} 45%, #ffffff))` }} />
      {CloseX(!!banner.imagem_url)}
      {banner.imagem_url && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={banner.imagem_url} alt="" className="max-h-64 w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent" />
        </div>
      )}
      <div className={cn('px-6 pb-6', banner.imagem_url ? 'pt-4' : 'pt-6')}>
        {Eyebrow(false)}
        {banner.titulo && <h3 className="mt-3 text-xl font-bold whitespace-pre-wrap leading-snug tracking-tight">{banner.titulo}</h3>}
        {banner.mensagem && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{banner.mensagem}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{Fechar(false)}{CTA}</div>
      </div>
    </div>
  )
}
