'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DESAFIO DE LEI SECA — ÁREA INTERNA (montanha) · marca MEQ (spec 04 §5).
//
// Porte fiel do mockup `DesafioLSMEQ{Claro,Azul,Escuro}[Mobile].dc.html`:
//   • Header card hero (raio 14, gradiente 120deg #171E3B→#25356F→#306AB5, circuito SVG,
//     ícone de montanha em quadrado ciano, 4 stats Dia/Progresso/Pontos/Posição) + abas
//     segmentadas (NÃO sublinhadas): Trilha · Regulamento · Desempenho · Ranking.
//   • Trilha: palco da montanha (trilha_m.jpg), spline Catmull-Rom por 30 nós, zoom/pan,
//     painel de vidro "Sua subida" (ciano) no canto sup-esq + minimapa no canto sup-dir +
//     toolbar flutuante centralizada embaixo + barra de início acoplada. Coluna lateral de
//     ficha técnica à ESQUERDA (ordem invertida no grid por marca).
//   • Regulamento, Desempenho (tabela PRIMEIRO no MEQ) e Ranking (tabela | lateral 400px à direita).
//
// LIGADO AOS DADOS REAIS já carregados por LeituraModuloView:
//   trilha.nodes (dias), desempenho (AulaDesempenho[]), ranking (RankingLeitura anonimizado),
//   pontuacao, gam (XP/nível/streak), regulamento. TODO placeholder = nenhum: todo número vem do
//   backend; privacidade preservada (iniciais p/ terceiros; "Você" p/ o próprio).
//
// Tokens: herda var(--brand)/--brand2/--surface/--line/--ink/--muted/--track/--chip do root
// (InternaPageRoot / internaTokensStyle injeta); cyan = var(--brand2) na MEQ.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Flag, BookOpen, BarChart3, Trophy, Play, RotateCcw, Lock, Check, Mountain,
  ChevronRight, Plus, Minus, Maximize2, Crosshair, Download, ExternalLink,
  Flame, Zap, Crown, Target,
} from 'lucide-react'
import type { Trilha, TrilhaNode } from '@/components/aluno/trilha-simulados'
import type { AulaDesempenho } from '@/lib/leitura/trilha'
import type { RankingLeitura, RankingLeituraItem } from '@/lib/leitura/ranking'
import type { RegulamentoConfig } from '@/lib/leitura/regulamento'
import type { PontuacaoLeitura } from '@/lib/leitura/pontuacao'
import type { GamRail } from '@/lib/aluno/trilhas'
import type { CarimboAlunoView } from '@/components/aluno/carimbos-colecao'
import type { TrilhaSimbolos } from '@/lib/gamificacao/trilha-simbolos'
import type { TrilhaFormato } from '@/lib/gamificacao/trilha-formato'
import type { TrilhaLivreConfig, TrilhaDegrade } from '@/lib/leitura/trilha-aparencia'

// Helper puro (iniciais p/ privacidade de terceiros) — inline p/ NÃO arrastar `ranking.ts`
// (server-only: importa createAdminClient) para dentro deste client component.
function iniciaisDe(nome: string | null | undefined): string {
  const ps = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (!ps.length) return '—'
  const a = ps[0][0]?.toUpperCase() ?? ''
  const b = ps.length > 1 ? (ps[ps.length - 1][0]?.toUpperCase() ?? '') : ''
  return b ? `${a}. ${b}.` : `${a}.`
}

// ── Geometria da trilha (coordenadas da imagem 1024×1536) — spline Catmull-Rom. ──
const IMG_W = 1024
const IMG_H = 1536
const PATH: [number, number][] = [
  [690, 1495], [720, 1430], [740, 1360], [730, 1290], [700, 1230], [600, 1200], [500, 1170], [530, 1130], [630, 1110], [730, 1080],
  [750, 1060], [680, 1035], [570, 1010], [500, 990], [520, 965], [600, 950], [680, 920], [685, 905], [630, 890], [550, 870],
  [520, 850], [580, 840], [680, 825], [730, 820], [650, 805], [590, 780], [570, 760], [610, 745], [680, 725], [680, 715],
  [630, 695], [570, 670], [530, 640], [500, 605], [490, 595], [530, 580], [600, 565], [620, 555], [590, 540], [550, 525],
  [530, 500], [535, 450], [525, 400], [515, 360],
]
/** Amostra N pontos equidistantes ao longo do PATH (por comprimento de arco). */
function samplePath(n: number): [number, number][] {
  const seg = PATH.slice(0, -1).map((p, i) => Math.hypot(PATH[i + 1][0] - p[0], PATH[i + 1][1] - p[1]))
  const tot = seg.reduce((a, b) => a + b, 0)
  const out: [number, number][] = []
  for (let k = 0; k < n; k++) {
    let t = (tot * k) / (n - 1)
    let i = 0
    while (i < seg.length - 1 && t > seg[i]) { t -= seg[i]; i++ }
    const f = seg[i] ? t / seg[i] : 0
    const [x0, y0] = PATH[i]
    const [x1, y1] = PATH[i + 1]
    out.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f])
  }
  return out
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

export interface DesafioLSMeqProps {
  theme: 'claro' | 'azul' | 'escuro'
  trilha: Trilha
  desempenho: AulaDesempenho[]
  ranking: RankingLeitura
  minhaLinha?: RankingLeituraItem | null
  meuId?: string | null
  meuNome?: string | null
  regulamento?: RegulamentoConfig
  pontuacao?: PontuacaoLeitura
  gam?: GamRail | null
  carimbos?: CarimboAlunoView[]
  /** Dias (YYYY-MM-DD) com atividade de leitura — base da faixa de ofensiva DOM→SÁB. */
  diasLeitura?: string[]
  /** Aparência da trilha CONFIGURADA NO ADMIN (fundo + formato/posições) — a trilha do interior usa
   *  o TrilhaSistema real com isto, para bater com o que o admin montou. */
  formato?: TrilhaFormato
  simbolos?: TrilhaSimbolos
  livre?: TrilhaLivreConfig
  inverter?: boolean
  degrade?: TrilhaDegrade
  degradeTrilha?: TrilhaDegrade
  /** Nome do módulo p/ breadcrumb ("Constituição Federal"). */
  moduloNome: string
}

