'use client'

// CÓPIA self-contained das seções "Simulados recentes" + "Pastas de simulados" da Início (home.tsx),
// para a aba "Simulado Revisão" de /aluno/simulados ter o MESMO visual. NÃO importa componentes locais
// de home.tsx (eles não são exportados), então `Recentes`, `RecentesMobile`, `HScrollArrows`,
// `RecenteCard`, `Pastas`, `CoverFull` + constantes (`COVER_BG`, `SVG_R`, `FILTROS`) são copiados aqui
// tal e qual. O bloco CSS escopado `hrv-*` é REUTILIZADO via `import { CSS } from './home'` (sem duplicar)
// e injetado dentro de um `<div className="hrv-root">` com os MESMOS tokens de cor da Início.
//
// ⚠️ Duplicação consciente: estes componentes são um espelho dos de home.tsx. Se o visual da Início
// mudar, atualizar aqui também (não dá para exportá-los sem editar home.tsx, o que é proibido por ora).

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Clock, Download, Folder, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { internaTokensStyle } from '../../interna-tokens'
import { useTemaInterno } from '../../use-tema-interno'
import { BaixarCadernoBtn } from '../../baixar-caderno-btn'
import type { HomeSimuladoCard, HomePasta } from '../types'
import { CSS } from './home'

// Amarelo fixo da marca (spec §1.1) — usado só nos overrides de token (--accentInk/--peachBg).
const AMARELO = '#F1C232'

// Gradientes de capa (determinístico por índice) p/ cards/pastas (cópia de home.tsx).
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

const FILTROS = ['Todas', 'Federais', 'Estaduais', 'Municipais'] as const
type Filtro = (typeof FILTROS)[number]

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

/** Scroll horizontal com SETAS LATERAIS que aparecem só quando há card pro lado (overflow). */
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

function RecenteCard({ c, i }: { c: HomeSimuladoCard; i: number }) {
  return (
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
          {c.cadernoUrl ? <BaixarCadernoBtn simuladoId={c.id} titulo={c.titulo} brand="revisao" className="hrv-dl-btn"><Download size={14} />Baixar</BaixarCadernoBtn> : null}
        </div>
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

  if (!pastas.length) return null
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

/* ============================ Capa (marca R + grade) ============================ */

function CoverFull({ bg, rotulo, sub, small, img }: { bg: string; rotulo: string; sub?: string; small?: boolean; img?: string | null }) {
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

/* ============================ Seção composta (export) ============================ */

// Alterna Recentes desktop ↔ mobile pelo mesmo breakpoint da Início (≤640px). `hrv-only-m` já esconde
// o mobile no desktop; `secsim-only-d` esconde o desktop no mobile (par simétrico, escopado).
const EXTRA_CSS = `
.secsim-only-d{display:block}
@media (max-width:640px){.secsim-only-d{display:none}}
`

export function SecaoSimulados({ recentes, pastas }: { recentes: HomeSimuladoCard[]; pastas: HomePasta[] }) {
  // Reproduz o ambiente de tokens da Início (internaTokensStyle + overrides exatos do mockup §1.1) no
  // wrapper `.hrv-root`, para o CSS escopado `hrv-*` pintar IDÊNTICO à Início (claro/escuro ao vivo).
  const theme = useTemaInterno('claro')
  const rootStyle = useMemo(() => {
    const dark = theme === 'escuro'
    const baseTok = internaTokensStyle('revisao', theme) as Record<string, string>
    const over: Record<string, string> = {
      '--bg': dark ? '#0E0A24' : '#F4F2FA',
      '--surface': dark ? '#1C1440' : '#FFFFFF',
      '--surface2': dark ? '#171030' : '#F6F4FC',
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
    return { ...baseTok, ...over } as React.CSSProperties
  }, [theme])

  if (!recentes.length && !pastas.length) {
    return (
      <div className="hrv-root" style={rootStyle}>
        <style>{CSS}</style>
        <div style={{ padding: '48px 8px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          Nenhum simulado disponível no momento.
        </div>
      </div>
    )
  }

  return (
    <div className="hrv-root" style={rootStyle}>
      <style>{CSS}</style>
      <style>{EXTRA_CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div className="secsim-only-d"><Recentes cards={recentes} /></div>
        <RecentesMobile cards={recentes} />
        <Pastas pastas={pastas} />
      </div>
    </div>
  )
}
