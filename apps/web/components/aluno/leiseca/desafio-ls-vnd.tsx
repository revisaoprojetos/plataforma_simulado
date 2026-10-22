'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DESAFIO DE LEI SECA — ÁREA INTERNA (montanha) · marca VND (Você na Defensoria).
//
// Porte fiel dos mockups `DesafioLSVND*.dc.html` (verde + dourado). NÃO é o layout
// do Revisão (roxo) nem do MEQ: hero VERDE de largura total (grade de pontos +
// chevrons + silhueta de montanha), altímetro à ESQUERDA do palco, zoom horizontal
// no canto superior direito, barra de início acoplada embaixo. Coluna lateral à
// DIREITA com "Missão do dia", "Ofensiva apagada", "Sua cordada" (iniciais) e
// "Marcos da subida" (card dourado). Traço da trilha em DOURADO VND (#E8C877).
//
// REUSA do `desafio-ls-revisao.tsx` TODO o data-wiring e o MOTOR da trilha
// (PalcoMontanha): geometria dos 30 nós OU posições do admin (modo livre),
// zoom/pan imperativo, fundo configurado no admin vs `/leiseca/trilha_m.jpg`,
// privacidade (iniciais p/ terceiros, "Você"/nome p/ o próprio). Só muda o CHROME.
//
// Tokens: herda var(--brand)/--surface/--surface2/--ink/--muted/--line/--line2/
// --chip/--track/--brand2 do root (o pai injeta `internaTokensStyle('vnd', theme)`).
// Dourados do mockup (acentos permitidos): #E8C877 / #F1D48A / #D8B45A.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Flag, BookOpen, BarChart3, Trophy, Play, RotateCcw, Lock, Check, Mountain,
  Plus, Minus, Maximize2, Crosshair, Download, ExternalLink,
  Flame, Zap, Crown, Target, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ChevronUp, ChevronDown, FileText, TrendingUp, List, Loader2, FlaskConical, HelpCircle,
} from 'lucide-react'
import type { TrilhaNode } from '@/components/aluno/trilha-simulados'
import type { AulaDesempenho } from '@/lib/leitura/trilha'
import type { RankingLeitura, RankingLeituraItem } from '@/lib/leitura/ranking'
import type { RegulamentoConfig } from '@/lib/leitura/regulamento'
import type { PontuacaoLeitura } from '@/lib/leitura/pontuacao'
import type { GamRail } from '@/lib/aluno/trilhas'
import type { CarimboAlunoView } from '@/components/aluno/carimbos-colecao'
import { avatarPadraoDe } from '@/lib/aluno/avatar-padrao'
import type { TrilhaFundoConfig, TrilhaLivreConfig } from '@/lib/leitura/trilha-aparencia'
import type { TrilhaFormato } from '@/lib/gamificacao/trilha-formato'
import type { DesafioLSMeqProps } from './desafio-ls-meq'
import { useTemaInterno } from '@/components/brand/interna/use-tema-interno'

// Dourados do mockup VND (acentos permitidos pela spec). O traço da trilha usa GOLD.
const GOLD = '#E8C877'
const GOLD_HI = '#F1D48A'
const GOLD_LO = '#D8B45A'
const GOLD_INK = '#9A7414'
const HERO_BG = 'linear-gradient(120deg,#041A10 0%,#0B4A2E 55%,#12643D 100%)'

// Helper puro (iniciais p/ privacidade de terceiros) — inline p/ NÃO arrastar `ranking.ts`
// (server-only) para dentro deste client component. (= Revisão/MEQ)
function iniciaisDe(nome: string | null | undefined): string {
  const ps = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (!ps.length) return '—'
  const a = ps[0][0]?.toUpperCase() ?? ''
  const b = ps.length > 1 ? (ps[ps.length - 1][0]?.toUpperCase() ?? '') : ''
  return b ? `${a}. ${b}.` : `${a}.`
}
function primeiroNome(nome: string): string {
  return (nome || '').trim().split(/\s+/)[0] || 'Você'
}
/** Iniciais do PRÓPRIO aluno (pode usar nome completo — é ele mesmo). */
function inic(nome: string): string {
  const ps = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (!ps.length) return 'V'
  const a = ps[0][0]?.toUpperCase() ?? ''
  const b = ps.length > 1 ? (ps[ps.length - 1][0]?.toUpperCase() ?? '') : ''
  return (a + b) || 'V'
}

// ── Geometria da trilha (coordenadas da imagem 1024×1536) — spline Catmull-Rom. ──
// (REUSO do motor Revisão/MEQ — mesma trilha fixa de 30 nós.)
const IMG_W = 1024
const IMG_H = 1536
const NODES: [number, number][] = [
  [690, 1495], [724.5, 1414.1], [735.5, 1328.5], [708, 1246], [632.8, 1209.8], [548.4, 1184.5], [522.5, 1139.9], [604.2, 1115.2], [689.2, 1092.3], [733.8, 1054.2],
  [649.8, 1028.1], [564, 1008.3], [513.4, 973.2], [596.3, 950.7], [678.9, 920.4], [616.3, 886.6], [533.6, 859], [590.8, 838.4], [644, 829.3], [694.8, 813.4],
  [610.8, 788.7], [604.9, 746.9], [680, 715.1], [598.5, 681.9], [525.3, 634.5], [522.8, 582.7], [607.9, 561.1], [551.6, 525.6], [534.2, 446], [515, 360],
]
const clampPct = (n: number) => Math.max(0, Math.min(100, n))
/** Posição-padrão (serpentina) p/ um nó do modo LIVRE que o admin ainda não posicionou à mão. */
function posSerp(i: number, total: number): { x: number; y: number } {
  const cols = total <= 4 ? 2 : 3
  const rows = Math.max(1, Math.ceil(total / cols))
  const row = Math.floor(i / cols)
  const inRow = i % cols
  const col = row % 2 === 0 ? inRow : cols - 1 - inRow
  return { x: clampPct(((col + 0.5) / cols) * 100), y: clampPct(rows === 1 ? 50 : 8 + (row / (rows - 1)) * 84) }
}

/** Fundo da trilha PERSONALIZADA (formato 'livre') — imagem do admin com recorte/encaixe/opacidade/zoom. */
function FundoLivre({ fundo }: { fundo: TrilhaFundoConfig }) {
  const url = fundo.url
  if (!url) return null
  const desfoque = fundo.desfoque ?? 0
  const opacity = (fundo.opacidade ?? 100) / 100
  const filter = desfoque > 0 ? `blur(${desfoque}px)` : undefined
  const crop = fundo.crop
  if (crop && crop.w > 0 && crop.h > 0) {
    const sizeW = 100 / crop.w, sizeH = 100 / crop.h
    const posBgX = crop.w < 1 ? (crop.x / (1 - crop.w)) * 100 : 0
    const posBgY = crop.h < 1 ? (crop.y / (1 - crop.h)) * 100 : 0
    const blurScale = desfoque > 0 ? 1.06 : 1
    return <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: `url("${url}")`, backgroundSize: `${sizeW}% ${sizeH}%`, backgroundPosition: `${posBgX}% ${posBgY}%`, backgroundRepeat: 'no-repeat', opacity, filter, transform: blurScale !== 1 ? `scale(${blurScale})` : undefined }} />
  }
  const posX = fundo.posX ?? 50, posY = fundo.posY ?? 50
  const zoom = Math.max(1, fundo.zoom ?? 1) + (desfoque > 0 ? 0.06 : 0)
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fundo.ajuste ?? 'cover', objectPosition: `${posX}% ${posY}%`, opacity, filter, transform: `scale(${zoom})`, transformOrigin: `${posX}% ${posY}%` }} />
}

