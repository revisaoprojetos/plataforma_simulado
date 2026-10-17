'use client'

// ÁREA INTERNA da Maratona de Simulados — dentro do portal (mantém sidebar + top bar). Full-bleed, com
// identidade PRÓPRIA do desafio (navy + dourado, fundo claro), abas Percurso/Painel/Ranking/Medalhas e
// "Voltar ao início". Porte do design `MARATONADESIMULADOS-main` (telas estáticas; dados MOCK, admin depois).

import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import type { InternaTheme } from '@/components/brand/interna/interna-tokens'
import { ChevronLeft, ChevronDown, Map, User, Trophy, Medal, Plane, Check, MapPin, Lock, Flag, ScrollText, FileText, Download, ExternalLink, Play } from 'lucide-react'
import { type RegulamentoConfig, embedVideoUrl } from '@/lib/leitura/regulamento'
import type { RankingMaratona, MaratonaRankLinha, MaratonaSimuladoLink } from '@/lib/maratona/carregar'
import { ChevronsLeft, ChevronRight, ChevronsRight } from 'lucide-react'

type Aba = 'percurso' | 'painel' | 'simulados' | 'ranking' | 'medalhas' | 'regulamento'
// Simulados da maratona (para o select da aba "Simulados"). cur = checkpoint correspondente no Painel.
const SIMULADOS_SEL: { cur: number; label: string }[] = [
  { cur: 1, label: 'Simulado 1 · 17/10 · AGU' },
  { cur: 2, label: 'Simulado 2 · 24/10 · PGF' },
  { cur: 3, label: 'Simulado 3 · 31/10 · Chegada' },
]
// Marca (iguais nos 2 temas; superfícies escuras / acento): NAVY/GOLD. INK fica literal p/ FUNDOS escuros
// (dots/chips/botão). As demais cores (fundo da página, cards, texto, borda) viram tokens que o CSS troca
// no tema escuro (.dark .mxi-root) — ver bloco CSS. INK_TX/TEXT = as versões de TEXTO (claras no escuro).
const NAVY = '#071A3F', GOLD = '#F7B500', INK = '#2E4FB0' // INK = azul da marca (mais claro/vivo) p/ botões, dots de concluído, chips e bordas
const TEXT = 'var(--mxi-text)', INK_TX = 'var(--mxi-ink)', MUT = 'var(--mxi-mut)', LINE = 'var(--mxi-line)', BG = 'var(--mxi-bg)'
const CARD = 'var(--mxi-card)', CARD_SUB = 'var(--mxi-card-sub)'
const MONO = "'DM Mono', ui-monospace, monospace"

// Ação (link + rótulo) do simulado de uma área/checkpoint (idx 0/1/2): "Ver resultados" se já fez;
// "Iniciar simulado" se LIBERADO; null = sem simulado / ainda não liberado (não renderiza botão ativo).
function acaoSim(simulados: (MaratonaSimuladoLink | null)[] | undefined, idx: number | null): { href: string; label: string } | null {
  if (idx == null) return null
  const s = simulados?.[idx]
  if (!s) return null
  if (s.concluido) return { href: s.resultadoUrl, label: 'Ver resultados' }
  if (!s.liberada) return null // ainda não disponível (data/janela/não publicado)
  return s.fazerUrl ? { href: s.fazerUrl, label: 'Iniciar simulado' } : null
}
// DD/MM a partir de 'YYYY-MM-DD'.
const fmtDMa = (iso?: string | null) => { if (!iso) return ''; const p = iso.split('-'); return p[2] && p[1] ? `${p[2]}/${p[1]}` : iso }
// Texto de disponibilidade do simulado (data real / já disponível / concluído).
function dispoSim(s?: MaratonaSimuladoLink | null): string {
  if (!s) return ''
  if (s.concluido) return 'Simulado concluído'
  if (s.liberada) return 'Já disponível'
  return s.data ? `Disponível em ${fmtDMa(s.data)}` : 'Disponível em breve'
}
// Segundos → HH:MM:SS (tempo decorrido real do desafio = soma dos tempos dos simulados).
const fmtTempo = (seg?: number) => { const s = Math.max(0, Math.round(Number(seg) || 0)); const p = (n: number) => String(n).padStart(2, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}` }
// Número do corredor como peito (0001). null = ainda não corre.
const fmtNum = (n?: number | null) => (n && n > 0 ? String(n).padStart(4, '0') : null)
// Segundos → duração curta "20min" / "1h 05min" (para o tempo mínimo da etapa).
const fmtDurCurto = (seg?: number) => { const s = Math.max(0, Math.round(Number(seg) || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return [h ? `${h}h` : '', m ? `${m}min` : '', ss ? `${ss}s` : ''].filter(Boolean).join(' ') || '0s' }

export function MaratonaInterno({ capaUrl, regulamento, progresso = 0, ranking, meuId, simulados, tempoDecorrido = 0, numeroCorredor = null }: { theme: InternaTheme; capaUrl?: string; regulamento?: RegulamentoConfig; progresso?: number; ranking?: RankingMaratona; meuId?: string; simulados?: (MaratonaSimuladoLink | null)[]; tempoDecorrido?: number; numeroCorredor?: number | null }) {
  const [aba, setAba] = useState<Aba>('painel')
  const [simSel, setSimSel] = useState<number>(1) // simulado selecionado na aba "Simulados" (cur 1/2/3)
  const [simMenu, setSimMenu] = useState(false)   // dropdown do botão "Simulados" aberto?
  const [hoverSim, setHoverSim] = useState<number | null>(null)
  const simBtnRef = useRef<HTMLButtonElement>(null)
  const simMenuRef = useRef<HTMLDivElement>(null)
  const navWrapRef = useRef<HTMLDivElement>(null)
  const [simRect, setSimRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const abrirSimMenu = () => {
    const b = simBtnRef.current?.getBoundingClientRect()
    const c = navWrapRef.current?.getBoundingClientRect()
    if (b && c) {
      // coords relativas ao container (cancela qualquer transform de ancestral); clampa na borda direita.
      const width = Math.max(b.width, 240)
      const left = Math.min(Math.max(b.left - c.left, 0), Math.max(c.width - width, 0))
      setSimRect({ top: b.bottom - c.top + 6, left, width })
    }
    setSimMenu((v) => !v)
  }
  const escolherSim = (cur: number) => { setSimSel(cur); setAba('simulados'); setSimMenu(false) }
  // REGRA: ao trocar de área/aba da maratona, volta pro TOPO (senão a nova tela abre no meio/fim onde estava).
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = rootRef.current
    if (el) { try { el.scrollTop = 0 } catch { /* ignore */ } try { el.scrollIntoView({ block: 'start' }) } catch { /* ignore */ } }
    try { window.scrollTo(0, 0) } catch { /* ignore */ }
  }, [aba, simSel])
  // Fecha o dropdown ao clicar fora (ignora cliques no menu/botão — stopPropagation do React NÃO barra o
  // listener nativo do document) ou ao rolar/redimensionar.
  useEffect(() => {
    if (!simMenu) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (simMenuRef.current?.contains(t) || simBtnRef.current?.contains(t)) return
      setSimMenu(false)
    }
    const fechar = () => setSimMenu(false)
    window.addEventListener('scroll', fechar, true)
    window.addEventListener('resize', fechar)
    document.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('scroll', fechar, true); window.removeEventListener('resize', fechar); document.removeEventListener('pointerdown', onDown) }
  }, [simMenu])
  const TABS: { k: Aba; label: string; icon: React.ReactNode }[] = [
    { k: 'percurso', label: 'Percurso', icon: <Map size={15} /> },
    { k: 'painel', label: 'Painel', icon: <User size={15} /> },
    { k: 'simulados', label: 'Simulados', icon: <FileText size={15} /> },
    { k: 'ranking', label: 'Ranking', icon: <Trophy size={15} /> },
    { k: 'medalhas', label: 'Medalhas', icon: <Medal size={15} /> },
    { k: 'regulamento', label: 'Regulamento', icon: <ScrollText size={15} /> },
  ]
  return (
    // Container de rolagem PRÓPRIO (altura = viewport menos a top bar do shell) → a barra do desafio
    // gruda no topo DELE (top:0), encostando na top bar do sistema, sem gap nem sobreposição.
    <div ref={rootRef} className="mxi-root" style={{ display: 'flex', flexDirection: 'column', background: BG, fontFamily: 'Archivo, system-ui, Arial, sans-serif', color: TEXT }}>
      <style>{CSS}</style>
      {/* Top bar da maratona: voltar + marca + abas */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: NAVY, borderBottom: `3px solid ${GOLD}` }}>
        <div ref={navWrapRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', flexWrap: 'wrap' }}>
          <Link href="/aluno" className="mxi-back" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 9, background: 'rgba(255,255,255,.1)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
            <ChevronLeft size={16} /> Voltar ao início
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
            {capaUrl
              ? <img src={capaUrl} alt="" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              : <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: GOLD, color: NAVY, fontWeight: 900, fontStyle: 'italic', fontSize: 15 }}>M</span>}
            <div style={{ lineHeight: 1.05 }}>
              <div style={{ fontSize: 10.5, letterSpacing: '.12em', color: '#BCC8E0', fontWeight: 700 }}>MARATONA DE SIMULADOS</div>
              <b style={{ fontSize: 15, fontStyle: 'italic' }}>ENAP + AGU</b>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: 4, marginLeft: 'auto', overflowX: 'auto' }} aria-label="Telas da maratona">
            {TABS.map((t) => (
              t.k === 'simulados' ? (
                // "Simulados" é um botão-dropdown: ao clicar, abre o select dos 3 simulados.
                <button key={t.k} ref={simBtnRef} type="button" onClick={abrirSimMenu}
                  aria-haspopup="listbox" aria-expanded={simMenu} aria-current={aba === t.k ? 'page' : undefined}
                  className="mxi-tab" data-on={aba === t.k ? '1' : '0'}>
                  {t.icon}<span>{t.label}</span><ChevronDown size={14} style={{ transition: 'transform .15s', transform: simMenu ? 'rotate(180deg)' : 'none' }} />
                </button>
              ) : (
                <button key={t.k} type="button" onClick={() => setAba(t.k)} aria-current={aba === t.k ? 'page' : undefined}
                  className="mxi-tab" data-on={aba === t.k ? '1' : '0'}>
                  {t.icon}<span>{t.label}</span>
                </button>
              )
            ))}
          </nav>

          {/* Dropdown do botão "Simulados" — absoluto ao container (abaixo do botão). Hover realça a opção. */}
          {simMenu && simRect && (
            <div ref={simMenuRef} role="listbox"
              style={{ position: 'absolute', top: simRect.top, left: simRect.left, width: simRect.width, zIndex: 60, background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, boxShadow: '0 16px 40px rgba(7,26,63,.28)', overflow: 'hidden', padding: 6 }}>
              {SIMULADOS_SEL.map((s) => {
                const on = aba === 'simulados' && simSel === s.cur
                const hover = hoverSim === s.cur
                // Nome do simulado da área (cur-1): personalizado se definido, senão o título real.
                // Sem simulado nessa área → mantém o rótulo mock do design. (Sem prefixo "Simulado N" p/ não
                // duplicar quando o próprio título já tem esse texto.)
                const sim = simulados?.[s.cur - 1]
                const label = sim ? (sim.rotulo || sim.titulo) : s.label
                return (
                  <button key={s.cur} type="button" role="option" aria-selected={on} onClick={() => escolherSim(s.cur)}
                    onMouseEnter={() => setHoverSim(s.cur)} onMouseLeave={() => setHoverSim(null)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: 0, cursor: 'pointer', background: on ? INK : (hover ? 'rgba(46,79,176,.14)' : 'transparent'), color: on ? '#fff' : TEXT, fontSize: 14, fontWeight: 700, transition: 'background .12s' }}>
                    <FileText size={15} style={{ flexShrink: 0, opacity: on ? 1 : 0.6 }} /> {label}
                    {on && <Check size={15} style={{ marginLeft: 'auto' }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </header>

      {/* main SEM padding lateral → o banner do Painel fica fora a fora; as demais abas usam wrapper com px. */}
      <main style={{ flex: 1, width: '100%' }}>
        {aba === 'percurso' && <Percurso cur={progresso} simulados={simulados} />}
        {aba === 'painel' && <Painel onVerMapa={() => setAba('percurso')} onVerRanking={() => setAba('ranking')} onIrSimulado={escolherSim} cur={progresso} simulados={simulados} tempoDecorrido={tempoDecorrido} numero={numeroCorredor} />}
        {/* Aba Simulados: conteúdo = simulado de referência selecionado; PERCURSO = conclusão REAL (progresso). */}
        {aba === 'simulados' && <Painel onVerMapa={() => setAba('percurso')} onVerRanking={() => setAba('ranking')} onIrSimulado={escolherSim} cur={simSel} percursoCur={progresso} simulados={simulados} tempoDecorrido={tempoDecorrido} numero={numeroCorredor} abaSimulado />}
        {aba === 'ranking' && <Ranking ranking={ranking} meuId={meuId} simulados={simulados} />}
        {aba === 'medalhas' && <div style={{ padding: '20px 24px 32px' }}><Medalhas simulados={simulados} progresso={progresso} /></div>}
        {aba === 'regulamento' && <div style={{ padding: '20px 24px 32px' }}><Regulamento regulamento={regulamento} /></div>}
      </main>
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: CARD, borderRadius: 16, boxShadow: '0 1px 3px rgba(7,26,63,.08)', ...style }}>{children}</div>
}
function Kicker({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: INK_TX }}>{children}</div>
}

/* ─────────── REGULAMENTO — PDF (lido na plataforma) + vídeo + descrição (igual ao Lei Seca) ─────────── */
function Regulamento({ regulamento }: { regulamento?: RegulamentoConfig }) {
  if (!regulamento?.ativo) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: MUT, fontSize: 14, background: CARD, border: `1px dashed ${LINE}`, borderRadius: 20 }}>
        O regulamento deste desafio ainda não foi publicado.
      </div>
    )
  }
  const embed = embedVideoUrl(regulamento.video_url)
  const temConteudo = regulamento.descricao || regulamento.documento_url || regulamento.video_url
  const iconBtn: CSSProperties = { width: 36, height: 36, borderRadius: 10, border: `1px solid ${LINE}`, color: MUT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }
  return (
    <Card style={{ padding: 18 }}>
      {/* Cabeçalho + ações do PDF */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 14, marginBottom: 18, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: GOLD, display: 'inline-flex' }}><FileText size={18} /></span>
          <div>
            <b style={{ display: 'block', fontSize: 14, color: INK_TX }}>{regulamento.titulo || 'Regulamento oficial'}</b>
            <span style={{ fontSize: 11.5, color: MUT }}>Documento oficial do desafio</span>
          </div>
        </div>
        {regulamento.documento_url && (
          <div style={{ display: 'flex', gap: 6 }}>
            <a href={`${regulamento.documento_url}${regulamento.documento_url.includes('?') ? '&' : '?'}download`} title="Baixar PDF" aria-label="Baixar PDF" style={iconBtn}><Download size={15} /></a>
            <a href={regulamento.documento_url} target="_blank" rel="noopener noreferrer" title="Abrir em nova aba" aria-label="Abrir em nova aba" style={iconBtn}><ExternalLink size={15} /></a>
          </div>
        )}
      </div>

      {/* Descrição */}
      {regulamento.descricao && (
        <div style={{ padding: '4px 2px', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.75, color: TEXT }}>{regulamento.descricao}</div>
      )}

      {/* Vídeo: embed (YouTube/Vimeo) ou botão "Assistir" (ex.: link do Drive). */}
      {regulamento.video_url && (
        embed ? (
          <div style={{ marginTop: 14, borderRadius: 14, border: `1px solid ${LINE}`, overflow: 'hidden' }}>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000' }}>
              <iframe src={embed} title="Vídeo do regulamento" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
            </div>
          </div>
        ) : (
          <a href={regulamento.video_url} target="_blank" rel="noopener noreferrer"
            style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, background: NAVY, color: '#fff', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>
            <Play size={15} fill="currentColor" /> Assistir ao vídeo
          </a>
        )
      )}

      {/* PDF lido dentro da plataforma (estilo Drive). */}
      {regulamento.documento_url && (
        <div style={{ marginTop: 14, borderRadius: 14, border: `1px solid ${LINE}`, overflow: 'hidden' }}>
          <iframe src={`${regulamento.documento_url}#view=FitH`} title="Regulamento (PDF)" style={{ width: '100%', height: '78vh', border: 0, background: '#fff' }} />
        </div>
      )}

      {!temConteudo && <p style={{ margin: 0, fontSize: 13.5, color: MUT }}>Regulamento ativo, mas sem documento, vídeo ou descrição publicados.</p>}
    </Card>
  )
}

