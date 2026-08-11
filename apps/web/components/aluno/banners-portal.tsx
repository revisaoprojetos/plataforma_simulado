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

export type BannerPortal = {
  id: string; tipo: 'banner' | 'popup' | 'hero'; titulo: string | null; mensagem: string | null
  imagem_url: string | null; link: string | null; cor: string | null; ordem?: number
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

  // Mostra o pop-up SÓ logo após o login (marcador 'popup-login' setado no formulário de login),
  // não a cada visita à home. Consome o marcador na 1ª montagem para não repetir ao voltar ao início.
  useEffect(() => {
    let fresh = false
    try { fresh = sessionStorage.getItem('popup-login') === '1'; if (fresh) sessionStorage.removeItem('popup-login') } catch { /* SSR/priv */ }
    if (!fresh) return
    const pop = banners.find((b) => b.tipo === 'popup')
    if (pop) setPopup(pop)
  }, [banners])

  function fecharPopup() { setPopup(null) }

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
        <div role="dialog" aria-modal="true" aria-label={popup.titulo ?? 'Aviso'}
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

/** Banner de imagem (ou faixa colorida com texto quando não há imagem). */
function ImgSlide({ b }: { b: BannerPortal }) {
  const cor = b.cor ?? '#6366f1'
  const conteudo = b.imagem_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.imagem_url} alt={b.titulo ?? ''} className="absolute inset-0 h-full w-full object-cover" />
  ) : (
    <div className="absolute inset-0 flex items-center gap-3 p-4" style={{ background: cor + '14' }}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: cor + '22', color: cor }}><Megaphone className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        {b.titulo && <p className="text-sm font-semibold">{b.titulo}</p>}
        {b.mensagem && <p className="text-xs text-muted-foreground">{b.mensagem}</p>}
      </div>
    </div>
  )
  return b.link ? <Alvo href={b.link} aria-label={b.titulo ?? 'Abrir'} className="absolute inset-0">{conteudo}</Alvo> : <>{conteudo}</>
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

export type PopupDados = { titulo: string | null; mensagem: string | null; imagem_url: string | null; cor: string | null; link: string | null }

/** Card do pop-up (visual reutilizado no portal do aluno e na prévia do admin).
 *  `preview` = estático (CTA não navega, fechar é opcional). */
export function PopupCard({ banner, onFechar, preview }: { banner: PopupDados; onFechar?: () => void; preview?: boolean }) {
  const cor = banner.cor || '#6366f1'
  const txt = textoContraste(cor)
  const mostrarCTA = !!banner.link || preview
  const ctaCls = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-md transition hover:opacity-95'
  const ctaStyle: React.CSSProperties = { background: `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 78%, #000))`, color: txt }
  return (
    <div onClick={(e) => e.stopPropagation()}
      className="relative w-full max-w-md animate-in fade-in zoom-in-95 slide-in-from-bottom-2 overflow-hidden rounded-3xl border bg-card text-foreground shadow-2xl duration-300">
      {/* Faixa de cor no topo (cor de destaque do aviso) */}
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${cor}, color-mix(in oklab, ${cor} 45%, #ffffff))` }} />

      {/* Fechar — flutuante (sobre a imagem quando houver) */}
      <button type="button" onClick={onFechar} aria-label="Fechar"
        className={cn('absolute right-3 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full transition',
          banner.imagem_url ? 'bg-black/40 text-white ring-1 ring-white/25 backdrop-blur hover:bg-black/60' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
        <X className="h-4 w-4" />
      </button>

      {banner.imagem_url && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={banner.imagem_url} alt="" className="max-h-64 w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent" />
        </div>
      )}

      <div className={cn('px-6 pb-6', banner.imagem_url ? 'pt-4' : 'pt-6')}>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
          style={{ background: `color-mix(in oklab, ${cor} 16%, var(--card))`, color: cor }}>
          <Megaphone className="h-3.5 w-3.5" /> Aviso
        </span>
        {banner.titulo && <h3 className="mt-3 text-xl font-bold leading-snug tracking-tight">{banner.titulo}</h3>}
        {banner.mensagem && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{banner.mensagem}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onFechar}
            className="rounded-xl border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted">Fechar</button>
          {mostrarCTA && (
            preview || !banner.link
              ? <span className={ctaCls} style={ctaStyle}>Ver mais <ArrowRight className="h-4 w-4" /></span>
              : <Alvo href={banner.link} onClick={onFechar} className={ctaCls} style={ctaStyle}>Ver mais <ArrowRight className="h-4 w-4" /></Alvo>
          )}
        </div>
      </div>
    </div>
  )
}
