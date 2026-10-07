'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DESAFIO DE LEI SECA — ÁREA INTERNA (montanha) · marca REVISÃO.
//
// Porte fiel do mockup `DesafioLSRevisao.dc.html` (marca Revisão — roxo + ouro).
// NÃO é o layout do MEQ: hero diferente (banner roxo radial com a peça gráfica
// "DESAFIO LEI SECA" + abas SUBLINHADAS na borda inferior), palco da montanha com
// coluna lateral à DIREITA (card roxo "Aula do dia" + próximas paradas + energia),
// overlay "Subindo a montanha" no topo, zoom vertical à direita, toolbar embaixo e
// barra de início acoplada; traço da trilha em OURO (#F1C232). Desempenho com KPIs
// em cards com ícone + gráfico/etapas + tabela + carimbos. Ranking com pódio+você
// à ESQUERDA (420px) e a classificação à direita (invertido vs MEQ).
//
// REUSA do `desafio-ls-meq.tsx` a MECÂNICA da trilha (motor) e TODO o data-wiring:
//   • geometria: PATH de 30 nós, samplePath(), splinePath() (Catmull-Rom→Bézier);
//   • zoom/pan imperativo (applyTransform/clampPan/zoomBy/irMinhaAula/verTudo);
//   • mapeamento nó real → ponto da trilha (nodePts), idxAtual/progresso/pontos;
//   • privacidade (iniciaisDe p/ terceiros, "Você"/nome real p/ o próprio).
// Só muda o CHROME/cores/layout (Revisão).
//
// Tokens: herda var(--brand)/--surface/--ink/--muted/--line/--track/--chip/--brand2
// do root (o pai injeta `internaTokensStyle('revisao', theme)`). Ouro = #F1C232
// (acento permitido do mockup). NÃO hardcode cores do MEQ.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Flag, BookOpen, BarChart3, Trophy, Play, RotateCcw, Lock, Check, Mountain,
  Plus, Minus, Maximize2, Crosshair, Download, ExternalLink,
  Flame, Zap, Crown, Target, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronUp, ChevronDown, Scale, FileText, TrendingUp, List, Loader2,
} from 'lucide-react'
import type { Trilha, TrilhaNode } from '@/components/aluno/trilha-simulados'
import type { AulaDesempenho } from '@/lib/leitura/trilha'
import type { RankingLeitura, RankingLeituraItem } from '@/lib/leitura/ranking'
import type { RegulamentoConfig } from '@/lib/leitura/regulamento'
import type { PontuacaoLeitura } from '@/lib/leitura/pontuacao'
import type { GamRail } from '@/lib/aluno/trilhas'
import type { CarimboAlunoView } from '@/components/aluno/carimbos-colecao'
import { avatarPadraoDe } from '@/lib/aluno/avatar-padrao'
import type { DesafioLSMeqProps } from './desafio-ls-meq'
import { useTemaInterno } from '@/components/brand/interna/use-tema-interno'

const GOLD = '#F1C232'

// Helper puro (iniciais p/ privacidade de terceiros) — inline p/ NÃO arrastar `ranking.ts`
// (server-only: importa createAdminClient) para dentro deste client component. (= MEQ)
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
// (REUSO do motor MEQ — mesma trilha fixa de 30 nós.)
const IMG_W = 1024
const IMG_H = 1536
// Posições EXATAS dos 30 dias (dia 1 na base → dia 30 no cume), extraídas do mockup DesafioLSRevisao
// (os pontos-âncora do spline). Usar estas coordenadas — e não uma reamostragem equidistante — evita
// que dias próximos (ex.: 19 e 20) se sobreponham e deixa a trilha IDÊNTICA ao mockup.
const NODES: [number, number][] = [
  [690, 1495], [724.5, 1414.1], [735.5, 1328.5], [708, 1246], [632.8, 1209.8], [548.4, 1184.5], [522.5, 1139.9], [604.2, 1115.2], [689.2, 1092.3], [733.8, 1054.2],
  [649.8, 1028.1], [564, 1008.3], [513.4, 973.2], [596.3, 950.7], [678.9, 920.4], [616.3, 886.6], [533.6, 859], [590.8, 838.4], [644, 829.3], [694.8, 813.4],
  [610.8, 788.7], [604.9, 746.9], [680, 715.1], [598.5, 681.9], [525.3, 634.5], [522.8, 582.7], [607.9, 561.1], [551.6, 525.6], [534.2, 446], [515, 360],
]
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

/** NOVO ícone de sequência (ofensiva) — chama bicolor animada do mockup (substitui o Flame genérico). */
function FlameSeq({ size = 18 }: { size?: number }) {
  return (
    <svg className="lsfl" viewBox="0 0 24 30" aria-hidden style={{ width: size, height: Math.round(size * 1.27), overflow: 'visible', display: 'block' }}>
      <ellipse className="sh" cx="12" cy="27.6" rx="7" ry="1.7" fill="rgba(150,50,30,.28)" />
      <g className="b">
        <path className="o" d="M12 25.4C7.4 25.4 4.1 22.1 4.1 17.7 4.1 14.7 5.5 12.6 6.3 10.7 6.7 9.6 6.7 6.6 7.1 5.3 7.4 4.4 8.4 4.3 8.9 5.1 9.6 6.3 10 7.2 10.6 7.8 11.1 5.7 11.9 2.9 13.4 1.4 14 .8 14.9 .9 15.3 1.6 17.4 5.3 19.9 9.8 19.9 17.4 19.9 22.1 16.6 25.4 12 25.4Z" fill="#F26B4A" />
        <path className="i" d="M12 23.3C9.9 23.3 8.6 21.8 8.6 20 8.6 17.9 10.5 16.1 11.4 14.3 11.6 13.9 12.4 13.9 12.6 14.3 13.5 16.1 15.4 17.9 15.4 20 15.4 21.8 14.1 23.3 12 23.3Z" fill="#FFC24D" />
      </g>
    </svg>
  )
}