/* ─────────── PERCURSO — mapa de Brasília + parada selecionada (PORTE do protótipo main_src.html) ─────────── */
// Paradas com coordenadas do MAPA (x/y = ponto no traçado; mx/my = âncora do marcador; side = lado do rótulo).
type PC = { n: number; stage: number; medal: number | null; code: string; codeLabel: string; stepName: string; name: string; short: string; km: string; date: string; sim: string; local: string; img: string; x: number; y: number; mx: number; my: number; side: 'l' | 'r' | 't' }
const PCB = '/maratona/'
const PC_LAST = 4
const PERCURSO_PCS: PC[] = [
  { n: 0, stage: 0, medal: null, code: 'LARGADA', codeLabel: 'LARGADA', stepName: 'Aeroporto', name: 'Aeroporto', short: 'Aeroporto', km: '0', date: 'inscrição', sim: 'Retirada do número de peito', local: 'Aeroporto Internacional de Brasília', img: PCB + 'foto-aeroporto.jpg', x: 381, y: 568, mx: 381, my: 568, side: 'r' },
  { n: 1, stage: 1, medal: 2, code: 'PC 1', codeLabel: 'PC 1 · 17/10', stepName: 'AGU', name: 'AGU', short: 'PC 1 · AGU', km: '21', date: '17/10', sim: 'Simulado 1 · 17/10', local: 'SAS Quadra 3 · Sede I', img: PCB + 'foto-agu.jpg', x: 580, y: 218, mx: 622, my: 252, side: 'r' },
  { n: 2, stage: 2, medal: 3, code: 'PC 2', codeLabel: 'PC 2 · 24/10', stepName: 'PGF', name: 'PGF', short: 'PC 2 · PGF', km: '28', date: '24/10', sim: 'Simulado 2 · 24/10', local: 'SAUN Quadra 5 [a confirmar]', img: PCB + 'foto-pgf.jpg', x: 605, y: 132, mx: 548, my: 104, side: 'l' },
  { n: 3, stage: 3, medal: 4, code: 'PASSAGEM', codeLabel: 'PASSAGEM · 31/10', stepName: 'PGFN', name: 'PGFN', short: 'Passagem · PGFN', km: '35', date: '31/10', sim: 'Simulado 3 · 31/10', local: 'SAUN Quadra 5', img: PCB + 'foto-pgfn.jpg', x: 606, y: 137, mx: 604, my: 64, side: 't' },
  { n: 4, stage: 3, medal: 5, code: 'CHEGADA', codeLabel: 'CHEGADA · 31/10', stepName: 'Ed. II da AGU', name: 'Ed. II da AGU', short: 'Ed. II da AGU', km: '42,195', date: '31/10', sim: 'Simulado 3 · 31/10 · conclusão', local: 'SAUN Quadra 5, Lote C · onde foi a posse do último concurso', img: PCB + 'foto-ed-ii-agu.jpg', x: 605, y: 134, mx: 664, my: 104, side: 'r' },
]
// Traçados do mapa (SVG estático). Cidade + ruas (traço casado: largo cinza + fino branco) + extras.
const MAPA_CIDADE = 'M446 433L446 424L442 418L449 419L464 407L473 405L479 406L480 404L481 406L489 406L493 403L497 394L501 391L526 381L531 378L535 374L533 371L537 365L546 350L555 341L571 326L572 324L578 322L583 317L587 317L594 313L596 313L611 308L630 307L633 309L634 308L646 313L653 311L676 310L684 307L686 308L692 308L694 306L716 302L720 302L731 306L741 313L754 313L756 312L755 313L758 312L765 315L769 314L775 318L797 310L804 311L809 310L811 311L813 309L814 312L817 312L820 305L822 297L824 296L825 290L827 289L826 286L828 282L832 280L831 278L833 277L831 265L832 256L833 254L830 206L844 193L845 194L850 188L866 180L874 178L882 172L887 168L887 165L886 162L883 161L866 158L858 149L838 135L829 135L822 133L821 132L816 132L816 134L811 134L797 132L776 138L762 139L756 138L759 139L757 140L750 138L741 131L716 120L711 120L705 122L703 124L703 129L700 130L697 130L692 125L689 126L687 124L685 104L686 101L688 99L686 94L692 87L693 88L698 84L700 80L707 73L712 71L719 72L723 64L727 62L733 61L736 57L740 55L732 33L722 24L713 13L712 2L709 0L707 -5L704 -6L693 -5L684 -1L677 -3L676 -2L677 -3L672 -4L664 -9L660 -18L661 -19L660 -20L494 -20L751 -20L755 -14L756 0L768 3L776 11L779 18L795 24L803 31L803 37L806 39L808 46L808 52L806 56L806 61L813 68L821 71L823 68L825 68L835 50L839 32L841 15L846 3L844 -6L838 -10L831 -20L843 -20L685 -20L818 -20L900 -20L887 -20L884 -18L885 -18L884 -16L881 -7L885 1L891 4L893 4L893 5L904 15L912 19L909 21L898 24L894 24L891 22L889 23L887 25L894 58L893 61L894 72L896 77L908 84L916 92L926 100L927 106L930 112L936 118L943 127L948 131L946 138L948 143L962 150L973 151L979 153L984 157L985 156L984 154L989 155L990 158L995 156L995 155L1001 152L1003 150L1004 146L1007 149L1007 153L1009 153L1011 154L1008 159L1014 158L1019 155L1020 157L1020 148L1020 218L1020 183L1019 187L1016 185L1011 188L1007 186L1003 193L1002 190L1001 189L1001 186L995 189L995 187L992 185L988 193L986 188L987 187L985 183L987 183L987 182L982 179L974 180L974 177L972 176L963 178L962 177L966 174L968 169L962 169L959 167L953 169L946 170L943 171L941 170L934 172L931 174L931 177L928 177L929 181L932 183L931 185L919 193L913 205L910 213L904 222L906 231L913 238L911 240L895 236L894 246L886 253L890 260L884 295L888 304L897 313L898 317L897 317L894 315L886 316L875 320L869 326L864 337L858 339L844 352L844 360L846 365L852 371L853 375L839 374L837 371L831 370L824 366L812 367L811 368L804 370L791 377L792 378L782 393L777 406L777 411L772 408L767 410L762 408L737 414L724 409L718 410L713 413L703 421L691 435L674 445L663 463L662 465L666 465L671 469L678 469L689 473L687 481L685 480L685 482L681 481L678 477L670 476L661 476L654 479L647 476L644 479L645 482L644 483L633 486L633 487L638 489L638 496L631 502L629 508L624 511L620 511L616 510L609 503L615 499L618 495L627 490L630 484L636 480L639 471L641 469L641 465L639 462L635 459L633 454L637 451L638 443L641 437L649 421L669 396L673 395L672 393L674 389L678 384L683 381L687 375L700 363L707 359L707 350L704 348L696 346L689 347L670 352L662 353L651 350L640 354L634 360L628 362L624 358L622 350L624 347L628 344L623 334L618 332L608 335L597 334L594 337L586 341L583 349L578 354L571 357L568 354L566 354L559 388L550 399L529 414L521 418L516 419L498 417L495 418L492 416L490 421L465 436L464 435L464 431L460 432L452 437L446 436L446 433Z'
const MAPA_RUAS_FINAS = 'M285 116L293 96L305 93M390 432L386 431L374 415L423 378M597 190L596 198M671 214L673 205M332 408L346 395M550 -35L578 64L582 113L580 142M346 393L331 409M606 182L608 173M372 379L482 296M262 138L272 134L282 125L284 119M255 256L247 239M542 -40L569 54L576 126L574 139M367 374L359 381M845 355L835 333L818 306M343 86L369 5M595 204L592 212M605 172L602 180M610 156L605 170M567 192L576 162M613 129L610 132L609 128L614 122M207 496L215 444M188 534L199 528L190 532M202 527L207 522L205 514M142 240L90 264L74 268L50 264M339 369L347 378M215 442L225 385M212 447L204 493M-9 273L7 266L23 265M322 151L330 129M371 106L397 25M590 -7L604 44L611 104M380 425L381 432L375 439M530 180L540 147M596 217L598 201M185 252L239 260M48 264L25 262M599 199L602 191M200 516L190 532M204 511L206 499M225 381L229 352M315 87L295 80M316 176L316 193M617 118L608 129L614 139M426 375L401 393M518 204L524 195M524 194L528 184M515 206L510 214M494 233L509 216M523 194L516 205M438 281L410 302M462 262L445 275M484 242L470 255M409 302L383 322M368 334L381 324M382 322L348 348M580 237L589 227M544 122L543 134M544 110L544 120M544 106L542 85M528 21L533 39M529 23L520 -6M612 99L608 66M23 262L7 263M347 350L363 338M328 129L321 150M539 148L529 180M319 209L317 200M315 200L323 216M611 164L615 157L614 139M353 383L422 333M551 223L557 214M714 240L737 251L753 266M817 306L806 295L755 268L801 293L818 307L833 329L844 355M372 412L360 390L366 383M203 497L201 512M317 187L317 166M652 85L622 111M509 215L488 238M346 390L350 396L368 408M366 403L350 393L346 384M409 304L454 270M382 324L400 310M457 267L489 239M545 222L551 211M573 165L568 164L563 180M522 249L500 272M543 223L535 234M474 294L448 313M499 273L475 293M379 365L368 373M393 354L382 363M420 334L395 353M447 314L431 326M362 386L371 380M529 252L549 227M507 275L526 255M527 253L485 294L359 388L362 399M548 227L528 251M426 330L495 278L544 223M485 294L504 278M508 313L501 319M517 306L510 311M576 144L576 135M453 355L446 360M576 130L573 69L563 25L550 -16M399 395L374 414M577 53L569 23M583 121L577 55M457 353L470 343M541 283L567 253M481 333L455 354M580 146L583 123M104 261L140 247L154 247M611 107L612 122M518 -10L524 9M608 64L597 14M613 122L612 102M597 13L592 -4M533 41L539 68M537 54L530 25M542 83L538 56M540 70L543 98M25 266L77 271M157 247L180 251M592 221L579 238M551 271L544 278M564 255L553 268M577 240L566 253M535 288L528 295M639 100L649 91M324 218L330 227M331 228L341 245M754 266L738 251L715 240M618 119L637 102M342 245L331 227M883 523L880 534M568 18L525 -120M881 534L885 523'
const MAPA_RUAS_LARGAS = 'M292 262L302 323L339 369L346 390M214 416L279 437L354 442L368 442L379 439L508 381L522 371L544 340L562 322L582 308L651 273L724 226L729 219L724 203L716 189L692 165L690 161L692 143L680 126L669 93L663 66L669 19L663 4L654 -6M1005 276L982 254L981 250M844 355L856 376L855 395L857 407L863 418L888 438L903 461L867 576L864 603L869 647M872 645L867 629L866 593L868 579L897 480L906 463M633 -24L661 5L667 17L660 79L679 127L690 144L687 161L690 168L717 195L722 203L726 222L682 253L642 276L563 316L510 377L421 419L367 441L280 436L214 415M-30 136L14 137L41 143L68 151L131 183L154 185L189 176L212 167L262 138L270 136M1038 8L980 -1M1043 113L1012 109L1003 110L992 117L981 133L974 138L966 142L958 139L951 121L939 108L915 65L915 55L918 47L938 23L936 16L922 0M190 532L62 598L-21 606M185 596L187 592L194 593L211 587L305 526M184 637L246 236L289 98L292 91L305 93L434 136L413 199L349 237M299 256L273 263L144 243L108 257L91 268L62 269L13 262L-13 271M434 136L490 159L568 180L671 214M312 522L321 516L404 496L432 468L543 428L562 411L585 371L597 365L623 365L601 362L585 369L562 409L550 421L533 431L435 465L402 495L339 509L311 519M304 524L204 590L194 592L187 590M907 461L961 387M-63 611L64 599L188 534M354 568L315 571L306 567L301 555L311 513L300 556L304 567L314 572L354 570M267 135L206 169L189 176L154 184L132 183L92 161L54 145L0 135L-30 135M292 91L312 42L344 -10M434 126L315 87M437 114L431 87L434 62L432 55L402 21L344 -13M979 -1L944 -6L929 -14L919 -12M345 375L306 323L293 262M343 -12L302 55L275 135L270 136M37 597L28 566L29 561L73 546L72 541L24 490M556 -5L571 48L579 108L574 157L555 209L565 188L574 160L578 142L580 108L573 51L557 -6M275 135L245 231L190 592L183 624L183 637M-19 438L-10 456L20 489M22 488L-7 459M22 491L68 537L70 543L69 547L28 560L26 563L35 597L37 598L35 597M356 -6L403 24L430 56L432 62L430 94L436 115L432 125M962 385L1002 329L1018 295M976 254L980 255L1012 286L1016 296L1000 329L961 384M959 386L905 459L885 435L863 417L857 406L856 376L845 355M-12 273L12 264L62 270L89 269L144 245L281 267L340 244L354 236L306 253M354 236L406 205L417 196L418 187L435 136M313 251L297 258M672 203L562 167L479 135L434 126L437 115'
const MAPA_RUAS_EXTRA = 'M346 535L487 526M284 623L430 614M436 613L430 614M494 525L487 526'

