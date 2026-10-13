'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DESAFIO DE JURISPRUDÊNCIA — ÁREA INTERNA (abas) · visual novo (interno).
//
// Monta o desafio no MESMO padrão da área interna da Lei Seca (hero + abas sublinhadas
// em OURO). No lugar da aba "Trilha" há a aba "Desafio" (arcade inteiro, iframe). As
// outras abas replicam a APARÊNCIA da Lei Seca com os DADOS do arcade:
//   • Regulamento: card "Ganhos & metas" (tabela de pontos do jogo) + "Como funciona".
//   • Desempenho: KPIs + gráfico de pontuação por fase + etapas + tabela por fase.
//   • Ranking: pódio + card "Você" + progresso + classificação (reusa /api/.../ranking).
//
// O iframe do arcade fica SEMPRE montado (display:none quando inativo) → trocar de aba
// não recarrega o jogo. Tokens herdados do root (internaTokensStyle). Ouro = #F1C232.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  Gamepad2, Trophy, BookOpen, BarChart3, ChevronLeft, Loader2, Heart, Timer, Coins, Medal, Target, Scale,
  Zap, Check, List, Flag, Lock, FileText, HelpCircle, TrendingUp,
} from 'lucide-react'
import { useTemaInterno } from '@/components/brand/interna/use-tema-interno'
import type { InternaTheme } from '@/components/brand/interna/interna-tokens'
import { iniciarTourGuia } from '@/components/aluno/guia-tour-runner'
import { LeituraRanking } from '@/components/aluno/leitura-ranking'
import type { RankingLeitura } from '@/lib/leitura/ranking'
import type { TituloNivel } from '@/lib/gamificacao/config'

const GOLD = '#F1C232'
const fmt = (n: number) => (Number(n) || 0).toLocaleString('pt-BR')

type Tab = 'desafio' | 'reg' | 'des' | 'rank'
// Alvos do tour da Capi (ver TOURS_ALUNO.jurisprudencia). O arcade usa 'juris-desafio' (área grande);
// as abas Regulamento/Desempenho/Ranking recebem o próprio alvo nos botões.
const TOUR_ATTR: Partial<Record<Tab, string>> = { reg: 'juris-reg', des: 'juris-des', rank: 'juris-rank' }
/** Botão de Ajuda do desafio: reinicia o tour guiado da Capi (também alvo do último passo). `onStart`
 *  garante a aba Desafio ativa antes (os blocos do arcade ficam ocultos nas outras abas). */
function AjudaTourBtn({ style, onStart }: { style?: React.CSSProperties; onStart?: () => void }) {
  return (
    <button
      type="button" data-tour="juris-ajuda" onClick={() => { onStart?.(); iniciarTourGuia('jurisprudencia') }}
      title="Rever o tour do desafio com a Capi" aria-label="Ajuda — rever o tour do desafio"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 11px', borderRadius: 99,
        background: 'rgba(255,255,255,.14)', color: '#fff', border: '1px solid rgba(255,255,255,.22)',
        fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', ...style,
      }}
    >
      <HelpCircle size={14} /> Ajuda
    </button>
  )
}
type Pontos = { ponto?: number; tese?: number; vadeMecum?: number; vida?: number; armadilha?: number; labirintoLimpo?: number }
type Config = { vidas?: number; tempoResposta?: number; pontos?: Pontos } | null
type DiaInfo = { chave: string; titulo: string }

export interface DesafioJurisInternoProps {
  desafioId: string
  titulo: string
  theme: InternaTheme
  totalDias: number
  materiasCount: number
  config: Config
  bannerUrl: string | null
  /** Cabeçalho compacto (retrai banner + abas → mais tela para o arcade). */
  compacto?: boolean
  /** Cor de fundo do cabeçalho (usada quando NÃO há imagem). Vazio/null = gradiente padrão. */
  corFundo?: string | null
  dias: DiaInfo[]
}