export function DesafioLSMeq({
  trilha, desempenho, ranking, minhaLinha, meuId, meuNome, regulamento, pontuacao, gam, carimbos = [], moduloNome,
}: DesafioLSMeqProps) {
  const [tab, setTab] = useState<Tab>('trilha')

  // ── Nós reais → geometria da montanha. Usamos SEMPRE 30 pontos de trilha (desenho fixo
  //    do mockup) e mapeamos os nós reais sobre eles proporcionalmente. ──
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
  const posicao = minhaLinha?.posicao ?? ranking.itens.find((r) => r.estudanteId === meuId)?.posicao ?? null

  // Stats do header (4 blocos).
  const headerStats = [
    { rotulo: 'DIA', valor: `${Math.min(diasConcluidos + 1, totalDias)}/${totalDias}` },
    { rotulo: 'PROGRESSO', valor: `${progressoPct}%` },
    { rotulo: 'PONTOS', valor: fmt(pontos) },
    { rotulo: 'POSIÇÃO', valor: posicao != null ? `${posicao}º` : '—' },
  ]

  const TABS: { k: Tab; label: string; icon: React.ReactNode }[] = [
    { k: 'trilha', label: 'Trilha', icon: <Flag size={15} /> },
    { k: 'reg', label: 'Regulamento', icon: <BookOpen size={15} /> },
    { k: 'des', label: 'Desempenho', icon: <BarChart3 size={15} /> },
    { k: 'rank', label: 'Ranking', icon: <Trophy size={15} /> },
  ]

  // Subtítulo do hero a partir dos DADOS REAIS (nada inventado): "N dias · <total> questões"
  // (o range de artigos sai do nome do módulo/aulas, que já aparece no título).
  const totalQuestoes = useMemo(() => desempenho.reduce((s, a) => s + a.questoesTotal, 0), [desempenho])
  const heroSub = totalQuestoes > 0 ? `${totalDias} dias · ${fmt(totalQuestoes)} questões` : `${totalDias} dias`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-ls-meq>
      {/* ═══════════ HEADER HERO ═══════════ */}
      <HeaderHero moduloNome={moduloNome} heroSub={heroSub} stats={headerStats} />

      {/* ═══════════ ABAS SEGMENTADAS ═══════════ */}
      {/* Container em var(--track) (= --tBg do mockup: #E4EAF5 claro), ativo = var(--surface) (--tOn #fff)
          com ink var(--ink) (--tOnInk), inativo = var(--muted) (--sub). Altura 40, radius 11/8, fonte 13.5. */}
      <div className="ls-tabs" role="tablist" style={{ display: 'inline-flex', gap: 3, padding: 4, borderRadius: 11, background: 'var(--track)', alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}>
        {TABS.map((t) => {
          const ativo = tab === t.k
          return (
            <button
              key={t.k}
              type="button"
              role="tab"
              onClick={() => setTab(t.k)}
              aria-selected={ativo}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, whiteSpace: 'nowrap',
                height: 40, padding: '0 14px', border: 0, borderRadius: 8,
                background: ativo ? 'var(--surface)' : 'transparent',
                color: ativo ? 'var(--ink)' : 'var(--muted)',
                fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                boxShadow: ativo ? '0 1px 4px rgba(16,30,70,.08)' : 'none',
                transition: 'background .25s,color .25s,box-shadow .25s',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ═══════════ CONTEÚDO ═══════════ */}
      {tab === 'trilha' && (
        <AbaTrilha nodes={nodes} dy={dy} setDy={setDy} idxAtual={idxAtual} diasConcluidos={diasConcluidos} totalDias={totalDias} progressoPct={progressoPct} desempenho={desempenho} />
      )}
      {tab === 'reg' && <AbaRegulamento regulamento={regulamento} pontuacao={pontuacao} gam={gam} />}
      {tab === 'des' && <AbaDesempenho desempenho={desempenho} totalDias={totalDias} diasConcluidos={diasConcluidos} pontos={pontos} carimbos={carimbos} />}
      {tab === 'rank' && <AbaRanking ranking={ranking} minhaLinha={minhaLinha} meuId={meuId} meuNome={meuNome} progressoPct={progressoPct} totalDias={totalDias} moduloNome={moduloNome} />}

      <style>{`
        @media (max-width: 1023px){
          [data-ls-meq] .ls-hero-stats{ grid-template-columns:repeat(2,auto) !important; gap:14px 28px; }
          [data-ls-meq] .ls-grid-side{ grid-template-columns:1fr !important; }
          [data-ls-meq] .ls-rank-grid{ grid-template-columns:1fr !important; }
          [data-ls-meq] .ls-minimap{ display:none !important; }
          [data-ls-meq] .ls-stage{ height:560px !important; }
          [data-ls-meq] .ls-tabs{ display:grid !important; grid-template-columns:repeat(2,1fr); width:100%; }
          [data-ls-meq] .ls-subida{ width:auto !important; right:14px; }
          [data-ls-meq] .ls-zoom-slider{ width:90px !important; }
          [data-ls-meq] .ls-pill-lab{ display:none; }
        }
        @keyframes lsTrailDraw{ to{ stroke-dashoffset:0; } }
        @keyframes lsPulse{ 0%,100%{ box-shadow:0 0 0 0 color-mix(in srgb,${'var(--brand2)'} 55%,transparent);} 50%{ box-shadow:0 0 0 10px color-mix(in srgb,${'var(--brand2)'} 0%,transparent);} }
        @keyframes lsBob{ 0%,100%{ transform:translateY(0);} 50%{ transform:translateY(-4px);} }
        /* Balão de ação do nó: "pop" ao abrir e encolher+fade ao fechar, escalando da base (seta/nó). */
        .lsm-balao-in{ animation:lsmBalaoIn .22s cubic-bezier(.2,.9,.3,1.4) both; transform-origin:50% 100%; }
        .lsm-balao-out{ animation:lsmBalaoOut .14s ease-in both; transform-origin:50% 100%; }
        @keyframes lsmBalaoIn{ 0%{ opacity:0; transform:scale(.55) translateY(14px); } 60%{ opacity:1; } 100%{ opacity:1; transform:none; } }
        @keyframes lsmBalaoOut{ 0%{ opacity:1; transform:none; } 100%{ opacity:0; transform:scale(.7) translateY(8px); } }
        /* Pulo contínuo do balão (sobe/desce) — só depois do "pop" de entrada. */
        .lsm-balao-wrap{ animation:lsmBalaoBob 1.7s ease-in-out .28s infinite; }
        @keyframes lsmBalaoBob{ 0%,100%{ transform:translate(-50%, calc(-100% - 48px)); } 50%{ transform:translate(-50%, calc(-100% - 58px)); } }
        /* Botão de ação do balão: realce no HOVER e "pressionar" no CLIQUE. */
        .lsm-balao-cta{ transition:transform .12s ease, filter .12s ease, box-shadow .12s ease; }
        .lsm-balao-cta:hover{ filter:brightness(1.06); transform:translateY(-1px); box-shadow:0 10px 20px -10px rgba(0,0,0,.55); }
        .lsm-balao-cta:active{ transform:translateY(1px) scale(.97); filter:brightness(.95); }
        @media (prefers-reduced-motion: reduce){ [data-ls-meq] *{ animation:none !important; } }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HEADER HERO — card gradiente + circuito SVG + ícone montanha ciano + 4 stats.
// ─────────────────────────────────────────────────────────────────────────────
function HeaderHero({ moduloNome, heroSub, stats }: { moduloNome: string; heroSub: string; stats: { rotulo: string; valor: string }[] }) {
  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '22px 24px',
        background: 'linear-gradient(120deg,#171E3B,#25356F 60%,#306AB5)', color: '#fff',
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}
    >
      {/* Circuito SVG decorativo */}
      <svg aria-hidden viewBox="0 0 400 120" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }}>
        <g fill="none" stroke="#5ECEF0" strokeOpacity="0.18" strokeWidth="1.5">
          <path d="M-10 36 H120 L140 56 H260 L280 36 H420" />
          <path d="M-10 86 H80 L104 62 H210 L236 86 H420" />
        </g>
        <g fill="#5ECEF0" fillOpacity="0.3">
          <circle cx="120" cy="36" r="3" /><circle cx="260" cy="56" r="3" /><circle cx="80" cy="86" r="3" /><circle cx="236" cy="86" r="3" />
        </g>
      </svg>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 260 }}>
        <span style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(94,206,240,.16)', border: '1px solid rgba(94,206,240,.4)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Mountain size={34} color="#5ECEF0" />
        </span>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8BEAEA' }}>
            Desafio de Lei Seca · Módulo 1
          </span>
          <b style={{ display: 'block', fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em' }}>{moduloNome}</b>
          <span style={{ fontSize: 12.5, color: '#A9C6F0' }}>{heroSub}</span>
        </div>
      </div>

      <div className="ls-hero-stats" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4,auto)', gap: 26 }}>
        {stats.map((s) => (
          <div key={s.rotulo} style={{ lineHeight: 1.2 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: '#A9C6F0' }}>{s.rotulo}</span>
            <b style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{s.valor}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA TRILHA — coluna lateral (ESQUERDA no MEQ) + palco da montanha.
// ─────────────────────────────────────────────────────────────────────────────
function AbaTrilha({
  nodes, dy, setDy, idxAtual, diasConcluidos, totalDias, progressoPct, desempenho,
}: {
  nodes: TrilhaNode[]; dy: number; setDy: (i: number) => void; idxAtual: number
  diasConcluidos: number; totalDias: number; progressoPct: number; desempenho: AulaDesempenho[]
}) {
  const sel = nodes[dy]
  const selDesemp = sel ? desempenho.find((d) => d.id === sel.id) : undefined

  return (
    // No MEQ a coluna lateral fica à ESQUERDA do palco (spec §5.2).
    <div className="ls-grid-side" style={{ display: 'grid', gridTemplateColumns: '336px minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
      {/* ── Coluna lateral (ficha técnica + previsão) ── */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 12 }}>
        <FichaTecnica sel={sel} selDesemp={selDesemp} dy={dy} idxAtual={idxAtual} totalDias={totalDias} />
        <AcertoQuizzes desempenho={desempenho} />
        <ChecklistHoje sel={sel} selDesemp={selDesemp} />
        <RitmoPrevisao desempenho={desempenho} totalDias={totalDias} diasConcluidos={diasConcluidos} />
      </aside>

      {/* ── Palco da montanha ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <PalcoMontanha nodes={nodes} dy={dy} setDy={setDy} idxAtual={idxAtual} diasConcluidos={diasConcluidos} totalDias={totalDias} progressoPct={progressoPct} desempenho={desempenho} />
        <BarraInicio sel={sel} selDesemp={selDesemp} dy={dy} idxAtual={idxAtual} />
      </div>
    </div>
  )
}

// ── Ficha técnica (card lateral) ──
function FichaTecnica({ sel, selDesemp, dy, idxAtual, totalDias }: { sel?: TrilhaNode; selDesemp?: AulaDesempenho; dy: number; idxAtual: number; totalDias: number }) {
  if (!sel) return null
  const bloqueada = sel.estado === 'disponivel' && !!sel.naoLiberada
  const concluida = sel.estado === 'concluido'
  const atual = sel.estado === 'atual' || (sel.estado === 'disponivel' && !sel.naoLiberada && dy === idxAtual)
  const leituraPct = selDesemp ? Math.round(selDesemp.leituraPct) : 0
  const statusTxt = concluida ? 'Concluída' : bloqueada ? 'Bloqueada' : 'Em andamento'
  const statusCor = concluida ? '#1FA868' : bloqueada ? 'var(--muted)' : 'var(--brand2)'
  const qTxt = selDesemp && selDesemp.questoesTotal > 0
    ? `${selDesemp.questoesRespondidas}/${selDesemp.questoesTotal} questões`
    : '0/10'
  const ctaLab = concluida ? 'Revisar aula' : leituraPct > 0 ? 'Continuar leitura' : 'Começar aula'
  const href = sel.hrefLeitura ?? sel.href ?? '#'

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ width: 46, height: 46, borderRadius: 11, background: 'color-mix(in srgb,var(--brand2) 14%,transparent)', color: 'var(--brand)', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '.08em' }}>DIA</span>
          <b style={{ fontSize: 17, fontWeight: 800 }}>{String(dy + 1).padStart(2, '0')}</b>
        </span>
        <div style={{ minWidth: 0, lineHeight: 1.25 }}>
          <b style={{ display: 'block', fontSize: 15, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{sel.titulo}</b>
          {sel.statusLabel && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sel.statusLabel}</span>}
        </div>
      </div>

      <LinhaFicha rotulo="Status" valor={<b style={{ color: statusCor, fontWeight: 700 }}>{statusTxt}</b>} />
      <LinhaFicha
        rotulo="Leitura"
        valor={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 70, height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${leituraPct}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,var(--brand),var(--brand2))' }} />
            </span>
            <b style={{ color: 'var(--ink)', fontWeight: 700 }}>{leituraPct}%</b>
          </span>
        }
      />
      <LinhaFicha rotulo="Quiz" valor={<b style={{ color: 'var(--ink)', fontWeight: 700 }}>{qTxt}</b>} />
      <LinhaFicha rotulo="Duração estimada" valor={<b style={{ color: 'var(--ink)', fontWeight: 700 }}>≈ 25 min</b>} ultima />

      {bloqueada ? (
        <div style={{ marginTop: 14, display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 11, background: 'var(--surface2)', border: '1px solid var(--line)', color: 'var(--muted)', fontSize: 13, fontWeight: 700 }}>
          <Lock size={14} /> Libera em breve
        </div>
      ) : (
        <Link href={href} style={{ marginTop: 14, display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 11, background: concluida ? 'var(--surface2)' : 'var(--brand)', color: concluida ? 'var(--ink)' : '#fff', border: concluida ? '1px solid var(--line)' : 0, fontSize: 13.5, fontWeight: 800 }}>
          {concluida ? <RotateCcw size={15} /> : <Play size={15} />} {ctaLab}
        </Link>
      )}
    </div>
  )
}

function LinhaFicha({ rotulo, valor, ultima }: { rotulo: string; valor: React.ReactNode; ultima?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line)', fontSize: 13, ...(ultima ? {} : {}) }}>
      <span style={{ color: 'var(--muted)' }}>{rotulo}</span>
      <span style={{ textAlign: 'right' }}>{valor}</span>
    </div>
  )
}

// ── Acerto nos quizzes (barras D01..) — só dias concluídos reais. ──
function AcertoQuizzes({ desempenho }: { desempenho: AulaDesempenho[] }) {
  const feitos = desempenho.filter((d) => d.questoesTotal > 0 && d.questoesRespondidas > 0)
  const pontosPorDia = feitos.slice(0, 6).map((d, i) => ({
    label: `D${String(i + 1).padStart(2, '0')}`,
    pct: d.questoesTotal > 0 ? Math.round((d.questoesRespondidas / d.questoesTotal) * 100) : 0,
  }))
  const media = pontosPorDia.length ? Math.round(pontosPorDia.reduce((s, d) => s + d.pct, 0) / pontosPorDia.length) : 0
  const vazios = Math.max(0, 6 - pontosPorDia.length)
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>
          <BarChart3 size={15} color="var(--brand)" /> Acerto nos quizzes
        </span>
        <b style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{media}%</b>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, alignItems: 'end', height: 92 }}>
        {pontosPorDia.map((d) => (
          <div key={d.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink)' }}>{d.pct}%</span>
            <span style={{ width: '100%', maxWidth: 30, height: `${Math.max(8, d.pct * 0.6)}%`, borderRadius: '6px 6px 0 0', background: 'linear-gradient(180deg,var(--brand2),var(--brand))' }} />
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{d.label}</span>
          </div>
        ))}
        {Array.from({ length: vazios }).map((_, i) => (
          <div key={`v${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>—</span>
            <span style={{ width: '100%', maxWidth: 30, height: 8, borderRadius: '6px 6px 0 0', background: 'var(--track)' }} />
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>D{String(pontosPorDia.length + i + 1).padStart(2, '0')}</span>
          </div>
        ))}
      </div>
      {pontosPorDia.length > 0 && (
        <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>Média dos {pontosPorDia.length} dias concluídos · meta 80%</p>
      )}
    </div>
  )
}

// ── Checklist de hoje ──
function ChecklistHoje({ sel, selDesemp }: { sel?: TrilhaNode; selDesemp?: AulaDesempenho }) {
  const leu = !!selDesemp?.leituraConcluida
  const quizOk = !!selDesemp && selDesemp.questoesTotal > 0 && selDesemp.questoesRespondidas >= selDesemp.questoesTotal
  const itens = [
    { txt: `Leitura · ${sel?.titulo ?? 'aula do dia'}`, done: leu, meta: selDesemp ? `${Math.round(selDesemp.leituraPct)}%` : '0%' },
    { txt: `Quiz do dia${selDesemp && selDesemp.questoesTotal ? ` (${selDesemp.questoesTotal} questões)` : ''}`, done: quizOk, meta: selDesemp ? `${selDesemp.questoesRespondidas}/${selDesemp.questoesTotal || 10}` : '0/10' },
  ]
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 10 }}>
        <BarChart3 size={15} color="var(--brand)" /> Checklist de hoje
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {itens.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: i === 0 ? 0 : '1px solid var(--line)' }}>
            <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: it.done ? '#1FA868' : 'var(--surface2)', border: it.done ? 0 : '1px solid var(--line2)', color: '#fff' }}>
              {it.done && <Check size={13} />}
            </span>
            <span style={{ flex: 1, fontSize: 12.5, color: it.done ? 'var(--muted)' : 'var(--ink)', textDecoration: it.done ? 'line-through' : 'none' }}>{it.txt}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: it.done ? '#1FA868' : 'var(--muted)' }}>{it.done ? 'feito' : it.meta}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Ritmo e previsão ──