// Checkpoint (índice em PERCURSO_PCS) → índice do simulado/semana (Largada não tem simulado).
const PC_SIM_IDX: (number | null)[] = [null, 0, 1, 2, 2]
function Percurso({ cur = 0, simulados }: { cur?: number; simulados?: (MaratonaSimuladoLink | null)[]}) {
  // cur = conclusão REAL do aluno (0..3): só marca checkpoint como concluído quando terminou o simulado.
  const [picked, setPicked] = useState<number | null>(null)
  const dm = (iso: string) => { const p = (iso || '').split('-'); return p[2] && p[1] ? `${p[2]}/${p[1]}` : iso }
  // Checkpoint EFETIVO: sobrepõe o rótulo/data REAIS do simulado (config.etapas) sobre o mock do mapa.
  const pcEf = (i: number): PC => {
    const base = PERCURSO_PCS[i]
    const si = PC_SIM_IDX[i]
    const sim = si != null ? simulados?.[si] : null
    if (!sim) return base
    const nome = sim.rotulo || sim.titulo || base.name
    const dt = sim.data ? dm(sim.data) : base.date
    return { ...base, name: nome, stepName: nome, short: `${base.code} · ${nome}`, codeLabel: `${base.code} · ${dt}`, date: dt, sim: `${nome} · ${dt}` }
  }
  // Estado do checkpoint: done/now/locked por conclusão (cur) + trava se o simulado da etapa não está LIBERADO.
  const st = (i: number): 'done' | 'now' | 'locked' => {
    const g = PERCURSO_PCS[i].stage
    const base = (cur === 3 || g < cur) ? 'done' : (g === cur ? 'now' : 'locked')
    if (base !== 'done') { const si = PC_SIM_IDX[i]; const sim = si != null ? simulados?.[si] : null; if (sim && !sim.liberada) return 'locked' }
    return base
  }
  const lastIdx = cur === 3 ? PC_LAST : cur
  const selIdx = picked != null ? picked : lastIdx
  // Ícone por estado (mesmas regras do protótipo).
  const iconDe = (i: number, size: number): ReactNode => {
    const s = st(i)
    if (i === 0 && s !== 'now') return <Plane size={size} color="#fff" />
    if (i === PC_LAST && s !== 'now') return <Flag size={size} color={NAVY} />
    if (i > 0 && i < PC_LAST && s === 'done') return <Check size={size} color="#fff" />
    if (s === 'now') return <MapPin size={size} color="#fff" />
    if (i > 0 && i < PC_LAST && s === 'locked') return <Lock size={size} color="#3B4866" />
    return null
  }
  const circulo = (i: number, size: number): CSSProperties => {
    const s = st(i)
    const base: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', width: size, height: size, borderRadius: '50%', boxSizing: 'border-box', padding: 0, cursor: 'pointer', border: 0 }
    if (i === PC_LAST && s !== 'now') return { ...base, background: GOLD, border: `2px solid ${GOLD}`, ...(s === 'locked' ? { opacity: 0.55 } : {}) }
    if (s === 'now') return { ...base, background: '#53308F', border: '2px solid #53308F', boxShadow: '0 0 0 5px #CBB8FF' }
    if (i === 0) return { ...base, background: NAVY, border: `2px solid ${NAVY}` }
    if (s === 'done') return { ...base, background: INK, border: `2px solid ${INK}` }
    return { ...base, background: '#fff', border: '2px dashed #C9D1E0' }
  }
  const chipDe = (i: number): [CSSProperties, string] => {
    const s = st(i)
    const base: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontStretch: '125%', fontWeight: 800, fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase' }
    if (i === PC_LAST && s === 'done') return [{ ...base, background: GOLD, color: NAVY }, 'Chegada']
    if (s === 'done') return [{ ...base, background: INK, color: '#fff' }, 'Concluído']
    if (s === 'now') return [{ ...base, background: '#53308F', color: '#fff' }, 'Você está aqui']
    return [{ ...base, background: CARD, color: MUT, border: `1px solid ${LINE}` }, 'Em ' + pcEf(i).date]
  }
  const routeDone = lastIdx > 0 ? PERCURSO_PCS.slice(0, lastIdx + 1).map((d) => d.x + ',' + d.y).join(' ') : '381,568 381,568'
  const sel = pcEf(selIdx)
  const [chipSel, chipSelLbl] = chipDe(selIdx)
  const selOn = st(selIdx) !== 'locked'
  const kmLabel = cur === 3 ? 'KM 42,195 de 42,195 · chegada concluída' : `KM ${PERCURSO_PCS[lastIdx].km} de 42,195 · você está em ${PERCURSO_PCS[lastIdx].short} · próximo simulado ${['17/10', '24/10', '31/10'][Math.min(cur, 2)]}`

  return (
    <div>
      {/* HEADER navy full-bleed (mesmo do Painel): faixas diagonais + marca + ticket. O título/descrição
          descrevem o percurso; o ticket (peito) fica à direita, como no protótipo. */}
      <header style={{ position: 'relative', overflow: 'hidden', background: NAVY, color: '#fff' }}>
        <svg aria-hidden="true" viewBox="0 0 1440 460" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <g transform="rotate(-8 720 240)">
            <rect x="-200" y="150" width="1900" height="26" fill="#2E4FB0" />
            <rect x="-200" y="190" width="1900" height="26" fill="#2E4FB0" />
            <rect x="-200" y="230" width="1900" height="26" fill="#53308F" />
          </g>
        </svg>
        <div style={{ position: 'relative', padding: '24px 24px 72px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span style={kickerLt}>Maratona de simulados · ENAP + AGU</span>
            <img src="/maratona/logo-revisao.png" alt="Revisão Ensino Jurídico" style={{ height: 28, width: 'auto' }} />
          </div>
          <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 32, justifyContent: 'space-between' }}>
            <div style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ ...kickerLt, color: GOLD }}>O percurso</span>
              <h1 style={{ margin: 0, fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 52, lineHeight: 0.98 }}>Do aeroporto<br />ao Ed. II da AGU</h1>
              <p style={{ margin: 0, maxWidth: 560, fontSize: 15.5, lineHeight: 1.55, color: '#BCC8E0' }}>
                Três simulados, três paradas: 17/10 na AGU, 24/10 na PGF e 31/10 passando pela PGFN até a chegada no Ed. II da AGU, onde foi a posse do último concurso.
              </p>
            </div>
            <img src="/maratona/peito.png" alt="Número de peito · Nº 0001" style={{ flex: '0 1 440px', width: 'min(440px, 60vw)', height: 'auto', transform: 'rotate(3deg)', filter: 'drop-shadow(0 16px 26px rgba(0,0,0,.35))' }} />
          </div>
        </div>
      </header>

      {/* Conteúdo sobreposto ao header (como no Painel) + padding lateral próprio. */}
      <div style={{ position: 'relative', marginTop: -48, padding: '0 24px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Linha do percurso (dots) */}
      <section style={{ ...panelCard, padding: '18px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
          <span style={kickerDk}>Percurso</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: MUT }}>{kmLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {PERCURSO_PCS.map((d, i) => {
            const lineBase: CSSProperties = { flex: '1 1 auto', height: 4, borderRadius: 2 }
            return (
              <button key={i} type="button" onClick={() => setPicked(i)} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', color: TEXT }}>
                <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <span style={{ ...lineBase, background: i === 0 ? 'transparent' : (st(i) !== 'locked' ? GOLD : '#CBD4E4') }} />
                  <span style={circulo(i, 40)}>{iconDe(i, 18)}</span>
                  <span style={{ ...lineBase, background: i === PC_LAST ? 'transparent' : (st(i + 1) !== 'locked' ? GOLD : '#CBD4E4') }} />
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: MUT, whiteSpace: 'nowrap' }}>{pcEf(i).codeLabel}</span>
                <span className="pn-step-name" style={{ fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 15, textAlign: 'center' }}>{pcEf(i).stepName}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Mapa + parada selecionada */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <Card style={{ flex: '999 1 520px', minWidth: 0, padding: 14 }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1000 / 620', borderRadius: 10, overflow: 'hidden', background: '#E9EDF3' }}>
            <svg viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <rect x="0" y="0" width="1000" height="620" fill="#E9EDF3" />
              <path d={MAPA_CIDADE} fill="#BCC8E0" />
              <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path stroke="#CBD4E4" strokeWidth={5} d={MAPA_RUAS_FINAS} />
                <path stroke="#CBD4E4" strokeWidth={9} d={MAPA_RUAS_LARGAS} />
                <path stroke="#FFFFFF" strokeWidth={5} d={MAPA_RUAS_LARGAS} />
                <path stroke="#C9D1E0" strokeWidth={7} d={MAPA_RUAS_EXTRA} />
              </g>
              <g fontFamily="Archivo, sans-serif" fontWeight={700} letterSpacing="2" fill="#3B4866" fontSize={11}>
                <text x={790} y={250} letterSpacing="3" fontSize={12}>LAGO PARANOÁ</text>
                <text x={420} y={512}>AEROPORTO JK</text>
                <text x={330} y={232}>PARQUE DA CIDADE</text>
                <text x={380} y={80}>ASA NORTE</text>
                <text x={300} y={320}>ASA SUL</text>
                <text x={690} y={236} fontSize={10}>PRAÇA DOS TRÊS PODERES</text>
              </g>
              <g fill="#3B4866"><circle cx={569} cy={174} r={3} /><circle cx={661} cy={205} r={3} /></g>
              <g fontFamily="Archivo, sans-serif" fontWeight={600} fill="#3B4866" fontSize={9}><text x={574} y={172}>Rodoviária</text><text x={666} y={203}>Congresso</text></g>
              <polyline points="381,568 580,218 605,132 606,137 605,134" fill="none" stroke="#BCC8E0" strokeWidth={5} strokeDasharray="2 9" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={routeDone} fill="none" stroke="#F7B500" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
              <g stroke="#3B4866" strokeWidth={1.5} fill="none">
                <line x1={580} y1={218} x2={622} y2={252} />
                <line x1={605} y1={132} x2={548} y2={104} />
                <line x1={606} y1={137} x2={604} y2={64} />
                <line x1={605} y1={134} x2={664} y2={104} />
              </g>
              <g fill="#071A3F"><circle cx={580} cy={218} r={3.5} /><circle cx={605} cy={134} r={4} /></g>
            </svg>
            {PERCURSO_PCS.map((d, i) => {
              const lab: CSSProperties = { position: 'absolute', whiteSpace: 'nowrap', padding: '4px 8px', borderRadius: 8, background: '#fff', boxShadow: '0 2px 8px rgba(7,26,63,.16)', pointerEvents: 'none', color: '#071A3F', ...(d.side === 'l' ? { right: 24, top: -18, textAlign: 'right' as const } : d.side === 't' ? { left: '50%', bottom: 24, transform: 'translateX(-50%)', textAlign: 'center' as const } : { left: 24, top: -18 }) }
              return (
                <div key={i} style={{ position: 'absolute', left: `${d.mx / 10}%`, top: `${d.my / 6.2}%`, width: 0, height: 0 }}>
                  <button type="button" onClick={() => setPicked(i)} aria-label={d.short} style={{ position: 'absolute', left: -18, top: -18, ...circulo(i, 36) }}>{iconDe(i, 16)}</button>
                  <span className="mp-label" style={lab}><span style={{ fontFamily: MONO, fontSize: 10, color: '#3B4866', display: 'block' }}>{pcEf(i).codeLabel}</span><span style={{ fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 13 }}>{pcEf(i).stepName}</span></span>
                </div>
              )
            })}
            <div style={{ position: 'absolute', right: 8, bottom: 6, fontFamily: MONO, fontSize: 9, color: '#3B4866', background: 'rgba(255,255,255,.85)', padding: '2px 6px', borderRadius: 4 }}>Mapa: © colaboradores do OpenStreetMap</div>
          </div>
        </Card>

        <Card style={{ flex: '1 1 320px', minWidth: 0, overflow: 'hidden', padding: 0 }}>
          <div style={{ position: 'relative', aspectRatio: '16 / 9', background: NAVY }}>
            <img src={sel.img} alt={`Foto ilustrativa: ${sel.name}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <span style={{ position: 'absolute', left: 12, top: 12, padding: '5px 10px', borderRadius: 8, background: NAVY, color: '#fff', fontFamily: MONO, fontSize: 12 }}>{sel.codeLabel}</span>
          </div>
          <div style={{ padding: '22px 24px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={chipSel}>{chipSelLbl}</span>
            <h2 style={{ margin: 0, fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 28 }}>{sel.name}</h2>
            {(() => {
              const acao = acaoSim(simulados, PC_SIM_IDX[selIdx])
              return acao ? (
                <Link href={acao.href} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 20px', borderRadius: 10, background: INK, color: '#fff', textDecoration: 'none', fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 14, letterSpacing: '.5px' }}>{acao.label} →</Link>
              ) : null
            })()}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
              {[['Simulado', sel.sim], ['Endereço', sel.local], ['Km acumulado', `KM ${sel.km}`]].map(([k, v], j) => (
                <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
                  <span style={{ color: MUT }}>{k}</span>
                  <span style={{ fontWeight: 600, textAlign: 'right', ...(k === 'Km acumulado' ? { fontFamily: MONO, fontWeight: 500 } : {}) }}>{v}</span>
                </div>
              ))}
            </div>
            {sel.medal != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 12, borderRadius: 10, background: CARD_SUB }}>
                <img src={medalSrc(sel.medal, selOn)} alt="" style={{ width: 84, height: 116, objectFit: 'contain', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontStretch: '125%', fontWeight: 800, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '.12em', fontSize: 11, color: INK_TX }}>Medalha do ponto</span>
                  <span style={{ fontSize: 14, lineHeight: 1.4, color: MUT }}>{selOn ? `Conquistada no simulado de ${sel.date}: KM ${sel.km}.` : `Faça o simulado de ${sel.date} para ganhar a medalha KM ${sel.km}.`}</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Suas medalhas de km */}
      <Card style={{ padding: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
          <Kicker>Suas medalhas de km</Kicker>
          <span style={{ fontFamily: MONO, fontSize: 12, color: MUT }}>{PERCURSO_PCS.filter((d) => d.medal != null && st(d.n) !== 'locked').length} de 4 conquistadas</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {PERCURSO_PCS.filter((d) => d.medal != null).map((d) => { const on = st(d.n) !== 'locked'; return (
            <div key={d.n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 12px 16px', borderRadius: 16, background: CARD_SUB, border: `1px solid ${LINE}` }}>
              <img src={medalSrc(d.medal!, on)} alt="" style={{ width: 96, height: 132, objectFit: 'contain', opacity: on ? 1 : 0.5 }} />
              <span style={{ fontFamily: MONO, fontSize: 12, textAlign: 'center', color: MUT }}>{(on ? 'Conquistada' : 'Em ' + d.date) + ' · KM ' + d.km}</span>
            </div>
          )})}
        </div>
      </Card>
      </div>
    </div>
  )
}

/* ─────────── PAINEL do corredor (PORTE FIEL de painel.html / template "Painel") ─────────── */
// Estado inicial do aluno na maratona = LARGADA (cur=0). Progresso real virá do backend (fase 2);
// a lógica abaixo é a MESMA do protótipo (steps/medalha/parciais por checkpoint).
const B = '/maratona/'
const LAST_STEP = 4
const PAINEL_D = [
  { stage: 0, medal: 0, code: 'LARGADA', stepName: 'Aeroporto', short: 'Aeroporto', name: 'Aeroporto', km: '0', date: 'inscrição', local: 'Aeroporto de Brasília', img: B + 'foto-aeroporto.jpg' },
  { stage: 1, medal: 2, code: 'PC 1 · 17/10', stepName: 'AGU', short: 'PC 1 · AGU', name: 'AGU', km: '21', date: '17/10', local: 'SAS Qd. 3', img: B + 'foto-agu.jpg' },
  { stage: 2, medal: 3, code: 'PC 2 · 24/10', stepName: 'PGF', short: 'PC 2 · PGF', name: 'PGF', km: '28', date: '24/10', local: 'SAUN Qd. 5 [a confirmar]', img: B + 'foto-pgf.jpg' },
  { stage: 3, medal: 4, code: 'PASSAGEM · 31/10', stepName: 'PGFN', short: 'PGFN', name: 'PGFN', km: '35', date: '31/10', local: 'SAUN Qd. 5', img: B + 'foto-pgfn.jpg' },
  { stage: 3, medal: 5, code: 'CHEGADA · 31/10', stepName: 'Ed. II AGU', short: 'Ed. II da AGU', name: 'Ed. II da AGU', km: '42,195', date: '31/10', local: 'SAUN Qd. 5, Lote C', img: B + 'foto-ed-ii-agu.jpg' },
]
const PAINEL_SIM = [
  { label: 'Simulado 1 · 17/10', dest: 'AGU', km: '21', medal: 2 },
  { label: 'Simulado 2 · 24/10', dest: 'PGF', km: '28', medal: 3 },
  { label: 'Simulado 3 · 31/10', dest: 'PGFN e chegada no Ed. II da AGU', km: '42,195', medal: 5 },
]
// Medalha nº → [conquistada, bloqueada] (mesma lista do template "Medalha").
const MEDAL_IMG: Record<number, [string, string]> = {
  2: ['medalha-agu.png', 'medalha-agu-bloqueada.png'],
  3: ['medalha-pgf.png', 'medalha-pgf-bloqueada.png'],
  4: ['medalha-pgfn.png', 'medalha-pgfn-bloqueada.png'],
  5: ['medalha-ed-ii-agu.png', 'medalha-ed-ii-agu-bloqueada.png'],
}
const medalSrc = (n: number, on: boolean) => B + (MEDAL_IMG[n]?.[on ? 0 : 1] ?? MEDAL_IMG[2][1])
const kickerLt: CSSProperties = { fontStretch: '125%', fontWeight: 800, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '3px', fontSize: 13, color: '#CBB8FF' }
const kickerDk: CSSProperties = { fontStretch: '125%', fontWeight: 800, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '3px', fontSize: 13, color: INK_TX }
const chipBase: CSSProperties = { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontStretch: '125%', fontWeight: 800, fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase' }
const panelCard: CSSProperties = { background: CARD, borderRadius: 16, boxShadow: '0 10px 30px rgba(7,26,63,.12)' }

/** SELO (check-in) da etapa: CINZA/bloqueado até o aluno PERMANECER o tempo mínimo no simulado; vira
 *  DOURADO + tag "OBTIDO" quando cumpre (s.checkin). Desenhado p/ fundo navy (texto claro). */
function SeloEtapa({ s }: { s?: MaratonaSimuladoLink | null }) {
  if (!s) return null
  const ok = s.checkin
  const circulo: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: ok ? GOLD : 'rgba(255,255,255,.08)', border: ok ? `2px solid ${GOLD}` : '2px dashed rgba(255,255,255,.3)', filter: ok ? 'none' : 'grayscale(1)' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: ok ? 'rgba(247,181,0,.12)' : 'rgba(255,255,255,.05)', border: `1px solid ${ok ? 'rgba(247,181,0,.5)' : 'rgba(255,255,255,.12)'}` }}>
      <span style={circulo}>{ok ? <Medal size={22} color={NAVY} /> : <Lock size={16} color="#CBD4E4" />}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: 13.5, color: '#fff' }}>{ok ? 'Selo da etapa' : 'Selo bloqueado'}</span>
        {ok && <span style={{ padding: '1px 8px', borderRadius: 999, background: GOLD, color: NAVY, fontSize: 10, fontWeight: 800, letterSpacing: '.5px' }}>OBTIDO</span>}
      </span>
    </div>
  )
}

function Painel({ onVerMapa, onVerRanking, onIrSimulado, cur = 0, percursoCur, simulados, tempoDecorrido = 0, numero = null, abaSimulado = false }: { onVerMapa: () => void; onVerRanking?: () => void; onIrSimulado?: (cur: number) => void; cur?: number; percursoCur?: number; simulados?: (MaratonaSimuladoLink | null)[]; tempoDecorrido?: number; numero?: number | null; abaSimulado?: boolean }) {
  // cur = simulado de REFERÊNCIA mostrado (header/medalha/próximo). A aba "Simulados" passa 1/2/3 p/ ver
  // a página de cada simulado. percursoCur = conclusão REAL do aluno (0..3) → dirige SÓ a timeline do
  // percurso, p/ um checkpoint só aparecer "concluído" quando o aluno terminou o simulado correspondente.
  // "finished" (maratona concluída) só no Painel overview. Na aba Simulados, cur = simulado SELECIONADO
  // (1/2/3) → cada um é um PC normal (inclusive o 3 = PC 3 · PGFN), nunca a tela de chegada.
  const finished = !abaSimulado && cur === 3
  const lastIdx = finished ? LAST_STEP : cur
  // Simulado alvo: na ABA SIMULADOS = o selecionado (cur 1/2/3 → índice cur-1); no overview = o próximo a fazer.
  const alvoIdx = abaSimulado ? Math.min(Math.max(cur - 1, 0), 2) : Math.min(cur, 2)
  const alvo = simulados?.[alvoIdx] ?? null
  const alvoAcao = acaoSim(simulados, alvoIdx)
  // Estado do PERCURSO = progresso real (default = cur quando não informado, ex.: aba Painel padrão).
  const pc = percursoCur ?? cur
  const pcFinished = pc === 3
  const st = (i: number): 'done' | 'now' | 'locked' => { const g = PAINEL_D[i].stage; return (pcFinished || g < pc) ? 'done' : (g === pc ? 'now' : 'locked') }

  const steps = PAINEL_D.map((d, i) => {
    const s = st(i); const isLast = i === LAST_STEP
    let dot: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', width: 38, height: 38, borderRadius: '50%', boxSizing: 'border-box' }
    if (isLast && s !== 'now') dot = { ...dot, background: GOLD, border: `2px solid ${GOLD}`, ...(s === 'locked' ? { opacity: 0.55 } : {}) }
    else if (s === 'now') dot = { ...dot, background: '#53308F', border: '2px solid #53308F', boxShadow: '0 0 0 5px #CBB8FF' }
    else if (i === 0) dot = { ...dot, background: NAVY, border: `2px solid ${NAVY}` }
    else if (s === 'done') dot = { ...dot, background: INK, border: `2px solid ${INK}` }
    else dot = { ...dot, background: CARD, border: '2px dashed #C9D1E0' }
    const lineBase: CSSProperties = { flex: '1 1 auto', height: 4, borderRadius: 2 }
    const isStart = i === 0 && s !== 'now'
    const icon: ReactNode = isStart ? <Plane size={16} color="#fff" />
      : (isLast && s !== 'now') ? <Flag size={16} color={NAVY} />
        : (i > 0 && i < LAST_STEP && s === 'done') ? <Check size={16} color="#fff" />
          : s === 'now' ? <MapPin size={16} color="#fff" />
            : (i > 0 && i < LAST_STEP && s === 'locked') ? <Lock size={14} color="#3B4866" /> : null
    return {
      codeLabel: d.code + (s === 'now' ? ' · VOCÊ' : ''), stepName: d.stepName, dot, icon,
      lineL: { ...lineBase, background: i === 0 ? 'transparent' : (s !== 'locked' ? GOLD : '#CBD4E4') } as CSSProperties,
      lineR: { ...lineBase, background: isLast ? 'transparent' : (st(i + 1) !== 'locked' ? GOLD : '#CBD4E4') } as CSSProperties,
    }
  })

  const c = PAINEL_D[lastIdx]
  const nx = PAINEL_SIM[Math.min(cur, 2)]
  const h = abaSimulado
    // ABA SIMULADOS: cada simulado é um PC normal → "PC {N} · {nome}" (N=3 → PC 3 · PGFN). Nome = personalizado
    // (se definido) ou o checkpoint (AGU/PGF/PGFN).
    ? { rotulo: `PC ${cur} · KM ${c.km}`, titulo: `PC ${cur} · ${alvo?.rotulo || c.stepName}`, resumo: `Simulado ${cur} da maratona${alvo ? ' · ' + dispoSim(alvo) : ''}.` }
    : cur === 0
      ? { rotulo: 'Largada · KM 0', titulo: 'Aeroporto', resumo: 'Seu número de peito está pronto. Primeiro simulado em 17/10: ele leva você até a AGU.' }
      : finished
        ? { rotulo: 'Chegada · KM 42,195', titulo: 'Linha de chegada no Ed. II da AGU', resumo: '3 de 3 simulados concluídos. Passou pela PGFN e chegou onde foi a posse do último concurso. Confira sua classificação, o selo Finisher e o certificado.' }
        : { rotulo: 'Você está no · KM ' + c.km, titulo: PAINEL_D[lastIdx].code.split(' · ')[0] + ' · ' + c.stepName, resumo: cur + ' de 3 simulados concluídos. Próximo: ' + nx.label + ', até ' + nx.dest + '.' }
  const p = cur === 0
    ? { n: 2, on: false, codeLabel: 'LARGADA', local: c.local, img: c.img, chip: 'Largada', chipStyle: { ...chipBase, background: NAVY, color: '#fff' } as CSSProperties, medalTitle: 'Primeira medalha: KM 21 · AGU', medalText: 'São três simulados e quatro medalhas: AGU (17/10), PGF (24/10) e, em 31/10, PGFN e a chegada no Ed. II da AGU.' }
    : finished
      ? { n: 5, on: true, codeLabel: 'CHEGADA', local: c.local, img: c.img, chip: 'Chegada', chipStyle: { ...chipBase, background: GOLD, color: NAVY } as CSSProperties, medalTitle: 'Medalhas KM 35 e KM 42,195', medalText: 'O simulado de 31/10 levou você pela PGFN até a chegada. As quatro medalhas e o selo Finisher estão no seu perfil.' }
      // Na aba Simulados, a medalha/selo só fica DOURADA quando o aluno conquistou o check-in da etapa (≥ tempo
      // mínimo); no overview permanece pelo progresso real. (on=false → medalSrc devolve a versão cinza.)
      : { n: c.medal, on: abaSimulado ? !!alvo?.checkin : true, codeLabel: PAINEL_D[lastIdx].code, local: c.local, img: c.img, chip: 'Parcial registrada · ' + c.date, chipStyle: { ...chipBase, background: INK, color: '#fff' } as CSSProperties, medalTitle: 'Medalha KM ' + c.km + ' · ' + c.short, medalText: PAINEL_SIM[cur - 1].label + ' concluído. Você já correu ' + c.km + ' km do percurso.' }
  const n = finished
    ? { trecho: 'Percurso concluído', chip: 'Chegada', chipStyle: { ...chipBase, background: GOLD, color: NAVY } as CSSProperties, titulo: 'Classificação final', meta: (fmtNum(numero) ? 'Nº ' + fmtNum(numero) + ' · ' : '') + 'confira sua classificação', botao: 'Ver classificação' }
    : { trecho: (cur === 0 ? 'Aeroporto' : c.short) + ' → ' + nx.dest + ' · vale a medalha KM ' + nx.km, chip: 'Novo simulado', chipStyle: { ...chipBase, background: BG, color: TEXT } as CSSProperties, titulo: nx.label, meta: '[nº] questões · [tempo] min · libera em ' + nx.label.split(' · ')[1], botao: cur === 2 ? 'Correr até a chegada →' : 'Correr até o PC ' + (cur + 1) + ' →' }
  const parciais = PAINEL_SIM.map((s, i) => {
    const done = i < cur, now = i === cur
    let row: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 40, padding: '0 14px', borderRadius: 8, boxSizing: 'border-box' }
    let v = '--'
    if (done) { row = { ...row, background: BG, color: TEXT }; v = '[00:00:00]' }
    else if (now) { row = { ...row, background: '#53308F', color: '#fff' }; v = 'próximo' }
    else { row = { ...row, background: CARD, border: `1px solid ${LINE}`, color: MUT } }
    return { label: s.label + ' · ' + s.dest.split(' e ')[0], val: v, rowStyle: row }
  })
  return (
    <div>
      {/* HEADER navy com faixas diagonais + peito + tempo — FULL-BLEED (fora a fora), sem bordas arredondadas */}
      <header style={{ position: 'relative', overflow: 'hidden', background: NAVY, color: '#fff' }}>
        <svg aria-hidden="true" viewBox="0 0 1440 460" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <g transform="rotate(-8 720 240)">
            <rect x="-200" y="150" width="1900" height="26" fill="#2E4FB0" />
            <rect x="-200" y="190" width="1900" height="26" fill="#2E4FB0" />
            <rect x="-200" y="230" width="1900" height="26" fill="#53308F" />
          </g>
        </svg>
        <div style={{ position: 'relative', padding: '24px 24px 72px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span style={kickerLt}>Maratona de simulados · ENAP + AGU</span>
            <img src="/maratona/logo-revisao.png" alt="Revisão Ensino Jurídico" style={{ height: 28, width: 'auto' }} />
          </div>
          <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 32 }}>
            <img src="/maratona/peito-compacto.png" alt={`Número de peito${fmtNum(numero) ? ' · Nº ' + fmtNum(numero) : ''}`} style={{ width: 200, height: 200, maxWidth: '42vw', transform: 'rotate(-4deg)', filter: 'drop-shadow(0 16px 26px rgba(0,0,0,.35))' }} />
            {/* Posição atual + tempo acumulado (o Aeroporto/Largada NÃO tem "iniciar" — é só o começo). */}
            <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={kickerLt}>{h.rotulo}</span>
              <h1 style={{ margin: 0, fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 52, lineHeight: 0.98 }}>{h.titulo}</h1>
              <p style={{ margin: 0, maxWidth: 560, fontSize: 15.5, lineHeight: 1.55, color: '#BCC8E0' }}>{h.resumo}</p>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 18 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: '#BCC8E0' }}>Tempo de prova acumulado</span>
                  <span style={{ fontFamily: MONO, fontSize: 34, lineHeight: 1 }}>{fmtTempo(tempoDecorrido)}</span>
                </div>
                {/* NÚMERO DO CORREDOR — destacado à DIREITA do tempo (entregue ao encerrar o 1º simulado). */}
                {fmtNum(numero)
                  ? <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 16px', borderRadius: 12, background: GOLD, color: NAVY }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: '1.5px' }}>CORREDOR</span>
                      <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>Nº {fmtNum(numero)}</span>
                    </div>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 16px', borderRadius: 12, background: 'rgba(255,255,255,.08)', border: '1px dashed rgba(247,181,0,.6)' }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: '1.5px', color: GOLD }}>Nº A DEFINIR</span>
                      <span style={{ fontFamily: MONO, fontSize: 12.5, color: '#CBD4E4' }}>encerre o 1º simulado</span>
                    </div>}
              </div>
            </div>
            {/* ACESSO AO SIMULADO — à DIREITA do banner, SÓ na aba "Simulados" (abas com o nome dos simulados):
                iniciar/ver resultado do simulado selecionado + a data real ("já disponível"/"disponível em …").
                Na aba "Painel" (overview) NÃO aparece botão de iniciar. O Aeroporto nunca tem simulado. */}
            {abaSimulado && alvo && (
              <div style={{ flex: '0 1 300px', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, padding: 18 }}>
                <span style={{ ...kickerLt, color: GOLD }}>Simulado desta etapa</span>
                <span style={{ fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 20, lineHeight: 1.08 }}>{alvo.rotulo || alvo.titulo}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: alvo.liberada ? GOLD : '#BCC8E0' }}>{dispoSim(alvo)}</span>
                {/* SELO da etapa: cinza/bloqueado → dourado "OBTIDO" quando o aluno cumpre o tempo mínimo. */}
                <SeloEtapa s={alvo} />
                {alvoAcao
                  ? <Link href={alvoAcao.href} style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 10, background: GOLD, color: NAVY, textDecoration: 'none', fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 15 }}>{alvoAcao.label} →</Link>
                  : <span style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 10, background: 'rgba(255,255,255,.12)', color: '#CBD4E4', fontWeight: 700, fontSize: 13.5 }}><Lock size={15} /> {dispoSim(alvo)}</span>}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* conteúdo sobreposto ao header (como no protótipo: margin-top negativo) + padding lateral próprio */}
      <div style={{ position: 'relative', marginTop: -48, padding: '0 24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Percurso em etapas */}
        <section style={{ ...panelCard, padding: '22px 26px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
            <span style={kickerDk}>Percurso</span>
            <button type="button" onClick={onVerMapa} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: INK_TX }}>Ver mapa completo</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            {steps.map((s, i) => (
              <div key={i} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <span style={s.lineL} />
                  <span style={s.dot}>{s.icon}</span>
                  <span style={s.lineR} />
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: MUT, whiteSpace: 'nowrap' }}>{s.codeLabel}</span>
                <span className="pn-step-name" style={{ fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 14, textAlign: 'center' }}>{s.stepName}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Parada atual: foto + medalha */}
        <section style={{ ...panelCard, overflow: 'hidden', display: 'flex', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 380px', minHeight: 260, position: 'relative', background: NAVY }}>
            <img src={p.img} alt={'Foto ilustrativa · ' + c.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <span style={{ position: 'absolute', left: 14, top: 14, padding: '5px 10px', borderRadius: 8, background: NAVY, color: '#fff', fontFamily: MONO, fontSize: 12 }}>{p.codeLabel} · {p.local}</span>
          </div>
          <div style={{ flex: '1 1 380px', minWidth: 0, padding: 28, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            {/* Medalha da parada: quando NÃO conquistada (p.on=false) ganha cara de bloqueada — dessaturada,
                esmaecida e com cadeado por cima. */}
            <div style={{ position: 'relative', flexShrink: 0, width: 150, height: 206 }}>
              <img src={medalSrc(p.n, p.on)} alt={p.on ? 'Medalha conquistada' : 'Medalha bloqueada'} style={{ display: 'block', width: 150, height: 206, ...(p.on ? {} : { filter: 'grayscale(1) brightness(1.05) opacity(.45)' }) }} />
              {!p.on && (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: '50%', background: 'rgba(7,26,63,.78)', border: '2px solid rgba(255,255,255,.45)', boxShadow: '0 6px 16px rgba(0,0,0,.35)' }}><Lock size={24} color="#fff" /></span>
                </span>
              )}
            </div>
            <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={p.chipStyle}>{p.chip}</span>
              <h2 style={{ margin: 0, fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 26, lineHeight: 1.05 }}>{p.medalTitle}</h2>
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55, color: MUT }}>{p.medalText}</p>
            </div>
          </div>
        </section>

        {/* Próximo simulado + Parciais */}
        <section style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
          <div style={{ ...panelCard, flex: '999 1 480px', minWidth: 0, padding: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 13, color: MUT }}>{n.trecho}</span>
              <span style={n.chipStyle}>{n.chip}</span>
            </div>
            <h3 style={{ margin: 0, fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 28, lineHeight: 1.05 }}>{finished ? n.titulo : (alvo ? (alvo.rotulo || alvo.titulo) : n.titulo)}</h3>
            <span style={{ fontFamily: MONO, fontSize: 14, color: MUT }}>{finished ? n.meta : (alvo ? dispoSim(alvo) : n.meta)}</span>
            {(() => {
              const btnSt: CSSProperties = { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', minHeight: 48, padding: '0 22px', borderRadius: 10, border: 0, cursor: 'pointer', background: INK, color: '#fff', textDecoration: 'none', fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 15, letterSpacing: '0.5px' }
              const infoSt: CSSProperties = { ...btnSt, opacity: 0.6, cursor: 'default', background: '#6B7280' }
              if (finished) return <button type="button" onClick={onVerRanking} style={btnSt}>{n.botao}</button>
              // PAINEL (overview): botão ÚNICO "Ir para o simulado N" → vai ao 1º simulado DISPONÍVEL (não feito +
              // liberado). Se o próximo ainda não liberou, mostra QUANDO libera; feito o atual, aponta pro próximo.
              if (!abaSimulado) {
                // Vai para a ABA SIMULADOS (select do simulado alvo), NÃO direto pro simulado.
                if (alvo && !alvo.concluido && alvo.liberada && alvo.fazerUrl && onIrSimulado)
                  return <button type="button" onClick={() => onIrSimulado(alvoIdx + 1)} style={btnSt}>Ir para o simulado {alvoIdx + 1} →</button>
                return <span style={infoSt}>{alvo ? (alvo.concluido ? 'Simulado concluído' : dispoSim(alvo)) : n.meta}</span>
              }
              // ABA SIMULADOS: informativo aqui (o iniciar do simulado selecionado fica no painel à direita do banner).
              return <span style={infoSt}>{alvo ? dispoSim(alvo) : n.meta}</span>
            })()}
          </div>
          <div style={{ ...panelCard, flex: '1 1 340px', minWidth: 0, padding: 26, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ ...kickerDk, marginBottom: 6 }}>Parciais</span>
            {parciais.map((r, i) => {
              // Cada parcial ABRE a aba do respectivo simulado (como o dropdown "Simulados") — sempre clicável.
              const conteudo = (<>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{r.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 13 }}>{r.val}</span>
              </>)
              return onIrSimulado
                ? <button key={i} type="button" onClick={() => onIrSimulado(i + 1)} title={`Ver simulado ${i + 1}`} style={{ ...r.rowStyle, width: '100%', border: (r.rowStyle as CSSProperties).border ?? 0, cursor: 'pointer', textAlign: 'left', color: (r.rowStyle as CSSProperties).color ?? 'inherit', font: 'inherit' }}>{conteudo}</button>
                : <div key={i} style={r.rowStyle}>{conteudo}</div>
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

/* ─────────── RANKING (semanas + geral) ─────────── */
// Semanas da maratona (base do ranking — PORTE do ranking.html do protótipo).
const RK_W = [
  { nome: 'Semana 1', data: '17/10', pontos: 'Simulado 1 · AGU', km: ['21'] },
  { nome: 'Semana 2', data: '24/10', pontos: 'Simulado 2 · PGF', km: ['28'] },
  { nome: 'Semana 3', data: '31/10', pontos: 'Simulado 3 · PGFN e chegada', km: ['35', '42,195'] },
]
const RK_LAST_KM = ['21', '28', '42,195'] // KM exibido por semana (geral = 42,195)

// Paginação first/prev/next/last (mesmo padrão do ranking do Lei Seca), estilizada p/ a maratona.
function RankPager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  if (total <= 1) return null
  const btn = (dis: boolean): CSSProperties => ({ width: 36, height: 36, borderRadius: 10, border: `1px solid ${LINE}`, background: CARD, color: dis ? MUT : TEXT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: dis ? 'default' : 'pointer', opacity: dis ? 0.45 : 1 })
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0 16px' }}>
      <button type="button" aria-label="Início" disabled={page <= 0} onClick={() => onPage(0)} style={btn(page <= 0)}><ChevronsLeft size={16} /></button>
      <button type="button" aria-label="Voltar" disabled={page <= 0} onClick={() => onPage(page - 1)} style={btn(page <= 0)}><ChevronLeft size={16} /></button>
      <span style={{ minWidth: 70, textAlign: 'center', fontFamily: MONO, fontSize: 13, fontWeight: 700, color: MUT }}>{page + 1}/{total}</span>
      <button type="button" aria-label="Avançar" disabled={page >= total - 1} onClick={() => onPage(page + 1)} style={btn(page >= total - 1)}><ChevronRight size={16} /></button>
      <button type="button" aria-label="Pular tudo" disabled={page >= total - 1} onClick={() => onPage(total - 1)} style={btn(page >= total - 1)}><ChevronsRight size={16} /></button>
    </div>
  )
}

// Uma linha da tabela de classificação (real). Destaca "Você" em roxo.
function RankRow({ r, sou }: { r: MaratonaRankLinha; sou: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(0,1fr) 96px 88px 104px', gap: 8, alignItems: 'center', minHeight: 48, padding: '0 22px', borderTop: sou ? `2px solid #CBB8FF` : `1px solid ${LINE}`, background: sou ? '#53308F' : CARD, color: sou ? '#fff' : TEXT }}>
      <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 500 }}>{r.posicao}º</span>
      <span style={{ minWidth: 0, display: 'flex', gap: 8, alignItems: 'baseline', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sou ? 'Você' : r.nome}</span>
        {sou && <span style={{ height: 18, padding: '0 6px', borderRadius: 99, background: '#CBB8FF', color: '#2E1065', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>VOCÊ</span>}
      </span>
      {/* NÚMERO DO CORREDOR (fixo) · CHECK (permaneceu o mínimo) · TEMPO — sem pontos. */}
      <span className="rk-hide" style={{ fontFamily: MONO, fontSize: 13 }}>{fmtNum(r.numero) ? 'Nº ' + fmtNum(r.numero) : '—'}</span>
      <span style={{ display: 'inline-flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
        {r.checkin ? <Check size={16} color={sou ? '#fff' : GOLD} /> : <span style={{ fontFamily: MONO, fontSize: 13, color: sou ? 'rgba(255,255,255,.65)' : MUT }}>—</span>}
      </span>
      <span className="rk-hide" style={{ fontFamily: MONO, fontSize: 13, textAlign: 'right' }}>{r.tempo}</span>
    </div>
  )
}

function Ranking({ ranking, meuId, simulados }: { ranking?: RankingMaratona; meuId?: string; simulados?: (MaratonaSimuladoLink | null)[]}) {
  const [wk, setWk] = useState(0)
  const [page, setPage] = useState(0)
  const isGeral = wk === 3
  const tabs = [...RK_W.map((w, i) => ({ label: w.nome, i })), { label: 'Geral', i: 3 }]
  const head = isGeral
    ? { rotulo: 'Ranking geral · acumulado', titulo: 'Quem lidera a maratona', resumo: 'Classificação por check-in (ficar o tempo mínimo) e menor tempo de prova. Mostra o número do corredor e o check — sem pontos.' }
    : { rotulo: `Ranking da ${RK_W[wk].nome.toLowerCase()} · ${RK_W[wk].pontos}`, titulo: 'Ranking da semana', resumo: 'Quem fez o check-in da etapa (encerrou e ficou o tempo mínimo) e em quanto tempo. O número do corredor é fixo em toda a maratona.' }
  const period = isGeral ? 'Semanas 1 a 3 · simulados de 17/10, 24/10 e 31/10' : `${RK_W[wk].nome} · simulado em ${RK_W[wk].data} · ${RK_W[wk].pontos}`
  const trocarWk = (i: number) => { setWk(i); setPage(0) }
  // Dados REAIS: semana selecionada (ou geral). Paginação 10/pág; "Você" fixo embaixo quando fora da página.
  const view = (isGeral ? ranking?.geral : ranking?.semanas?.[wk]) ?? []
  const POR_PAG = 10
  const totalPaginas = Math.max(1, Math.ceil(view.length / POR_PAG))
  const pageSafe = Math.min(page, totalPaginas - 1)
  const pageItens = view.slice(pageSafe * POR_PAG, pageSafe * POR_PAG + POR_PAG)
  const eu = meuId ? (view.find((r) => r.estudanteId === meuId) ?? null) : null
  const euNaPagina = !!eu && pageItens.some((r) => r.estudanteId === eu!.estudanteId)
  const podium = view.slice(0, 3)
  const temDados = view.length > 0

  return (
    <div>
      {/* HEADER navy full-bleed (mesmo do Painel/Percurso): faixas diagonais + marca + conteúdo. */}
      <header style={{ position: 'relative', overflow: 'hidden', background: NAVY, color: '#fff' }}>
        <svg aria-hidden="true" viewBox="0 0 1440 460" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <g transform="rotate(-8 720 240)">
            <rect x="-200" y="150" width="1900" height="26" fill="#2E4FB0" />
            <rect x="-200" y="190" width="1900" height="26" fill="#2E4FB0" />
            <rect x="-200" y="230" width="1900" height="26" fill="#53308F" />
          </g>
        </svg>
        <div style={{ position: 'relative', padding: '24px 24px 72px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span style={kickerLt}>Maratona de simulados · ENAP + AGU</span>
            <img src="/maratona/logo-revisao.png" alt="Revisão Ensino Jurídico" style={{ height: 28, width: 'auto' }} />
          </div>
          <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ ...kickerLt, color: GOLD }}>{head.rotulo}</span>
              <h1 style={{ margin: 0, fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 52, lineHeight: 0.98 }}>{head.titulo}</h1>
              <p style={{ margin: 0, maxWidth: 560, fontSize: 15.5, lineHeight: 1.55, color: '#BCC8E0' }}>{head.resumo}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo sobreposto ao header (como no Painel) + padding lateral próprio. */}
      <div style={{ position: 'relative', marginTop: -48, padding: '0 24px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Tabs + período */}
      <section style={{ ...panelCard, padding: '16px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button key={t.i} type="button" onClick={() => trocarWk(t.i)} className="mxi-wk" data-on={t.i === wk ? '1' : '0'}>{t.label}</button>
          ))}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: MUT }}>{period}</span>
      </section>

      {!temDados ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <span style={{ fontSize: 14, color: MUT }}>A classificação aparece quando os alunos concluírem {isGeral ? 'os simulados' : 'o simulado desta semana'}.</span>
        </Card>
      ) : (
        <>
          {/* Pódio (top 3 reais) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
            {podium.map((r, i) => {
              const first = i === 0
              const cardBg: CSSProperties = first ? { background: GOLD, color: NAVY, border: `2px solid ${GOLD}` } : { background: CARD, color: TEXT, border: `2px solid ${i === 1 ? INK : LINE}` }
              return (
                <div key={r.estudanteId} style={{ borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, ...cardBg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', fontSize: 40 }}>{r.posicao}º</span>
                    {r.estudanteId === meuId && <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: '1px', opacity: 0.85 }}>VOCÊ</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.estudanteId === meuId ? 'Você' : r.nome}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: `1px solid ${first ? 'rgba(7,26,63,.25)' : LINE}`, paddingTop: 12 }}>
                    <span style={{ fontFamily: MONO, fontSize: 14 }}>{fmtNum(r.numero) ? 'Nº ' + fmtNum(r.numero) : 'Nº —'}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: 14 }}>{r.checkin && <Check size={14} color={first ? NAVY : GOLD} />}{r.tempo}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Classificação (real) — paginada 10/pág, com "Você" fixo embaixo e controles início/voltar/avançar/pular. */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '20px 22px 12px' }}>
              <Kicker>Classificação</Kicker>
              <span style={{ fontFamily: MONO, fontSize: 12, color: MUT }}>{view.length} {view.length === 1 ? 'corredor' : 'corredores'}</span>
            </div>
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(0,1fr) 96px 88px 104px', gap: 8, padding: '10px 22px', background: NAVY, color: '#fff', borderBottom: `2px solid ${GOLD}`, fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
                <span>Pos.</span><span>Corredor</span>
                <span className="rk-hide">Nº</span>
                <span style={{ textAlign: 'right' }}>Check</span>
                <span className="rk-hide" style={{ textAlign: 'right' }}>Tempo</span>
              </div>
              {pageItens.map((r) => (
                <RankRow key={r.estudanteId} r={r} sou={r.estudanteId === meuId} />
              ))}
              {/* "Você" fixo (visualização rápida) quando está fora da página atual. */}
              {eu && !euNaPagina && (
                <>
                  <div style={{ padding: '6px 22px', background: CARD_SUB, fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: MUT, borderTop: `1px solid ${LINE}` }}>Sua posição</div>
                  <RankRow r={eu} sou />
                </>
              )}
            </div>
            <RankPager page={pageSafe} total={totalPaginas} onPage={setPage} />
          </Card>
        </>
      )}

      {/* Como a pontuação funciona + Calendário semanal */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
        <Card style={{ flex: '999 1 480px', minWidth: 0, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <Kicker>Como funciona o ranking</Kicker>
            <span style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 999, background: CARD_SUB, color: MUT, fontSize: 12 }}>Sem pontos · por check e tempo</span>
          </div>
          {[['Encerrar o 1º simulado', 'ganha o número de corredor (fixo)'], ['Permanecer o tempo mínimo da etapa (ex.: 20min)', 'check-in ✓ + selo dourado'], ['Classificação da etapa', 'quem tem check-in na frente, depois menor tempo'], ['Sem o tempo mínimo', 'sem check — selo fica cinza'], ['Pontuação', 'não há — vale o check e o tempo']].map(([t, v], j) => (
            <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
              <span style={{ fontSize: 14, lineHeight: 1.5, color: MUT }}>{t}</span>
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{v}</span>
            </div>
          ))}
        </Card>
        <Card style={{ flex: '1 1 380px', minWidth: 0, padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Kicker>Calendário semanal</Kicker>
          {RK_W.map((w, i) => {
            // Clicar numa semana direciona ao respectivo simulado (fazer / ver resultado).
            const acao = acaoSim(simulados, i)
            const rowSt: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 44, padding: '0 14px', borderRadius: 8, boxSizing: 'border-box', textDecoration: 'none', ...(i === wk ? { background: INK, color: '#fff' } : i < wk ? { background: CARD_SUB, color: TEXT } : { background: CARD, border: `1px solid ${LINE}`, color: MUT }) }
            const conteudo = (<>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{w.nome}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, textAlign: 'right' }}>{w.data} · KM {w.km.join(' / ')}</span>
            </>)
            return acao
              ? <Link key={i} href={acao.href} title={acao.label} style={{ ...rowSt, cursor: 'pointer' }}>{conteudo}</Link>
              : <div key={i} style={rowSt}>{conteudo}</div>
          })}
          <span style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: MUT }}>Ranking da semana fecha [domingo, 23h59] e é publicado [segunda, 10h]. O geral soma as semanas.</span>
        </Card>
      </div>
      </div>
    </div>
  )
}

/* ─────────── MEDALHAS + selos (PORTE do medalhas.html) ─────────── */
const MEDALHAS_PC: { n: number; txt: string }[] = [
  { n: 2, txt: 'Simulado 1 · 17/10 · AGU' },
  { n: 3, txt: 'Simulado 2 · 24/10 · PGF' },
  { n: 4, txt: 'Simulado 3 · 31/10 · passagem PGFN' },
  { n: 5, txt: 'Simulado 3 · 31/10 · chegada' },
]
// Medalha (índice em MEDALHAS_PC) → ÁREA de simulado (0..2). A 3ª e a 4ª (passagem/chegada) vêm do 3º simulado.
const MEDAL_AREA = [0, 1, 2, 2]
function Medalhas({ simulados, progresso = 0 }: { simulados?: (MaratonaSimuladoLink | null)[]; progresso?: number }) {
  // Medalha de KM CONQUISTADA = o aluno CONCLUIU o simulado daquela parada. Finisher = concluiu os 3 (chegada).
  const onMedalha = (i: number) => !!simulados?.[MEDAL_AREA[i] ?? 0]?.concluido
  const finisher = progresso >= 3 || !!simulados?.[2]?.concluido
  const qtd = MEDALHAS_PC.filter((_, i) => onMedalha(i)).length
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* Hero (texto sobre o fundo, como no protótipo) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
        <div style={{ minWidth: 0 }}>
          <Kicker>Gamificação · medalhas de km</Kicker>
          <h1 style={{ margin: '10px 0 10px', fontStretch: '125%', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 40, lineHeight: 1, color: INK_TX }}>Uma medalha a cada parada</h1>
          <p style={{ margin: 0, maxWidth: 820, fontSize: 14.5, lineHeight: 1.5, color: MUT }}>Três simulados, quatro medalhas. Partindo do Aeroporto: 17/10 chega à AGU (KM 21), 24/10 à PGF (KM 28) e 31/10 passa pela PGFN (KM 35) até a chegada no Ed. II da AGU (KM 42,195).</p>
          <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 700, color: INK_TX }}>{qtd} de {MEDALHAS_PC.length} medalhas conquistadas.</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 18px', borderRadius: 999, background: NAVY, border: `2px solid ${GOLD}` }}>
          <img src="/maratona/logo-revisao.png" alt="Revisão Ensino Jurídico" style={{ height: 24, width: 'auto' }} />
        </span>
      </div>

      {/* Medalhas — estado REAL por parada: dourada (conquistada) ou cinza/bloqueada (até concluir o simulado). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {MEDALHAS_PC.map((m, i) => {
          const on = onMedalha(i)
          const dark = i === 3
          return (
            <div key={m.n} style={{ position: 'relative', background: dark ? NAVY : CARD, borderRadius: 16, padding: '24px 12px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, border: `1px solid ${on ? (dark ? NAVY : LINE) : 'var(--mxi-line)'}`, ...(on ? {} : { opacity: 0.96 }) }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: 170 }}>
                <img src={medalSrc(m.n, on)} alt="" style={{ width: '100%', height: 'auto', objectFit: 'contain', ...(on ? {} : { filter: 'grayscale(1) opacity(.7)' }) }} />
                {!on && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: 'rgba(7,26,63,.72)', border: '2px solid rgba(255,255,255,.5)' }}><Lock size={18} color="#fff" /></span>
                  </span>
                )}
              </div>
              <span style={{ fontFamily: MONO, fontSize: 13, textAlign: 'center', color: dark ? '#CBB8FF' : MUT }}>{m.txt}</span>
              <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, letterSpacing: '.5px', ...(on ? { background: GOLD, color: NAVY } : { background: 'var(--mxi-bg)', color: MUT, border: `1px solid ${LINE}` }) }}>{on ? 'CONQUISTADA' : 'BLOQUEADA'}</span>
            </div>
          )
        })}
      </div>
      <span style={{ fontSize: 13, color: MUT }}>As medalhas cinza liberam assim que você <b style={{ color: INK_TX }}>concluir o simulado</b> daquela parada.</span>

      {/* Selos próprios da maratona: Maratona (na inscrição — já liberado p/ quem tem acesso) + Finisher (na chegada). */}
      <div style={{ display: 'grid', gap: 12 }}>
        <Kicker>Selo da maratona e selo finisher</Kicker>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {([
            { img: 'selo-maratona.png', cap: 'Selo da Maratona · na inscrição', dark: false, on: true },
            { img: 'selo-finisher-42k.png', cap: 'Selo Finisher · na chegada', dark: true, on: finisher },
          ] as const).map((s) => (
            <div key={s.img} style={{ position: 'relative', background: s.dark ? NAVY : CARD, border: `1px solid ${s.dark ? NAVY : LINE}`, borderRadius: 16, padding: '30px 24px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
              <img src={`/maratona/${s.img}`} alt="" style={{ width: '100%', maxWidth: 300, aspectRatio: '1', objectFit: 'contain', ...(s.on ? {} : { filter: 'grayscale(1)', opacity: 0.45 }) }} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 13, letterSpacing: '.02em', textAlign: 'center', color: s.dark ? '#CBB8FF' : MUT }}>
                {s.on ? <Medal size={15} color={GOLD} /> : <Lock size={14} />}{s.cap}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const CSS = `
.mxi-tab { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 14px; border-radius:9px; border:0; background:transparent; color:#BCC8E0; font:inherit; font-size:12.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; cursor:pointer; white-space:nowrap; }
.mxi-tab:hover { color:#fff; }
.mxi-tab[data-on="1"] { background:#53308F; color:#fff; }
.mxi-back:hover { background:rgba(255,255,255,.2)!important; }
.mxi-pill { display:inline-flex; align-items:center; height:28px; padding:0 12px; border-radius:99px; font-size:12px; font-weight:800; letter-spacing:.04em; }
.mxi-wk { min-height:40px; padding:0 16px; border-radius:10px; cursor:pointer; font:inherit; font-weight:800; font-style:italic; text-transform:uppercase; font-size:12.5px; letter-spacing:1px; background:#fff; color:#071A3F; border:2px solid #CBD4E4; }
.mxi-wk[data-on="1"] { background:#2E4FB0; color:#fff; border-color:#2E4FB0; }
/* Container de rolagem próprio: altura = viewport menos a top bar do shell (72px desktop / 64px mobile).
   Assim a barra do desafio gruda no topo deste container, logo abaixo da barra do sistema. */
.mxi-root { height:calc(100dvh - 72px); overflow-y:auto;
  --mxi-bg:#E9EDF3; --mxi-card:#fff; --mxi-card-sub:#F4F7FC; --mxi-text:#071A3F; --mxi-ink:#1A367C; --mxi-mut:#3B4866; --mxi-line:#CBD4E4; }
/* Tema ESCURO: fundo/cards/texto/borda trocam; navy+dourado (marca) permanecem. */
.dark .mxi-root { --mxi-bg:#0a1122; --mxi-card:#121a30; --mxi-card-sub:#19233d; --mxi-text:#e7ebf5; --mxi-ink:#9db2e8; --mxi-mut:#9aa6c2; --mxi-line:#2a3450; }
.dark .mxi-root .mxi-wk { background:var(--mxi-card); color:var(--mxi-text); border-color:var(--mxi-line); }
.dark .mxi-root .mxi-wk[data-on="1"] { background:#2E4FB0; color:#fff; border-color:#2E4FB0; }
@media (max-width:720px){ .pn-step-name{display:none} }
@media (max-width:760px){ .rk-hide{display:none!important} }
@media (max-width:640px){ .mxi-root{ height:calc(100dvh - 64px); } }
`