export function DesafioJurisInterno({ desafioId, titulo, theme, totalDias, materiasCount, config, bannerUrl, compacto, corFundo, dias }: DesafioJurisInternoProps) {
  useTemaInterno(theme) // reage ao toggle claro/escuro/azul ao vivo
  const [tab, setTab] = useState<Tab>('desafio')

  // Tour da Capi na PRIMEIRA vez que o aluno entra num desafio (apresenta o jogo e as abas). Depois,
  // é só o botão "Ajuda" no cabeçalho para refazer. Flag global por aluno (não repete a cada desafio).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    try {
      if (localStorage.getItem('juris:tour-visto') !== '1') {
        localStorage.setItem('juris:tour-visto', '1')
        t = setTimeout(() => iniciarTourGuia('jurisprudencia'), 950) // deixa o cabeçalho/arena montarem
      }
    } catch { /* sem storage → sem auto-tour */ }
    return () => { if (t) clearTimeout(t) }
  }, [])

  // FAIXA BRANCA em volta da down bar: o scroll do portal (.shr-main) tem fundo CLARO no interno e aparecia
  // atrás/abaixo do arcade. Na aba DESAFIO pintamos SÓ o fundo do .shr-main com o MESMO fundo do desafio
  // (o do body do arcade: navy + pontilhado) → mesmo se rolar, o que aparece é o fundo do desafio, não
  // branco, e a down bar fica ENCAIXADA. NÃO mexemos no overflow (senão a rolagem das outras abas buga).
  // Reverte ao trocar de aba/sair; as outras abas ficam iguais.
  useEffect(() => {
    if (tab !== 'desafio') return
    const main = document.querySelector('.shr-main') as HTMLElement | null
    if (!main) return
    const prev = main.style.background
    main.style.background =
      'radial-gradient(circle at 1px 1px, #131b63 1px, transparent 1.5px) 0 0 / 18px 18px,' +
      'radial-gradient(1200px 600px at 50% -10%, #0d1670 0%, transparent 60%),' +
      '#040830'
    return () => { main.style.background = prev }
  }, [tab])


  // LEITURA sem recarregar o arcade: o iframe do jogo fica SEMPRE montado (congelado, estado preservado);
  // a leitura abre num overlay POR CIMA (irmão, via portal). O arcade pede via postMessage; ao fechar,
  // avisamos o arcade p/ reatualizar só o gate — nada recarrega, sem painéis vazios nem flash da abertura.
  const arcadeRef = useRef<HTMLIFrameElement>(null)
  const leituraRef = useRef<HTMLIFrameElement>(null)
  const [leitura, setLeitura] = useState<string | null>(null)
  // Enquanto o iframe da leitura carrega, mostramos um loader ESCURO por cima (em vez da tela branca).
  const [leituraLoad, setLeituraLoad] = useState(false)
  // Rótulo do overlay conforme o que está abrindo: "a leitura…" (leitor do dia) ou "as questões…" (quiz).
  const [overlayLabel, setOverlayLabel] = useState('a leitura…')
  const fecharLeitura = () => { setLeitura(null); setLeituraLoad(false); try { arcadeRef.current?.contentWindow?.postMessage({ type: 'juris-leitura-fechada' }, '*') } catch { /* ignora */ } }
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as { type?: string; docId?: string; desafio?: string }
      if (d && (d.type === 'juris-abrir-leitura' || d.type === 'juris-abrir-leitura-rapida' || d.type === 'juris-abrir-questoes') && d.docId) {
        // leitura = leitor do dia · leitura-rapida = quiz HTML · questoes = tela de responder do Lei Seca.
        const base = d.type === 'juris-abrir-leitura-rapida' ? 'leitura-rapida' : d.type === 'juris-abrir-questoes' ? 'questoes' : 'leitura'
        // Leitor NOVO (redesign) na leitura do dia (v2=1); rápida/questões seguem como estão.
        const extra = base === 'leitura' ? '&v2=1' : ''
        setOverlayLabel(base === 'leitura' ? 'a leitura…' : 'as questões…')
        setLeituraLoad(true)
        setLeitura(`/aluno/jurisprudencia/${base}/${encodeURIComponent(d.docId)}?desafio=${encodeURIComponent(d.desafio || desafioId)}&embed=1${extra}`)
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [desafioId])
  // Fecha APENAS pelo sinal explícito do leitor (#fechar-leitura). NÃO checar pathname — no about:blank
  // inicial do iframe o pathname não é o do leitor e fecharia o overlay antes dele renderizar (flicker).
  useEffect(() => {
    if (!leitura) return
    const iv = setInterval(() => {
      try { if (leituraRef.current?.contentWindow?.location.hash === '#fechar-leitura') fecharLeitura() } catch { /* cross-origin transitório */ }
    }, 250)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leitura])

  const TABS: { k: Tab; label: string; icon: React.ReactNode }[] = [
    { k: 'desafio', label: 'Desafio', icon: <Gamepad2 size={15} /> },
    { k: 'reg', label: 'Regulamento', icon: <BookOpen size={15} /> },
    { k: 'des', label: 'Desempenho', icon: <BarChart3 size={15} /> },
    { k: 'rank', label: 'Ranking', icon: <Trophy size={15} /> },
  ]

  return (
    // margin:-24 cancela o padding do InternaPageRoot (full-bleed). height capada à viewport (menos o
    // topbar de 72px do shell) + overflow:hidden → SEM scroll externo e sem faixa/linha sobrando.
    <div data-juris-int data-tab={tab} style={{ display: 'flex', flexDirection: 'column', margin: -24, height: 'calc(100dvh - 72px)', overflow: 'hidden' }}>
      <HeaderHero titulo={titulo} totalDias={totalDias} materiasCount={materiasCount} tab={tab} setTab={setTab} tabs={TABS} banner={bannerUrl} compacto={compacto} corFundo={corFundo} />

      {/* ARCADE: SEMPRE montado — nunca recarrega (nem ao trocar de aba, nem ao abrir a leitura), então
          nada de painéis vazios, perda de progresso ou flash da abertura ao voltar. */}
      <div data-tour="juris-desafio" style={{ display: tab === 'desafio' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, background: '#05060f' }}>
        <iframe
          ref={arcadeRef}
          src={`/jurisprudencia/index.html?desafio=${encodeURIComponent(desafioId)}`}
          title="Desafio de Jurisprudência"
          allow="autoplay; fullscreen"
          style={{ display: 'block', width: '100%', flex: 1, minHeight: 0, height: '100%', border: 0, background: '#05060f' }}
        />
      </div>

      {/* Overlay da LEITURA (por cima de tudo, via portal) — o arcade continua montado/congelado atrás.
          SEM barra própria: a leitura abre em TELA CHEIA (embed cobre o shell) e tem o seu botão "Voltar"
          (fecha via #fechar-leitura). Só o loader escuro enquanto o iframe carrega. */}
      {leitura && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#05060f' }}>
          <iframe ref={leituraRef} src={leitura} title={overlayLabel === 'a leitura…' ? 'Leitura do dia' : 'Questões do dia'} onLoad={() => setLeituraLoad(false)} style={{ display: 'block', width: '100%', height: '100%', border: 0, background: '#fff' }} />
          {leituraLoad && (
            // Loader ESCURO por cima do iframe branco → sem a tela branca "em branco" antes da leitura.
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#05060f', color: 'rgba(255,255,255,.75)' }}>
              <Loader2 size={30} className="animate-spin" style={{ color: GOLD }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.08em' }}>Carregando {overlayLabel}</span>
            </div>
          )}
        </div>,
        document.body,
      )}

      {tab !== 'desafio' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '22px 24px 24px' }}>
          <div key={tab} className="ji-pane">
            {tab === 'reg' && <AbaRegulamento config={config} totalDias={totalDias} materiasCount={materiasCount} />}
            {tab === 'des' && <AbaDesempenho desafioId={desafioId} totalDias={totalDias} dias={dias} />}
            {tab === 'rank' && <AbaRanking desafioId={desafioId} totalDias={totalDias} titulo={titulo} />}
          </div>
        </div>
      )}

      <style>{`
        [data-juris-int] .ji-tab{ transition:color .25s; }
        [data-juris-int] .ji-pane{ animation:jiTabIn .34s cubic-bezier(.22,1,.36,1) both; }
        @keyframes jiTabIn{ from{ opacity:0; transform:translateX(34px); } to{ opacity:1; transform:none; } }
        [data-juris-int] .ji-card{ background:var(--surface); border:1px solid var(--line); border-radius:20px; }
        [data-juris-int] .ji-reg-grid{ display:grid; grid-template-columns:300px minmax(0,1fr); gap:18px; align-items:start; }
        [data-juris-int] .ji-kpis{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
        [data-juris-int] .ji-des-grid{ display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); gap:16px; align-items:start; }
        [data-juris-int] .ji-rank-grid{ display:grid; grid-template-columns:420px minmax(0,1fr); gap:18px; align-items:start; }
        @media (max-width: 1023px){
          [data-juris-int] .ji-kpis{ grid-template-columns:repeat(2,1fr); }
          /* minmax(0,1fr) (não 1fr=minmax(auto,1fr)): a coluna pode encolher abaixo do min-content, então
             a tabela (min-width:560) rola DENTRO do ji-table-scroll em vez de esticar o grid e estourar a
             tela (pódio/cards do Ranking ficavam maiores que o viewport). */
          [data-juris-int] .ji-reg-grid, [data-juris-int] .ji-des-grid, [data-juris-int] .ji-rank-grid{ grid-template-columns:minmax(0,1fr); }
          [data-juris-int] .ji-hero-chip{ display:none !important; }
          /* Empilhado: o card "Ganhos e metas" não pode mais ser sticky (grudava e sobrepunha o texto). */
          [data-juris-int] .ji-reg-sticky{ position: static !important; }
        }
        /* Tabelas (Desempenho/Ranking) rolam na HORIZONTAL quando não cabem (mobile) — sem colunas
           espremidas/sobrepostas nem conteúdo saindo do card. */
        [data-juris-int] .ji-table-scroll{ overflow-x:auto; -webkit-overflow-scrolling:touch; }
        [data-juris-int] .ji-table-min{ min-width:560px; }
        /* ≤640px: o shell usa o topbar MOBILE (64px) → preenche a altura disponível. A faixa branca
           abaixo some porque o ARCADE (iframe) agora tem folga própria no rodapé (padding no .page,
           ver estilos.css): ao rolar até o fim, o conteúdo sobe acima da down bar e o fundo pontilhado
           do próprio arcade preenche a área. */
        @media (max-width: 640px){
          [data-juris-int]{ height: calc(100dvh - 64px); }
        }
        @media (prefers-reduced-motion: reduce){ [data-juris-int] *{ animation:none !important; } }
      `}</style>
    </div>
  )
}