function RitmoPrevisao({ desempenho, totalDias, diasConcluidos }: { desempenho: AulaDesempenho[]; totalDias: number; diasConcluidos: number }) {
  const diasRestantes = Math.max(0, totalDias - diasConcluidos)
  const qFeitas = desempenho.reduce((s, a) => s + a.questoesRespondidas, 0)
  const qTotal = desempenho.reduce((s, a) => s + a.questoesTotal, 0)
  const qPct = qTotal > 0 ? Math.round((qFeitas / qTotal) * 100) : 0
  const cells: { rotulo: string; valor: string; sub: string }[] = [
    { rotulo: 'Dias restantes', valor: String(diasRestantes), sub: `de ${totalDias}` },
    { rotulo: 'Questões', valor: `${qFeitas}/${qTotal || totalDias * 10}`, sub: `${qPct}% feitas` },
  ]
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 12 }}>
        <BarChart3 size={15} color="var(--brand)" /> Ritmo e previsão
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {cells.map((c) => (
          <div key={c.rotulo}>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{c.rotulo}</span>
            <b style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{c.valor}</b>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{c.sub}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PALCO DA MONTANHA — imagem de fundo + spline SVG + 30 nós + zoom/pan + overlays.
// ─────────────────────────────────────────────────────────────────────────────
function PalcoMontanha({
  nodes, dy, setDy, idxAtual, diasConcluidos, totalDias, progressoPct, desempenho = [],
}: {
  nodes: TrilhaNode[]; dy: number; setDy: (i: number) => void; idxAtual: number
  diasConcluidos: number; totalDias: number; progressoPct: number; desempenho?: AulaDesempenho[]
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  // Balão de ação ao clicar num nó (Iniciar/Continuar/Revisar) — fecha ao arrastar.
  const [balaoNode, setBalaoNode] = useState<number | null>(null)
  // Estado VISUAL (mantém montado durante a animação de saída). `saindo` dispara o fechar.
  const [balaoVis, setBalaoVis] = useState<{ i: number; saindo: boolean } | null>(null)
  const balaoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (balaoTimer.current) { clearTimeout(balaoTimer.current); balaoTimer.current = null }
    if (balaoNode !== null) setBalaoVis({ i: balaoNode, saindo: false })
    else { setBalaoVis((p) => (p ? { i: p.i, saindo: true } : null)); balaoTimer.current = setTimeout(() => setBalaoVis(null), 170) }
  }, [balaoNode])
  const panRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; ox: number; oy: number }>({ active: false, sx: 0, sy: 0, ox: 0, oy: 0 })

  // 30 pontos fixos de trilha; mapeamos os nós reais (0..totalDias-1) sobre eles.
  const pts = useMemo(() => samplePath(30), [])
  const spline = useMemo(() => splinePath(pts), [pts])
  // Fração concluída da trilha para o traço "aceso".
  const doneFrac = totalDias > 0 ? Math.min(1, diasConcluidos / (totalDias - 1 || 1)) : 0

  // Nós visíveis: mapeados proporcionalmente aos 30 pontos.
  const nodePts = useMemo(() => {
    return nodes.slice(0, 30).map((node, i) => {
      const t = nodes.length > 1 ? i / (nodes.length - 1) : 0
      const p = pts[Math.round(t * (pts.length - 1))]
      return { node, i, x: p[0], y: p[1] }
    })
  }, [nodes, pts])

  // Aplica transform imperativamente (evita re-render por frame).
  function applyTransform() {
    if (!stageRef.current) return
    stageRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoom})`
  }
  useEffect(() => { applyTransform() }, [zoom])

  function clampPan() {
    const wrap = wrapRef.current
    if (!wrap) return
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    const sw = w * zoom
    const sh = h * zoom
    const minX = Math.min(0, w - sw)
    const minY = Math.min(0, h - sh)
    panRef.current.x = Math.max(minX, Math.min(0, panRef.current.x))
    panRef.current.y = Math.max(minY, Math.min(0, panRef.current.y))
  }

  function onPointerDown(e: React.PointerEvent) {
    setBalaoNode(null) // arrastar/clicar vazio fecha o balão; clicar num nó reabre no onClick
    if (zoom <= 1) return
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, ox: panRef.current.x, oy: panRef.current.y }
      ; (e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.active) return
    panRef.current.x = dragRef.current.ox + (e.clientX - dragRef.current.sx)
    panRef.current.y = dragRef.current.oy + (e.clientY - dragRef.current.sy)
    clampPan()
    applyTransform()
  }
  function onPointerUp() { dragRef.current.active = false }

  function zoomBy(factor: number) {
    setZoom((z) => {
      const nz = Math.max(1, Math.min(2.6, z * factor))
      if (nz === 1) { panRef.current = { x: 0, y: 0 } }
      return nz
    })
    requestAnimationFrame(() => { clampPan(); applyTransform() })
  }
  function irMinhaAula() {
    setZoom(1.8)
    requestAnimationFrame(() => {
      const wrap = wrapRef.current
      if (!wrap) return
      const p = nodePts.find((np) => np.i === idxAtual) ?? nodePts[nodePts.length - 1]
      if (!p) return
      const relX = p.x / IMG_W
      const relY = p.y / IMG_H
      panRef.current.x = wrap.clientWidth / 2 - relX * wrap.clientWidth * 1.8
      panRef.current.y = wrap.clientHeight / 2 - relY * wrap.clientHeight * 1.8
      clampPan(); applyTransform()
    })
  }
  function verTudo() { setZoom(1); panRef.current = { x: 0, y: 0 }; requestAnimationFrame(applyTransform) }

  const nodeSize = (estado: string, atualNode: boolean) => (atualNode ? 44 : 30)

  return (
    <div style={{ position: 'relative', borderRadius: '14px 14px 0 0', overflow: 'hidden', border: '1px solid var(--line)', borderBottom: 0 }}>
      {/* Palco com zoom/pan */}
      <div
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={() => (zoom > 1 ? verTudo() : zoomBy(1.6))}
        className="ls-stage"
        style={{ position: 'relative', width: '100%', height: 720, overflow: 'hidden', touchAction: 'pan-y', cursor: zoom > 1 ? 'grab' : 'default', background: '#0B0820' }}
      >
        <div ref={stageRef} style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', willChange: 'transform' }}>
          {/* Fundo da montanha */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/leiseca/trilha_m.jpg" alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center bottom' }} />
          {/* Tint ciano da marca */}
          <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(23,30,59,.1),rgba(48,106,181,.28))' }} />

          {/* Caminho SVG */}
          <svg viewBox={`0 0 ${IMG_W} ${IMG_H}`} preserveAspectRatio="xMidYMax slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden>
            {/* Traço total (escuro, pontilhado) */}
            <path d={spline} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth={5} strokeLinecap="round" strokeDasharray="2 14" vectorEffect="non-scaling-stroke" />
            {/* Traço concluído (ciano aceso) */}
            <path
              d={spline} fill="none" stroke="#5ECEF0" strokeWidth={6} strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeDasharray: 3000, strokeDashoffset: 3000 * (1 - doneFrac), filter: 'drop-shadow(0 0 6px rgba(94,206,240,.7))' }}
            />
          </svg>

          {/* Nós */}
          {nodePts.map(({ node, i, x, y }) => {
            const concluido = node.estado === 'concluido'
            const atualNode = i === idxAtual
            const bloqueado = node.estado === 'disponivel' && !!node.naoLiberada
            const sz = nodeSize(node.estado, atualNode)
            const sel = i === dy
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
                  width: sz, height: sz, borderRadius: node.estado === 'concluido' || atualNode ? '50%' : 8,
                  border: '2px solid rgba(255,255,255,.9)', cursor: 'pointer', padding: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: atualNode ? 13 : 11, fontWeight: 800, color: '#fff',
                  background: concluido
                    ? '#2EC77A'
                    : atualNode
                      ? 'linear-gradient(135deg,#3E7FE0,#5ECEF0)'
                      : bloqueado
                        ? 'rgba(23,30,59,.66)'
                        : 'rgba(48,106,181,.9)',
                  boxShadow: sel
                    ? '0 0 0 4px color-mix(in srgb,#5ECEF0 55%,transparent)'
                    : atualNode
                      ? '0 0 0 6px rgba(94,206,240,.3)'
                      : '0 2px 6px rgba(0,0,0,.4)',
                  animation: atualNode ? 'lsPulse 2.2s ease-in-out infinite' : undefined,
                  zIndex: atualNode ? 5 : 2,
                }}
              >
                {concluido ? <Check size={sz * 0.5} /> : ehCume ? <Flag size={sz * 0.5} /> : bloqueado ? <Lock size={sz * 0.42} /> : String(i + 1).padStart(2, '0')}
              </button>
            )
          })}

          {/* Rótulo "Você está aqui" sobre o nó atual (some quando um balão de aula está aberto). */}
          {!balaoVis && nodePts[idxAtual] && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: `${(nodePts[idxAtual].x / IMG_W) * 100}%`,
                top: `${(nodePts[idxAtual].y / IMG_H) * 100}%`,
                transform: 'translate(-50%,-250%)',
                display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                height: 24, padding: '0 10px', borderRadius: 99, background: '#5ECEF0', color: '#0b1020',
                fontSize: 11, fontWeight: 800, boxShadow: '0 4px 12px rgba(0,0,0,.35)', zIndex: 6,
              }}
            >
              Você está aqui
            </span>
          )}
          {/* Balão "Libera amanhã" no próximo nó (some SÓ quando o balão aberto está NESSE mesmo nó). */}
          {nodePts[idxAtual + 1] && !(balaoVis && balaoVis.i === idxAtual + 1) && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: `${(nodePts[idxAtual + 1].x / IMG_W) * 100}%`,
                top: `${(nodePts[idxAtual + 1].y / IMG_H) * 100}%`,
                transform: 'translate(-50%,-220%)',
                display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                height: 22, padding: '0 9px', borderRadius: 99, background: 'rgba(11,16,32,.85)', color: '#fff',
                fontSize: 10.5, fontWeight: 700, border: '1px solid rgba(94,206,240,.5)', zIndex: 4,
                animation: 'lsBob 2.6s ease-in-out infinite',
              }}
            >
              <Lock size={11} /> Libera amanhã
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
              <div className={balaoVis.saindo ? undefined : 'lsm-balao-wrap'} onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', left: `${(np.x / IMG_W) * 100}%`, top: `${(np.y / IMG_H) * 100}%`, transform: 'translate(-50%, calc(-100% - 48px))', zIndex: 14, width: 216 }}>
                <div className={balaoVis.saindo ? 'lsm-balao-out' : 'lsm-balao-in'} style={{ position: 'relative', borderRadius: 14, padding: '11px 12px', background: '#fff', color: '#171E3B', boxShadow: '0 16px 34px -14px rgba(0,0,0,.72)' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: 'var(--brand)' }}>DIA {String(balaoVis.i + 1).padStart(2, '0')}</span>
                  <b style={{ display: 'block', margin: '2px 0 9px', fontSize: 13, lineHeight: 1.25, letterSpacing: '-0.01em' }}>{nd.titulo}</b>
                  {bloq ? (
                    <span style={{ display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 10, background: 'rgba(23,30,59,.08)', color: '#5A6690', fontSize: 12.5, fontWeight: 700 }}><Lock size={13} /> Libera em breve</span>
                  ) : (
                    <Link href={href} onClick={() => setBalaoNode(null)} className="lsm-balao-cta" style={{ display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, borderRadius: 10, background: 'var(--brand)', color: '#fff', fontSize: 13.5, fontWeight: 800 }}>
                      {concl ? <RotateCcw size={14} /> : <Play size={13} />} {lab}
                    </Link>
                  )}
                  <span aria-hidden style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '8px solid #fff' }} />
                </div>
              </div>
            )
          })()}
        </div>

        {/* ── Overlay: painel de vidro "Sua subida" (canto sup-esq; largura total no mobile) ── */}
        <div className="ls-subida" style={{ position: 'absolute', left: 14, top: 14, width: 310, maxWidth: 'calc(100% - 28px)', padding: '12px 14px', borderRadius: 12, background: 'rgba(11,16,32,.62)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(94,206,240,.3)', color: '#fff', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(94,206,240,.16)', border: '1px solid rgba(94,206,240,.45)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Mountain size={20} color="#5ECEF0" />
            </span>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
              <b style={{ display: 'block', fontSize: 13 }}>Sua subida</b>
              <span style={{ fontSize: 11, color: '#A9C6F0' }}>{diasConcluidos} de {totalDias} dias · dia {Math.min(diasConcluidos + 1, totalDias)}</span>
            </div>
            <b style={{ fontSize: 20, fontWeight: 800 }}>{progressoPct}%</b>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 3 }}>
            {Array.from({ length: 30 }).map((_, i) => (
              <span key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: i < Math.round((progressoPct / 100) * 30) ? '#5ECEF0' : 'rgba(255,255,255,.2)' }} />
            ))}
          </div>
        </div>

        {/* ── Overlay: minimapa (canto sup-dir, desktop) ── */}
        <div className="ls-minimap" style={{ position: 'absolute', right: 14, top: 14, width: 108, height: 150, borderRadius: 10, overflow: 'hidden', border: '2px solid rgba(255,255,255,.5)', zIndex: 10, boxShadow: '0 6px 18px rgba(0,0,0,.4)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/leiseca/trilha_m.jpg" alt="" aria-hidden style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center bottom' }} />
        </div>

        {/* ── Toolbar flutuante centralizada embaixo ── */}
        <div style={{ position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 99, background: 'rgba(11,16,32,.72)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.12)', zIndex: 10 }}>
          <ToolBtn onClick={() => zoomBy(1 / 1.5)} title="Diminuir zoom"><Minus size={15} /></ToolBtn>
          <input
            type="range" min={1} max={2.6} step={0.1} value={zoom}
            onChange={(e) => { const z = Number(e.target.value); setZoom(z); if (z === 1) panRef.current = { x: 0, y: 0 }; requestAnimationFrame(() => { clampPan(); applyTransform() }) }}
            aria-label="Zoom da trilha"
            className="ls-zoom-slider"
            style={{ width: 160, accentColor: '#5ECEF0' }}
          />
          <ToolBtn onClick={() => zoomBy(1.5)} title="Aumentar zoom"><Plus size={15} /></ToolBtn>
          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,.15)' }} />
          <ToolPill onClick={irMinhaAula} title="Ir para minha aula"><Crosshair size={13} /> <span className="ls-pill-lab">Minha aula</span></ToolPill>
          <ToolPill onClick={verTudo} title="Ver trilha inteira"><Maximize2 size={13} /> <span className="ls-pill-lab">Ver tudo</span></ToolPill>
        </div>
      </div>
    </div>
  )
}

function ToolBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} style={{ width: 30, height: 30, borderRadius: 8, border: 0, background: 'rgba(255,255,255,.1)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {children}
    </button>
  )
}
function ToolPill({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 99, border: 0, background: 'rgba(94,206,240,.18)', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {children}
    </button>
  )
}

// ── Barra de início acoplada abaixo do palco ──
function BarraInicio({ sel, selDesemp, dy, idxAtual }: { sel?: TrilhaNode; selDesemp?: AulaDesempenho; dy: number; idxAtual: number }) {
  if (!sel) return null
  const bloqueada = sel.estado === 'disponivel' && !!sel.naoLiberada
  const concluida = sel.estado === 'concluido'
  const leituraPct = selDesemp ? Math.round(selDesemp.leituraPct) : 0
  const progW = concluida ? 100 : leituraPct
  const progTxt = concluida ? 'Aula concluída · +10 pts' : bloqueada ? 'Bloqueada' : `Etapa 1 de 2 · leitura ${leituraPct}%`
  const ctaLab = concluida ? 'Revisar aula' : leituraPct > 0 ? 'Continuar leitura' : 'Começar aula'
  const href = sel.hrefLeitura ?? sel.href ?? '#'
  const numBg = concluida ? '#22B573' : dy === idxAtual ? 'var(--brand2)' : '#8A8FA3'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '0 0 14px 14px', flexWrap: 'wrap' }}>
      <span style={{ width: 46, height: 46, borderRadius: 11, background: numBg, color: '#fff', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '.08em' }}>DIA</span>
        <b style={{ fontSize: 17, fontWeight: 800 }}>{String(dy + 1).padStart(2, '0')}</b>
      </span>
      <div style={{ flex: 1, minWidth: 180 }}>
        <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{sel.titulo}</b>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <span style={{ flex: 1, maxWidth: 260, height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${progW}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,var(--brand),var(--brand2))' }} />
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{progTxt}</span>
        </div>
      </div>
      {bloqueada ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 18px', borderRadius: 11, background: 'var(--surface2)', border: '1px solid var(--line)', color: 'var(--muted)', fontSize: 13, fontWeight: 700 }}>
          <Lock size={14} /> Bloqueada
        </span>
      ) : (
        <Link href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 22px', borderRadius: 11, background: concluida ? 'var(--surface2)' : 'var(--brand)', color: concluida ? 'var(--ink)' : '#fff', border: concluida ? '1px solid var(--line)' : 0, fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
          {concluida ? <RotateCcw size={15} /> : <Play size={15} />} {ctaLab}
        </Link>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA REGULAMENTO
// ─────────────────────────────────────────────────────────────────────────────
function AbaRegulamento({ regulamento, pontuacao, gam }: { regulamento?: RegulamentoConfig; pontuacao?: PontuacaoLeitura; gam?: GamRail | null }) {
  const xr = gam?.config.xp_regras
  const marcos = xr?.streak?.marcos ?? []
  const chest = xr?.chest
  const limiteDia = xr?.limite_dia ?? 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Ganhos & metas (topo no MEQ) */}
      {pontuacao && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
              <Zap size={17} color="var(--brand)" /> Ganhos & metas
            </span>
            {gam && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: 99, background: 'color-mix(in srgb,var(--brand2) 14%,transparent)', color: 'var(--brand)', fontSize: 13, fontWeight: 700 }}>
                <Zap size={13} /> +{fmt(gam.resumo.xpHoje)} pontos hoje
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
            <div style={{ borderRadius: 11, border: '1px solid var(--line)', background: 'var(--surface2)', padding: 14 }}>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>Por atividade (no dia)</p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <GanhoItem valor={`+${pontuacao.pontos_aula}`} txt="por leitura" />
                <GanhoItem valor={`+${pontuacao.pontos_quiz}`} txt="por concluir o quiz" />
                {pontuacao.pontos_acerto > 0 && <GanhoItem valor={`+${pontuacao.pontos_acerto}`} txt="por acerto no quiz" />}
                {pontuacao.combo_ativo && <GanhoItem valor={`+${pontuacao.combo_bonus}`} txt="ao gabaritar a aula" />}
              </ul>
            </div>
            {(chest || marcos.length > 0) && (
              <div style={{ borderRadius: 11, border: '1px solid var(--line)', background: 'var(--surface2)', padding: 14 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>Sequência (login diário)</p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {chest && chest.xp > 0 && <GanhoItem gold valor={`+${chest.xp}`} txt={`a cada ${chest.cada_n_dias} dias seguidos`} />}
                  {marcos.map((m) => <GanhoItem key={m.dias} gold valor={`+${m.xp}`} txt={`ao completar ${m.dias} dias`} />)}
                </ul>
              </div>
            )}
          </div>
          {limiteDia > 0 && <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>Máximo de <b style={{ color: 'var(--ink)' }}>{limiteDia}</b> pontos por dia — cada tarefa conta uma única vez.</p>}
        </div>
      )}

      {/* Documento / PDF do regulamento */}
      {regulamento?.ativo && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 15, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{regulamento.titulo || 'Regulamento oficial'}</b>
            {regulamento.documento_url && (
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={`${regulamento.documento_url}${regulamento.documento_url.includes('?') ? '&' : '?'}download`} title="Baixar PDF" aria-label="Baixar PDF" style={{ width: 36, height: 36, borderRadius: 9, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Download size={16} /></a>
                <a href={regulamento.documento_url} target="_blank" rel="noopener noreferrer" title="Abrir em nova aba" aria-label="Abrir em nova aba" style={{ width: 36, height: 36, borderRadius: 9, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ExternalLink size={16} /></a>
              </div>
            )}
          </div>
          {regulamento.descricao && <div style={{ padding: 18, whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink)' }}>{regulamento.descricao}</div>}
          {regulamento.documento_url && (
            <iframe src={`${regulamento.documento_url}#view=FitH`} title="Regulamento (PDF)" style={{ width: '100%', height: '80vh', border: 0, background: '#fff' }} />
          )}
        </div>
      )}
      {!regulamento?.ativo && !pontuacao && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 14, background: 'var(--surface)', border: '1px dashed var(--line)', borderRadius: 14 }}>
          O regulamento deste desafio ainda não foi publicado.
        </div>
      )}
    </div>
  )
}