export function DesafioLSRevisao({
  theme, trilha, desempenho, ranking, minhaLinha, meuId, meuNome, regulamento, pontuacao, gam, carimbos = [], diasLeitura = [], moduloNome,
}: DesafioLSMeqProps) {
  useTemaInterno(theme) // reage ao toggle claro/escuro/azul ao vivo
  const [tab, setTab] = useState<Tab>('trilha')

  // Ranking SOB DEMANDA: no interno o servidor manda a lista vazia (abertura do desafio rápida); só
  // buscamos o ranking (1000+ alunos) quando a aba Ranking abre. A linha "Você" (minhaLinha) já veio.
  const searchParams = useSearchParams()
  const moduloId = searchParams.get('modulo')
  const [rankingLazy, setRankingLazy] = useState<RankingLeitura | null>(null)
  const [rankLoading, setRankLoading] = useState(false)
  useEffect(() => {
    if (tab !== 'rank' || rankingLazy || ranking.itens.length > 0 || !moduloId) return
    setRankLoading(true)
    fetch(`/api/aluno/leitura/ranking?modulo=${encodeURIComponent(moduloId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.itens)) setRankingLazy(d) })
      .catch(() => {})
      .finally(() => setRankLoading(false))
  }, [tab, moduloId, rankingLazy, ranking.itens.length])
  const rankingAtivo = rankingLazy ?? ranking

  // ── Nós reais → geometria da montanha. (REUSO da lógica MEQ.) ──
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
  const pontos = useMemo(() => desempenho.reduce((s, a) => s + (a.pontos || 0), 0), [desempenho])
  const posicao = minhaLinha?.posicao ?? rankingAtivo.itens.find((r) => r.estudanteId === meuId)?.posicao ?? null

  const TABS: { k: Tab; label: string; icon: React.ReactNode }[] = [
    { k: 'trilha', label: 'Trilha', icon: <Flag size={15} /> },
    { k: 'reg', label: 'Regulamento', icon: <BookOpen size={15} /> },
    { k: 'des', label: 'Desempenho', icon: <BarChart3 size={15} /> },
    { k: 'rank', label: 'Ranking', icon: <Trophy size={15} /> },
  ]

  return (
    <div data-ls-rev style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ═══════════ HERO (banner roxo + peça gráfica + abas sublinhadas) ═══════════ */}
      <HeaderHero moduloNome={moduloNome} diasConcluidos={diasConcluidos} totalDias={totalDias} tab={tab} setTab={setTab} tabs={TABS} banner={trilha.capa ?? trilha.capaCard ?? null} />

      {/* ═══════════ CONTEÚDO (banner full-bleed acima; aqui o conteúdo recebe respiro lateral) ═══════════ */}
      <div style={{ padding: '22px 24px 24px' }}>
        {/* `key={tab}` remonta o painel ao trocar de aba → a animação lsrTabIn (fade + leve subida) re-roda. */}
        <div key={tab} className="lsr-tabpane">
          {tab === 'trilha' && (
            <AbaTrilha nodes={nodes} dy={dy} setDy={setDy} idxAtual={idxAtual} diasConcluidos={diasConcluidos} totalDias={totalDias} progressoPct={progressoPct} desempenho={desempenho} gam={gam} diasLeitura={diasLeitura} />
          )}
          {tab === 'reg' && <AbaRegulamento regulamento={regulamento} pontuacao={pontuacao} gam={gam} moduloNome={moduloNome} />}
          {tab === 'des' && <AbaDesempenho desempenho={desempenho} totalDias={totalDias} diasConcluidos={diasConcluidos} pontos={pontos} progressoPct={progressoPct} carimbos={carimbos} />}
          {tab === 'rank' && <AbaRanking ranking={rankingAtivo} loading={rankLoading} minhaLinha={minhaLinha} meuId={meuId} meuNome={meuNome} progressoPct={progressoPct} totalDias={totalDias} moduloNome={moduloNome} />}
        </div>
      </div>

      <style>{`
        @media (max-width: 1023px){
          [data-ls-rev] .lsr-trilha-wrap{ flex-direction:column !important; }
          [data-ls-rev] .lsr-side{ flex:0 0 auto !important; width:100% !important; position:static !important; }
          [data-ls-rev] .lsr-des-kpis{ grid-template-columns:repeat(2,1fr) !important; }
          [data-ls-rev] .lsr-des-grid{ grid-template-columns:1fr !important; }
          [data-ls-rev] .lsr-rank-grid{ grid-template-columns:1fr !important; }
          [data-ls-rev] .lsr-reg-grid{ grid-template-columns:1fr !important; }
          [data-ls-rev] .lsr-hero-piece{ display:none !important; }
        }
        [data-ls-rev] .lsfl .b{ transform-box:view-box; transform-origin:12px 25.4px; animation:lsflb 1.6s cubic-bezier(.45,0,.55,1) infinite }
        [data-ls-rev] .lsfl .o{ transform-box:view-box; transform-origin:12px 25px; animation:lsflo 2.4s ease-in-out infinite }
        [data-ls-rev] .lsfl .i{ transform-box:view-box; transform-origin:12px 23.3px; animation:lsfli 1.1s ease-in-out infinite }
        [data-ls-rev] .lsfl .sh{ transform-box:view-box; transform-origin:12px 27.6px; animation:lsflsh 1.6s cubic-bezier(.45,0,.55,1) infinite }
        @keyframes lsflb{ 0%,100%{transform:scale(1,1)} 18%{transform:scale(1.07,.92)} 38%{transform:scale(.95,1.08) translateY(-.6px)} 58%{transform:scale(1.02,.98)} 76%{transform:scale(.99,1.02)} }
        @keyframes lsflo{ 0%,100%{transform:skewX(0deg)} 30%{transform:skewX(-3deg)} 70%{transform:skewX(3deg)} }
        @keyframes lsfli{ 0%,100%{transform:scale(1,1)} 40%{transform:scale(.88,1.1)} 70%{transform:scale(1.06,.94)} }
        @keyframes lsflsh{ 0%,100%{transform:scaleX(1);opacity:1} 18%{transform:scaleX(1.1)} 38%{transform:scaleX(.88);opacity:.75} }
        @keyframes lsrPulse{ 0%,100%{ box-shadow:0 0 0 0 color-mix(in srgb,${GOLD} 55%,transparent);} 50%{ box-shadow:0 0 0 10px color-mix(in srgb,${GOLD} 0%,transparent);} }
        @keyframes lsrPulseLib{ 0%,100%{ box-shadow:0 0 0 0 rgba(143,117,255,.55);} 50%{ box-shadow:0 0 0 10px rgba(143,117,255,0);} }
        @keyframes lsrBob{ 0%,100%{ transform:translateY(0);} 50%{ transform:translateY(-4px);} }
        /* Bob do balão "Libera amanhã" PRESERVANDO a centralização (translate -50% + deslocamento). Sem isto
           a animação sobrescreve o transform inline e o balão desgruda do nó. */
        @keyframes lsrBobLib{ 0%,100%{ transform:translate(-50%, calc(-50% - 46px)); } 50%{ transform:translate(-50%, calc(-50% - 52px)); } }
        [data-ls-rev] .lsr-tab{ transition:color .25s; }
        /* Transição do CONTEÚDO ao trocar de aba — DESLIZAMENTO (entra da direita) + fade. */
        [data-ls-rev] .lsr-tabpane{ animation:lsrTabIn .34s cubic-bezier(.22,1,.36,1) both; }
        @keyframes lsrTabIn{ from{ opacity:0; transform:translateX(34px); } to{ opacity:1; transform:none; } }
        /* Balão de ação do nó: "pop" ao abrir e encolher+fade ao fechar, escalando da base (seta/nó). */
        .lsr-balao-in{ animation:lsrBalaoIn .22s cubic-bezier(.2,.9,.3,1.4) both; transform-origin:50% 100%; }
        .lsr-balao-out{ animation:lsrBalaoOut .14s ease-in both; transform-origin:50% 100%; }
        @keyframes lsrBalaoIn{ 0%{ opacity:0; transform:scale(.55) translateY(14px); } 60%{ opacity:1; } 100%{ opacity:1; transform:none; } }
        @keyframes lsrBalaoOut{ 0%{ opacity:1; transform:none; } 100%{ opacity:0; transform:scale(.7) translateY(8px); } }
        /* Pulo contínuo do balão (sobe/desce) — só depois do "pop" de entrada. */
        .lsr-balao-wrap{ animation:lsrBalaoBob 1.7s ease-in-out .28s infinite; }
        @keyframes lsrBalaoBob{ 0%,100%{ transform:translate(-50%, calc(-100% - 48px)); } 50%{ transform:translate(-50%, calc(-100% - 58px)); } }
        /* Botão de ação do balão: realce no HOVER e "pressionar" no CLIQUE. */
        .lsr-balao-cta{ transition:transform .12s ease, filter .12s ease, box-shadow .12s ease; }
        .lsr-balao-cta:hover{ filter:brightness(1.06); transform:translateY(-1px); box-shadow:0 10px 20px -10px rgba(0,0,0,.55); }
        .lsr-balao-cta:active{ transform:translateY(1px) scale(.97); filter:brightness(.95); }
        @media (prefers-reduced-motion: reduce){ [data-ls-rev] .lsr-tabpane{ animation:none; } }
        @media (prefers-reduced-motion: reduce){ [data-ls-rev] *{ animation:none !important; } }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO — banner roxo radial (220px) com peça gráfica "DESAFIO LEI SECA" central,
// breadcrumb do módulo à esquerda e as ABAS sublinhadas na borda inferior.
// ─────────────────────────────────────────────────────────────────────────────
function HeaderHero({
  moduloNome, diasConcluidos, totalDias, tab, setTab, tabs, banner,
}: {
  moduloNome: string; diasConcluidos: number; totalDias: number
  tab: Tab; setTab: (t: Tab) => void; tabs: { k: Tab; label: string; icon: React.ReactNode }[]
  banner?: string | null
}) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: 220, borderRadius: 0, background: 'radial-gradient(120% 140% at 50% 0%,#3B1E8F 0%,#1E1150 55%,#120A33 100%)' }}>
      {/* Banner REAL do módulo (capa) ao fundo, com degradê escuro p/ o grafismo "DESAFIO LEI SECA" seguir legível. */}
      {banner && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={banner} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {/* Efeitos decorativos (raios + textura) — só SEM banner (o banner já tem a própria arte). */}
      {!banner && (
        <>
          <span aria-hidden style={{ position: 'absolute', left: 40, top: -40, width: 3, height: 300, background: 'linear-gradient(180deg,transparent,#B9A6FF,transparent)', transform: 'rotate(35deg)', opacity: 0.8 }} />
          <span aria-hidden style={{ position: 'absolute', left: 90, top: -40, width: 14, height: 300, background: 'linear-gradient(180deg,transparent,rgba(143,117,255,.35),transparent)', transform: 'rotate(35deg)', opacity: 0.7 }} />
          <span aria-hidden style={{ position: 'absolute', right: 60, top: -40, width: 3, height: 300, background: 'linear-gradient(180deg,transparent,#E8B85A,transparent)', transform: 'rotate(-35deg)', opacity: 0.8 }} />
          <span aria-hidden style={{ position: 'absolute', right: 120, top: -40, width: 18, height: 300, background: 'linear-gradient(180deg,transparent,rgba(143,117,255,.3),transparent)', transform: 'rotate(-35deg)', opacity: 0.6 }} />
          <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px)', backgroundSize: '28px 28px' }} />
        </>
      )}

      {/* Breadcrumb do módulo (esq.) */}
      <div style={{ position: 'absolute', left: 28, top: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/aluno/leitura" aria-label="Voltar" style={{ width: 36, height: 36, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.12)', color: '#fff' }}>
            <ChevronLeft size={16} />
          </Link>
          <span style={{ display: 'inline-flex', color: '#CFC4FF' }}><Scale size={20} /></span>
          <b style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>{moduloNome}</b>
          <span style={{ height: 24, padding: '0 9px', borderRadius: 99, background: GOLD, color: '#2A1A55', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{diasConcluidos}/{totalDias}</span>
        </div>
      </div>

      {/* Peça gráfica central "DESAFIO LEI SECA" — só SEM banner (o banner já traz a arte do módulo). */}
      {!banner && (
      <div className="lsr-hero-piece" style={{ position: 'absolute', left: '50%', top: 34, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 30 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.3em', color: '#E9D9A6' }}>— DESAFIO —</span>
          <b style={{ marginTop: 4, fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em', backgroundImage: 'linear-gradient(180deg,#FFFFFF 0%,#E7DFFF 55%,#B9A6FF 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textShadow: '0 6px 24px rgba(0,0,0,.25)' }}>LEI SECA</b>
          <span style={{ marginTop: 4, fontStyle: 'italic', fontWeight: 600, fontSize: 20, backgroundImage: 'linear-gradient(90deg,#E8B85A,#F7DA7A,#C9952F)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{moduloNome}</span>
        </div>
        <div role="img" aria-label="Revisão Ensino Jurídico" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg viewBox="0 0 68 66" aria-hidden style={{ width: 29, height: 28 }}>
            <path fillRule="evenodd" fill="#FFFFFF" d="M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z M9.2 9.2H19.2V57.6H9.2Z" />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, color: '#fff' }}>
            <span style={{ fontWeight: 800, fontSize: 12, lineHeight: '.8', letterSpacing: '.01em' }}>REVISÃO</span>
            <span style={{ fontWeight: 500, fontSize: 5, letterSpacing: '.22em', color: '#E1D9FF' }}>ENSINO JURÍDICO</span>
          </div>
        </div>
      </div>
      )}

      {/* Abas sublinhadas (borda inferior do hero) — sem a linha quando há banner. */}
      <div style={{ position: 'absolute', left: 28, right: 28, bottom: 0, borderTop: banner ? 'none' : '1px solid rgba(255,255,255,.1)' }}>
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
                className="lsr-tab"
                style={{
                  position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, height: 44, padding: '0 4px',
                  border: 0, background: 'none', font: 'inherit', fontSize: 14, fontWeight: 700,
                  color: ativo ? '#fff' : 'rgba(255,255,255,.62)', cursor: 'pointer', whiteSpace: 'nowrap',
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
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA TRILHA — palco da montanha (flex 1) + coluna lateral à DIREITA (336px).
// ─────────────────────────────────────────────────────────────────────────────
function AbaTrilha({
  nodes, dy, setDy, idxAtual, diasConcluidos, totalDias, progressoPct, desempenho, gam, diasLeitura = [],
}: {
  nodes: TrilhaNode[]; dy: number; setDy: (i: number) => void; idxAtual: number
  diasConcluidos: number; totalDias: number; progressoPct: number; desempenho: AulaDesempenho[]; gam?: GamRail | null; diasLeitura?: string[]
}) {
  const sel = nodes[dy]
  const selDesemp = sel ? desempenho.find((d) => d.id === sel.id) : undefined

  return (
    <div className="lsr-trilha-wrap" style={{ display: 'flex', gap: 18, alignItems: 'stretch' }}>
      {/* ── Palco da montanha (com barra de início acoplada) ── */}
      <PalcoMontanha nodes={nodes} dy={dy} setDy={setDy} idxAtual={idxAtual} diasConcluidos={diasConcluidos} totalDias={totalDias} progressoPct={progressoPct} sel={sel} selDesemp={selDesemp} desempenho={desempenho} />

      {/* ── Coluna lateral DIREITA ── */}
      <aside className="lsr-side" style={{ flex: '0 0 336px', width: 336, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 90 }}>
        <AulaDoDiaCard sel={sel} selDesemp={selDesemp} dy={dy} idxAtual={idxAtual} />
        <ProximasParadas nodes={nodes} idxAtual={idxAtual} />
        <SuaEnergia desempenho={desempenho} gam={gam} diasLeitura={diasLeitura} />
      </aside>
    </div>
  )
}

// ── Card roxo "Aula do dia" (lateral) ──
function AulaDoDiaCard({ sel, selDesemp, dy, idxAtual }: { sel?: TrilhaNode; selDesemp?: AulaDesempenho; dy: number; idxAtual: number }) {
  if (!sel) return null
  const bloqueada = sel.estado === 'disponivel' && !!sel.naoLiberada
  const concluida = sel.estado === 'concluido'
  const leituraPct = selDesemp ? Math.round(selDesemp.leituraPct) : 0
  const ringLen = 163.36
  const ringOff = ringLen * (1 - (concluida ? 100 : leituraPct) / 100)
  const statusTxt = concluida ? 'Concluída' : bloqueada ? 'Bloqueada' : 'Em andamento'
  const qTxt = selDesemp && selDesemp.questoesTotal > 0 ? `${selDesemp.questoesRespondidas}/${selDesemp.questoesTotal}` : '0/10'
  const ptsTxt = selDesemp && selDesemp.pontos > 0 ? `+${selDesemp.pontos}` : '—'
  const ctaLab = concluida ? 'Revisar aula' : leituraPct > 0 ? 'Continuar leitura' : 'Começar aula'
  const href = sel.hrefLeitura ?? sel.href ?? '#'

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, padding: 20, background: 'radial-gradient(120% 120% at 100% 0%,#6449E0 0%,#3B1E8F 55%,#1E1150 100%)', color: '#fff', boxShadow: '0 24px 40px -24px rgba(40,20,110,.8)' }}>
      <span aria-hidden style={{ position: 'absolute', right: -30, top: -30, width: 120, height: 120, borderRadius: '50%', background: 'color-mix(in srgb,' + GOLD + ' 14%,transparent)' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', color: GOLD }}>AULA DO DIA</span>
        <span style={{ height: 22, padding: '0 9px', borderRadius: 99, background: 'rgba(255,255,255,.14)', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{statusTxt}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <b style={{ display: 'block', marginTop: 10, fontSize: 19, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{sel.titulo}</b>
        <span style={{ fontSize: 12.5, color: '#CFC4FF' }}>{sel.statusLabel || 'Aula do dia'} · ≈ 25 min</span>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, margin: '16px 0', padding: 12, borderRadius: 16, background: 'rgba(255,255,255,.08)' }}>
        <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
          <svg viewBox="0 0 64 64" style={{ width: 64, height: 64, transform: 'rotate(-90deg)', flexShrink: 0 }}>
            <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="7" />
            <circle cx="32" cy="32" r="26" fill="none" stroke={GOLD} strokeWidth="7" strokeLinecap="round" strokeDasharray={ringLen} strokeDashoffset={ringOff} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)' }} />
          </svg>
          <b style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{concluida ? 100 : leituraPct}%</b>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <LinhaRoxa rotulo="Leitura" valor={`${concluida ? 100 : leituraPct}%`} />
          <LinhaRoxa rotulo="Quiz" valor={qTxt} />
          <LinhaRoxa rotulo="Pontos" valor={ptsTxt} />
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        {bloqueada ? (
          <span style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, padding: '0 18px', borderRadius: 13, background: 'rgba(255,255,255,.1)', color: '#CFC4FF', fontSize: 13.5, fontWeight: 700 }}>
            <Lock size={15} /> Libera em breve
          </span>
        ) : concluida ? (
          <Link href={href} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 50, padding: '0 20px', borderRadius: 13, background: '#fff', border: 0, color: '#3B1E8F', fontSize: 15, fontWeight: 800, boxShadow: '0 10px 20px -12px rgba(0,0,0,.6)' }}>
            <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: '50%', background: 'color-mix(in srgb,var(--brand) 12%,transparent)', color: 'var(--brand)', alignItems: 'center', justifyContent: 'center' }}><RotateCcw size={14} /></span>
            Revisar aula
          </Link>
        ) : (
          <Link href={href} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 50, padding: '0 22px', borderRadius: 13, background: GOLD, color: '#2A1A55', fontSize: 15, fontWeight: 800 }}>
            <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,.12)', alignItems: 'center', justifyContent: 'center' }}><Play size={13} /></span>
            {ctaLab}
          </Link>
        )}
      </div>
    </div>
  )
}
function LinhaRoxa({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
      <span style={{ color: '#CFC4FF' }}>{rotulo}</span>
      <b style={{ color: '#fff' }}>{valor}</b>
    </div>
  )
}

// ── Próximas paradas (lista a partir dos nós reais) ──
function ProximasParadas({ nodes, idxAtual }: { nodes: TrilhaNode[]; idxAtual: number }) {
  const prox = nodes.slice(idxAtual, idxAtual + 4)
  if (prox.length === 0) return null
  const quando = (offset: number, n: TrilhaNode) => {
    if (offset === 0) return 'Hoje'
    if (offset === 1) return 'Amanhã'
    return n.statusLabel || `Em ${offset} dias`
  }
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Próximas paradas</span>
      </div>
      {prox.map((n, k) => {
        const idx = idxAtual + k
        const hoje = k === 0
        const bloqueado = n.estado === 'disponivel' && !!n.naoLiberada
        return (
          <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: k === 0 ? 0 : '1px dashed var(--line)' }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: hoje ? 'var(--brand)' : 'var(--surface2)', color: hoje ? '#fff' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {hoje ? <Play size={14} /> : bloqueado ? <Lock size={14} /> : <Flag size={14} />}
            </span>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
              <b style={{ display: 'block', fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Dia {String(idx + 1).padStart(2, '0')} · {n.titulo}</b>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{quando(k, n)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Sua energia (sequência + nível, do gam) + faixa de ofensiva DOM→SÁB (dias com leitura). ──
function SuaEnergia({ desempenho, gam, diasLeitura = [] }: { desempenho: AulaDesempenho[]; gam?: GamRail | null; diasLeitura?: string[] }) {
  const streak = gam?.resumo.streakAtual ?? desempenho.reduce((m, a) => Math.max(m, a.sequencia), 0)
  const recorde = gam?.resumo.streakMaior ?? streak
  const nivel = gam?.resumo.nivel ?? null
  const xp = gam?.resumo.xpTotal ?? null
  const xpFalta = gam?.resumo.progresso ? Math.max(0, gam.resumo.progresso.xpParaProximo) : null

  // Faixa da semana (DOM→SÁB): marca os dias com atividade de leitura e destaca HOJE.
  // Calculado no cliente (evita hydration mismatch do Date no servidor).
  const [semana, setSemana] = useState<{ sigla: string; ativo: boolean; hoje: boolean }[] | null>(null)
  useEffect(() => {
    const set = new Set(diasLeitura)
    const hoje = new Date()
    const dom = new Date(hoje); dom.setDate(hoje.getDate() - hoje.getDay()) // domingo desta semana
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
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Sua energia</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '10px 0 0' }}>
        <div style={{ padding: 12, borderRadius: 14, background: 'rgba(240,119,58,.1)' }}>
          <FlameSeq size={20} />
          <b style={{ display: 'block', marginTop: 4, fontSize: 18, color: 'var(--ink)' }}>{streak} {streak === 1 ? 'dia' : 'dias'}</b>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>sequência · recorde {recorde}</span>
        </div>
        <div style={{ padding: 12, borderRadius: 14, background: 'var(--chip)' }}>
          <span style={{ color: 'var(--brand)' }}><Zap size={18} /></span>
          <b style={{ display: 'block', marginTop: 4, fontSize: 18, color: 'var(--ink)' }}>{nivel != null ? `Nível ${nivel}` : '—'}</b>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{xp != null ? `${fmt(xp)} XP` : 'sem XP'}{xpFalta != null ? ` · faltam ${fmt(xpFalta)}` : ''}</span>
        </div>
      </div>
      {/* Faixa DOM→SÁB (ofensiva da semana) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginTop: 12 }}>
        {(semana ?? ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map((sigla) => ({ sigla, ativo: false, hoje: false }))).map((d, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', color: d.hoje ? 'var(--brand)' : 'var(--muted)' }}>{d.sigla}</span>
            <span style={{
              width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: d.ativo ? 'color-mix(in srgb,#F0773A 16%,transparent)' : 'var(--surface2)',
              border: d.hoje ? '2px solid var(--brand)' : '1px solid var(--line)',
              color: d.ativo ? '#F0773A' : 'var(--muted2, var(--muted))',
            }}>
              {d.ativo ? <FlameSeq size={15} /> : <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: 0.5 }} />}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PALCO DA MONTANHA — imagem + spline SVG (ouro) + 30 nós + overlay "Subindo a
// montanha" + zoom vertical à direita + toolbar + barra de início acoplada.
// (Motor de zoom/pan e mapeamento de nós = REUSO do MEQ.)
// ─────────────────────────────────────────────────────────────────────────────
function PalcoMontanha({
  nodes, dy, setDy, idxAtual, diasConcluidos, totalDias, progressoPct, sel, selDesemp, desempenho = [],
}: {
  nodes: TrilhaNode[]; dy: number; setDy: (i: number) => void; idxAtual: number
  diasConcluidos: number; totalDias: number; progressoPct: number; sel?: TrilhaNode; selDesemp?: AulaDesempenho; desempenho?: AulaDesempenho[]
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  // Balão de ação ancorado ao nó clicado (Iniciar/Continuar/Revisar) — reduz a confusão de ter que
  // olhar o card lateral. `null` = nenhum aberto. Fecha ao arrastar/dar zoom.
  const [balaoNode, setBalaoNode] = useState<number | null>(null)
  // Estado VISUAL do balão (mantém montado durante a animação de SAÍDA). `saindo` dispara a animação.
  const [balaoVis, setBalaoVis] = useState<{ i: number; saindo: boolean } | null>(null)
  const balaoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (balaoTimer.current) { clearTimeout(balaoTimer.current); balaoTimer.current = null }
    if (balaoNode !== null) setBalaoVis({ i: balaoNode, saindo: false })
    else { setBalaoVis((p) => (p ? { i: p.i, saindo: true } : null)); balaoTimer.current = setTimeout(() => setBalaoVis(null), 170) }
  }, [balaoNode])
  const zoomRef = useRef(1) // espelho síncrono do zoom p/ o transform imperativo (evita closure velha)
  const panRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; ox: number; oy: number }>({ active: false, sx: 0, sy: 0, ox: 0, oy: 0 })
  const wheelTargetRef = useRef<number | null>(null) // alvo de rolagem suave (y) da roda do mouse
  const rafRef = useRef<number | null>(null)

  const pts = NODES
  const spline = useMemo(() => splinePath(pts), [pts])
  const doneFrac = totalDias > 0 ? Math.min(1, diasConcluidos / (totalDias - 1 || 1)) : 0

  const nodePts = useMemo(() => {
    return nodes.slice(0, 30).map((node, i) => {
      const t = nodes.length > 1 ? i / (nodes.length - 1) : 0
      const p = pts[Math.round(t * (pts.length - 1))]
      return { node, i, x: p[0], y: p[1] }
    })
  }, [nodes, pts])

  // "Libera amanhã" = PRÓXIMA aula realmente BLOQUEADA (agendada), não o nó vizinho ao aluno. Com a aula
  // atrasada (várias disponíveis), o balão vai p/ o 1º nó bloqueado — nunca ao lado do "Você está aqui".
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
  // Liga/desliga a animação suave do transform: ligada ao dar zoom (gradiente), desligada ao arrastar
  // (resposta instantânea ao dedo/mouse).
  function setAnim(on: boolean) {
    if (stageRef.current) stageRef.current.style.transition = on ? 'transform .28s cubic-bezier(.22,1,.36,1)' : 'none'
  }
  // Rolagem SUAVE da roda: anima o pan.y até `wheelTargetRef` com easing (lerp), em vez de saltar.
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
    panRef.current.y = atual + dif * 0.18 // easing exponencial → desaceleração suave
    applyTransform()
    rafRef.current = requestAnimationFrame(passoRolagem)
  }

  // A imagem PREENCHE a LARGURA do palco mantendo a proporção (IMG_W×IMG_H) → o conteúdo fica MAIS ALTO
  // que a janela e o aluno ARRASTA na vertical para subir a montanha. Altura do conteúdo = largura ×
  // (IMG_H/IMG_W) × zoom (sem esticar; a janela mostra uma faixa e o resto rola).
  function contentSize() {
    const wrap = wrapRef.current
    const w = wrap ? wrap.clientWidth : 0
    return { w: w * zoomRef.current, h: w * (IMG_H / IMG_W) * zoomRef.current }
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
  // Começa mostrando a BASE (dia atual) — o aluno puxa para cima para ver o topo.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ch = wrap.clientWidth * (IMG_H / IMG_W)
    panRef.current = { x: 0, y: Math.min(0, wrap.clientHeight - ch) }
    applyTransform()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Rolar a trilha com a RODA DO MOUSE (pan vertical). Listener nativo não-passivo p/ poder
  // `preventDefault` — mas só quando a trilha realmente rola; nas bordas deixa a página rolar.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const { h: ch } = contentSize()
      const minY = Math.min(0, el.clientHeight - ch)
      if (minY >= 0) return // nada a rolar (conteúdo cabe na janela)
      // Rolagem SUAVE: acumula no alvo e deixa o rAF (passoRolagem) animar até lá com easing.
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
    setBalaoNode(null) // arrastar/clicar vazio fecha o balão; clicar num nó reabre no onClick do nó
    pararRolagemSuave() // arrastar cancela a rolagem suave em curso
    setAnim(false) // arrasto = sem animação (segue o dedo)
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

  /** Zoom ANCORADO: amplia/reduz mantendo fixo o ponto sob `anchor` (padrão = centro do que está
   *  visível), em vez de pular para o topo. Com animação suave (gradiente). */
  function zoomTo(nz: number, anchorClientX?: number, anchorClientY?: number) {
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const ax = (anchorClientX ?? rect.left + rect.width / 2) - rect.left
    const ay = (anchorClientY ?? rect.top + rect.height / 2) - rect.top
    const z0 = zoomRef.current
    const target = Math.max(1, Math.min(2.6, nz))
    // Ponto de conteúdo sob a âncora (origem do transform = canto sup-esq): content = (tela - pan) / z
    const cx = (ax - panRef.current.x) / z0
    const cy = (ay - panRef.current.y) / z0
    zoomRef.current = target
    setZoom(target)
    panRef.current.x = ax - cx * target
    panRef.current.y = ay - cy * target
    setAnim(true) // zoom = animação suave
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
    const relX = p.x / IMG_W
    const relY = p.y / IMG_H
    panRef.current.x = wrap.clientWidth / 2 - relX * wrap.clientWidth * target
    panRef.current.y = wrap.clientHeight / 2 - relY * (wrap.clientWidth * (IMG_H / IMG_W)) * target
    setAnim(true)
    clampPan(); applyTransform()
  }
  function verTudo() {
    const wrap = wrapRef.current
    zoomRef.current = 1
    setZoom(1)
    // "Ver trilha inteira" = zoom 1 mostrando a base (dia atual); o aluno sobe arrastando.
    const ch = wrap ? wrap.clientWidth * (IMG_H / IMG_W) : 0
    panRef.current = { x: 0, y: wrap ? Math.min(0, wrap.clientHeight - ch) : 0 }
    setAnim(true)
    applyTransform()
  }
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
        className="lsr-stage"
        style={{ position: 'relative', flex: 1, minHeight: 560, width: '100%', overflow: 'hidden', background: '#0B0820', touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
      >
        {/* Conteúdo (stageRef) preenche a LARGURA e mantém a proporção da imagem (aspect 1024/1536) →
            fica MAIS ALTO que a janela de 720px: o aluno arrasta pra cima pra ver o topo. img `cover`
            numa caixa com a MESMA proporção = sem distorção; nós por % linear = idêntico ao mockup. */}
        <div ref={stageRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', aspectRatio: `${IMG_W} / ${IMG_H}`, transformOrigin: '0 0', willChange: 'transform' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/leiseca/trilha_m.jpg" alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />

          {/* Spline (traço pontilhado + traço aceso em OURO) */}
          <svg viewBox={`0 0 ${IMG_W} ${IMG_H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden>
            <path d={spline} fill="none" stroke="rgba(255,255,255,.85)" strokeWidth={3.5} strokeLinecap="round" strokeDasharray="0.5 10" vectorEffect="non-scaling-stroke" />
            <path
              d={spline} fill="none" stroke={GOLD} strokeWidth={6} strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeDasharray: 3000, strokeDashoffset: 3000 * (1 - doneFrac), filter: 'drop-shadow(0 0 6px rgba(241,194,50,.6))' }}
            />
          </svg>

          {/* Nós */}
          {nodePts.map(({ node, i, x, y }) => {
            const concl = node.estado === 'concluido'
            const atualNode = i === idxAtual
            const bloq = node.estado === 'disponivel' && !!node.naoLiberada
            const sz = atualNode ? 46 : 32
            const selN = i === dy
            const ehCume = i === nodes.length - 1
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => { setDy(i); setBalaoNode(i) }}
                title={`Dia ${String(i + 1).padStart(2, '0')} · ${node.titulo}`}
                style={{
                  position: 'absolute',
                  left: `${(x / IMG_W) * 100}%`,
                  top: `${(y / IMG_H) * 100}%`,
                  transform: 'translate(-50%,-50%)',
                  width: sz, height: sz, borderRadius: '50%',
                  border: atualNode ? '3px solid #fff' : concl ? '2px solid rgba(255,255,255,.85)' : bloq ? '1.5px solid rgba(255,255,255,.55)' : 0,
                  cursor: 'pointer', padding: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10.5, fontWeight: 800, color: '#fff',
                  background: concl ? '#22B573' : atualNode ? 'var(--brand)' : bloq ? 'rgba(30,17,80,.62)' : '#fff',
                  backdropFilter: bloq ? 'blur(2px)' : undefined,
                  boxShadow: selN
                    ? `0 0 0 4px color-mix(in srgb,${GOLD} 55%,transparent)`
                    : atualNode
                      ? '0 0 0 5px rgba(241,194,50,.55), 0 10px 20px -8px rgba(0,0,0,.6)'
                      : i === libIdx
                        ? '0 0 0 4px rgba(143,117,255,.5), 0 8px 18px -8px rgba(0,0,0,.6)'
                        : '0 6px 14px -6px rgba(0,0,0,.6)',
                  // Pulsa o nó ATUAL (ouro) e o PRÓXIMO a liberar (roxo) p/ chamar atenção.
                  animation: atualNode ? 'lsrPulse 2.2s ease-in-out infinite' : i === libIdx ? 'lsrPulseLib 2.2s ease-in-out infinite' : undefined,
                  zIndex: atualNode ? 5 : i === libIdx ? 4 : 2,
                }}
              >
                {concl ? <Check size={sz * 0.46} strokeWidth={3} />
                  : atualNode ? <Play size={sz * 0.42} />
                    : ehCume ? <Flag size={14} color="var(--brand)" />
                      : bloq ? String(i + 1).padStart(2, '0')
                        : <Play size={12} color="#2E1F7A" />}
              </button>
            )
          })}

          {/* Rótulo "Você está aqui" — logo acima do nó atual (some quando um balão de aula está aberto). */}
          {!balaoVis && nodePts[idxAtual] && (
            <span aria-hidden style={{ position: 'absolute', left: `${(nodePts[idxAtual].x / IMG_W) * 100}%`, top: `${(nodePts[idxAtual].y / IMG_H) * 100}%`, transform: 'translate(-50%, calc(-50% - 50px))', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', height: 22, padding: '0 9px', borderRadius: 99, background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 800, boxShadow: '0 6px 14px -6px rgba(0,0,0,.6)', zIndex: 7 }}>
              Você está aqui
              {/* Ponta (triângulo) logo ABAIXO do balão → aponta p/ o círculo do nó atual (sem invadir o texto). */}
              <span aria-hidden style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '7px solid var(--brand)' }} />
            </span>
          )}
          {/* Balão "Libera amanhã" — some SÓ quando o balão da aula aberto está NO PRÓPRIO nó bloqueado. */}
          {libIdx >= 0 && nodePts[libIdx] && !(balaoVis && balaoVis.i === libIdx) && (
            <span aria-hidden style={{ position: 'absolute', left: `${(nodePts[libIdx].x / IMG_W) * 100}%`, top: `${(nodePts[libIdx].y / IMG_H) * 100}%`, transform: 'translate(-50%, calc(-50% - 46px))', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', height: 26, padding: '0 11px 0 6px', borderRadius: 99, background: '#fff', color: '#1A1530', fontSize: 11.5, fontWeight: 800, boxShadow: '0 10px 22px -10px rgba(0,0,0,.6)', zIndex: 9, animation: 'lsrBobLib 2.6s ease-in-out infinite' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Lock size={11} /></span>
              {libLabel}
              {/* Ponta (triângulo) logo ABAIXO do balão → aponta p/ o círculo da aula (sem invadir o texto). */}
              <span aria-hidden style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '7px solid #fff' }} />
            </span>
          )}

          {/* Balão de AÇÃO ao clicar num nó: Iniciar aula / Continuar / Revisar (ou bloqueado). */}
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
              <div className={balaoVis.saindo ? undefined : 'lsr-balao-wrap'} onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', left: `${(np.x / IMG_W) * 100}%`, top: `${(np.y / IMG_H) * 100}%`, transform: 'translate(-50%, calc(-100% - 48px))', zIndex: 14, width: 216 }}>
                <div className={balaoVis.saindo ? 'lsr-balao-out' : 'lsr-balao-in'} style={{ position: 'relative', borderRadius: 14, padding: '11px 12px', background: '#fff', color: '#1A1530', boxShadow: '0 16px 34px -14px rgba(0,0,0,.72)' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: 'var(--brand)' }}>DIA {String(balaoVis.i + 1).padStart(2, '0')}</span>
                  <b style={{ display: 'block', margin: '2px 0 9px', fontSize: 13, lineHeight: 1.25, letterSpacing: '-0.01em' }}>{nd.titulo}</b>
                  {bloq ? (
                    <span style={{ display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 10, background: 'rgba(30,17,80,.08)', color: '#6B5EA8', fontSize: 12.5, fontWeight: 700 }}><Lock size={13} /> Libera em breve</span>
                  ) : (
                    <Link href={href} onClick={() => setBalaoNode(null)} className="lsr-balao-cta" style={{ display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, borderRadius: 10, background: concl ? 'var(--brand)' : GOLD, color: concl ? '#fff' : '#2A1A55', fontSize: 13.5, fontWeight: 800 }}>
                      {concl ? <RotateCcw size={14} /> : <Play size={13} />} {lab}
                    </Link>
                  )}
                  <span aria-hidden style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '8px solid #fff' }} />
                </div>
              </div>
            )
          })()}
        </div>

        {/* ── Overlay "Subindo a montanha" (topo) ── */}
        <div style={{ position: 'absolute', left: 12, right: 12, top: 12, zIndex: 6, pointerEvents: 'none', padding: '12px 16px 14px', borderRadius: 16, background: 'linear-gradient(120deg,rgba(59,30,143,.94),rgba(30,17,80,.9))', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', boxShadow: '0 14px 30px -16px rgba(0,0,0,.8)', border: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: GOLD, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Mountain size={20} color="#2A1A55" />
            </span>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
              <b style={{ display: 'block', fontSize: 13, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Subindo a montanha</b>
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.72)', whiteSpace: 'nowrap' }}>{diasConcluidos} de {totalDias} dias concluídos · dia {Math.min(diasConcluidos + 1, totalDias)} em andamento</span>
            </div>
            <b style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#fff' }}>{progressoPct}<span style={{ fontSize: '.55em', color: GOLD }}>%</span></b>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 14, marginTop: 4 }}>
            {nodePts.map(({ i }) => {
              const feito = i < diasConcluidos
              const atual = i === diasConcluidos
              return <span key={i} title={`Dia ${String(i + 1).padStart(2, '0')}`} style={{ flex: 1, height: atual ? 12 : 8, borderRadius: 3, background: feito || atual ? GOLD : 'rgba(255,255,255,.22)', boxShadow: atual ? '0 0 0 2px #fff' : undefined }} />
            })}
          </div>
        </div>

        {/* ── Zoom vertical (direita) ── */}
        <div style={{ position: 'absolute', right: 10, top: 106, bottom: 12, zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <ZBtn onClick={() => zoomBy(1.5)} title="Aproximar"><Plus size={18} /></ZBtn>
          <input
            type="range" min={1} max={2.6} step={0.1} value={zoom}
            onChange={(e) => zoomTo(Number(e.target.value))}
            aria-label="Zoom da trilha"
            // Slider vertical acoplado ao eixo da coluna.
            style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 32, flex: 1, minHeight: 80, accentColor: GOLD, cursor: 'ns-resize' }}
          />
          <ZBtn onClick={() => zoomBy(1 / 1.5)} title="Afastar"><Minus size={18} /></ZBtn>
        </div>

        {/* ── Toolbar (canto inf-esq) ── */}
        <div style={{ position: 'absolute', left: 12, bottom: 12, right: 70, zIndex: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ToolPill onClick={irMinhaAula} title="Ir para minha aula"><Crosshair size={15} /> Ir para minha aula</ToolPill>
          <ToolPill onClick={verTudo} title="Ver trilha inteira"><Maximize2 size={15} /> Ver trilha inteira</ToolPill>
        </div>
      </div>
    </div>
  )
}

function ZBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} style={{ width: 32, height: 32, flexShrink: 0, padding: 0, border: 0, borderRadius: '50%', background: 'var(--brand)', color: '#fff', boxShadow: `0 0 0 3px rgba(241,194,50,.5), 0 6px 14px -4px rgba(0,0,0,.6)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {children}
    </button>
  )
}
function ToolPill({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} style={{ height: 32, padding: '0 12px 0 10px', border: '1px solid rgba(255,255,255,.12)', borderRadius: 99, background: 'rgba(18,10,51,.88)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA REGULAMENTO — sumário (esq. 260px) + documento/ganhos (dir.).
// ─────────────────────────────────────────────────────────────────────────────
function AbaRegulamento({ regulamento, pontuacao, gam, moduloNome }: { regulamento?: RegulamentoConfig; pontuacao?: PontuacaoLeitura; gam?: GamRail | null; moduloNome: string }) {
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

  return (
    <div className="lsr-reg-grid" style={{ display: 'grid', gridTemplateColumns: pontuacao ? '300px minmax(0,1fr)' : '1fr', gap: 18, alignItems: 'start' }}>
      {/* Ganhos e metas (no lugar do antigo Sumário) — coluna esquerda sticky. */}
      {pontuacao && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18, position: 'sticky', top: 90 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Zap size={18} color="var(--brand)" />
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Ganhos e metas</h3>
            </div>
            {gam && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                <Zap size={12} /> +{fmt(gam.resumo.xpHoje)} pontos hoje
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <div style={{ padding: 14, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface2)' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Sequência (login diário)</span>
                <div style={{ marginTop: 6 }}>
                  {chest && chest.xp > 0 && <GanhoItem gold valor={`+${chest.xp}`} txt={`a cada ${chest.cada_n_dias} dias seguidos`} />}
                  {marcos.map((m) => <GanhoItem key={m.dias} gold valor={`+${m.xp}`} txt={`ao completar ${m.dias} dias`} />)}
                </div>
              </div>
            )}
            {limiteDia > 0 && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>Máximo de <b style={{ color: 'var(--ink)' }}>{limiteDia}</b> pontos por dia — cada tarefa conta uma única vez.</span>}
          </div>
        </div>
      )}

      {/* Documento oficial */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {regulamento?.ativo && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 14, marginBottom: 18, borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--brand)', display: 'inline-flex' }}><FileText size={18} /></span>
                <div>
                  <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)' }}>{regulamento.titulo || 'Regulamento oficial'}</b>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Documento oficial do desafio</span>
                </div>
              </div>
              {regulamento.documento_url && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <a href={`${regulamento.documento_url}${regulamento.documento_url.includes('?') ? '&' : '?'}download`} title="Baixar PDF" aria-label="Baixar PDF" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Download size={15} /></a>
                  <a href={regulamento.documento_url} target="_blank" rel="noopener noreferrer" title="Abrir em nova aba" aria-label="Abrir em nova aba" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ExternalLink size={15} /></a>
                </div>
              )}
            </div>
            {regulamento.descricao && (
              <div style={{ padding: '4px 2px', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.75, color: 'var(--ink)', opacity: .9 }}>{regulamento.descricao}</div>
            )}
            {regulamento.documento_url && (
              <div style={{ marginTop: 14, borderRadius: 14, border: '1px solid var(--line)', overflow: 'hidden' }}>
                <iframe src={`${regulamento.documento_url}#view=FitH`} title="Regulamento (PDF)" style={{ width: '100%', height: '78vh', border: 0, background: '#fff' }} />
              </div>
            )}
            {!regulamento.descricao && !regulamento.documento_url && (
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>Regulamento ativo, mas sem documento ou descrição publicados.</p>
            )}
          </div>
        )}

        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Desafio: {moduloNome}</span>
      </div>
    </div>
  )
}

function GanhoItem({ valor, txt, gold }: { valor: string; txt: string; gold?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13 }}>
      <span style={{ minWidth: 44, height: 24, padding: '0 8px', borderRadius: 8, background: gold ? 'rgba(232,169,58,.16)' : 'var(--chip)', color: gold ? '#C98A12' : 'var(--brand)', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{valor}</span>
      <span style={{ color: 'var(--ink)' }}>{txt}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA DESEMPENHO — KPIs (cards com ícone) + gráfico/etapas + tabela + carimbos.
// ─────────────────────────────────────────────────────────────────────────────
function AbaDesempenho({
  desempenho, totalDias, diasConcluidos, pontos, progressoPct, carimbos,
}: {
  desempenho: AulaDesempenho[]; totalDias: number; diasConcluidos: number; pontos: number; progressoPct: number; carimbos: CarimboAlunoView[]
}) {
  const qFeitas = desempenho.reduce((s, a) => s + a.questoesRespondidas, 0)
  const qTotal = desempenho.reduce((s, a) => s + a.questoesTotal, 0)
  const feitosComQuiz = desempenho.filter((d) => d.questoesTotal > 0 && d.questoesRespondidas > 0)
  const acertoMedio = feitosComQuiz.length
    ? Math.round(feitosComQuiz.reduce((s, d) => s + (d.questoesRespondidas / d.questoesTotal) * 100, 0) / feitosComQuiz.length)
    : 0
  const melhorSeq = desempenho.reduce((m, a) => Math.max(m, a.sequencia), 0)

  const kpis = [
    { rotulo: 'Aulas concluídas', valor: `${diasConcluidos}/${totalDias}`, icon: <Check size={17} /> },
    { rotulo: 'Questões', valor: `${qFeitas}/${qTotal || totalDias * 10}`, icon: <List size={17} /> },
    { rotulo: 'Acerto médio', valor: `${acertoMedio}%`, icon: <Target size={17} /> },
    { rotulo: 'Pontos', valor: fmt(pontos), icon: <Zap size={17} /> },
    { rotulo: 'Melhor sequência', valor: String(melhorSeq), icon: <Flame size={17} /> },
  ]

  const etapas: { t: string; d: string; ok: boolean }[] = [
    { t: 'Acampamento base', d: 'D1', ok: diasConcluidos >= 1 },
    { t: 'Primeiro mirante', d: 'D7', ok: diasConcluidos >= 7 },
    { t: 'Meio da encosta', d: 'D15', ok: diasConcluidos >= 15 },
    { t: 'Acampamento alto', d: 'D21', ok: diasConcluidos >= 21 },
    { t: 'Cume', d: `D${totalDias}`, ok: diasConcluidos >= totalDias },
  ]

  // Gráfico de barras (SVG) — acerto por dia (dados reais).
  const CHART_W = 640
  const CHART_H = 150
  const barW = CHART_W / Math.max(1, totalDias) - 4

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div className="lsr-des-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
        {kpis.map((k) => (
          <div key={k.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{k.icon}</span>
            <div style={{ lineHeight: 1.2, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 18, color: 'var(--ink)' }}>{k.valor}</b>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{k.rotulo}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico | Etapas */}
      <div className="lsr-des-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
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

      {/* Tabela de desempenho (grid rows, estilo Revisão) */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18 }}>
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
              <div key={a.id} className="rowh" style={{ display: 'grid', gridTemplateColumns: DES_COLS, gap: 12, alignItems: 'center', padding: 10, borderBottom: '1px solid var(--line)', opacity: bloqueada ? .55 : 1 }}>
                <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{String(i + 1).padStart(2, '0')}</b>
                <div style={{ minWidth: 0 }}>
                  {bloqueada ? (
                    <b style={{ display: 'block', fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titulo}</b>
                  ) : (
                    <Link href={`/aluno/leitura/${a.id}`} style={{ display: 'block', fontSize: 13, color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'none' }}>{a.titulo}</Link>
                  )}
                </div>
                {/* Feito em (dia imutável de conclusão) */}
                <span style={{ fontSize: 12, color: a.diaFeito ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDiaFeito(a.diaFeito)}</span>
                {/* Leitura */}
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
                {/* Questões */}
                <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{a.questoesTotal > 0 ? `${a.questoesRespondidas}/${a.questoesTotal}` : '—'}</span>
                {/* Sequência */}
                {a.sequencia > 0 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700, color: '#F0773A' }}><Flame size={13} /> {a.sequencia}</span>
                ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                {/* Pontos */}
                {a.pontos > 0 ? <b style={{ fontSize: 12.5, color: 'var(--brand)' }}>+{a.pontos}</b> : <b style={{ fontSize: 12.5, color: 'var(--muted)' }}>—</b>}
                {/* Situação */}
                {concl ? (
                  <PillR cor="#1FA868" icon={<Check size={11} strokeWidth={3} />}>Concluída</PillR>
                ) : bloqueada ? (
                  <PillR cor="var(--muted)" icon={<Lock size={11} />}>Bloqueada</PillR>
                ) : (
                  <PillR cor="var(--brand)" icon={<Zap size={11} />}>Em andamento</PillR>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Passaporte de carimbos */}
      {carimbos.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Trophy size={18} color="var(--brand)" />
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Passaporte de carimbos</h3>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>({carimbos.filter((c) => c.ganho).length}/{carimbos.length})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 14 }}>
            {carimbos.map((c) => (
              <div key={c.def.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
                <span style={{ width: 72, height: 72, borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: c.ganho ? '2px solid var(--brand)' : '2px dashed var(--line2)', background: c.ganho ? 'color-mix(in srgb,var(--brand) 8%,transparent)' : 'var(--surface2)', transform: c.ganho ? 'rotate(-8deg)' : 'none' }}>
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
    </div>
  )
}

const DES_COLS = '60px minmax(0,2fr) 0.9fr 1.2fr 0.8fr 0.8fr 0.7fr 120px'

/** 'YYYY-MM-DD' → 'DD/MM/AA' (fuso já aplicado na origem). Vazio → travessão. */
function fmtDiaFeito(d: string | null): string {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return y && m && dd ? `${dd}/${m}/${y.slice(2)}` : '—'
}

function PillR({ cor, icon, children }: { cor: string; icon?: React.ReactNode; children: React.ReactNode }) {
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
// ABA RANKING — pódio + você + progresso à ESQUERDA (420px); classificação à dir.
// Terceiros só por iniciais; o próprio aluno destacado. (Privacidade = MEQ.)
// ─────────────────────────────────────────────────────────────────────────────
/** Avatar do aluno: foto real quando houver; senão, círculo com iniciais (cor da conta ou da marca). */
function AvatarR({ avatar, cor, size, sou, seed }: { avatar?: string | null; cor?: string | null; size: number; sou?: boolean; seed?: string | null }) {
  // SEM avatar próprio → capivara PADRÃO determinística (mesma do app), nunca letras soltas.
  const src = avatar || avatarPadraoDe(seed)
  return (
    <span style={{ flexShrink: 0, width: size, height: size, borderRadius: '50%', overflow: 'hidden', background: cor || 'var(--surface2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: sou ? '2px solid #F2A93B' : undefined }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center 82%' }} />
    </span>
  )
}

/** Paginação compacta « ‹ N/total › » (igual ao mockup). */
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

/** Cabeçalho de coluna ORDENÁVEL do ranking (clique → ordena; seta mostra a direção). */
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
  progressoPct: number; totalDias: number; moduloNome: string
}) {
  const itens = ranking.itens.filter((r) => !r.oculto)
  // "Você": usa a linha FRESCA (score/streak certos) mas com a POSIÇÃO REAL — a linha fresca vem com
  // posicao=0 do servidor, então derivamos do ranking completo (entrada do aluno OU contando quantos
  // estão à frente por streak→pontos). Sem isto o card mostrava "0º".
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

  // Ordenação (clicável) + paginação de 10 por página.
  type Col = 'pos' | 'aulas' | 'seq' | 'pts'
  const [sortBy, setSortBy] = useState<Col>('pos')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const POR_PAG = 10
  const ordenados = useMemo(() => {
    const val = (r: RankingLeituraItem) => sortBy === 'aulas' ? r.aulasConcluidas : sortBy === 'seq' ? r.streakAtual : sortBy === 'pts' ? r.score : r.posicao
    const arr = [...itens].sort((a, b) => (val(a) - val(b)) * (dir === 'asc' ? 1 : -1))
    return arr
  }, [itens, sortBy, dir])
  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / POR_PAG))
  const pageSafe = Math.min(page, totalPaginas - 1)
  const pageItens = ordenados.slice(pageSafe * POR_PAG, pageSafe * POR_PAG + POR_PAG)
  const ordenar = (c: string) => {
    const col = c as Col
    if (col === sortBy) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(col); setDir(col === 'pos' ? 'asc' : 'desc') } // pos sobe (1,2,3); métricas descem (maior→menor)
    setPage(0)
  }

  // Ranking carregado sob demanda → enquanto busca (lista ainda vazia) mostra um carregando.
  if (loading && !itens.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '64px 20px', color: 'var(--muted)', fontSize: 14 }}>
        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--brand)' }} /> Carregando ranking…
      </div>
    )
  }

  return (
    <div className="lsr-rank-grid" style={{ display: 'grid', gridTemplateColumns: '420px minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
      {/* Esquerda: pódio + você + progresso */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 20 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{moduloNome}</span>
          <b style={{ display: 'block', margin: '4px 0 2px', fontSize: 22, letterSpacing: '-0.03em', color: 'var(--ink)' }}>Ranking geral</b>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1FA868' }} /> Ao vivo · <b style={{ color: 'var(--ink)' }}>{fmt(total)}</b> alunos
          </span>

          {/* Pódio */}
          {top3.length > 0 && (
            <div style={{ marginTop: 22, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              {[top3[1], top3[0], top3[2]].map((r, idx) => {
                if (!r) return <div key={idx} style={{ flex: 1 }} />
                const pos = r.posicao
                const alt = pos === 1 ? 120 : pos === 2 ? 90 : 70
                const cor = pos === 1 ? '#E8C877' : pos === 2 ? '#C0C7CF' : '#D3955E'
                const sou = r.estudanteId === meuId
                return (
                  <div key={r.estudanteId} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    {pos === 1 && <Crown size={18} color="#E8B83A" />}
                    <AvatarR avatar={r.avatar} cor={r.avatarCor} seed={r.estudanteId} size={pos === 1 ? 48 : 40} sou={sou} />
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

          {/* Você */}
          {eu && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, background: 'var(--surface)', border: '1.5px solid var(--brand)', boxShadow: '0 12px 24px -18px rgba(0,0,0,.5)' }}>
                <div style={{ paddingRight: 12, borderRight: '1px solid var(--line)' }}>
                  <b style={{ display: 'block', fontSize: 24, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{eu.posicao}º</b>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Posição</span>
                </div>
                <AvatarR avatar={eu.avatar} cor={eu.avatarCor} seed={meuId ?? eu.estudanteId} size={40} sou />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14, color: 'var(--ink)' }}>{meuNome ? primeiroNome(meuNome) : 'Você'}</b>{' '}
                  <span style={{ height: 18, padding: '0 6px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>VOCÊ</span>
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

        {/* Progresso do desafio */}
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

      {/* Direita: classificação (tabela em grid) */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trophy size={18} color="var(--brand)" />
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Classificação</h3>
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmt(total)} alunos</span>
        </div>
        {/* Cabeçalho ORDENÁVEL (clique p/ ordenar; seta mostra a direção). */}
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
                  <AvatarR avatar={r.avatar} cor={r.avatarCor} seed={r.estudanteId} size={34} sou={sou} />
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