/** Caminho SVG suave (Catmull-Rom → Bézier) pelos pontos. */
function splinePath(pts: [number, number][]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

const fmt = (n: number) => n.toLocaleString('pt-BR')

type Tab = 'trilha' | 'reg' | 'des' | 'rank'

/** Marca "V" (Você na Defensoria) usada nos nós/avatares dourados. */
function MarcaV({ size = 14, color = '#0B4A2E' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden style={{ width: size, height: size, display: 'block' }}>
      <path d="M4 5 L12 20 L20 5 L16.5 5 L12 14 L7.5 5 Z" fill={color} />
    </svg>
  )
}

/** Chama bicolor animada (ofensiva) — do mockup. */
function FlameSeq({ size = 18 }: { size?: number }) {
  return (
    <svg className="lsvfl" viewBox="0 0 24 30" aria-hidden style={{ width: size, height: Math.round(size * 1.27), overflow: 'visible', display: 'block' }}>
      <ellipse className="sh" cx="12" cy="27.6" rx="7" ry="1.7" fill="rgba(150,50,30,.28)" />
      <g className="b">
        <path className="o" d="M12 25.4C7.4 25.4 4.1 22.1 4.1 17.7 4.1 14.7 5.5 12.6 6.3 10.7 6.7 9.6 6.7 6.6 7.1 5.3 7.4 4.4 8.4 4.3 8.9 5.1 9.6 6.3 10 7.2 10.6 7.8 11.1 5.7 11.9 2.9 13.4 1.4 14 .8 14.9 .9 15.3 1.6 17.4 5.3 19.9 9.8 19.9 17.4 19.9 22.1 16.6 25.4 12 25.4Z" fill="#F26B4A" />
        <path className="i" d="M12 23.3C9.9 23.3 8.6 21.8 8.6 20 8.6 17.9 10.5 16.1 11.4 14.3 11.6 13.9 12.4 13.9 12.6 14.3 13.5 16.1 15.4 17.9 15.4 20 15.4 21.8 14.1 23.3 12 23.3Z" fill="#FFC24D" />
      </g>
    </svg>
  )
}

export function DesafioLSVND({
  theme, trilha, desempenho, ranking, minhaLinha, meuId, meuNome, regulamento, pontuacao, gam, carimbos = [], diasLeitura = [], moduloNome, testador = false,
  formato, livre,
}: DesafioLSMeqProps) {
  useTemaInterno(theme) // reage ao toggle claro/escuro/azul ao vivo
  const [tab, setTab] = useState<Tab>('trilha')

  // Ranking SOB DEMANDA: o servidor manda a lista vazia (abertura rápida). Carregamos (1000+ alunos)
  // quando a aba Ranking abre — e também na Trilha, pois a "Sua cordada" (VND) precisa dos vizinhos.
  // O ranking é cacheado no servidor (~5 min), então o custo é 1 cache por módulo.
  const searchParams = useSearchParams()
  const moduloId = searchParams.get('modulo')
  const [rankingLazy, setRankingLazy] = useState<RankingLeitura | null>(null)
  const [rankLoading, setRankLoading] = useState(false)
  useEffect(() => {
    const precisa = tab === 'rank' || tab === 'trilha'
    if (!precisa || rankingLazy || ranking.itens.length > 0 || !moduloId) return
    setRankLoading(true)
    fetch(`/api/aluno/leitura/ranking?modulo=${encodeURIComponent(moduloId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.itens)) setRankingLazy(d) })
      .catch(() => {})
      .finally(() => setRankLoading(false))
  }, [tab, moduloId, rankingLazy, ranking.itens.length])
  const rankingAtivo = rankingLazy ?? ranking

  // ── Nós reais → geometria da montanha. (REUSO da lógica Revisão/MEQ.) ──
  const nodes = trilha.nodes.filter((n) => !n.intro)
  const totalDias = trilha.total || nodes.length || 30
  const diasConcluidos = trilha.done
  const idxAtual = useMemo(() => {
    const i = nodes.findIndex((n) => n.estado === 'atual')
    if (i >= 0) return i
    const j = nodes.findIndex((n) => n.estado === 'disponivel' && !n.naoLiberada)
    return j >= 0 ? j : Math.min(diasConcluidos, nodes.length - 1)
  }, [nodes, diasConcluidos])

  const [dy, setDy] = useState(idxAtual >= 0 ? idxAtual : 0)
  useEffect(() => { setDy(idxAtual >= 0 ? idxAtual : 0) }, [idxAtual])

  const progressoPct = totalDias > 0 ? Math.round((diasConcluidos / totalDias) * 100) : 0
  const pontos = useMemo(() => desempenho.reduce((s, a) => s + (a.pontos || 0) + (a.pontosExtra || 0), 0), [desempenho])
  const posicao = minhaLinha?.posicao ?? rankingAtivo.itens.find((r) => r.estudanteId === meuId)?.posicao ?? null

  const TABS: { k: Tab; label: string; icon: React.ReactNode }[] = [
    { k: 'trilha', label: 'Trilha', icon: <Flag size={15} /> },
    { k: 'reg', label: 'Regulamento', icon: <BookOpen size={15} /> },
    { k: 'des', label: 'Desempenho', icon: <BarChart3 size={15} /> },
    { k: 'rank', label: 'Ranking', icon: <Trophy size={15} /> },
  ]

  return (
    <div data-ls-vnd style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ═══════════ HERO VERDE (largura total + abas sublinhadas douradas) ═══════════ */}
      <HeaderHero moduloNome={moduloNome} diasConcluidos={diasConcluidos} totalDias={totalDias} progressoPct={progressoPct} posicao={posicao} totalAlunos={rankingAtivo.itens.length || null} tab={tab} setTab={setTab} tabs={TABS} />

      {/* ═══════════ CONTEÚDO ═══════════ */}
      <div style={{ padding: '22px 24px 24px' }}>
        {testador && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '11px 14px', borderRadius: 14, background: 'color-mix(in srgb, var(--brand) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--brand) 35%, transparent)', color: 'var(--ink)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: 'color-mix(in srgb, var(--brand) 18%, transparent)', color: 'var(--brand)', flexShrink: 0 }}><FlaskConical size={16} /></span>
            <div style={{ minWidth: 0, lineHeight: 1.3 }}>
              <b style={{ display: 'block', fontSize: 13 }}>Modo teste</b>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Todas as aulas liberadas e livres para refazer — nada é contabilizado (sem XP, sequência ou ranking).</span>
            </div>
          </div>
        )}
        {/* `key={tab}` remonta o painel ao trocar de aba → a animação lsvTabIn re-roda. */}
        <div key={tab} className="lsv-tabpane">
          {tab === 'trilha' && (
            <AbaTrilha nodes={nodes} dy={dy} setDy={setDy} idxAtual={idxAtual} diasConcluidos={diasConcluidos} totalDias={totalDias} progressoPct={progressoPct} desempenho={desempenho} gam={gam} diasLeitura={diasLeitura} testador={testador} formato={formato} livre={livre} ranking={rankingAtivo} minhaLinha={minhaLinha} meuId={meuId} meuNome={meuNome} posicao={posicao} />
          )}
          {tab === 'reg' && <AbaRegulamento regulamento={regulamento} pontuacao={pontuacao} gam={gam} moduloNome={moduloNome} totalDias={totalDias} />}
          {tab === 'des' && <AbaDesempenho desempenho={desempenho} totalDias={totalDias} diasConcluidos={diasConcluidos} pontos={pontos} progressoPct={progressoPct} carimbos={carimbos} gam={gam} />}
          {tab === 'rank' && <AbaRanking ranking={rankingAtivo} loading={rankLoading} minhaLinha={minhaLinha} meuId={meuId} meuNome={meuNome} progressoPct={progressoPct} totalDias={totalDias} moduloNome={moduloNome} gam={gam} />}
        </div>
      </div>

      <style>{`
        /* Banner/hero FULL-BLEED: cancela o padding lateral do <main> do AlunoShell (p-4 md:p-6) p/ o hero
           verde encostar nas bordas (sem faixas do lado). O conteúdo interno reaplica seu próprio respiro. */
        [data-ls-vnd]{ margin-left:-16px; margin-right:-16px; }
        @media (min-width:768px){ [data-ls-vnd]{ margin-left:-24px; margin-right:-24px; } }
        @media (max-width: 1023px){
          [data-ls-vnd] .lsv-trilha-wrap{ flex-direction:column !important; }
          [data-ls-vnd] .lsv-side{ flex:0 0 auto !important; width:100% !important; position:static !important; }
          [data-ls-vnd] .lsv-des-kpis{ grid-template-columns:repeat(2,1fr) !important; }
          [data-ls-vnd] .lsv-des-grid{ grid-template-columns:1fr !important; }
          [data-ls-vnd] .lsv-rank-grid{ grid-template-columns:1fr !important; }
          [data-ls-vnd] .lsv-reg-grid{ grid-template-columns:1fr !important; }
          [data-ls-vnd] .lsv-hero-aside{ display:none !important; }
          [data-ls-vnd] .lsv-hero-chev{ display:none !important; }
        }
        [data-ls-vnd] .lsvfl .b{ transform-box:view-box; transform-origin:12px 25.4px; animation:lsvflb 1.6s cubic-bezier(.45,0,.55,1) infinite }
        [data-ls-vnd] .lsvfl .o{ transform-box:view-box; transform-origin:12px 25px; animation:lsvflo 2.4s ease-in-out infinite }
        [data-ls-vnd] .lsvfl .i{ transform-box:view-box; transform-origin:12px 23.3px; animation:lsvfli 1.1s ease-in-out infinite }
        [data-ls-vnd] .lsvfl .sh{ transform-box:view-box; transform-origin:12px 27.6px; animation:lsvflsh 1.6s cubic-bezier(.45,0,.55,1) infinite }
        @keyframes lsvflb{ 0%,100%{transform:scale(1,1)} 18%{transform:scale(1.07,.92)} 38%{transform:scale(.95,1.08) translateY(-.6px)} 58%{transform:scale(1.02,.98)} 76%{transform:scale(.99,1.02)} }
        @keyframes lsvflo{ 0%,100%{transform:skewX(0deg)} 30%{transform:skewX(-3deg)} 70%{transform:skewX(3deg)} }
        @keyframes lsvfli{ 0%,100%{transform:scale(1,1)} 40%{transform:scale(.88,1.1)} 70%{transform:scale(1.06,.94)} }
        @keyframes lsvflsh{ 0%,100%{transform:scaleX(1);opacity:1} 18%{transform:scaleX(1.1)} 38%{transform:scaleX(.88);opacity:.75} }
        @keyframes lsvPulse{ 0%,100%{ box-shadow:0 0 0 0 color-mix(in srgb,${GOLD} 55%,transparent), 0 4px 0 ${GOLD_INK};} 50%{ box-shadow:0 0 0 10px color-mix(in srgb,${GOLD} 0%,transparent), 0 4px 0 ${GOLD_INK};} }
        @keyframes lsvPulseLib{ 0%,100%{ box-shadow:0 0 0 0 rgba(20,138,79,.5);} 50%{ box-shadow:0 0 0 10px rgba(20,138,79,0);} }
        @keyframes lsvBobLib{ 0%,100%{ transform:translate(-50%, calc(-100% - 24px * var(--z,1))) scale(var(--z,1)); } 50%{ transform:translate(-50%, calc(-100% - 30px * var(--z,1))) scale(var(--z,1)); } }
        [data-ls-vnd] .lsv-chev{ opacity:0; animation:lsvChevIn 1.2s cubic-bezier(.2,.8,.2,1) both, lsvFloat 8s ease-in-out infinite alternate; }
        [data-ls-vnd] .lsv-c1{ animation-delay:.4s,1.6s } [data-ls-vnd] .lsv-c2{ animation-delay:.55s,2.1s } [data-ls-vnd] .lsv-c3{ animation-delay:.7s,2.6s }
        @keyframes lsvChevIn{ from{opacity:0;transform:translateY(60px)} to{opacity:1;transform:none} }
        @keyframes lsvFloat{ from{translate:0 0} to{translate:0 -14px} }
        [data-ls-vnd] .lsv-dots{ animation:lsvDrift 30s linear infinite; }
        @keyframes lsvDrift{ to{ background-position:0 -110px } }
        [data-ls-vnd] .lsv-tab{ transition:color .25s; }
        [data-ls-vnd] .lsv-tabpane{ animation:lsvTabIn .34s cubic-bezier(.22,1,.36,1) both; }
        @keyframes lsvTabIn{ from{ opacity:0; transform:translateX(34px); } to{ opacity:1; transform:none; } }
        .lsv-balao-in{ animation:lsvBalaoIn .22s cubic-bezier(.2,.9,.3,1.4) both; transform-origin:50% 100%; }
        .lsv-balao-out{ animation:lsvBalaoOut .14s ease-in both; transform-origin:50% 100%; }
        @keyframes lsvBalaoIn{ 0%{ opacity:0; transform:scale(.55) translateY(14px); } 60%{ opacity:1; } 100%{ opacity:1; transform:none; } }
        @keyframes lsvBalaoOut{ 0%{ opacity:1; transform:none; } 100%{ opacity:0; transform:scale(.7) translateY(8px); } }
        .lsv-balao-wrap{ animation:lsvBalaoBob 1.7s ease-in-out .28s infinite; transform-origin:50% 100%; }
        @keyframes lsvBalaoBob{ 0%,100%{ transform:translate(-50%, calc(-100% - 48px * var(--z,1))) scale(var(--z,1)); } 50%{ transform:translate(-50%, calc(-100% - 58px * var(--z,1))) scale(var(--z,1)); } }
        .lsv-balao-cta{ transition:transform .12s ease, filter .12s ease, box-shadow .12s ease; }
        .lsv-balao-cta:hover{ filter:brightness(1.06); transform:translateY(-1px); box-shadow:0 10px 20px -10px rgba(0,0,0,.55); }
        .lsv-balao-cta:active{ transform:translateY(1px) scale(.97); filter:brightness(.95); }
        .lsv-mission{ transition:filter .15s, transform .15s; }
        .lsv-mission:hover{ filter:brightness(1.04); }
        @media (prefers-reduced-motion: reduce){ [data-ls-vnd] *{ animation:none !important; } }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO VERDE — gradiente da marca + grade de pontos + chevrons + silhueta de
// montanha; link de volta, ícone de montanha dourado, kicker, H1, subtítulo e, à
// direita, anel de progresso + "N de T dias · posº de total". Abas sublinhadas.
// ─────────────────────────────────────────────────────────────────────────────
function HeaderHero({
  moduloNome, diasConcluidos, totalDias, progressoPct, posicao, totalAlunos, tab, setTab, tabs,
}: {
  moduloNome: string; diasConcluidos: number; totalDias: number; progressoPct: number
  posicao: number | null; totalAlunos: number | null
  tab: Tab; setTab: (t: Tab) => void; tabs: { k: Tab; label: string; icon: React.ReactNode }[]
}) {
  const ringLen = 163.36
  const ringOff = ringLen * (1 - progressoPct / 100)
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: HERO_BG, color: '#fff', padding: '22px 0 0' }}>
      {/* Grade de pontos (deriva lentamente) */}
      <span aria-hidden className="lsv-dots" style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(185,245,212,.18) 1.2px,transparent 1.8px)', backgroundSize: '22px 22px' }} />
      {/* Chevrons (só desktop) */}
      <div className="lsv-hero-chev" aria-hidden style={{ position: 'absolute', right: 120, top: 0, bottom: 0, width: 420, pointerEvents: 'none' }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`lsv-chev lsv-c${i + 1}`} style={{ position: 'absolute', right: i * 90, top: '50%', width: 150, height: 150, transform: 'translateY(-50%)', borderRight: `2px solid rgba(232,200,119,${0.26 - i * 0.06})`, borderTop: `2px solid rgba(232,200,119,${0.26 - i * 0.06})`, borderRadius: 6, rotate: '45deg' }} />
        ))}
      </div>
      {/* Silhueta de montanha */}
      <svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 40, width: '100%', height: 110, opacity: 0.22 }}>
        <path d="M0 120 L60 60 L100 90 L170 20 L230 80 L280 45 L340 95 L400 50 L400 120 Z" fill="#0A2E1C" />
      </svg>

      <div style={{ position: 'relative', maxWidth: 1440, margin: '0 auto', padding: '0 32px' }}>
        <Link href="/aluno/leitura" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#B7D3C3' }}>
          <ChevronLeft size={14} /> Desafio de Lei Seca
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 14 }}>
          {/* Ícone de montanha 92px em quadrado dourado */}
          <div style={{ width: 92, height: 92, borderRadius: 24, background: `linear-gradient(160deg,${GOLD_HI},#B8913A)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 16px 30px -16px rgba(0,0,0,.7)' }}>
            <svg viewBox="0 0 48 32" aria-hidden style={{ width: 66, height: 44 }}>
              <path d="M2 30 L18 8 L26 18 L32 12 L46 30 Z" fill="#0B4A2E" />
              <path d="M18 8 L22 14 L19 13 L16 16 Z M32 12 L35 16 L32 15.5 L30 17 Z" fill="#FFFFFF" opacity=".9" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: GOLD_HI }}>DESAFIO DE LEI SECA · {totalDias} DIAS</span>
            <h1 style={{ margin: '4px 0 6px', fontSize: 38, fontWeight: 800, letterSpacing: '-0.045em', color: '#fff' }}>{moduloNome}</h1>
            <span style={{ fontSize: 13.5, color: '#CFE3D7' }}>Um trecho por dia até o cume.</span>
          </div>
          {/* Anel de progresso + resumo (direita, só desktop) */}
          <div className="lsv-hero-aside" style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            <div style={{ position: 'relative', width: 58, height: 58 }}>
              <svg viewBox="0 0 58 58" style={{ width: 58, height: 58, transform: 'rotate(-90deg)' }}>
                <circle cx="29" cy="29" r="26" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="5" />
                <circle cx="29" cy="29" r="26" fill="none" stroke={GOLD} strokeWidth="5" strokeLinecap="round" strokeDasharray={ringLen} strokeDashoffset={ringOff} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)' }} />
              </svg>
              <b style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#fff' }}>{progressoPct}</b>
            </div>
            <div style={{ lineHeight: 1.3 }}>
              <b style={{ display: 'block', fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>{diasConcluidos} de {totalDias} dias</b>
              <span style={{ fontSize: 12.5, color: '#9FC3AE' }}>{posicao != null ? `${posicao}º` : '—'}{totalAlunos ? ` de ${fmt(totalAlunos)} alunos` : ''}</span>
            </div>
          </div>
        </div>

        {/* Abas sublinhadas (ativa #F1D48A, linha #E8C877) */}
        <div style={{ marginTop: 18 }}>
          <div role="tablist" style={{ display: 'flex', gap: 26, overflowX: 'auto' }}>
            {tabs.map((t) => {
              const ativo = tab === t.k
              return (
                <button
                  key={t.k}
                  type="button"
                  role="tab"
                  aria-selected={ativo}
                  onClick={() => setTab(t.k)}
                  className="lsv-tab"
                  style={{
                    position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, height: 44, padding: '0 4px',
                    border: 0, background: 'none', font: 'inherit', fontSize: 14, fontWeight: 700,
                    color: ativo ? GOLD_HI : '#CFE3D7', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {t.icon}{t.label}
                  <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, borderRadius: '3px 3px 0 0', background: ativo ? GOLD : 'transparent', transform: ativo ? 'scaleX(1)' : 'scaleX(.4)', transformOrigin: 'center', opacity: ativo ? 1 : 0, transition: 'opacity .25s ease, transform .25s cubic-bezier(.22,1,.36,1), background .25s' }} />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA TRILHA — palco da montanha (flex 1) + coluna lateral à DIREITA (336px).
// ─────────────────────────────────────────────────────────────────────────────
function AbaTrilha({
  nodes, dy, setDy, idxAtual, diasConcluidos, totalDias, progressoPct, desempenho, gam, diasLeitura = [], testador = false, formato, livre,
  ranking, minhaLinha, meuId, meuNome, posicao,
}: {
  nodes: TrilhaNode[]; dy: number; setDy: (i: number) => void; idxAtual: number
  diasConcluidos: number; totalDias: number; progressoPct: number; desempenho: AulaDesempenho[]; gam?: GamRail | null; diasLeitura?: string[]; testador?: boolean
  formato?: TrilhaFormato; livre?: TrilhaLivreConfig
  ranking: RankingLeitura; minhaLinha?: RankingLeituraItem | null; meuId?: string | null; meuNome?: string | null; posicao: number | null
}) {
  const sel = nodes[dy]
  const selDesemp = sel ? desempenho.find((d) => d.id === sel.id) : undefined

  return (
    <div className="lsv-trilha-wrap" style={{ display: 'flex', gap: 18, alignItems: 'stretch' }}>
      {/* ── Palco da montanha (altímetro à esquerda, barra de início acoplada) ── */}
      <PalcoMontanha nodes={nodes} dy={dy} setDy={setDy} idxAtual={idxAtual} diasConcluidos={diasConcluidos} totalDias={totalDias} progressoPct={progressoPct} sel={sel} selDesemp={selDesemp} desempenho={desempenho} testador={testador} formato={formato} livre={livre} />

      {/* ── Coluna lateral DIREITA ── */}
      <aside className="lsv-side" style={{ flex: '0 0 336px', width: 336, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 90 }}>
        <MissaoDoDia sel={sel} selDesemp={selDesemp} dy={dy} idxAtual={idxAtual} testador={testador} />
        <OfensivaApagada desempenho={desempenho} gam={gam} diasLeitura={diasLeitura} />
        <SuaCordada ranking={ranking} minhaLinha={minhaLinha} meuId={meuId} meuNome={meuNome} posicao={posicao} />
        <MarcosDaSubida gam={gam} />
      </aside>
    </div>
  )
}

// ── Card "MISSÃO DO DIA" (cabeçalho verde + selo + 2 missões com checkbox) ──
function MissaoDoDia({ sel, selDesemp, dy, idxAtual, testador = false }: { sel?: TrilhaNode; selDesemp?: AulaDesempenho; dy: number; idxAtual: number; testador?: boolean }) {
  if (!sel) return null
  const bloqueada = sel.estado === 'disponivel' && !!sel.naoLiberada
  const concluida = sel.estado === 'concluido'
  const leituraPct = selDesemp ? Math.round(selDesemp.leituraPct) : 0
  const qTotal = selDesemp && selDesemp.questoesTotal > 0 ? selDesemp.questoesTotal : 10
  const qResp = selDesemp?.questoesRespondidas ?? 0
  const m1Done = concluida || (selDesemp?.leituraConcluida ?? false) || leituraPct >= 100
  const m2Done = concluida || (qTotal > 0 && qResp >= qTotal)
  const statusTxt = concluida ? 'Concluída' : bloqueada ? 'Bloqueada' : 'Em andamento'
  const ctaLab = concluida ? 'Revisar aula' : leituraPct > 0 ? 'Continuar leitura' : 'Começar aula'
  const hint = concluida ? 'Você pode reler e refazer o quiz quando quiser.' : bloqueada ? 'As aulas liberam uma por dia, na ordem da trilha.' : 'Termine a leitura para liberar o quiz de 10 questões.'
  const href = sel.hrefLeitura ?? sel.href ?? '#'

  return (
    <div style={{ borderRadius: 20, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 5px 0 var(--line)' }}>
      {/* Cabeçalho verde */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: HERO_BG, color: '#fff' }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(160deg,${GOLD_HI},#B8913A)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Mountain size={20} color="#0B4A2E" />
        </span>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.16em', color: GOLD_HI }}>MISSÃO DO DIA</span>
          <b style={{ display: 'block', fontSize: 14.5, letterSpacing: '-0.02em' }}>Dia {String(dy + 1).padStart(2, '0')} · {sel.titulo}</b>
        </div>
        <span style={{ height: 22, padding: '0 9px', borderRadius: 99, background: 'rgba(255,255,255,.16)', fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{statusTxt}</span>
      </div>
      {/* Corpo */}
      <div style={{ padding: 16 }}>
        <MissaoItem done={m1Done} titulo="Ler os artigos do dia" sub={m1Done ? 'feito' : `${leituraPct}% lido`} xp={5} />
        <div style={{ height: 8 }} />
        <MissaoItem done={m2Done} titulo="Quiz de 10 questões" sub={m2Done ? `${qResp}/${qTotal} certas` : 'após a leitura'} xp={5} />
        <div style={{ marginTop: 14 }}>
          {bloqueada ? (
            <span style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 13, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 13.5, fontWeight: 700 }}>
              <Lock size={15} /> Libera em breve
            </span>
          ) : (
            <Link href={href} className="lsv-balao-cta" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: 13, background: concluida ? 'var(--brand)' : `linear-gradient(180deg,${GOLD_HI},${GOLD_LO})`, color: concluida ? '#fff' : '#3A2A05', fontSize: 15, fontWeight: 800, boxShadow: concluida ? undefined : `0 12px 24px -14px rgba(216,180,90,.9)` }}>
              <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,.12)', alignItems: 'center', justifyContent: 'center' }}>{concluida ? <RotateCcw size={13} /> : <Play size={13} />}</span>
              {ctaLab}
            </Link>
          )}
          {testador && (
            <Link href={sel.hrefLeitura ?? sel.href ?? `/aluno/leitura/${sel.id}`} className="lsv-balao-cta" style={{ marginTop: 10, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, background: 'color-mix(in srgb,var(--brand) 10%,transparent)', border: '1px solid color-mix(in srgb,var(--brand) 32%,transparent)', color: 'var(--brand)', fontSize: 13.5, fontWeight: 800 }}>
              <FlaskConical size={14} /> Testar
            </Link>
          )}
          <p style={{ margin: '10px 2px 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>{hint}</p>
        </div>
      </div>
    </div>
  )
}
function MissaoItem({ done, titulo, sub, xp }: { done: boolean; titulo: string; sub: string; xp: number }) {
  return (
    <div className="lsv-mission" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--line)' }}>
      <span style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: done ? '#22B573' : 'var(--surface)', border: done ? 'none' : '1.5px solid var(--line2)', color: '#fff' }}>
        {done && <Check size={14} strokeWidth={3} />}
      </span>
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
        <b style={{ display: 'block', fontSize: 13, color: 'var(--ink)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.75 : 1 }}>{titulo}</b>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</span>
      </div>
      <span style={{ height: 22, padding: '0 8px', borderRadius: 8, background: 'rgba(232,200,119,.2)', color: GOLD_INK, fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>+{xp} XP</span>
    </div>
  )
}

// ── "Ofensiva apagada" (chama 3D + contador + faixa da semana) ──
function OfensivaApagada({ desempenho, gam, diasLeitura = [] }: { desempenho: AulaDesempenho[]; gam?: GamRail | null; diasLeitura?: string[] }) {
  const streak = gam?.resumo.streakAtual ?? desempenho.reduce((m, a) => Math.max(m, a.sequencia), 0)
  const recorde = gam?.resumo.streakMaior ?? streak
  const apagada = streak <= 0

  const [semana, setSemana] = useState<{ sigla: string; ativo: boolean; hoje: boolean }[] | null>(null)
  useEffect(() => {
    const set = new Set(diasLeitura)
    const hoje = new Date()
    const dom = new Date(hoje); dom.setDate(hoje.getDate() - hoje.getDay())
    const SIG = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
    const fmtDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const hojeStr = fmtDia(hoje)
    setSemana(SIG.map((sigla, i) => {
      const d = new Date(dom); d.setDate(dom.getDate() + i)
      const key = fmtDia(d)
      return { sigla, ativo: set.has(key), hoje: key === hojeStr }
    }))
  }, [diasLeitura])

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18, boxShadow: '0 5px 0 var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ position: 'relative', width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: apagada ? 'linear-gradient(180deg,#F79659,#E5602F)' : 'linear-gradient(180deg,#FFB65A,#F0773A)', boxShadow: '0 5px 0 rgba(180,70,30,.45)' }}>
          <FlameSeq size={22} />
          <span style={{ position: 'absolute', right: -4, bottom: -4, minWidth: 20, height: 20, padding: '0 5px', borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{streak}</span>
        </span>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
          <b style={{ display: 'block', fontSize: 15.5, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{apagada ? 'Ofensiva apagada' : `Ofensiva de ${streak} ${streak === 1 ? 'dia' : 'dias'}`}</b>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{apagada ? 'Conclua a aula de hoje para reacender.' : 'Mantenha a sequência diária.'} Recorde: {recorde} dias.</span>
        </div>
      </div>
      {/* Faixa DOM→SÁB */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginTop: 14 }}>
        {(semana ?? ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map((sigla) => ({ sigla, ativo: false, hoje: false }))).map((d, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: d.ativo ? 'color-mix(in srgb,#F0773A 16%,transparent)' : 'var(--surface2)',
              border: d.hoje ? '2px solid var(--brand)' : '1px solid var(--line)',
              color: d.ativo ? '#F0773A' : 'var(--muted)',
            }}>
              {d.ativo ? <FlameSeq size={15} /> : <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: 0.5 }} />}
            </span>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', color: d.hoje ? 'var(--brand)' : 'var(--muted)' }}>{d.sigla}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── "Sua cordada": 5 vizinhos de ranking (±2) com INICIAIS; "Você" em dourado. ──
function SuaCordada({ ranking, minhaLinha, meuId, meuNome, posicao }: { ranking: RankingLeitura; minhaLinha?: RankingLeituraItem | null; meuId?: string | null; meuNome?: string | null; posicao: number | null }) {
  const itens = ranking.itens.filter((r) => !r.oculto).slice().sort((a, b) => a.posicao - b.posicao)
  // Índice do próprio aluno na lista (por id); se não achar e temos posição, encaixa pela posição.
  let meuIdx = itens.findIndex((r) => r.estudanteId === meuId)
  if (meuIdx < 0 && posicao != null) meuIdx = itens.findIndex((r) => r.posicao >= posicao)
  const temLista = itens.length > 0 && meuIdx >= 0

  // Janela de 5 (±2) centrada no aluno, ajustada às bordas.
  let ini = Math.max(0, meuIdx - 2)
  const fim = Math.min(itens.length, ini + 5)
  ini = Math.max(0, fim - 5)
  const janela = temLista ? itens.slice(ini, fim) : []

  // "Faltam X pts para passar o (pos-1)º": diferença para o aluno imediatamente acima.
  const acima = temLista && meuIdx > 0 ? itens[meuIdx - 1] : null
  const meuScore = (meuId ? itens.find((r) => r.estudanteId === meuId)?.score : undefined) ?? minhaLinha?.score ?? 0
  const falta = acima ? Math.max(0, acima.score - meuScore + 1) : null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18, boxShadow: '0 5px 0 var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Sua cordada</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>alunos perto de você</span>
      </div>
      {!temLista ? (
        <div style={{ padding: '18px 6px', textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
          {ranking.itens.length === 0 ? 'Carregando vizinhos do ranking…' : 'Comece a subir para ver sua cordada.'}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {janela.map((r) => {
              const sou = r.estudanteId === meuId || (meuId == null && posicao != null && r.posicao === posicao)
              const nome = sou ? 'Você' : iniciaisDe(r.nome)
              const iniTxt = sou ? (meuNome ? inic(meuNome) : 'EU') : iniciaisDe(r.nome).replace(/\./g, '').slice(0, 2)
              return (
                <div key={r.estudanteId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: sou ? `linear-gradient(90deg,rgba(232,200,119,.22),rgba(232,200,119,.1))` : 'transparent', border: sou ? `1px solid ${GOLD}` : '1px solid transparent' }}>
                  <b style={{ width: 40, fontSize: 12.5, color: sou ? GOLD_INK : 'var(--muted)', flexShrink: 0 }}>{r.posicao}º</b>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: sou ? 'var(--brand)' : 'var(--surface2)', color: sou ? '#fff' : 'var(--muted)', fontSize: 10.5, fontWeight: 800, border: sou ? 'none' : '1px solid var(--line)' }}>{iniTxt}</span>
                  <b style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink)', fontWeight: sou ? 800 : 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome}</b>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: sou ? GOLD_INK : 'var(--muted)', flexShrink: 0 }}>{fmt(r.score)} pts</span>
                </div>
              )
            })}
          </div>
          {falta != null && falta > 0 && (
            <p style={{ margin: '12px 2px 0', paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--muted)' }}>
              Faltam <b style={{ color: 'var(--ink)' }}>{fmt(falta)} pts</b> para passar o {acima?.posicao}º.
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── "MARCOS DA SUBIDA" (card dourado): dias 7/14/21/30 com XP. ──
function MarcosDaSubida({ gam }: { gam?: GamRail | null }) {
  const marcosGam = gam?.config.xp_regras?.streak?.marcos ?? []
  const DEFAULTS = [
    { dias: 7, xp: 10, label: 'Semana 1' },
    { dias: 14, xp: 15, label: 'Meio do caminho' },
    { dias: 21, xp: 35, label: 'Acampamento base' },
    { dias: 30, xp: 50, label: 'Cume' },
  ]
  const marcos = DEFAULTS.map((d) => {
    const g = marcosGam.find((m) => m.dias === d.dias)
    return { ...d, xp: g?.xp ?? d.xp }
  })
  return (
    <div style={{ borderRadius: 20, padding: 16, background: `linear-gradient(160deg,${GOLD_HI},${GOLD_LO})`, boxShadow: '0 16px 30px -20px rgba(216,180,90,.9)' }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.2em', color: '#3A2A05' }}>MARCOS DA SUBIDA</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {marcos.map((m) => (
          <div key={m.dias} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 13, background: 'rgba(255,255,255,.28)' }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(58,42,5,.14)', color: '#3A2A05' }}><Flag size={15} /></span>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
              <b style={{ display: 'block', fontSize: 13.5, color: '#2A1E03' }}>Dia {m.dias}</b>
              <span style={{ fontSize: 11, color: '#5A4312' }}>{m.label}</span>
            </div>
            <b style={{ fontSize: 13, color: '#2A1E03', flexShrink: 0 }}>+{m.xp} XP</b>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PALCO DA MONTANHA — imagem + spline SVG (ouro VND) + 30 nós + altímetro à
// esquerda + zoom horizontal no topo-direito + toolbar + barra de início acoplada.
// (Motor de zoom/pan e mapeamento de nós = REUSO do Revisão — geometria idêntica,
//  honra a config do admin no modo 'livre'.)
// ─────────────────────────────────────────────────────────────────────────────
function PalcoMontanha({
  nodes, dy, setDy, idxAtual, diasConcluidos, totalDias, progressoPct, sel, selDesemp, desempenho = [], testador = false, formato, livre,
}: {
  nodes: TrilhaNode[]; dy: number; setDy: (i: number) => void; idxAtual: number
  diasConcluidos: number; totalDias: number; progressoPct: number; sel?: TrilhaNode; selDesemp?: AulaDesempenho; desempenho?: AulaDesempenho[]; testador?: boolean
  formato?: TrilhaFormato; livre?: TrilhaLivreConfig
}) {
  const livreAtivo = formato === 'livre' && (!!livre?.fundo?.url || Object.keys(livre?.nos ?? {}).length > 0)
  const AR = livreAtivo ? (livre?.aspecto && livre.aspecto > 0 ? livre.aspecto : 0.8) : IMG_W / IMG_H
  const CW = livreAtivo ? 1000 : IMG_W
  const CH = livreAtivo ? Math.max(1, Math.round(1000 / AR)) : IMG_H
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [balaoNode, setBalaoNode] = useState<number | null>(null)
  const [balaoVis, setBalaoVis] = useState<{ i: number; saindo: boolean } | null>(null)
  const balaoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (balaoTimer.current) { clearTimeout(balaoTimer.current); balaoTimer.current = null }
    if (balaoNode !== null) setBalaoVis({ i: balaoNode, saindo: false })
    else { setBalaoVis((p) => (p ? { i: p.i, saindo: true } : null)); balaoTimer.current = setTimeout(() => setBalaoVis(null), 170) }
  }, [balaoNode])
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; ox: number; oy: number }>({ active: false, sx: 0, sy: 0, ox: 0, oy: 0 })
  const wheelTargetRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  const pts = useMemo<[number, number][]>(() => {
    if (livreAtivo) {
      return nodes.map((n, i) => {
        const p = livre?.nos?.[n.id] ?? posSerp(i, nodes.length)
        return [(p.x / 100) * CW, (p.y / 100) * CH] as [number, number]
      })
    }
    return NODES
  }, [livreAtivo, nodes, livre, CW, CH])
  const spline = useMemo(() => {
    if (!livreAtivo) return splinePath(pts)
    if (pts.length < 2) return ''
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
    for (let i = 0; i < pts.length - 1; i++) {
      const b = pts[i + 1]
      const cc = livre?.curvas?.[nodes[i].id]
      const cx = cc ? (cc.x / 100) * CW : (pts[i][0] + b[0]) / 2
      const cy = cc ? (cc.y / 100) * CH : (pts[i][1] + b[1]) / 2
      d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`
    }
    return d
  }, [livreAtivo, pts, livre, nodes, CW, CH])
  const doneFrac = totalDias > 0 ? Math.min(1, diasConcluidos / (totalDias - 1 || 1)) : 0

  const nodePts = useMemo(() => {
    if (livreAtivo) return nodes.map((node, i) => ({ node, i, x: pts[i]?.[0] ?? 0, y: pts[i]?.[1] ?? 0 }))
    return nodes.slice(0, 30).map((node, i) => {
      const t = nodes.length > 1 ? i / (nodes.length - 1) : 0
      const p = pts[Math.round(t * (pts.length - 1))]
      return { node, i, x: p[0], y: p[1] }
    })
  }, [livreAtivo, nodes, pts])

  const libIdx = useMemo(() => {
    const prox = nodePts.findIndex((p) => p.node.proxima && p.node.naoLiberada)
    if (prox >= 0) return prox
    return nodePts.findIndex((p) => p.node.estado === 'disponivel' && p.node.naoLiberada)
  }, [nodePts])
  const libLabel = 'Libera amanhã'

  function applyTransform() {
    if (!stageRef.current) return
    stageRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`
  }
  function setAnim(on: boolean) {
    if (stageRef.current) stageRef.current.style.transition = on ? 'transform .28s cubic-bezier(.22,1,.36,1)' : 'none'
  }
  function pararRolagemSuave() {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    wheelTargetRef.current = null
  }
  function passoRolagem() {
    rafRef.current = null
    const alvo = wheelTargetRef.current
    if (alvo == null) return
    const atual = panRef.current.y
    const dif = alvo - atual
    if (Math.abs(dif) < 0.5) { panRef.current.y = alvo; wheelTargetRef.current = null; applyTransform(); return }
    panRef.current.y = atual + dif * 0.18
    applyTransform()
    rafRef.current = requestAnimationFrame(passoRolagem)
  }

  function contentSize() {
    const wrap = wrapRef.current
    const w = wrap ? wrap.clientWidth : 0
    return { w: w * zoomRef.current, h: w * (CH / CW) * zoomRef.current }
  }
  function clampPan() {
    const wrap = wrapRef.current
    if (!wrap) return
    const { w: cw, h: ch } = contentSize()
    const minX = Math.min(0, wrap.clientWidth - cw)
    const minY = Math.min(0, wrap.clientHeight - ch)
    panRef.current.x = Math.max(minX, Math.min(0, panRef.current.x))
    panRef.current.y = Math.max(minY, Math.min(0, panRef.current.y))
  }
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ch = wrap.clientWidth * (CH / CW)
    panRef.current = { x: 0, y: Math.min(0, wrap.clientHeight - ch) }
    applyTransform()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const { h: ch } = contentSize()
      const minY = Math.min(0, el.clientHeight - ch)
      if (minY >= 0) return
      const base = wheelTargetRef.current ?? panRef.current.y
      const next = Math.max(minY, Math.min(0, base - e.deltaY))
      if (next === base) return
      e.preventDefault(); setAnim(false)
      wheelTargetRef.current = next
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(passoRolagem)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { el.removeEventListener('wheel', onWheel); pararRolagemSuave() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  function onPointerDown(e: React.PointerEvent) {
    setBalaoNode(null)
    pararRolagemSuave()
    setAnim(false)
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, ox: panRef.current.x, oy: panRef.current.y }
      ; (e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.active) return
    panRef.current.x = dragRef.current.ox + (e.clientX - dragRef.current.sx)
    panRef.current.y = dragRef.current.oy + (e.clientY - dragRef.current.sy)
    clampPan(); applyTransform()
  }
  function onPointerUp() { dragRef.current.active = false }

  function zoomTo(nz: number, anchorClientX?: number, anchorClientY?: number) {
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const ax = (anchorClientX ?? rect.left + rect.width / 2) - rect.left
    const ay = (anchorClientY ?? rect.top + rect.height / 2) - rect.top
    const z0 = zoomRef.current
    const target = Math.max(1, Math.min(2.6, nz))
    const cx = (ax - panRef.current.x) / z0
    const cy = (ay - panRef.current.y) / z0
    zoomRef.current = target
    setZoom(target)
    panRef.current.x = ax - cx * target
    panRef.current.y = ay - cy * target
    setAnim(true)
    clampPan(); applyTransform()
  }
  function zoomBy(factor: number) { zoomTo(zoomRef.current * factor) }
  function irMinhaAula() {
    const wrap = wrapRef.current
    if (!wrap) return
    const p = nodePts.find((np) => np.i === idxAtual) ?? nodePts[nodePts.length - 1]
    if (!p) return
    const target = 1.8
    zoomRef.current = target
    setZoom(target)
    const relX = p.x / CW
    const relY = p.y / CH
    panRef.current.x = wrap.clientWidth / 2 - relX * wrap.clientWidth * target
    panRef.current.y = wrap.clientHeight / 2 - relY * (wrap.clientWidth * (CH / CW)) * target
    setAnim(true)
    clampPan(); applyTransform()
  }
  function verTudo() {
    const wrap = wrapRef.current
    zoomRef.current = 1
    setZoom(1)
    const ch = wrap ? wrap.clientWidth * (CH / CW) : 0
    panRef.current = { x: 0, y: wrap ? Math.min(0, wrap.clientHeight - ch) : 0 }
    setAnim(true)
    applyTransform()
  }

  // ── Dados da barra de início (dia selecionado) ──
  const selConcl = sel?.estado === 'concluido'
  const selBloq = sel?.estado === 'disponivel' && !!sel?.naoLiberada
  const selLeitura = selDesemp ? Math.round(selDesemp.leituraPct) : 0
  const dProgW = selConcl ? 100 : selBloq ? 0 : Math.round(selLeitura / 2)
  const dProgTxt = selConcl ? 'Aula concluída · +10 pts' : selBloq ? 'Bloqueada' : `Etapa 1 de 2 · leitura ${selLeitura}%`
  const dCta = selConcl ? 'Revisar aula' : selLeitura > 0 ? 'Continuar leitura' : 'Começar aula'
  const selHref = sel?.hrefLeitura ?? sel?.href ?? '#'

  return (
    <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', borderRadius: 20, overflow: 'hidden', background: 'var(--surface)', boxShadow: '0 0 0 1px var(--line)' }}>
      {/* Palco com zoom/pan */}
      <div
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={(e) => (zoomRef.current > 1 ? verTudo() : zoomTo(1.8, e.clientX, e.clientY))}
        className="lsv-stage"
        style={{ position: 'relative', flex: 1, minHeight: 560, width: '100%', overflow: 'hidden', background: '#07140C', touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
      >
        <div ref={stageRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', aspectRatio: `${CW} / ${CH}`, transformOrigin: '0 0', willChange: 'transform', ['--z' as string]: (1 / zoom).toFixed(3) } as React.CSSProperties}>
          {livreAtivo && livre?.fundo?.url ? (
            <FundoLivre fundo={livre.fundo} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/leiseca/trilha_m.jpg" alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          )}

          {/* Spline (traço pontilhado + traço aceso em OURO VND). */}
          <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden>
            <path d={spline} fill="none" stroke="rgba(255,255,255,.85)" strokeWidth={3.5} strokeLinecap="round" strokeDasharray="0.5 10" vectorEffect="non-scaling-stroke" />
            <path
              d={spline} fill="none" stroke={GOLD} strokeWidth={6} strokeLinecap="round"
              vectorEffect="non-scaling-stroke" pathLength={1000}
              style={{ strokeDasharray: 1000, strokeDashoffset: 1000 * (1 - doneFrac), filter: 'drop-shadow(0 0 6px rgba(232,200,119,.6))' }}
            />
          </svg>

          {/* Nós */}
          {nodePts.map(({ node, i, x, y }) => {
            const concl = node.estado === 'concluido'
            const atualNode = i === idxAtual
            const bloq = node.estado === 'disponivel' && !!node.naoLiberada
            const sz = atualNode ? 44 : 30
            const selN = i === dy
            const ehCume = i === nodes.length - 1
            return (
              <button
                key={node.id}
                type="button"
                data-ni={i}
                onClick={() => { setDy(i); setBalaoNode(i) }}
                title={`Dia ${String(i + 1).padStart(2, '0')} · ${node.titulo}`}
                style={{
                  position: 'absolute',
                  left: `${(x / CW) * 100}%`,
                  top: `${(y / CH) * 100}%`,
                  transform: `translate(-50%,-50%) scale(${(1 / zoom).toFixed(3)})`,
                  transition: 'transform .3s cubic-bezier(.22,1,.36,1)',
                  width: sz, height: sz, borderRadius: '50%',
                  border: atualNode ? '3px solid #fff' : concl ? '2px solid #fff' : bloq ? '1.5px solid rgba(255,255,255,.8)' : '1.5px solid rgba(11,74,46,.3)',
                  cursor: 'pointer', padding: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: concl ? '#fff' : atualNode ? '#0B4A2E' : '#0B4A2E',
                  background: concl ? 'linear-gradient(180deg,#2FBE73,#148A4E)' : atualNode ? `linear-gradient(180deg,${GOLD_HI},${GOLD_LO})` : bloq ? 'rgba(255,255,255,.92)' : '#fff',
                  boxShadow: selN
                    ? `0 0 0 4px rgba(255,255,255,.95), 0 4px 0 ${concl ? '#0B4A2E' : atualNode ? GOLD_INK : 'rgba(11,74,46,.25)'}`
                    : atualNode
                      ? `0 0 0 5px rgba(232,200,119,.5), 0 4px 0 ${GOLD_INK}`
                      : concl
                        ? '0 4px 0 #0B4A2E'
                        : i === libIdx
                          ? '0 0 0 4px rgba(20,138,79,.45), 0 3px 0 rgba(11,74,46,.25)'
                          : '0 3px 0 rgba(11,74,46,.2)',
                  animation: atualNode ? 'lsvPulse 2.2s ease-in-out infinite' : i === libIdx ? 'lsvPulseLib 2.2s ease-in-out infinite' : undefined,
                  zIndex: atualNode ? 5 : i === libIdx ? 4 : 2,
                }}
              >
                {concl ? <Check size={sz * 0.46} strokeWidth={3} />
                  : atualNode ? <MarcaV size={sz * 0.5} color="#0B4A2E" />
                    : ehCume ? <Flag size={14} color="#0B4A2E" />
                      : String(i + 1).padStart(2, '0')}
              </button>
            )
          })}

          {/* Rótulo "Você está aqui" */}
          {!balaoVis && nodePts[idxAtual] && (
            <span aria-hidden style={{ position: 'absolute', left: `${(nodePts[idxAtual].x / CW) * 100}%`, top: `${(nodePts[idxAtual].y / CH) * 100}%`, transform: 'translate(-50%, calc(-100% - 28px * var(--z,1))) scale(var(--z,1))', transformOrigin: '50% 100%', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', height: 24, padding: '0 11px', borderRadius: 99, background: '#0B4A2E', color: '#fff', fontSize: 11, fontWeight: 800, boxShadow: '0 6px 14px -6px rgba(0,0,0,.6)', zIndex: 7 }}>
              Você está aqui
              <span aria-hidden style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '7px solid #0B4A2E' }} />
            </span>
          )}
          {/* Balão "Libera amanhã" */}
          {libIdx >= 0 && nodePts[libIdx] && !(balaoVis && balaoVis.i === libIdx) && (
            <span aria-hidden style={{ position: 'absolute', left: `${(nodePts[libIdx].x / CW) * 100}%`, top: `${(nodePts[libIdx].y / CH) * 100}%`, transform: 'translate(-50%, calc(-100% - 24px * var(--z,1))) scale(var(--z,1))', transformOrigin: '50% 100%', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', height: 26, padding: '0 11px 0 6px', borderRadius: 99, background: '#fff', color: '#0F1C16', fontSize: 11.5, fontWeight: 800, boxShadow: '0 10px 22px -10px rgba(0,0,0,.6)', zIndex: 9, animation: 'lsvBobLib 2.6s ease-in-out infinite' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#0F7A44', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Lock size={11} /></span>
              {libLabel}
              <span aria-hidden style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '7px solid #fff' }} />
            </span>
          )}
          {/* "Cume · Dia N" */}
          {nodePts[nodes.length - 1] && (
            <span aria-hidden style={{ position: 'absolute', left: `${(nodePts[nodes.length - 1].x / CW) * 100}%`, top: `${(nodePts[nodes.length - 1].y / CH) * 100}%`, transform: 'translate(calc(-50% + 40px * var(--z,1)), calc(-50% - 2px)) scale(var(--z,1))', transformOrigin: '0% 50%', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', height: 22, padding: '0 9px', borderRadius: 99, background: '#0B4A2E', color: '#fff', fontSize: 10.5, fontWeight: 800, boxShadow: '0 6px 14px -6px rgba(0,0,0,.6)', zIndex: 6 }}>
              Cume · Dia {totalDias}
            </span>
          )}

          {/* Balão de AÇÃO ao clicar num nó */}
          {balaoVis && nodePts[balaoVis.i] && (() => {
            const np = nodePts[balaoVis.i]
            const nd = np.node
            const d = desempenho.find((x) => x.id === nd.id)
            const lp = d ? Math.round(d.leituraPct) : 0
            const concl = nd.estado === 'concluido'
            const bloq = nd.estado === 'disponivel' && !!nd.naoLiberada
            const lab = concl ? 'Revisar aula' : lp > 0 ? 'Continuar' : 'Iniciar aula'
            const href = nd.hrefLeitura ?? nd.href ?? '#'
            return (
              <div className={balaoVis.saindo ? undefined : 'lsv-balao-wrap'} onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', left: `${(np.x / CW) * 100}%`, top: `${(np.y / CH) * 100}%`, transform: 'translate(-50%, calc(-100% - 48px * var(--z,1))) scale(var(--z,1))', transformOrigin: '50% 100%', zIndex: 14, width: 216, maxWidth: '82vw' }}>
                <div className={balaoVis.saindo ? 'lsv-balao-out' : 'lsv-balao-in'} style={{ position: 'relative', borderRadius: 14, padding: '11px 12px', background: '#fff', color: '#0F1C16', boxShadow: '0 16px 34px -14px rgba(0,0,0,.72)' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: '#0F7A44' }}>DIA {String(balaoVis.i + 1).padStart(2, '0')}</span>
                  <b style={{ display: 'block', margin: '2px 0 9px', fontSize: 13, lineHeight: 1.25, letterSpacing: '-0.01em' }}>{nd.titulo}</b>
                  {bloq ? (
                    <span style={{ display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 10, background: 'rgba(15,122,68,.08)', color: '#3C6B52', fontSize: 12.5, fontWeight: 700 }}><Lock size={13} /> Libera em breve</span>
                  ) : (
                    <Link href={href} onClick={() => setBalaoNode(null)} className="lsv-balao-cta" style={{ display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, borderRadius: 10, background: concl ? '#0F7A44' : `linear-gradient(180deg,${GOLD_HI},${GOLD_LO})`, color: concl ? '#fff' : '#3A2A05', fontSize: 13.5, fontWeight: 800 }}>
                      {concl ? <RotateCcw size={14} /> : <Play size={13} />} {lab}
                    </Link>
                  )}
                  {testador && (
                    <Link href={nd.hrefLeitura ?? nd.href ?? `/aluno/leitura/${nd.id}`} onClick={() => setBalaoNode(null)} className="lsv-balao-cta" style={{ display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, marginTop: 8, borderRadius: 10, background: 'color-mix(in srgb, var(--brand) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--brand) 32%, transparent)', color: 'var(--brand)', fontSize: 12.5, fontWeight: 800 }}>
                      <FlaskConical size={13} /> Testar
                    </Link>
                  )}
                  <span aria-hidden style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '8px solid #fff' }} />
                </div>
              </div>
            )
          })()}
        </div>

        {/* ── Altímetro vertical (ESQUERDA) ── */}
        <div style={{ position: 'absolute', left: 14, top: 16, bottom: 16, width: 64, zIndex: 6, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 56, height: 56, borderRadius: '50%', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1, background: `linear-gradient(160deg,${GOLD_HI},${GOLD_LO})`, color: '#3A2A05', boxShadow: '0 10px 20px -10px rgba(0,0,0,.6)' }}>
            <b style={{ fontSize: 15, fontWeight: 800 }}>{progressoPct}%</b>
            <span style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: '.14em', marginTop: 2 }}>SUBIDA</span>
          </span>
          <Flag size={14} color="#fff" style={{ opacity: 0.85, flexShrink: 0 }} />
          {/* Régua vertical com o "escalador" marcando o dia atual (de baixo p/ cima) */}
          <div style={{ position: 'relative', flex: 1, width: 10, borderRadius: 99, background: 'rgba(255,255,255,.14)', overflow: 'visible' }}>
            {/* preenchimento (altitude) */}
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${progressoPct}%`, borderRadius: 99, background: `linear-gradient(180deg,${GOLD},${GOLD_LO})` }} />
            {/* ticks */}
            {[0, 25, 50, 75, 100].map((p) => (
              <span key={p} style={{ position: 'absolute', left: -3, right: -3, bottom: `${p}%`, height: 1, background: 'rgba(255,255,255,.25)' }} />
            ))}
            {/* escalador */}
            <span style={{ position: 'absolute', left: '50%', bottom: `${progressoPct}%`, transform: 'translate(-50%, 50%)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 18, height: 26, borderRadius: 6, background: '#fff', boxShadow: '0 4px 10px -4px rgba(0,0,0,.6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Mountain size={12} color="#0F7A44" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 20, padding: '0 7px', borderRadius: 99, background: `linear-gradient(180deg,${GOLD_HI},${GOLD_LO})`, color: '#3A2A05', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap', boxShadow: '0 4px 10px -4px rgba(0,0,0,.5)' }}>
                <Mountain size={10} /> Dia {String(Math.min(diasConcluidos + 1, totalDias)).padStart(2, '0')}
              </span>
            </span>
          </div>
          <span style={{ width: 44, height: 28, borderRadius: 99, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(7,20,12,.78)', border: '1px solid rgba(232,200,119,.4)', color: '#fff', fontSize: 11, fontWeight: 800 }}>{diasConcluidos}/{totalDias}</span>
        </div>

        {/* ── Zoom horizontal (TOPO-DIREITA) ── */}
        <div style={{ position: 'absolute', right: 14, top: 16, zIndex: 6, display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 10px', borderRadius: 99, background: 'rgba(7,20,12,.82)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', border: '1px solid rgba(232,200,119,.3)' }}>
          <ZBtn onClick={() => zoomBy(1 / 1.5)} title="Afastar"><Minus size={16} /></ZBtn>
          <input
            type="range" min={1} max={2.6} step={0.1} value={zoom}
            onChange={(e) => zoomTo(Number(e.target.value))}
            aria-label="Zoom da trilha"
            style={{ width: 170, maxWidth: '40vw', accentColor: GOLD, cursor: 'ew-resize' }}
          />
          <ZBtn onClick={() => zoomBy(1.5)} title="Aproximar"><Plus size={16} /></ZBtn>
        </div>

        {/* ── Toolbar (canto inf-dir): pílulas douradas ── */}
        <div style={{ position: 'absolute', right: 14, bottom: 14, zIndex: 6, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <ToolPill onClick={irMinhaAula} title="Ir para minha aula"><Crosshair size={15} /> Ir para minha aula</ToolPill>
          <ToolPill onClick={verTudo} title="Ver tudo"><Maximize2 size={15} /> Ver tudo</ToolPill>
        </div>
      </div>

      {/* ── Barra de início acoplada (abaixo do palco) ── */}
      {sel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
          <div style={{ flexShrink: 0, width: 48, height: 48, borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1, background: selConcl ? 'linear-gradient(180deg,#2FBE73,#148A4E)' : selBloq ? 'var(--surface2)' : `linear-gradient(180deg,${GOLD_HI},${GOLD_LO})`, color: selBloq ? 'var(--muted)' : selConcl ? '#fff' : '#3A2A05' }}>
            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '.1em' }}>DIA</span>
            <b style={{ fontSize: 17, fontWeight: 800 }}>{String(dy + 1).padStart(2, '0')}</b>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sel.titulo}</b>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <div style={{ flex: 1, maxWidth: 220, height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${dProgW}%`, background: `linear-gradient(90deg,var(--brand),${GOLD})` }} />
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{dProgTxt}</span>
            </div>
          </div>
          {selBloq ? (
            <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 20px', borderRadius: 13, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 13.5, fontWeight: 700 }}>
              <Lock size={15} /> Libera em breve
            </span>
          ) : (
            <Link href={selHref} className="lsv-balao-cta" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 10, height: 46, padding: '0 22px', borderRadius: 13, background: selConcl ? 'var(--brand)' : `linear-gradient(180deg,${GOLD_HI},${GOLD_LO})`, color: selConcl ? '#fff' : '#3A2A05', fontSize: 14.5, fontWeight: 800, boxShadow: selConcl ? undefined : '0 12px 24px -14px rgba(216,180,90,.9)' }}>
              <span style={{ display: 'inline-flex', width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,.12)', alignItems: 'center', justifyContent: 'center' }}>{selConcl ? <RotateCcw size={12} /> : <Play size={12} />}</span>
              {dCta}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function ZBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} style={{ width: 30, height: 30, flexShrink: 0, padding: 0, border: 0, borderRadius: '50%', background: `linear-gradient(180deg,${GOLD_HI},${GOLD_LO})`, color: '#3A2A05', boxShadow: '0 4px 10px -4px rgba(0,0,0,.5)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {children}
    </button>
  )
}
function ToolPill({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} style={{ height: 34, padding: '0 14px 0 12px', border: `1px solid ${GOLD}`, borderRadius: 99, background: `linear-gradient(180deg,${GOLD_HI},${GOLD_LO})`, color: '#3A2A05', fontSize: 12.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 8px 18px -10px rgba(216,180,90,.9)' }}>
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA REGULAMENTO — documento (esq.) + coluna 340px [Marcos, Ganhos, FAQ].
// ─────────────────────────────────────────────────────────────────────────────
function AbaRegulamento({ regulamento, pontuacao, gam, moduloNome, totalDias }: { regulamento?: RegulamentoConfig; pontuacao?: PontuacaoLeitura; gam?: GamRail | null; moduloNome: string; totalDias: number }) {
  const xr = gam?.config.xp_regras
  const marcos = xr?.streak?.marcos ?? []
  const chest = xr?.chest
  const limiteDia = xr?.limite_dia ?? 0
  const temConteudo = !!regulamento?.ativo || !!pontuacao

  if (!temConteudo) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 14, background: 'var(--surface)', border: '1px dashed var(--line)', borderRadius: 20 }}>
        O regulamento deste desafio ainda não foi publicado.
      </div>
    )
  }

  const FAQ = [
    { q: 'Perdi um dia, perco a sequência?', a: 'Sim, a sequência zera, mas as aulas continuam disponíveis e os pontos de atividade continuam valendo.' },
    { q: 'Posso refazer o quiz?', a: 'Sim. Você pode reler e refazer o quiz quando quiser — o melhor resultado é o que conta.' },
    { q: 'O desafio tem prazo final?', a: 'As aulas liberam uma por dia, na ordem da trilha. Se atrasar, elas se acumulam e podem ser feitas em sequência.' },
  ]

  return (
    <div className="lsv-reg-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 18, alignItems: 'start' }}>
      {/* Documento */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--brand)', display: 'inline-flex' }}><FileText size={18} /></span>
            <div style={{ lineHeight: 1.3 }}>
              <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)' }}>{regulamento?.titulo || 'Regulamento oficial'}</b>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Documento oficial do desafio</span>
            </div>
          </div>
          {regulamento?.documento_url && (
            <div style={{ display: 'flex', gap: 6 }}>
              <a href={`${regulamento.documento_url}${regulamento.documento_url.includes('?') ? '&' : '?'}download`} title="Baixar PDF" aria-label="Baixar PDF" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Download size={15} /></a>
              <a href={regulamento.documento_url} target="_blank" rel="noopener noreferrer" title="Abrir em nova aba" aria-label="Abrir em nova aba" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ExternalLink size={15} /></a>
            </div>
          )}
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 20 }}>
          {/* Capa com o logotipo do Desafio no gradiente da marca */}
          <div style={{ borderRadius: 16, padding: '34px 20px', background: HERO_BG, color: '#fff', textAlign: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.3em', color: GOLD_HI }}>— DESAFIO —</span>
            <b style={{ display: 'block', margin: '6px 0 4px', fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', backgroundImage: 'linear-gradient(180deg,#FFFFFF,#CFE3D7)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>LEI SECA</b>
            <span style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 17, color: GOLD_HI }}>{moduloNome}</span>
          </div>
          {regulamento?.descricao ? (
            <div style={{ padding: '2px', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.75, color: 'var(--ink)', opacity: 0.9 }}>{regulamento.descricao}</div>
          ) : (
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>Regulamento ativo. Consulte o PDF oficial abaixo.</p>
          )}
          {regulamento?.documento_url && (
            <div style={{ marginTop: 16, borderRadius: 14, border: '1px solid var(--line)', overflow: 'hidden' }}>
              <iframe src={`${regulamento.documento_url}#view=FitH`} title="Regulamento (PDF)" style={{ width: '100%', height: '78vh', border: 0, background: '#fff' }} />
            </div>
          )}
        </div>
      </div>

      {/* Coluna direita: Marcos → Ganhos → FAQ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 90 }}>
        <MarcosDaSubida gam={gam} />

        {pontuacao && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Zap size={17} color="var(--brand)" />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Ganhos e metas</h3>
              </div>
              {gam && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  <Zap size={12} /> +{fmt(gam.resumo.xpHoje)} pontos hoje
                </span>
              )}
            </div>
            <div style={{ padding: 14, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface2)' }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Por atividade (no dia)</span>
              <div style={{ marginTop: 6 }}>
                <GanhoItem valor={`+${pontuacao.pontos_aula}`} txt="por leitura concluída" />
                <GanhoItem valor={`+${pontuacao.pontos_quiz}`} txt="por quiz concluído" />
                {pontuacao.pontos_acerto > 0 && <GanhoItem valor={`+${pontuacao.pontos_acerto}`} txt="por acerto no quiz" />}
                {pontuacao.combo_ativo && <GanhoItem valor={`+${pontuacao.combo_bonus}`} txt="ao gabaritar a aula" />}
              </div>
            </div>
            {(chest || marcos.length > 0) && (
              <div style={{ marginTop: 12, padding: 14, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface2)' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Sequência (login diário)</span>
                <div style={{ marginTop: 6 }}>
                  {chest && chest.xp > 0 && <GanhoItem gold valor={`+${chest.xp}`} txt={`a cada ${chest.cada_n_dias} dias seguidos`} />}
                  {marcos.map((m) => <GanhoItem key={m.dias} gold valor={`+${m.xp}`} txt={`ao completar ${m.dias} dias`} />)}
                </div>
              </div>
            )}
            {limiteDia > 0 && <span style={{ display: 'block', marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>Máximo de <b style={{ color: 'var(--ink)' }}>{limiteDia}</b> pontos por dia — cada tarefa conta uma única vez.</span>}
          </div>
        )}

        {/* FAQ */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
            <HelpCircle size={17} color="var(--brand)" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Dúvidas frequentes</h3>
          </div>
          {FAQ.map((f, i) => (
            <details key={i} open={i === 0} style={{ padding: '10px 0', borderTop: i === 0 ? 0 : '1px solid var(--line)' }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--ink)', listStyle: 'none' }}>{f.q}</summary>
              <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--muted)' }}>{f.a}</p>
            </details>
          ))}
        </div>

        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Desafio: {moduloNome} · {totalDias} dias</span>
      </div>
    </div>
  )
}

function GanhoItem({ valor, txt, gold }: { valor: string; txt: string; gold?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13 }}>
      <span style={{ minWidth: 44, height: 24, padding: '0 8px', borderRadius: 8, background: gold ? 'rgba(232,200,119,.2)' : 'var(--chip)', color: gold ? GOLD_INK : 'var(--brand)', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{valor}</span>
      <span style={{ color: 'var(--ink)' }}>{txt}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA DESEMPENHO — KPIs → [gráfico | etapas] → CARIMBOS → tabela (ordem VND).
// ─────────────────────────────────────────────────────────────────────────────
function AbaDesempenho({
  desempenho, totalDias, diasConcluidos, pontos, progressoPct, carimbos,
}: {
  desempenho: AulaDesempenho[]; totalDias: number; diasConcluidos: number; pontos: number; progressoPct: number; carimbos: CarimboAlunoView[]; gam?: GamRail | null
}) {
  const qFeitas = desempenho.reduce((s, a) => s + a.questoesRespondidas, 0)
  const qTotal = desempenho.reduce((s, a) => s + a.questoesTotal, 0)
  const feitosComQuiz = desempenho.filter((d) => d.questoesTotal > 0 && d.questoesRespondidas > 0)
  const acertoMedio = feitosComQuiz.length
    ? Math.round(feitosComQuiz.reduce((s, d) => s + (d.questoesRespondidas / d.questoesTotal) * 100, 0) / feitosComQuiz.length)
    : 0
  const melhorSeq = desempenho.reduce((m, a) => Math.max(m, a.sequencia), 0)

  // VND: ícones dos KPIs alternam --chip e dourado.
  const kpis = [
    { rotulo: 'Aulas concluídas', valor: `${diasConcluidos}/${totalDias}`, icon: <Check size={17} />, gold: false },
    { rotulo: 'Questões respondidas', valor: `${qFeitas}/${qTotal || totalDias * 10}`, icon: <List size={17} />, gold: true },
    { rotulo: 'Acerto nos quizzes', valor: `${acertoMedio}%`, icon: <Target size={17} />, gold: false },
    { rotulo: 'Pontos no desafio', valor: fmt(pontos), icon: <Zap size={17} />, gold: true },
    { rotulo: 'Melhor sequência', valor: String(melhorSeq), icon: <Flame size={17} />, gold: false },
  ]

  const etapas: { t: string; d: string; ok: boolean }[] = [
    { t: 'Acampamento base', d: 'Dia 1', ok: diasConcluidos >= 1 },
    { t: 'Primeiro mirante', d: 'Dia 7', ok: diasConcluidos >= 7 },
    { t: 'Meio da encosta', d: 'Dia 15', ok: diasConcluidos >= 15 },
    { t: 'Acampamento alto', d: 'Dia 21', ok: diasConcluidos >= 21 },
    { t: 'Cume', d: `Dia ${totalDias}`, ok: diasConcluidos >= totalDias },
  ]

  const CHART_W = 640
  const CHART_H = 150
  const barW = CHART_W / Math.max(1, totalDias) - 4

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div className="lsv-des-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
        {kpis.map((k) => (
          <div key={k.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, background: k.gold ? 'rgba(232,200,119,.2)' : 'var(--chip)', color: k.gold ? GOLD_INK : 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{k.icon}</span>
            <div style={{ lineHeight: 1.2, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 18, color: 'var(--ink)' }}>{k.valor}</b>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{k.rotulo}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico | Etapas */}
      <div className="lsv-des-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <TrendingUp size={18} color="var(--brand)" />
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Acertos por dia</h3>
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>quiz de 10 questões</span>
          </div>
          {desempenho.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sem dados de desempenho ainda.</div>
          ) : (
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H + 18}`} preserveAspectRatio="none" style={{ width: '100%', height: 168, display: 'block' }}>
              {desempenho.slice(0, totalDias).map((a, i) => {
                const pct = a.questoesTotal > 0 ? (a.questoesRespondidas / a.questoesTotal) * 100 : 0
                const bloq = a.estado === 'bloqueado'
                const andamento = a.estado === 'atual'
                const h = Math.max(6, (pct / 100) * CHART_H)
                const x = (CHART_W / totalDias) * i + 2
                const fill = bloq ? 'var(--track)' : andamento ? 'var(--brand)' : '#22B573'
                return (
                  <rect key={a.id} x={x} y={CHART_H - h} width={Math.max(6, barW)} height={h} rx={3} fill={fill}>
                    <title>Dia {i + 1}: {Math.round(pct)}%</title>
                  </rect>
                )
              })}
            </svg>
          )}
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11.5, color: 'var(--muted)', flexWrap: 'wrap' }}>
            <Legenda cor="#22B573" txt="Concluída" />
            <Legenda cor="var(--brand)" txt="Leitura em andamento" />
            <Legenda cor="var(--track)" txt="Bloqueada" />
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Flag size={18} color="var(--brand)" />
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Etapas da montanha</h3>
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{progressoPct}% da altitude</span>
          </div>
          {etapas.map((e, i) => (
            <div key={e.t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: i === 0 ? 0 : '1px solid var(--line)' }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: e.ok ? '#22B573' : 'var(--surface2)', color: e.ok ? '#fff' : 'var(--muted)' }}>
                {e.ok ? <Check size={13} /> : <Flag size={13} />}
              </span>
              <b style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{e.t}</b>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{e.d}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CARIMBOS (antes da tabela — ordem VND) */}
      {carimbos.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Trophy size={18} color="var(--brand)" />
            <div style={{ lineHeight: 1.25 }}>
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Passaporte de carimbos</h3>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Carimbos que você coleta ao longo da subida</span>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>{carimbos.filter((c) => c.ganho).length}/{carimbos.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 14 }}>
            {carimbos.map((c) => (
              <div key={c.def.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
                <span style={{ width: 72, height: 72, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: c.ganho ? `2px dashed ${GOLD}` : '2px dashed var(--line2)', background: c.ganho ? 'color-mix(in srgb,var(--brand) 8%,transparent)' : 'var(--surface2)', transform: c.ganho ? 'rotate(-8deg)' : 'none' }}>
                  {c.ganho && c.def.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.def.url} alt="" style={{ width: '82%', height: '82%', objectFit: 'contain' }} />
                  ) : (
                    <Lock size={22} color="var(--muted)" />
                  )}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: c.ganho ? 'var(--ink)' : 'var(--muted)', lineHeight: 1.2 }}>{c.def.titulo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela "Todas as aulas" */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <List size={18} color="var(--brand)" />
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Todas as aulas</h3>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{totalDias} dias</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: DES_COLS, gap: 12, padding: '0 10px 10px', borderBottom: '1px solid var(--line)' }}>
          {['Dia', 'Aula', 'Feito em', 'Leitura', 'Questões', 'Sequência', 'Pontos', 'Situação'].map((h) => (
            <span key={h} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{h}</span>
          ))}
        </div>
        <div style={{ maxHeight: 560, overflowY: 'auto' }}>
          {desempenho.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Nenhuma aula neste módulo.</div>
          ) : desempenho.map((a, i) => {
            const bloqueada = a.estado === 'bloqueado'
            const concl = a.estado === 'concluido'
            return (
              <div key={a.id} className="rowh" style={{ display: 'grid', gridTemplateColumns: DES_COLS, gap: 12, alignItems: 'center', padding: 10, borderBottom: '1px solid var(--line)', opacity: bloqueada ? 0.55 : 1 }}>
                <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{String(i + 1).padStart(2, '0')}</b>
                <div style={{ minWidth: 0 }}>
                  {bloqueada ? (
                    <b style={{ display: 'block', fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titulo}</b>
                  ) : (
                    <Link href={`/aluno/leitura/${a.id}`} style={{ display: 'block', fontSize: 13, color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'none' }}>{a.titulo}</Link>
                  )}
                </div>
                <span style={{ fontSize: 12, color: a.diaFeito ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDiaFeito(a.diaFeito)}</span>
                {concl || a.leituraConcluida ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#1FA868' }}><Check size={13} strokeWidth={3} /> 100%</span>
                ) : bloqueada ? (
                  <span style={{ color: 'var(--muted)' }}>—</span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 90, height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${Math.round(a.leituraPct)}%`, background: 'var(--brand)' }} />
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{Math.round(a.leituraPct)}%</span>
                  </div>
                )}
                <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{a.questoesTotal > 0 ? `${a.questoesRespondidas}/${a.questoesTotal}` : '—'}</span>
                {a.sequencia > 0 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700, color: '#F0773A' }}><Flame size={13} /> {a.sequencia}</span>
                ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                {a.pontos > 0 || a.pontosExtra > 0 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <b style={{ fontSize: 12.5, color: 'var(--brand)' }}>+{a.pontos}</b>
                    {a.pontosExtra > 0 ? <span title="Bônus (sequência/conclusão)" style={{ fontSize: 10, fontWeight: 800, color: GOLD_INK, background: 'rgba(232,200,119,.2)', borderRadius: 99, padding: '1px 6px', whiteSpace: 'nowrap' }}>+{a.pontosExtra} bônus</span> : null}
                  </span>
                ) : <b style={{ fontSize: 12.5, color: 'var(--muted)' }}>—</b>}
                {concl ? (
                  <PillV cor="#1FA868" icon={<Check size={11} strokeWidth={3} />}>Concluída</PillV>
                ) : bloqueada ? (
                  <PillV cor="var(--muted)" icon={<Lock size={11} />}>Bloqueada</PillV>
                ) : (
                  <PillV cor="var(--brand)" icon={<Zap size={11} />}>Em andamento</PillV>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const DES_COLS = '60px minmax(0,2fr) 0.9fr 1.2fr 0.8fr 0.8fr 0.7fr 120px'

function fmtDiaFeito(d: string | null): string {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return y && m && dd ? `${dd}/${m}/${y.slice(2)}` : '—'
}

function PillV({ cor, icon, children }: { cor: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, background: `color-mix(in srgb,${cor} 13%,transparent)`, color: cor }}>
      {icon}{children}
    </span>
  )
}
function Legenda({ cor, txt }: { cor: string; txt: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: cor }} />{txt}</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA RANKING — [420px: topo + progresso] | tabela. Terceiros só iniciais.
// ─────────────────────────────────────────────────────────────────────────────
function AvatarV({ avatar, cor, size, sou, seed }: { avatar?: string | null; cor?: string | null; size: number; sou?: boolean; seed?: string | null }) {
  const src = avatar || avatarPadraoDe(seed)
  return (
    <span style={{ flexShrink: 0, width: size, height: size, borderRadius: '50%', overflow: 'hidden', background: cor || 'var(--surface2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: sou ? `2px solid ${GOLD}` : undefined }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center 82%' }} />
    </span>
  )
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  if (total <= 1) return null
  const btn = (disabled: boolean): React.CSSProperties => ({ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: disabled ? 'var(--muted)' : 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1 })
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 14 }}>
      <button type="button" aria-label="Primeira" disabled={page <= 0} onClick={() => onPage(0)} style={btn(page <= 0)}><ChevronsLeft size={16} /></button>
      <button type="button" aria-label="Anterior" disabled={page <= 0} onClick={() => onPage(page - 1)} style={btn(page <= 0)}><ChevronLeft size={16} /></button>
      <span style={{ minWidth: 64, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{page + 1}/{total}</span>
      <button type="button" aria-label="Próxima" disabled={page >= total - 1} onClick={() => onPage(page + 1)} style={btn(page >= total - 1)}><ChevronRight size={16} /></button>
      <button type="button" aria-label="Última" disabled={page >= total - 1} onClick={() => onPage(total - 1)} style={btn(page >= total - 1)}><ChevronsRight size={16} /></button>
    </div>
  )
}

function RankTh({ label, col, sortBy, dir, onSort, right, brand }: { label: string; col: string; sortBy: string; dir: 'asc' | 'desc'; onSort: (c: string) => void; right?: boolean; brand?: boolean }) {
  const active = sortBy === col
  return (
    <button type="button" onClick={() => onSort(col)} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: right ? 'flex-end' : 'flex-start', width: '100%', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: active || brand ? 'var(--brand)' : 'var(--muted)' }}>
      {label}
      {active && (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  )
}

function AbaRanking({
  ranking, loading, minhaLinha, meuId, meuNome, progressoPct, totalDias, moduloNome,
}: {
  ranking: RankingLeitura; loading?: boolean; minhaLinha?: RankingLeituraItem | null; meuId?: string | null; meuNome?: string | null
  progressoPct: number; totalDias: number; moduloNome: string; gam?: GamRail | null
}) {
  const itens = ranking.itens.filter((r) => !r.oculto)
  const euBase = minhaLinha ?? itens.find((r) => r.estudanteId === meuId) ?? null
  const minhaPosicao = useMemo(() => {
    if (!euBase) return 0
    const exato = itens.find((r) => r.estudanteId === meuId)?.posicao
    if (exato) return exato
    return itens.filter((r) => r.estudanteId !== meuId && (r.streakAtual > euBase.streakAtual || (r.streakAtual === euBase.streakAtual && r.score > euBase.score))).length + 1
  }, [itens, euBase, meuId])
  const eu = euBase ? { ...euBase, posicao: euBase.posicao || minhaPosicao } : null
  const top3 = itens.slice(0, 3)
  const total = itens.length

  const nomeExib = (r: RankingLeituraItem) => (r.estudanteId === meuId ? (meuNome ? primeiroNome(meuNome) : 'Você') : iniciaisDe(r.nome))

  type Col = 'pos' | 'aulas' | 'seq' | 'pts'
  const [sortBy, setSortBy] = useState<Col>('pos')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const POR_PAG = 10
  const ordenados = useMemo(() => {
    const val = (r: RankingLeituraItem) => sortBy === 'aulas' ? r.aulasConcluidas : sortBy === 'seq' ? r.streakAtual : sortBy === 'pts' ? r.score : r.posicao
    return [...itens].sort((a, b) => (val(a) - val(b)) * (dir === 'asc' ? 1 : -1))
  }, [itens, sortBy, dir])
  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / POR_PAG))
  const pageSafe = Math.min(page, totalPaginas - 1)
  const pageItens = ordenados.slice(pageSafe * POR_PAG, pageSafe * POR_PAG + POR_PAG)
  const ordenar = (c: string) => {
    const col = c as Col
    if (col === sortBy) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(col); setDir(col === 'pos' ? 'asc' : 'desc') }
    setPage(0)
  }

  if (loading && !itens.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '64px 20px', color: 'var(--muted)', fontSize: 14 }}>
        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--brand)' }} /> Carregando ranking…
      </div>
    )
  }

  return (
    <div className="lsv-rank-grid" style={{ display: 'grid', gridTemplateColumns: '420px minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
      {/* Esquerda: pódio + você + progresso */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 20 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{moduloNome}</span>
          <b style={{ display: 'block', margin: '4px 0 2px', fontSize: 22, letterSpacing: '-0.03em', color: 'var(--ink)' }}>Ranking geral</b>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1FA868' }} /> Ao vivo · <b style={{ color: 'var(--ink)' }}>{fmt(total)}</b> alunos
          </span>

          {top3.length > 0 && (
            <div style={{ marginTop: 22, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              {[top3[1], top3[0], top3[2]].map((r, idx) => {
                if (!r) return <div key={idx} style={{ flex: 1 }} />
                const pos = r.posicao
                const alt = pos === 1 ? 120 : pos === 2 ? 90 : 70
                const cor = pos === 1 ? GOLD : pos === 2 ? '#C0C7CF' : '#D3955E'
                const sou = r.estudanteId === meuId
                return (
                  <div key={r.estudanteId} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    {pos === 1 && <Crown size={18} color="#E8B83A" />}
                    <AvatarV avatar={r.avatar} cor={r.avatarCor} seed={r.estudanteId} size={pos === 1 ? 48 : 40} sou={sou} />
                    <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{nomeExib(r)}</b>
                    <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {fmt(r.score)} pts{r.streakAtual > 0 ? <> · <span style={{ color: '#F0773A' }}><Flame size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> {r.streakAtual}</span></> : ''}
                    </span>
                    <div style={{ width: '100%', height: alt, borderRadius: '14px 14px 4px 4px', background: `linear-gradient(180deg,${cor}66,${cor}11)`, border: `1px solid ${cor}88`, display: 'flex', justifyContent: 'center', paddingTop: 10, fontSize: 20, fontWeight: 800, color: cor }}>
                      {pos}º
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {eu && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, background: 'var(--surface)', border: `1.5px solid ${GOLD}`, boxShadow: '0 12px 24px -18px rgba(0,0,0,.5)' }}>
                <div style={{ paddingRight: 12, borderRight: '1px solid var(--line)' }}>
                  <b style={{ display: 'block', fontSize: 24, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{eu.posicao}º</b>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Posição</span>
                </div>
                <AvatarV avatar={eu.avatar} cor={eu.avatarCor} seed={meuId ?? eu.estudanteId} size={40} sou />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14, color: 'var(--ink)' }}>{meuNome ? primeiroNome(meuNome) : 'Você'}</b>{' '}
                  <span style={{ height: 18, padding: '0 6px', borderRadius: 99, background: 'rgba(232,200,119,.22)', color: GOLD_INK, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>VOCÊ</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{eu.aulasConcluidas}/{eu.totalAulas} aulas</span>
                </div>
                <div style={{ textAlign: 'center', paddingLeft: 10, borderLeft: '1px solid var(--line)' }}>
                  <b style={{ display: 'block', fontSize: 16, color: '#F0773A' }}>{eu.streakAtual}</b>
                  <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>seq.</span>
                </div>
                <div style={{ textAlign: 'center', paddingLeft: 10, borderLeft: '1px solid var(--line)' }}>
                  <b style={{ display: 'block', fontSize: 16, color: 'var(--brand)' }}>{fmt(eu.score)}</b>
                  <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>pts</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <b style={{ fontSize: 14, color: 'var(--ink)' }}>Progresso do desafio</b>
            <b style={{ fontSize: 13, color: 'var(--brand)' }}>{progressoPct}%</b>
          </div>
          <div style={{ margin: '10px 0 6px' }}>
            <div style={{ height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${progressoPct}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg,var(--brand),${GOLD})` }} />
            </div>
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{eu?.aulasConcluidas ?? 0} de {totalDias} aulas concluídas</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)' }}>
            <TrendingUp size={14} color="#1FA868" /> Conclua a aula de hoje para subir no ranking.
          </div>
        </div>
      </div>

      {/* Direita: classificação */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trophy size={18} color="var(--brand)" />
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Classificação</h3>
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmt(total)} alunos</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: RANK_COLS, gap: 12, padding: '0 12px 10px', borderBottom: '1px solid var(--line)' }}>
          <RankTh label="#" col="pos" sortBy={sortBy} dir={dir} onSort={ordenar} />
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Aluno</span>
          <RankTh label="Aulas" col="aulas" sortBy={sortBy} dir={dir} onSort={ordenar} right />
          <RankTh label="Sequência" col="seq" sortBy={sortBy} dir={dir} onSort={ordenar} right />
          <RankTh label="Pontos" col="pts" sortBy={sortBy} dir={dir} onSort={ordenar} right brand />
        </div>
        <div>
          {ordenados.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Ranking ainda sem participantes.</div>
          ) : pageItens.map((r) => {
            const sou = r.estudanteId === meuId
            const top = r.posicao <= 3
            return (
              <div key={r.estudanteId} className="rowh" style={{ display: 'grid', gridTemplateColumns: RANK_COLS, gap: 12, alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--line)', background: sou ? 'color-mix(in srgb,var(--brand) 7%,transparent)' : 'transparent' }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: top ? 'var(--chip)' : 'transparent', color: top ? 'var(--brand)' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{r.posicao}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <AvatarV avatar={r.avatar} cor={r.avatarCor} seed={r.estudanteId} size={34} sou={sou} />
                  <div style={{ minWidth: 0 }}>
                    <b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)', fontWeight: sou ? 800 : 700 }}>
                      {nomeExib(r)}
                      {sou && <span style={{ marginLeft: 6, height: 16, padding: '0 5px', borderRadius: 99, background: 'var(--brand)', color: '#fff', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', verticalAlign: '1px' }}>VOCÊ</span>}
                    </b>
                  </div>
                </div>
                <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--muted)' }}>{r.aulasConcluidas}</span>
                {r.streakAtual > 0 ? (
                  <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#F0773A' }}><Flame size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> {r.streakAtual}</span>
                ) : <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--muted)' }}>—</span>}
                <b style={{ textAlign: 'right', fontSize: 14, color: 'var(--ink)' }}>{fmt(r.score)}</b>
              </div>
            )
          })}
        </div>
        <Pager page={pageSafe} total={totalPaginas} onPage={setPage} />
      </div>
    </div>
  )
}

const RANK_COLS = '50px minmax(0,1fr) 80px 100px 90px'