function GanhoItem({ valor, txt, gold }: { valor: string; txt: string; gold?: boolean }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
      <span style={{ minWidth: 48, textAlign: 'center', borderRadius: 7, padding: '2px 6px', fontSize: 12, fontWeight: 800, background: gold ? 'color-mix(in srgb,#F2A93B 16%,transparent)' : 'color-mix(in srgb,var(--brand2) 14%,transparent)', color: gold ? '#C98A1E' : 'var(--brand)' }}>{valor}</span>
      <span style={{ color: 'var(--ink)' }}>{txt}</span>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA DESEMPENHO — tabela PRIMEIRO (MEQ) + gráfico + etapas + carimbos.
// ─────────────────────────────────────────────────────────────────────────────
function AbaDesempenho({ desempenho, totalDias, diasConcluidos, pontos, carimbos }: { desempenho: AulaDesempenho[]; totalDias: number; diasConcluidos: number; pontos: number; carimbos: CarimboAlunoView[] }) {
  const qFeitas = desempenho.reduce((s, a) => s + a.questoesRespondidas, 0)
  const qTotal = desempenho.reduce((s, a) => s + a.questoesTotal, 0)
  const feitosComQuiz = desempenho.filter((d) => d.questoesTotal > 0 && d.questoesRespondidas > 0)
  const acertoMedio = feitosComQuiz.length
    ? Math.round(feitosComQuiz.reduce((s, d) => s + (d.questoesRespondidas / d.questoesTotal) * 100, 0) / feitosComQuiz.length)
    : 0
  const melhorSeq = desempenho.reduce((m, a) => Math.max(m, a.sequencia), 0)

  const kpis = [
    { rotulo: 'AULAS', valor: `${diasConcluidos}/${totalDias}` },
    { rotulo: 'QUESTÕES', valor: `${qFeitas}/${qTotal || totalDias * 10}` },
    { rotulo: 'ACERTO', valor: `${acertoMedio}%` },
    { rotulo: 'PONTOS', valor: fmt(pontos) },
    { rotulo: 'MELHOR SEQUÊNCIA', valor: String(melhorSeq) },
  ]

  const etapas: { t: string; d: string; ok: boolean }[] = [
    { t: 'Acampamento base', d: 'D1', ok: diasConcluidos >= 1 },
    { t: 'Primeiro mirante', d: 'D7', ok: diasConcluidos >= 7 },
    { t: 'Meio da encosta', d: 'D15', ok: diasConcluidos >= 15 },
    { t: 'Acampamento alto', d: 'D21', ok: diasConcluidos >= 21 },
    { t: 'Cume', d: `D${totalDias}`, ok: diasConcluidos >= totalDias },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
        {kpis.map((k) => (
          <div key={k.rotulo} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--muted)' }}>{k.rotulo}</span>
            <b style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{k.valor}</b>
          </div>
        ))}
      </div>

      {/* Tabela PRIMEIRO (MEQ) */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ maxHeight: 560, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface2)' }}>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={thSt}>Dia</th>
                <th style={thSt}>Aula / tema</th>
                <th style={thSt}>Feito em</th>
                <th style={thSt}>Leitura</th>
                <th style={thSt}>Questões</th>
                <th style={{ ...thSt, textAlign: 'center' }}>Sequência</th>
                <th style={{ ...thSt, textAlign: 'center' }}>Pontos</th>
                <th style={{ ...thSt, textAlign: 'right' }}>Situação</th>
              </tr>
            </thead>
            <tbody>
              {desempenho.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Nenhuma aula neste módulo.</td></tr>
              ) : desempenho.map((a, i) => {
                const bloqueada = a.estado === 'bloqueado'
                return (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--line)', opacity: bloqueada ? 0.55 : 1 }}>
                    <td style={tdSt}><b style={{ color: 'var(--muted)' }}>{String(i + 1).padStart(2, '0')}</b></td>
                    <td style={tdSt}>
                      {bloqueada ? (
                        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{a.titulo}</span>
                      ) : (
                        <Link href={`/aluno/leitura/${a.id}`} style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none' }}>{a.titulo}</Link>
                      )}
                    </td>
                    <td style={{ ...tdSt, color: a.diaFeito ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDiaFeito(a.diaFeito)}</td>
                    <td style={tdSt}>
                      {a.leituraConcluida ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1FA868' }}><Check size={13} /> 100%</span>
                        : bloqueada ? <span style={{ color: 'var(--muted)' }}>—</span>
                          : <span style={{ color: 'var(--ink)' }}>{Math.round(a.leituraPct)}%</span>}
                    </td>
                    <td style={tdSt}>{a.questoesTotal > 0 ? `${a.questoesRespondidas}/${a.questoesTotal}` : '—'}</td>
                    <td style={{ ...tdSt, textAlign: 'center' }}>{a.sequencia > 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#F0773A', fontWeight: 700 }}><Flame size={12} /> {a.sequencia}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td style={{ ...tdSt, textAlign: 'center' }}>{a.pontos > 0 ? <b style={{ color: 'var(--brand)' }}>+{a.pontos}</b> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>
                      {a.estado === 'concluido' ? <Pill cor="#1FA868" icon={<Check size={11} />}>Concluída</Pill>
                        : bloqueada ? <Pill cor="var(--muted)" icon={<Lock size={11} />}>Bloqueada</Pill>
                          : <Pill cor="var(--brand)">Em andamento</Pill>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gráfico | Etapas */}
      <div className="ls-grid-side" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Acertos por dia */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 14 }}>
            <BarChart3 size={16} color="var(--brand)" /> Acertos por dia
          </span>
          <div style={{ display: 'flex', alignItems: 'end', gap: 2, height: 110 }}>
            {desempenho.slice(0, 30).map((a, i) => {
              const pct = a.questoesTotal > 0 ? (a.questoesRespondidas / a.questoesTotal) * 100 : 0
              const bloqueada = a.estado === 'bloqueado'
              const andamento = a.estado === 'atual'
              return (
                <span key={a.id} title={`Dia ${i + 1}: ${Math.round(pct)}%`} style={{ flex: 1, height: `${Math.max(4, pct)}%`, minHeight: 4, borderRadius: '3px 3px 0 0', background: bloqueada ? 'var(--track)' : andamento ? 'var(--brand2)' : '#2EC77A' }} />
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
            <Legenda cor="#2EC77A" txt="Concluída" />
            <Legenda cor="var(--brand2)" txt="Em andamento" />
            <Legenda cor="var(--track)" txt="Bloqueada" />
          </div>
        </div>
        {/* Etapas da montanha */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>
            <Flag size={16} color="var(--brand)" /> Etapas da montanha
          </span>
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

      {/* Passaporte de carimbos */}
      {carimbos.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 14 }}>
            <Trophy size={16} color="var(--brand)" /> Passaporte de carimbos
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>({carimbos.filter((c) => c.ganho).length}/{carimbos.length})</span>
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 14 }}>
            {carimbos.map((c) => (
              <div key={c.def.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
                <span style={{ width: 72, height: 72, borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: c.ganho ? '2px solid var(--brand2)' : '2px dashed var(--line2)', background: c.ganho ? 'color-mix(in srgb,var(--brand2) 8%,transparent)' : 'var(--surface2)', transform: c.ganho ? 'rotate(-8deg)' : 'none' }}>
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

const thSt: React.CSSProperties = { padding: '11px 14px', fontWeight: 600, fontSize: 12 }
const tdSt: React.CSSProperties = { padding: '11px 14px', color: 'var(--ink)' }

/** 'YYYY-MM-DD' → 'DD/MM/AA' (fuso já aplicado na origem). Vazio → travessão. */
function fmtDiaFeito(d: string | null): string {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return y && m && dd ? `${dd}/${m}/${y.slice(2)}` : '—'
}

function Pill({ cor, icon, children }: { cor: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, background: `color-mix(in srgb,${cor} 12%,transparent)`, color: cor }}>
      {icon}{children}
    </span>
  )
}
function Legenda({ cor, txt }: { cor: string; txt: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: cor }} />{txt}</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA RANKING — tabela | lateral direita (400px no MEQ). Só iniciais p/ terceiros.
// ─────────────────────────────────────────────────────────────────────────────
function AbaRanking({ ranking, minhaLinha, meuId, meuNome, progressoPct, totalDias, moduloNome }: { ranking: RankingLeitura; minhaLinha?: RankingLeituraItem | null; meuId?: string | null; meuNome?: string | null; progressoPct: number; totalDias: number; moduloNome: string }) {
  const itens = ranking.itens.filter((r) => !r.oculto)
  const eu = minhaLinha ?? itens.find((r) => r.estudanteId === meuId) ?? null
  const top3 = itens.slice(0, 3)
  const total = itens.length

  const nomeExib = (r: RankingLeituraItem) => (r.estudanteId === meuId ? (meuNome ? primeiroNome(meuNome) : 'Você') : iniciaisDe(r.nome))
  const avatarIniciais = (r: RankingLeituraItem) => (r.estudanteId === meuId ? inic(meuNome || 'Você') : iniciaisDe(r.nome).replace(/\./g, '').replace(/\s/g, ''))

  return (
    <div className="ls-rank-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 18, alignItems: 'start' }}>
      {/* Tabela (esquerda) */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ fontSize: 15, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Ranking geral</b>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1FA868' }} /> Ao vivo · {fmt(total)} alunos
          </span>
        </div>
        <div style={{ maxHeight: 620, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface2)' }}>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={thSt}>#</th>
                <th style={thSt}>Aluno</th>
                <th style={{ ...thSt, textAlign: 'center' }}>Aulas</th>
                <th style={{ ...thSt, textAlign: 'center' }}>Sequência</th>
                <th style={{ ...thSt, textAlign: 'right' }}>Pontos</th>
              </tr>
            </thead>
            <tbody>
              {itens.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Ranking ainda sem participantes.</td></tr>
              ) : itens.slice(0, 200).map((r) => {
                const sou = r.estudanteId === meuId
                return (
                  <tr key={r.estudanteId} style={{ borderTop: '1px solid var(--line)', background: sou ? 'color-mix(in srgb,var(--brand2) 8%,transparent)' : 'transparent' }}>
                    <td style={tdSt}><b style={{ color: r.posicao <= 3 ? 'var(--brand)' : 'var(--muted)' }}>{r.posicao}º</b></td>
                    <td style={tdSt}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: sou ? '#F2A93B' : 'var(--surface2)', color: sou ? '#fff' : 'var(--muted)', border: sou ? 0 : '1px solid var(--line)' }}>
                          {avatarIniciais(r)}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <b style={{ color: 'var(--ink)', fontWeight: sou ? 800 : 600 }}>{nomeExib(r)}</b>
                          {sou && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', padding: '1px 5px', borderRadius: 5, background: 'var(--brand)', color: '#fff' }}>VOCÊ</span>}
                        </span>
                      </span>
                    </td>
                    <td style={{ ...tdSt, textAlign: 'center' }}>{r.aulasConcluidas}/{r.totalAulas}</td>
                    <td style={{ ...tdSt, textAlign: 'center' }}>{r.streakAtual > 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#F0773A', fontWeight: 700 }}><Flame size={12} /> {r.streakAtual}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}><b style={{ color: 'var(--ink)' }}>{fmt(r.score)}</b></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lateral (direita): pódio + me_card + progresso */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 12 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
          <b style={{ display: 'block', fontSize: 14.5, color: 'var(--ink)', marginBottom: 14, letterSpacing: '-0.02em' }}>{moduloNome}</b>
          {/* Pódio */}
          {top3.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, alignItems: 'end', marginBottom: 16 }}>
              {[top3[1], top3[0], top3[2]].map((r, idx) => {
                if (!r) return <span key={idx} />
                const pos = r.posicao
                const alt = pos === 1 ? 108 : pos === 2 ? 84 : 64
                const cor = pos === 1 ? '#F2A93B' : pos === 2 ? '#9AA5B1' : '#B9773F'
                const sou = r.estudanteId === meuId
                return (
                  <div key={r.estudanteId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    {pos === 1 && <Crown size={16} color="#F2A93B" />}
                    <span style={{ width: 44, height: 44, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', background: sou ? '#F2A93B' : cor }}>
                      {sou ? inic(meuNome || 'Você') : iniciaisDe(r.nome).replace(/[.\s]/g, '')}
                    </span>
                    <b style={{ fontSize: 12, color: 'var(--ink)' }}>{fmt(r.score)}</b>
                    <div style={{ width: '100%', height: alt, borderRadius: '8px 8px 0 0', background: `color-mix(in srgb,${cor} 22%,var(--surface2))`, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 6, fontSize: 14, fontWeight: 800, color: cor }}>
                      {pos}º
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {/* me_card */}
          {eu && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 11, border: '2px solid var(--brand)', background: 'color-mix(in srgb,var(--brand2) 6%,transparent)' }}>
              <span style={{ width: 42, height: 42, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', background: '#F2A93B', flexShrink: 0 }}>
                {inic(meuNome || 'Você')}
              </span>
              <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <b style={{ fontSize: 14, color: 'var(--ink)' }}>{meuNome ? primeiroNome(meuNome) : 'Você'}</b>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: 'var(--brand)', color: '#fff' }}>VOCÊ</span>
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{eu.posicao}º · {eu.aulasConcluidas}/{eu.totalAulas} aulas · {eu.streakAtual}🔥</span>
              </div>
              <b style={{ fontSize: 17, color: 'var(--brand)' }}>{fmt(eu.score)}</b>
            </div>
          )}
        </div>

        {/* Progresso do desafio */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 12 }}>
            <Target size={15} color="var(--brand)" /> Progresso do desafio
          </span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{eu?.aulasConcluidas ?? 0} de {totalDias} dias</span>
            <b style={{ fontSize: 16, color: 'var(--ink)' }}>{progressoPct}%</b>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${progressoPct}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,var(--brand),var(--brand2))' }} />
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--muted)' }}>Conclua a aula de hoje para subir no ranking.</p>
        </div>
      </aside>
    </div>
  )
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