// ── HERO: banner roxo radial + breadcrumb + abas sublinhadas (ouro). ──
function HeaderHero({
  titulo, totalDias, materiasCount, tab, setTab, tabs, banner, compacto, corFundo,
}: {
  titulo: string; totalDias: number; materiasCount: number
  tab: Tab; setTab: (t: Tab) => void; tabs: { k: Tab; label: string; icon: React.ReactNode }[]
  banner?: string | null; compacto?: boolean; corFundo?: string | null
}) {
  // Fundo do cabeçalho: imagem > cor custom > gradiente padrão. No compacto desemboca no preto do arcade.
  const bgCompacto = corFundo
    ? `linear-gradient(180deg,${corFundo} 0%,${corFundo} 45%,#05060f 100%)`
    : 'linear-gradient(180deg,#3B1E8F 0%,#1E1150 48%,#05060f 100%)'
  const bgNormal = corFundo || 'radial-gradient(120% 140% at 50% 0%,#3B1E8F 0%,#1E1150 55%,#120A33 100%)'
  // Botões de aba (reusados nos dois modos). `h` = altura da linha (encaixa o sublinhado embaixo).
  const abaBtns = (h: number) => tabs.map((t) => {
    const ativo = tab === t.k
    return (
      <button
        key={t.k} type="button" role="tab" aria-selected={ativo} onClick={() => setTab(t.k)} className="ji-tab"
        data-tour={TOUR_ATTR[t.k]}
        style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, height: h, padding: '0 4px',
          border: 0, background: 'none', font: 'inherit', fontSize: 14, fontWeight: 700,
          color: ativo ? '#fff' : 'rgba(255,255,255,.62)', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {t.icon}{t.label}
        <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, borderRadius: '3px 3px 0 0', background: ativo ? GOLD : 'transparent', opacity: ativo ? 1 : 0, transition: 'opacity .25s ease, background .25s' }} />
      </button>
    )
  })

  // MODO COMPACTO: barra retraída SEM o espaçamento do banner — título em cima e abas logo ABAIXO
  // (empilhado, como no normal, só que coladinho) → sobra bem mais tela para o arcade.
  if (compacto) {
    return (
      // Fundo desemboca no preto do arcade (#05060f) no rodapé → sem linha/aresta entre a barra e o jogo.
      <div style={{ position: 'relative', overflow: 'hidden', flex: '0 0 auto', background: bgCompacto }}>
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', padding: '0 20px' }}>
          {/* Linha 1 — voltar + título + chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, flexShrink: 0 }}>
            <Link href="/aluno/jurisprudencia" aria-label="Voltar aos desafios" style={{ width: 28, height: 28, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.12)', color: '#fff' }}>
              <ChevronLeft size={15} />
            </Link>
            <span style={{ display: 'inline-flex', color: '#CFC4FF' }}><Scale size={16} /></span>
            <b style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{titulo}</b>
            <span className="ji-hero-chip" style={{ height: 22, padding: '0 9px', borderRadius: 99, background: GOLD, color: '#2A1A55', fontSize: 11.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {totalDias} {totalDias === 1 ? 'fase' : 'fases'}{materiasCount ? ` · ${materiasCount} ${materiasCount === 1 ? 'matéria' : 'matérias'}` : ''}
            </span>
            <AjudaTourBtn style={{ marginLeft: 'auto', flexShrink: 0 }} onStart={() => setTab('desafio')} />
          </div>
          {/* Linha 2 — abas, logo abaixo do título (sem linha divisória). */}
          <div role="tablist" style={{ display: 'flex', gap: 24, overflowX: 'auto' }}>{abaBtns(42)}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: 160, flex: '0 0 auto', borderRadius: 0, background: bgNormal }}>
      {banner && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={banner} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {!banner && (
        <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px)', backgroundSize: '28px 28px' }} />
      )}

      {/* Breadcrumb */}
      <div style={{ position: 'absolute', left: 28, top: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/aluno/jurisprudencia" aria-label="Voltar aos desafios" style={{ width: 36, height: 36, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.12)', color: '#fff' }}>
            <ChevronLeft size={16} />
          </Link>
          <span style={{ display: 'inline-flex', color: '#CFC4FF' }}><Scale size={20} /></span>
          <b style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>{titulo}</b>
          <span className="ji-hero-chip" style={{ height: 24, padding: '0 10px', borderRadius: 99, background: GOLD, color: '#2A1A55', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {totalDias} {totalDias === 1 ? 'fase' : 'fases'}{materiasCount ? ` · ${materiasCount} ${materiasCount === 1 ? 'matéria' : 'matérias'}` : ''}
          </span>
        </div>
      </div>

      {/* Ajuda (rever o tour) — topo-direito */}
      <AjudaTourBtn style={{ position: 'absolute', right: 28, top: 22 }} onStart={() => setTab('desafio')} />

      {/* Abas sublinhadas */}
      <div style={{ position: 'absolute', left: 28, right: 28, bottom: 0, borderTop: banner ? 'none' : '1px solid rgba(255,255,255,.1)' }}>
        <div role="tablist" style={{ display: 'flex', gap: 26, overflowX: 'auto' }}>
          {tabs.map((t) => {
            const ativo = tab === t.k
            return (
              <button
                key={t.k} type="button" role="tab" aria-selected={ativo} onClick={() => setTab(t.k)} className="ji-tab"
                data-tour={TOUR_ATTR[t.k]}
                style={{
                  position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, height: 44, padding: '0 4px',
                  border: 0, background: 'none', font: 'inherit', fontSize: 14, fontWeight: 700,
                  color: ativo ? '#fff' : 'rgba(255,255,255,.62)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {t.icon}{t.label}
                <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, borderRadius: '3px 3px 0 0', background: ativo ? GOLD : 'transparent', opacity: ativo ? 1 : 0, transition: 'opacity .25s ease, background .25s' }} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA REGULAMENTO — card "Ganhos & metas" (sticky, tabela de pontos) + "Como funciona".
// (Mesma estrutura da Lei Seca: grid 300px | 1fr.)
// ─────────────────────────────────────────────────────────────────────────────
function AbaRegulamento({ config, totalDias, materiasCount }: { config: Config; totalDias: number; materiasCount: number }) {
  const vidas = config?.vidas ?? 3
  const tempo = config?.tempoResposta ?? 25
  const p = config?.pontos ?? {}
  const regras = [
    { icon: <Gamepad2 size={16} />, label: 'Fases', valor: `${totalDias}` },
    { icon: <BookOpen size={16} />, label: 'Matérias', valor: `${materiasCount}` },
    { icon: <Heart size={16} />, label: 'Vidas', valor: `${vidas}` },
    { icon: <Timer size={16} />, label: 'Tempo por pergunta', valor: `${tempo}s` },
  ]

  return (
    <div className="ji-reg-grid">
      {/* Ganhos e metas — coluna esquerda sticky (só no desktop; no mobile empilhado vira static p/ não
          grudar e sobrepor o "Como funciona"). */}
      <div className="ji-card ji-reg-sticky" style={{ padding: 18, position: 'sticky', top: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Zap size={18} color="var(--brand)" />
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Ganhos e metas</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: 14, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface2)' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>No labirinto</span>
            <div style={{ marginTop: 6 }}>
              <GanhoItem gold valor={`+${fmt(p.tese ?? 100)}`} txt="por tese dominada" />
              <GanhoItem valor={`+${fmt(p.ponto ?? 10)}`} txt="por ponto do labirinto" />
              <GanhoItem valor={`+${fmt(p.vadeMecum ?? 50)}`} txt="por Vade Mécum coletado" />
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface2)' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Bônus</span>
            <div style={{ marginTop: 6 }}>
              <GanhoItem gold valor={`+${fmt(p.labirintoLimpo ?? 500)}`} txt="ao limpar o labirinto" />
              <GanhoItem valor={`+${fmt(p.vida ?? 200)}`} txt="por vida restante no fim" />
              <GanhoItem valor={`+${fmt(p.armadilha ?? 200)}`} txt="por armadilha superada" />
            </div>
          </div>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>A leitura do dia libera o desafio; domine todas as teses da fase para concluí-la.</span>
        </div>
      </div>

      {/* Como funciona */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="ji-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 14, marginBottom: 16, borderBottom: '1px solid var(--line)' }}>
            <span style={{ color: 'var(--brand)', display: 'inline-flex' }}><FileText size={18} /></span>
            <div>
              <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)' }}>Como funciona</b>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Regras do desafio</span>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.75, color: 'var(--ink)', opacity: .9 }}>
            Cada fase (dia) tem uma <b>leitura</b> e um <b>desafio no labirinto</b>. Faça a leitura do dia para liberar o
            desafio; depois, percorra o labirinto pegando os pontos dourados e respondendo cada questão (tese), sem
            deixar as armadilhas te alcançarem. Domine todas as teses da fase para concluí-la e subir no ranking.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginTop: 16 }}>
            {regras.map((r) => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, background: 'var(--chip)' }}>
                <span style={{ display: 'inline-flex', color: 'var(--brand)' }}>{r.icon}</span>
                <span style={{ minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: 16, color: 'var(--ink)' }}>{r.valor}</b>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{r.label}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function GanhoItem({ valor, txt, gold }: { valor: string; txt: string; gold?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13 }}>
      <span style={{ minWidth: 52, height: 24, padding: '0 8px', borderRadius: 8, background: gold ? 'rgba(232,169,58,.16)' : 'var(--chip)', color: gold ? '#C98A12' : 'var(--brand)', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{valor}</span>
      <span style={{ color: 'var(--ink)' }}>{txt}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA DESEMPENHO — KPIs + gráfico (pontuação por fase) + etapas + tabela por fase.
// Dados reais do arcade via /api/jurisprudencia/progresso (dom/best/recorde).
// ─────────────────────────────────────────────────────────────────────────────
type ProgFase = { chave: string; titulo: string; teses: number; melhor: number; jogada: boolean }
function AbaDesempenho({ desafioId, totalDias, dias }: { desafioId: string; totalDias: number; dias: DiaInfo[] }) {
  const [prog, setProg] = useState<{ fases: ProgFase[]; pontos: number; teses: number; recorde: number; jogadas: number } | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let vivo = true
    setLoading(true)
    fetch(`/api/jurisprudencia/progresso?desafio=${encodeURIComponent(desafioId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((pp) => {
        if (!vivo) return
        const best: Record<string, any> = (pp && typeof pp.best === 'object' && pp.best) || {}
        const dom: Record<string, any> = (pp && typeof pp.dom === 'object' && pp.dom) || {}
        const fases: ProgFase[] = dias.map((d) => {
          const melhor = Math.max(0, Number(best[d.chave]) || 0)
          const teses = Array.isArray(dom[d.chave]) ? dom[d.chave].length : 0
          return { chave: d.chave, titulo: d.titulo, teses, melhor, jogada: melhor > 0 || teses > 0 }
        })
        const pontos = fases.reduce((s, f) => s + f.melhor, 0)
        const teses = fases.reduce((s, f) => s + f.teses, 0)
        const jogadas = fases.filter((f) => f.jogada).length
        setProg({ fases, pontos, teses, recorde: Math.max(0, Number(pp?.recorde) || 0), jogadas })
      })
      .catch(() => { if (vivo) setProg({ fases: [], pontos: 0, teses: 0, recorde: 0, jogadas: 0 }) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [desafioId, dias])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '64px 20px', color: 'var(--muted)', fontSize: 14 }}><Loader2 size={20} className="animate-spin" style={{ color: 'var(--brand)' }} /> Carregando desempenho…</div>

  const fases = prog?.fases ?? []
  const jogadas = prog?.jogadas ?? 0
  const progressoPct = totalDias > 0 ? Math.round((jogadas / totalDias) * 100) : 0
  const maxBest = Math.max(1, ...fases.map((f) => f.melhor))

  const kpis = [
    { rotulo: 'Pontos totais', valor: fmt(prog?.pontos ?? 0), icon: <Coins size={17} /> },
    { rotulo: 'Teses dominadas', valor: fmt(prog?.teses ?? 0), icon: <Medal size={17} /> },
    { rotulo: 'Fases jogadas', valor: `${jogadas}/${totalDias}`, icon: <Gamepad2 size={17} /> },
    { rotulo: 'Recorde', valor: fmt(prog?.recorde ?? 0), icon: <Trophy size={17} /> },
  ]

  const etapas = [
    { t: 'Primeira fase', d: 'F1', ok: jogadas >= 1 },
    { t: 'No caminho', d: `F${Math.max(1, Math.ceil(totalDias / 3))}`, ok: jogadas >= Math.ceil(totalDias / 3) },
    { t: 'Quase lá', d: `F${Math.max(1, Math.ceil((2 * totalDias) / 3))}`, ok: jogadas >= Math.ceil((2 * totalDias) / 3) },
    { t: 'Selo final', d: `F${totalDias}`, ok: jogadas >= totalDias && totalDias > 0 },
  ]

  const CHART_W = 640, CHART_H = 150
  const barW = CHART_W / Math.max(1, totalDias) - 4
  const COLS = '48px minmax(130px,1fr) 90px 120px 130px'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div className="ji-kpis">
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
      <div className="ji-des-grid">
        <div className="ji-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <TrendingUp size={18} color="var(--brand)" />
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Melhor pontuação por fase</h3>
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>recorde {fmt(prog?.recorde ?? 0)}</span>
          </div>
          {fases.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sem dados de desempenho ainda.</div>
          ) : (
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H + 18}`} preserveAspectRatio="none" style={{ width: '100%', height: 168, display: 'block' }}>
              {fases.slice(0, totalDias).map((f, i) => {
                const h = Math.max(6, (f.melhor / maxBest) * CHART_H)
                const x = (CHART_W / Math.max(1, totalDias)) * i + 2
                const fill = f.melhor > 0 ? '#22B573' : f.jogada ? 'var(--brand)' : 'var(--track)'
                return (
                  <rect key={f.chave} x={x} y={CHART_H - h} width={Math.max(6, barW)} height={h} rx={3} fill={fill}>
                    <title>Fase {i + 1}: {fmt(f.melhor)} pts</title>
                  </rect>
                )
              })}
            </svg>
          )}
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11.5, color: 'var(--muted)', flexWrap: 'wrap' }}>
            <Legenda cor="#22B573" txt="Com pontuação" />
            <Legenda cor="var(--brand)" txt="Em progresso" />
            <Legenda cor="var(--track)" txt="Não iniciada" />
          </div>
        </div>

        <div className="ji-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Flag size={18} color="var(--brand)" />
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Etapas do desafio</h3>
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{progressoPct}% percorrido</span>
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

      {/* Tabela por fase — rola na horizontal no mobile (não cabe: COLS ~436px). */}
      <div className="ji-card" style={{ padding: 18 }}>
        <div className="ji-table-scroll"><div className="ji-table-min">
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '0 10px 10px', borderBottom: '1px solid var(--line)' }}>
          {['Fase', 'Matéria / dia', 'Teses', 'Melhor pontuação', 'Situação'].map((h) => (
            <span key={h} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{h}</span>
          ))}
        </div>
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {fases.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Nenhuma fase neste desafio.</div>
          ) : fases.map((f, i) => (
            <div key={f.chave} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: 10, borderBottom: '1px solid var(--line)', opacity: f.jogada ? 1 : .7 }}>
              <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{String(i + 1).padStart(2, '0')}</b>
              <b style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.titulo || `Fase ${i + 1}`}</b>
              {f.teses > 0 ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--brand)' }}><Medal size={13} /> {f.teses}</span>
              ) : <span style={{ color: 'var(--muted)' }}>—</span>}
              {f.melhor > 0 ? <b style={{ fontSize: 12.5, color: GOLD }}>{fmt(f.melhor)}</b> : <span style={{ color: 'var(--muted)' }}>—</span>}
              {f.melhor > 0 ? (
                <PillR cor="#1FA868" icon={<Check size={11} strokeWidth={3} />}>Jogada</PillR>
              ) : f.jogada ? (
                <PillR cor="var(--brand)" icon={<Zap size={11} />}>Em progresso</PillR>
              ) : (
                <PillR cor="var(--muted)" icon={<Lock size={11} />}>Não iniciada</PillR>
              )}
            </div>
          ))}
        </div>
        </div></div>
      </div>
    </div>
  )
}

function Legenda({ cor, txt }: { cor: string; txt: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: cor }} /> {txt}</span>
}
function PillR({ cor, icon, children }: { cor: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px', borderRadius: 99, background: `color-mix(in srgb,${cor} 14%,transparent)`, color: cor, fontSize: 11, fontWeight: 700, width: 'fit-content' }}>
      {icon}{children}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA RANKING — REUSA o ranking rico do Lei Seca (LeituraRanking): pódio + cards "Sua posição" +
// classificação com PAGINAÇÃO. Dados de /api/jurisprudencia/ranking?rico=1 (RankingLeitura anonimizado).
// (Antes era uma versão simplificada, sem os cards e sem os botões de paginar.)
// ─────────────────────────────────────────────────────────────────────────────
function AbaRanking({ desafioId, totalDias, titulo }: { desafioId: string; totalDias: number; titulo?: string }) {
  const [data, setData] = useState<{ ranking: RankingLeitura; meuId: string | null; titulos: TituloNivel[]; totalDesafio: number } | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let vivo = true
    setLoading(true)
    fetch(`/api/jurisprudencia/ranking?desafio=${encodeURIComponent(desafioId)}&rico=1`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d && d.ranking) setData(d) })
      .catch(() => {})
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [desafioId])

  if (loading && !data) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '64px 20px', color: 'var(--muted)', fontSize: 14 }}><Loader2 size={20} className="animate-spin" style={{ color: 'var(--brand)' }} /> Carregando ranking…</div>
  if (!data || !data.ranking?.itens?.length) return <div className="ji-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Ainda não há pontuações neste desafio.</div>

  // O tema interno do juris redefine `--muted` com OUTRO significado (cor de TEXTO cinza), mas o
  // LeituraRanking (shadcn) usa `bg-muted` como FUNDO (cabeçalho da tabela, nº de posição, hover do botão
  // de paginação) → ficavam cinza-escuros. Remapeamos SÓ `--muted`/`--muted-foreground` a partir dos tokens
  // certos da área interna (surface2 = fundo sutil; sub = texto secundário) — herda marca e claro/escuro.
  return (
    <div style={{ ['--muted' as any]: 'var(--surface2)', ['--muted-foreground' as any]: 'var(--sub)' }}>
      <LeituraRanking ranking={data.ranking} meuId={data.meuId} moduloId={desafioId} moduloNome={titulo ?? 'Desafio'}
        titulos={data.titulos ?? []} totalDesafio={data.totalDesafio || totalDias} />
    </div>
  )
}

