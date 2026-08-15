'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Check, Play, Star, Route, Zap, Trophy, CircleCheck, Download, Crown } from 'lucide-react'
import { BauTrilha } from '@/components/aluno/bau-trilha'

export interface TrilhaNode {
  id: string
  titulo: string
  quando: string | null
  estado: 'concluido' | 'atual' | 'disponivel'
  acerto: number | null
  nota: number | null
  tentativas: number
  statusLabel: string
  questoes: number
  xp: number
  href: string | null
  acao: string
  capa: string | null
  capaBanner: string | null
  cadernoUrl: string | null
}
export interface Trilha {
  id: string
  nome: string
  cor: string | null
  capa?: string | null // imagem LARGA do banco (capa_url) — fundo p/ trilhas de 1–3 simulados
  capaCard?: string | null // imagem NORMAL/inteira do banco (capa_card_url) — fundo p/ trilhas 4+
  total: number
  done: number
  trilhaXp: number
  bauResgatado?: boolean // baú já resgatado (evento de chest no ledger) — vem do servidor
  nodes: TrilhaNode[]
}

const COR = 'var(--brand-primary, var(--primary))'
// Roxo dos botões dos cards de simulado de baixo (card-simulado.tsx: s.vis?.cor ?? '#6d28d9').
const BTN = '#6d28d9'

// Imagem de fundo de uma trilha (mesma regra na Início e na trilha gigante):
// > 3 ícones de simulado (o baú NÃO é um nó, então não conta) → imagem NORMAL/inteira do banco
// (capa_card_url); 1–3 → imagem LARGA/comprida (capa_url). Com fallback pelo banner dos nós.
function capaFundoTrilha(t: Trilha): string | null {
  const larga = t.capa ?? t.nodes.find((n) => n.capaBanner)?.capaBanner ?? null
  const normal = t.capaCard ?? t.nodes.find((n) => n.capa)?.capa ?? null
  return t.nodes.length > 3 ? (normal ?? larga) : (larga ?? normal)
}

// Fecha o card lateral ao clicar fora dele (ignora cliques em nós, que trocam o card aberto).
function useCliqueForaFechar(ativo: boolean, setAberto: (v: null) => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ativo) return
    const onDown = (e: MouseEvent) => {
      const el = ref.current, t = e.target as HTMLElement
      if (el && el.contains(t)) return
      if (t.closest('[data-trilha-node]')) return
      setAberto(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [ativo, setAberto])
  return ref
}

// Card de um simulado. No hover: a info desliza (animada) até a esquerda e as ações surgem à direita.
function NodeCard({ n, gamAtivo }: { n: TrilhaNode; gamAtivo: boolean }) {
  const infoRef = useRef<HTMLDivElement>(null)
  const [dx, setDx] = useState(0)
  const concluido = n.estado === 'concluido'
  const atual = n.estado === 'atual'
  const meta = [n.quando, n.questoes > 0 ? `${n.questoes} questões` : null].filter(Boolean).join(' · ')

  function enter() {
    const el = infoRef.current
    if (el) setDx(-Math.max(0, el.offsetLeft - 16)) // desloca a info até ~16px da borda esquerda
  }
  const leave = () => setDx(0)

  const img = n.capaBanner
  const txtSec = img ? 'text-white/85' : 'text-muted-foreground'

  return (
    <div onMouseEnter={enter} onMouseLeave={leave}
      className={cn('group relative mb-4 mr-8 flex h-40 flex-1 items-center overflow-hidden rounded-2xl border px-5 text-center shadow-sm transition-all duration-200 hover:shadow-md motion-safe:hover:scale-[1.02]',
        img ? 'text-white' : 'bg-card', atual && 'border-primary/40')}>
      {/* Fundo: banner comprido do banco (capa_url, mesmo tamanho do card de personalizar) + degradê */}
      {img && (
        <>
          <img src={img} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-black/10" />
        </>
      )}

      {/* Info — centralizada; desliza suavemente para a esquerda no hover (medido + translateX) */}
      <div ref={infoRef} className={cn('relative mx-auto inline-block max-w-full text-left align-middle transition-transform duration-300 ease-out will-change-transform', img && '[text-shadow:0_1px_3px_rgba(0,0,0,0.7)]')} style={{ transform: `translateX(${dx}px)` }}>
        {atual && <span className="mb-1.5 inline-block rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">Comece aqui</span>}
        <div className="font-semibold leading-snug">{n.titulo}</div>
        <div className={cn('mt-1 text-xs', txtSec)}>
          {concluido ? <span className="inline-flex items-center gap-1"><CircleCheck className="h-3.5 w-3.5" /> Concluído</span> : (meta || 'Disponível')}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {concluido && n.acerto != null && <span className={cn('inline-flex items-center gap-1 text-sm font-medium', img ? 'text-white' : 'text-primary')}><CircleCheck className="h-4 w-4" /> {n.acerto}% de acerto</span>}
          {!concluido && gamAtivo && n.xp > 0 && <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', img ? 'bg-white/15 text-white' : 'border border-primary/40 text-primary')}><Zap className="h-3.5 w-3.5" /> +{n.xp} XP</span>}
          {n.tentativas > 0 && <span className={cn('rounded-full px-2 py-0.5 text-[11px]', img ? 'bg-white/15 text-white/85' : 'bg-muted text-muted-foreground')}>{n.tentativas}x</span>}
        </div>
      </div>

      {/* Ações — surgem no hover deslizando da direita */}
      <div className={cn('absolute inset-y-0 right-0 flex items-center gap-2.5 pl-14 pr-4 opacity-0 translate-x-4 transition-all duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100',
        img ? 'bg-gradient-to-l from-black/90 via-black/80 to-transparent' : 'bg-gradient-to-l from-card via-card to-transparent')}>
        {n.href && (
          <Link href={n.href} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
            <Play className="h-5 w-5" /> {n.acao}
          </Link>
        )}
        {n.cadernoUrl && (
          <a href={n.cadernoUrl} target="_blank" rel="noopener noreferrer" title="Baixar caderno de questões" aria-label="Baixar caderno de questões"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <Download className="h-5 w-5" />
          </a>
        )}
      </div>
    </div>
  )
}

// ── Design "caminho": trilha serpenteada (SVG curvo), nós clicáveis; card aparece no lado com mais espaço.
const LANE = 300, ROW = 150, R = 30, PAD = 34
const OFFS = [0, 66, 98, 66, 0, -66, -98, -66]

function TrilhaCaminho({ t, gamAtivo }: { t: Trilha; gamAtivo: boolean }) {
  // Início: nenhum card aberto ao entrar — só abre quando o aluno clica em um nó.
  const [aberto, setAberto] = useState<string | null>(null)
  const cx = (off: number) => LANE / 2 + off
  const pts = t.nodes.map((_, i) => ({ off: OFFS[i % OFFS.length], y: PAD + i * ROW + R }))
  const chest = { off: 0, y: PAD + t.nodes.length * ROW + R } // baú centralizado (não fica sob o card lateral)
  const height = chest.y + R + 48
  const allPts = [...pts, chest]
  const openIdx = t.nodes.findIndex((n) => n.id === aberto)
  const open = openIdx >= 0 ? t.nodes[openIdx] : null
  const openPt = openIdx >= 0 ? pts[openIdx] : null
  const side = openPt && openPt.off > 0 ? 'left' : 'right' // card no lado OPOSTO à curva (mais espaço)
  const cardRef = useCliqueForaFechar(!!open, setAberto)
  // Card centralizado no nó + seta apontando dinamicamente p/ o nó (mede a altura real do card).
  const [cardH, setCardH] = useState(240)
  useEffect(() => { if (open && cardRef.current) setCardH(cardRef.current.offsetHeight) }, [open?.id])
  const cardTop = openPt ? Math.max(0, Math.min(openPt.y - cardH / 2, height - cardH)) : 0
  const arrowY = openPt ? Math.max(24, Math.min(openPt.y - cardTop, cardH - 24)) : 0

  return (
    <div className="relative mx-auto" style={{ width: LANE, height }}>
      {/* Conectores em curva */}
      <svg className="absolute left-0 top-0" width={LANE} height={height} aria-hidden>
        {allPts.slice(0, -1).map((p, i) => {
          const n = allPts[i + 1]
          const x0 = cx(p.off), y0 = p.y, x1 = cx(n.off), y1 = n.y, m = (y0 + y1) / 2
          const done = t.nodes[i]?.estado === 'concluido'
          return <path key={i} d={`M ${x0} ${y0} C ${x0} ${m}, ${x1} ${m}, ${x1} ${y1}`} fill="none" strokeWidth={6} strokeLinecap="round" strokeDasharray="0.1 16" stroke={done ? COR : 'var(--border)'} />
        })}
      </svg>

      {/* Nós */}
      {t.nodes.map((n, i) => {
        const p = pts[i]
        const concluido = n.estado === 'concluido'
        const ouro = concluido && n.acerto === 100   // 100% → tema dourado + coroa
        const atual = n.estado === 'atual'
        const sel = n.id === aberto
        return (
          <div key={n.id} data-trilha-item className="absolute -translate-x-1/2 text-center" style={{ left: cx(p.off), top: p.y - R, width: 200, marginLeft: 0 }}>
            <button type="button" data-trilha-node onClick={() => setAberto(n.id)} aria-label={n.titulo}
              className={cn('relative mx-auto flex items-center justify-center rounded-full border-4 shadow-sm transition-transform hover:scale-105 focus:outline-none', sel && 'ring-4 ring-primary/25')}
              style={{ width: R * 2, height: R * 2, ...(ouro ? { background: 'radial-gradient(circle at 50% 36%, #ffe680 0%, #ffcf33 46%, #f0b000 78%, #d99200 100%)', borderColor: '#c07f08', color: '#c2680a', boxShadow: '0 0 13px 2px rgba(250,204,21,.5), 0 0 28px 6px rgba(250,204,21,.22), 0 6px 16px -5px rgba(217,119,6,.55)' }
                : concluido ? { background: '#10b981', borderColor: '#059669', color: '#fff' }
                : atual ? { background: `color-mix(in oklab, ${COR} 16%, var(--card))`, borderColor: COR, color: COR }
                : { background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
              {atual && <span className="pointer-events-none absolute inset-[-5px] rounded-full border-2 opacity-60 motion-safe:animate-ping" style={{ borderColor: COR }} />}
              {ouro && (<>
                <Crown className="pointer-events-none absolute -top-[23px] left-1/2 h-[26px] w-[22px] -translate-x-1/2" fill="#ffd24a" strokeWidth={1.75} style={{ color: '#a75d09', filter: 'drop-shadow(0 1px 2px rgba(90,45,0,.5)) drop-shadow(0 0 5px rgba(250,204,21,.55))' }} />
                <span className="pointer-events-none absolute inset-[4px] rounded-full" style={{ background: 'radial-gradient(circle at 50% 34%, #fff2b0 0%, #ffd93b 44%, #f2b800 100%)', boxShadow: 'inset 0 -3px 6px rgba(170,105,10,.5), inset 0 2px 3px rgba(255,255,255,.7)' }} />
                <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"><span className="absolute inset-0" style={{ background: 'linear-gradient(122deg, transparent 30%, rgba(255,255,255,.7) 44%, rgba(255,255,255,.2) 55%, transparent 67%)' }} /></span>
              </>)}
              <span className="relative" style={ouro ? { color: '#c2680a' } : undefined}>{concluido ? <Check className="h-7 w-7" strokeWidth={ouro ? 3.25 : 2.5} /> : atual ? <Star className="h-7 w-7" /> : <Play className="h-6 w-6" />}</span>
            </button>
            {/* Rótulo com fundo próprio p/ não se misturar ao pontilhado que passa atrás. */}
            <div className="relative z-[1] mt-1.5 inline-block max-w-full rounded-lg border bg-background/85 px-2 py-0.5 shadow-sm backdrop-blur-sm">
              <span className="block text-xs font-semibold leading-snug">{n.titulo}</span>
              <span className="block text-[11px] text-muted-foreground">
                {concluido ? `Concluído${n.acerto != null ? ` · ${n.acerto}%` : ''}` : (n.quando ?? 'Disponível')}
              </span>
            </div>
          </div>
        )
      })}

      {/* Baú resgatável — liberado quando todos os simulados da trilha estão concluídos */}
      <div className="absolute z-[3] -translate-x-1/2" style={{ left: cx(chest.off), top: chest.y - R, width: 200 }}>
        <BauTrilha grupoId={t.id} xp={t.trilhaXp} liberado={t.total > 0 && t.done >= t.total} gamAtivo={gamAtivo} resgatadoServidor={t.bauResgatado ?? false} />
      </div>

      {/* Card do simulado — no lado com mais espaço, alinhado ao nó */}
      {open && openPt && (
        <div ref={cardRef} key={open.id} className="group/card absolute z-10 w-[400px] transition-transform duration-200 will-change-transform motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:hover:scale-[1.03]"
          style={{ top: cardTop, ...(side === 'right' ? { left: LANE + 20 } : { right: LANE + 20 }) }}>
          <span className={cn('absolute h-3 w-3 rotate-45 border bg-card', side === 'right' ? '-left-1.5 border-b-0 border-r-0' : '-right-1.5 border-l-0 border-t-0')} style={{ top: arrowY - 6 }} />
          <div className={cn('overflow-hidden rounded-2xl border bg-card shadow-xl motion-safe:animate-[trilha-card-pulse_2.2s_ease-in-out_infinite]', open.estado === 'atual' && 'border-primary/40')}>
            {open.capaBanner && <div className="relative h-28"><img src={open.capaBanner} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" /></div>}
            <div className="space-y-2 p-4">
              <div className="font-semibold leading-tight">{open.titulo}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {open.estado === 'concluido' ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CircleCheck className="h-3.5 w-3.5" /> Concluído</span>
                  : [open.quando, open.questoes > 0 ? `${open.questoes} questões` : null].filter(Boolean).join(' · ')}
                {open.acerto != null && <span className="inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> {open.acerto}%</span>}
                {gamAtivo && open.xp > 0 && open.estado !== 'concluido' && <span className="inline-flex items-center gap-1 font-semibold text-primary"><Zap className="h-3.5 w-3.5" /> +{open.xp} XP</span>}
                {open.estado === 'atual' && <span className="inline-flex items-center rounded-full border border-primary/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Comece aqui</span>}
              </div>
              {open.href && (
                <div className="mt-1 flex items-center gap-2">
                  <Link href={open.href} style={{ ['--btn' as any]: BTN }}
                    className="group/btn relative inline-flex flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-xl border-[1.5px] border-[var(--btn)] px-4 py-2 text-sm font-semibold text-[var(--btn)] transition-all duration-300 hover:scale-[1.02] hover:text-white">
                    <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100" style={{ background: `linear-gradient(135deg, ${BTN}, color-mix(in oklab, ${BTN} 72%, #000))` }} />
                    <span className="relative z-10 inline-flex items-center gap-1.5">{open.estado === 'atual' && <Play className="h-4 w-4" />}{open.acao}</span>
                  </Link>
                  {open.cadernoUrl && (
                    <a href={open.cadernoUrl} target="_blank" rel="noopener noreferrer" title="Baixar caderno de questões" aria-label="Baixar caderno de questões"
                      className="group/dl relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border-[1.5px] border-muted-foreground/40 text-muted-foreground transition-all hover:scale-[1.03] hover:border-white hover:text-white">
                      <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/dl:opacity-100" style={{ background: 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)' }} />
                      <Download className="relative z-10 h-4 w-4 transition-colors" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function TrilhaSimulados({ trilhas, gamAtivo, estilo = 'cards', visiveis = 3 }: { trilhas: Trilha[]; gamAtivo: boolean; estilo?: 'cards' | 'caminho'; visiveis?: number }) {
  const caminho = estilo === 'caminho'
  const [ativa, setAtiva] = useState(trilhas[0]?.id)
  const t = trilhas.find((x) => x.id === ativa) ?? trilhas[0]
  const rolar = t ? visiveis > 0 && t.nodes.length > visiveis : false

  // Altura animada: mostra `visiveis` simulados (0 = todos) medindo o N-ésimo nó; transiciona
  // ao trocar de trilha/estilo em vez de "pular" seco.
  const olRef = useRef<HTMLDivElement>(null)
  const [maxH, setMaxH] = useState<number | null>(null)
  useEffect(() => {
    const el = olRef.current
    if (!el) return
    const medir = () => {
      if (visiveis <= 0) { setMaxH(el.scrollHeight); return }
      const items = el.querySelectorAll('[data-trilha-item]')
      if (items.length <= visiveis) { setMaxH(el.scrollHeight); return }
      const nth = items[visiveis] as HTMLElement
      const h = nth.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop + 28 // + "pedaço" do próximo
      setMaxH(Math.round(h))
    }
    medir()
    const raf = requestAnimationFrame(medir)
    window.addEventListener('resize', medir)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', medir) }
  }, [ativa, estilo, visiveis, t?.nodes.length])

  if (!t) return null
  const pct = t.total ? Math.round((t.done / t.total) * 100) : 0

  // Mesma imagem/regra da trilha gigante, agora por trilha na Início.
  const capaFundo = capaFundoTrilha(t)

  return (
    <section data-tour="trilha" className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight"><Route className="h-5 w-5 text-primary" /> Trilhas de simulados</h2>
        <p className="text-sm text-muted-foreground">Todos os simulados ficam disponíveis — faça na ordem que quiser.</p>
      </div>

      {trilhas.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {trilhas.map((tr) => (
            <button key={tr.id} type="button" onClick={() => setAtiva(tr.id)}
              className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                tr.id === t.id ? 'border-primary/40 bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {tr.nome}
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', tr.id === t.id ? 'bg-primary/20 text-primary' : 'bg-muted')}>{tr.done}/{tr.total}</span>
            </button>
          ))}
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span><span className="font-medium text-foreground">{t.nome}</span> · {t.done}/{t.total} concluídos</span>
          {gamAtivo && t.trilhaXp > 0 && <span>recompensa da trilha: <span className="font-semibold text-primary">+{t.trilhaXp} XP</span></span>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: COR }} />
        </div>
      </div>

      <div className="relative">
        {/* Fundo cinza sutil + fade na base (quebra a divisão com a divisória de baixo). */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl" style={{ background: 'color-mix(in oklab, var(--muted) 68%, transparent)', WebkitMaskImage: 'linear-gradient(180deg, #000 0%, #000 80%, transparent 100%)', maskImage: 'linear-gradient(180deg, #000 0%, #000 80%, transparent 100%)' }} />
        <div ref={olRef} className="trilha-scroll relative z-[1] min-w-0 overflow-y-auto py-2 pr-1 transition-[max-height] duration-700 ease-out" style={{ maxHeight: maxH ?? undefined }}>
        <div key={ativa} className="relative min-w-0 space-y-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700">
          {/* Imagem de fundo do banco (mesma regra/imagem da trilha gigante), DENTRO do conteúdo →
              acompanha o rolamento. Cobre toda a altura da trilha; fade lateral + topo/base. */}
          {capaFundo && (
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl" style={{ WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 2%, #000 98%, transparent 100%)', maskImage: 'linear-gradient(to right, transparent 0%, #000 2%, #000 98%, transparent 100%)' }}>
              <img src={capaFundo} alt="" loading="lazy" decoding="async" className="h-full w-full scale-105 object-cover object-[center_30%] opacity-100 blur-[5px] dark:opacity-[0.75]" style={{ WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 32px, #000 calc(100% - 22px), transparent 100%)', maskImage: 'linear-gradient(to bottom, transparent 0, #000 32px, #000 calc(100% - 22px), transparent 100%)' }} />
            </div>
          )}
          {caminho ? (
            <TrilhaCaminho t={t} gamAtivo={gamAtivo} />
          ) : (<>
          {t.nodes.map((n, i) => {
            const concluido = n.estado === 'concluido'
            const ouro = concluido && n.acerto === 100
            const atual = n.estado === 'atual'
            return (
              <div key={n.id} data-trilha-item className="flex gap-4">
                <div className="flex flex-col items-center pt-3">
                  <span className="relative flex shrink-0 items-center justify-center rounded-full border-4 shadow-sm"
                    style={{ width: 52, height: 52, ...(ouro ? { background: 'radial-gradient(circle at 50% 36%, #ffe680 0%, #ffcf33 46%, #f0b000 78%, #d99200 100%)', borderColor: '#c07f08', color: '#c2680a', boxShadow: '0 0 11px 2px rgba(250,204,21,.5), 0 5px 14px -5px rgba(217,119,6,.55)' }
                      : concluido ? { background: '#10b981', borderColor: '#059669', color: '#fff' }
                      : atual ? { background: `color-mix(in oklab, ${COR} 16%, var(--card))`, borderColor: COR, color: COR }
                      : { background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
                    {atual && <span className="pointer-events-none absolute inset-[-5px] rounded-full border-2 opacity-60 motion-safe:animate-ping" style={{ borderColor: COR }} />}
                    {ouro && (<>
                      <Crown className="pointer-events-none absolute -top-[19px] left-1/2 h-[22px] w-[19px] -translate-x-1/2" fill="#ffd24a" strokeWidth={1.75} style={{ color: '#a75d09', filter: 'drop-shadow(0 1px 2px rgba(90,45,0,.5)) drop-shadow(0 0 4px rgba(250,204,21,.55))' }} />
                      <span className="pointer-events-none absolute inset-[3px] rounded-full" style={{ background: 'radial-gradient(circle at 50% 34%, #fff2b0 0%, #ffd93b 44%, #f2b800 100%)', boxShadow: 'inset 0 -2px 5px rgba(170,105,10,.5), inset 0 2px 3px rgba(255,255,255,.7)' }} />
                      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"><span className="absolute inset-0" style={{ background: 'linear-gradient(122deg, transparent 30%, rgba(255,255,255,.7) 44%, rgba(255,255,255,.2) 55%, transparent 67%)' }} /></span>
                    </>)}
                    <span className="relative" style={ouro ? { color: '#c2680a' } : undefined}>{concluido ? <Check className="h-6 w-6" strokeWidth={ouro ? 3 : 2.5} /> : atual ? <Star className="h-6 w-6" /> : <Play className="h-5 w-5" />}</span>
                  </span>
                  {i < t.nodes.length - 1 && <span className="my-1 flex-1" style={{ width: 6, minHeight: 24, backgroundImage: `radial-gradient(circle, ${concluido ? '#10b981' : 'var(--border)'} 40%, transparent 44%)`, backgroundSize: '6px 12px', backgroundRepeat: 'repeat-y' }} />}
                </div>

                <NodeCard n={n} gamAtivo={gamAtivo} />
              </div>
            )
          })}

          <div className="flex items-center gap-4">
            <div className="flex w-[52px] justify-center">
              <span className="flex items-center justify-center rounded-full border-4" style={{ width: 48, height: 48, ...(t.done >= t.total ? { background: 'var(--brand-accent, #f59e0b)', borderColor: 'color-mix(in oklab, var(--brand-accent, #f59e0b) 70%, #000)', color: '#fff' } : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
                <Trophy className="h-5 w-5" />
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{t.done >= t.total ? 'Trilha concluída! 🎉' : `Conclua os ${t.total} para o troféu da trilha.`}</span>
          </div>
          </>)}
        </div>
        </div>
        {rolar && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-2xl bg-gradient-to-t from-background to-transparent" />}
      </div>
    </section>
  )
}

// ── Trilha GIGANTE: todas as trilhas em UM caminho serpenteado contínuo, dividido por grupo,
// com o pontilhado seguindo entre os grupos. Usado na página dedicada /aluno/trilha.
const GAP_HDR = 58   // altura reservada p/ a divisória (nome do grupo)
const GAP_GRUPO = 44 // respiro extra entre grupos (o pontilhado continua nele)

export function TrilhaGigante({ trilhas, gamAtivo }: { trilhas: Trilha[]; gamAtivo: boolean }) {
  const flat = trilhas.flatMap((t) => t.nodes)
  const atualId = flat.find((n) => n.estado === 'atual')?.id ?? flat[0]?.id ?? null
  const [aberto, setAberto] = useState<string | null>(atualId)
  const cx = (off: number) => LANE / 2 + off

  // Trilha aberta: mais distância vertical entre os nós e zigue-zague mais largo na horizontal.
  // Só quando fica MUITO grande (>16 nós) encurta um pouco p/ não virar um comprimento absurdo.
  const compacto = flat.length > 16
  const rowH = compacto ? 138 : 172
  const AMP = compacto ? 132 : 154
  // Enrolamento orgânico tipo "estrada sinuosa": curvas fluidas e aparentemente aleatórias, porém
  // DETERMINÍSTICAS (mesmo traçado a cada render/SSR, sem Math.random) e coerentes — soma de senos
  // de frequências incomensuráveis + leve jitter por hash do índice, saturada p/ encostar nos
  // extremos e arredondar as voltas como as curvas da estrada.
  const hash = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
  const waveOff = (i: number) => {
    const base = 0.66 * Math.sin(i * 0.82 + 0.7) + 0.34 * Math.sin(i * 1.57 + 2.3)
    const jit = (hash(i) - 0.5) * 0.55
    return Math.round(Math.max(-1, Math.min(1, (base + jit) * 1.38)) * AMP)
  }
  // Tensão da spline (>1/6): deixa as voltas mais "gordas"/arredondadas, como as curvas da estrada.
  const SMOOTH = 0.22

  // Layout: percorre grupos empilhando divisória + nós, guardando as posições.
  const nodesL: { n: TrilhaNode; off: number; y: number }[] = []
  const dividers: { id: string; nome: string; done: number; total: number; y: number }[] = []
  // Fundo por grupo: capa INTEIRA do banco (capa_url); começa abaixo da divisória e termina antes da próxima.
  const segMeta: { id: string; capa: string | null; dy: number; total: number }[] = []
  let y = PAD, gi = 0
  trilhas.forEach((t, ti) => {
    if (ti > 0) y += GAP_GRUPO
    const dy = y
    dividers.push({ id: t.id, nome: t.nome, done: t.done, total: t.total, y: dy })
    y += GAP_HDR
    if (t.nodes.length === 1) {
      // Grupo com um único simulado → segue o mesmo meandro lateral (waveOff) p/ acompanhar as
      // curvas acentuadas da trilha, e fica verticalmente centralizado na faixa do grupo
      // (espaço simétrico acima/abaixo).
      const VPAD = 66
      y += VPAD
      nodesL.push({ n: t.nodes[0], off: waveOff(gi), y: y + R })
      y += 2 * R + VPAD
      gi++
    } else {
      t.nodes.forEach((n) => {
        const off = waveOff(gi)
        nodesL.push({ n, off, y: y + R })
        // Regra anti-colisão: o passo vertical nunca deixa o rótulo (título + linha de status)
        // deste nó alcançar o ícone do próximo — cresce conforme o texto ocupa mais linhas.
        const linhas = Math.min(2, Math.max(1, Math.ceil((n.titulo?.length ?? 0) / 20)))
        const alturaRotulo = 46 + (linhas - 1) * 16
        const passoMin = 2 * R + alturaRotulo + 22
        y += Math.max(rowH, passoMin)
        gi++
      })
    }
    segMeta.push({ id: t.id, capa: capaFundoTrilha(t), dy, total: t.total })
  })
  // Baú SEMPRE centralizado (off 0): é só o marcador de fim e, no centro, nunca fica sob o card
  // lateral do último simulado (que abre em LANE+20).
  const chest = { off: 0, y: y + R }
  const segmentos = segMeta.map((s, i) => ({
    id: s.id, capa: s.capa,
    yTop: s.dy + 20,                                                        // logo abaixo da divisória do grupo
    yBot: (i < segMeta.length - 1 ? segMeta[i + 1].dy - 4 : chest.y - 24),   // quase encostando na próxima divisória (ou no baú)
  }))
  const height = chest.y + R + 48
  const allPts = [...nodesL.map((x) => ({ off: x.off, y: x.y, estado: x.n.estado })), { off: chest.off, y: chest.y, estado: 'disponivel' as const }]

  const openL = nodesL.find((x) => x.n.id === aberto) ?? null
  const open = openL?.n ?? null
  const openPt = openL ? { off: openL.off, y: openL.y } : null
  const side = openPt && openPt.off > 0 ? 'left' : 'right'
  const cardRef = useCliqueForaFechar(!!open, setAberto)
  // Card centralizado no nó + seta apontando dinamicamente p/ o nó (mede a altura real do card).
  // Quando o card encosta na borda (nó no topo/base), a seta desliza para continuar apontando.
  const [cardH, setCardH] = useState(240)
  useEffect(() => { if (open && cardRef.current) setCardH(cardRef.current.offsetHeight) }, [open?.id])
  const cardTop = openPt ? Math.max(0, Math.min(openPt.y - cardH / 2, height - cardH)) : 0
  const arrowY = openPt ? Math.max(24, Math.min(openPt.y - cardTop, cardH - 24)) : 0

  // Mede a largura da coluna p/ as capas de fundo chegarem quase às bordas.
  const rootRef = useRef<HTMLDivElement>(null)
  const [larguraCol, setLarguraCol] = useState(0)
  useEffect(() => {
    const el = rootRef.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(() => setLarguraCol(el.clientWidth))
    ro.observe(el)
    setLarguraCol(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const coverW = larguraCol > LANE ? Math.min(larguraCol - 4, 1600) : LANE

  if (!nodesL.length) return null

  return (
    <div ref={rootRef} className="relative mx-auto" style={{ width: LANE, height }}>
      {/* Fundo por grupo — capa do banco (quase às bordas), quadrada com fade em todas as bordas */}
      {segmentos.map((s) => s.capa && (
        <div key={s.id} className="pointer-events-none absolute left-1/2 z-0 -translate-x-1/2 overflow-hidden" style={{ top: s.yTop, height: Math.max(0, s.yBot - s.yTop), width: coverW, WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 2%, #000 98%, transparent 100%)', maskImage: 'linear-gradient(to right, transparent 0%, #000 2%, #000 98%, transparent 100%)' }}>
          <img src={s.capa} alt="" loading="lazy" decoding="async" className="h-full w-full scale-105 object-cover object-[center_30%] opacity-100 blur-[5px] dark:opacity-[0.75]" style={{ WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 32px, #000 calc(100% - 22px), transparent 100%)', maskImage: 'linear-gradient(to bottom, transparent 0, #000 32px, #000 calc(100% - 22px), transparent 100%)' }} />
        </div>
      ))}
      {/* Conectores pontilhados — spline Catmull-Rom contínua (C1): curva fluida que passa por
          cada ícone entrando/saindo pelas laterais, em vez de subir/descer reto. Cada segmento é
          um path próprio p/ manter a cor (concluído x pendente), mas as tangentes são compartilhadas
          com os vizinhos → sem "quebras" nas junções. */}
      <svg className="absolute left-0 top-0 overflow-visible" width={LANE} height={height} aria-hidden>
        {allPts.slice(0, -1).map((p, i) => {
          const P0 = allPts[i - 1] ?? p
          const P2 = allPts[i + 1]
          const P3 = allPts[i + 2] ?? P2
          const x1 = cx(p.off), y1 = p.y, x2 = cx(P2.off), y2 = P2.y
          const c1x = x1 + (cx(P2.off) - cx(P0.off)) * SMOOTH, c1y = y1 + (P2.y - P0.y) * SMOOTH
          const c2x = x2 - (cx(P3.off) - cx(p.off)) * SMOOTH, c2y = y2 - (P3.y - p.y) * SMOOTH
          const done = p.estado === 'concluido'
          return <path key={i} d={`M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`} fill="none" strokeWidth={6} strokeLinecap="round" strokeDasharray="0.1 16" stroke={done ? COR : 'var(--border)'} />
        })}
      </svg>

      {/* Divisórias de grupo — destacadas: pílula (card + borda da marca + sombra), nome forte e
          contador em chip sólido; linhas mais grossas e tingidas pela marca. */}
      {dividers.map((d) => (
        <div key={d.id} className="absolute left-1/2 z-[2] -translate-x-1/2" style={{ top: d.y, width: 580 }}>
          <div className="flex items-center gap-3">
            <span className="h-[3px] flex-1 rounded-full" style={{ background: 'linear-gradient(to right, transparent, color-mix(in oklab, var(--brand-primary, var(--primary)) 48%, transparent))' }} />
            <span className="inline-flex max-w-[360px] items-center gap-2.5 whitespace-nowrap rounded-full bg-card px-4 py-1.5 shadow-md" title={d.nome}>
              <span className="truncate text-base font-extrabold tracking-tight text-foreground">{d.nome}</span>
              <span className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums text-white" style={{ background: COR }}>{d.done}/{d.total}</span>
            </span>
            <span className="h-[3px] flex-1 rounded-full" style={{ background: 'linear-gradient(to left, transparent, color-mix(in oklab, var(--brand-primary, var(--primary)) 48%, transparent))' }} />
          </div>
        </div>
      ))}

      {/* Nós */}
      {nodesL.map(({ n, off, y: cyv }) => {
        const concluido = n.estado === 'concluido'
        const ouro = concluido && n.acerto === 100   // nota 100% → tema dourado + coroa
        const atual = n.estado === 'atual'
        const bloqueado = n.estado === 'disponivel'
        const sel = n.id === aberto
        return (
          <div key={n.id} className="absolute z-[1] flex w-max max-w-[260px] -translate-x-1/2 flex-col items-center text-center" style={{ left: cx(off), top: cyv - R }}>
            <button type="button" data-trilha-node onClick={() => setAberto(n.id)} aria-label={n.titulo}
              className={cn('relative flex items-center justify-center rounded-full border-4 shadow-sm transition-transform hover:scale-105 focus:outline-none', sel && 'ring-4 ring-primary/25')}
              style={{ width: R * 2, height: R * 2, ...(ouro ? { background: 'radial-gradient(circle at 50% 36%, #ffe680 0%, #ffcf33 46%, #f0b000 78%, #d99200 100%)', borderColor: '#c07f08', color: '#c2680a', boxShadow: '0 0 13px 2px rgba(250,204,21,.5), 0 0 28px 6px rgba(250,204,21,.22), 0 6px 16px -5px rgba(217,119,6,.55)' }
                : concluido ? { background: '#10b981', borderColor: '#059669', color: '#fff' }
                : atual ? { background: `color-mix(in oklab, ${COR} 16%, var(--card))`, borderColor: COR, color: COR }
                : { background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
              {atual && <span className="pointer-events-none absolute inset-[-5px] rounded-full border-2 opacity-60 motion-safe:animate-ping" style={{ borderColor: COR }} />}
              {ouro && (<>
                {/* Coroa (só 100%) — flutua acima da moeda, dourada com contorno âmbar e leve glow */}
                <Crown className="pointer-events-none absolute -top-[23px] left-1/2 h-[26px] w-[22px] -translate-x-1/2" fill="#ffd24a" strokeWidth={1.75} style={{ color: '#a75d09', filter: 'drop-shadow(0 1px 2px rgba(90,45,0,.5)) drop-shadow(0 0 5px rgba(250,204,21,.55))' }} />
                {/* Disco interno da moeda (mais claro, com relevo) */}
                <span className="pointer-events-none absolute inset-[4px] rounded-full" style={{ background: 'radial-gradient(circle at 50% 34%, #fff2b0 0%, #ffd93b 44%, #f2b800 100%)', boxShadow: 'inset 0 -3px 6px rgba(170,105,10,.5), inset 0 2px 3px rgba(255,255,255,.7)' }} />
                {/* Faixa de brilho diagonal (verniz), recortada no círculo */}
                <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"><span className="absolute inset-0" style={{ background: 'linear-gradient(122deg, transparent 30%, rgba(255,255,255,.7) 44%, rgba(255,255,255,.2) 55%, transparent 67%)' }} /></span>
              </>)}
              <span className="relative" style={ouro ? { color: '#c2680a' } : undefined}>{concluido ? <Check className="h-7 w-7" strokeWidth={ouro ? 3.25 : 2.5} /> : atual ? <Star className="h-7 w-7" /> : <Play className="h-6 w-6" />}</span>
            </button>
            {/* Rótulo cresce lateralmente (largura por conteúdo, teto 260px); título no máx. 2 linhas. */}
            <div className="relative z-[1] mt-1.5 inline-block max-w-full rounded-lg border bg-background/85 px-2 py-0.5 shadow-sm backdrop-blur-sm">
              <span className={cn('block text-xs font-semibold leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden', bloqueado && 'text-muted-foreground')} title={n.titulo}>{n.titulo}</span>
              <span className="block text-[11px] text-muted-foreground">
                {concluido ? `Concluído${n.acerto != null ? ` · ${n.acerto}%` : ''}` : (n.quando ?? 'Disponível')}
              </span>
            </div>
          </div>
        )
      })}

      {/* Baú final */}
      <div className="absolute z-[1] -translate-x-1/2 text-center" style={{ left: cx(chest.off), top: chest.y - R, width: 220 }}>
        <span className="mx-auto flex items-center justify-center rounded-2xl border-4" style={{ width: 56, height: 56, background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
          <Trophy className="h-6 w-6" />
        </span>
        <div className="mt-1.5 inline-block rounded-lg border bg-background/85 px-2 py-0.5 shadow-sm backdrop-blur-sm">
          <span className="block text-xs font-semibold">Mais simulados em breve</span>
          <span className="block text-[11px] text-muted-foreground">Fique de olho — novos simulados chegam aqui.</span>
        </div>
      </div>

      {/* Card do simulado — no lado com mais espaço, alinhado ao nó */}
      {open && openPt && (
        <div ref={cardRef} key={open.id} className="group/card absolute z-10 w-[400px] transition-transform duration-200 will-change-transform motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:hover:scale-[1.03]"
          style={{ top: cardTop, ...(side === 'right' ? { left: LANE + 20 } : { right: LANE + 20 }) }}>
          <span className={cn('absolute h-3 w-3 rotate-45 border bg-card', side === 'right' ? '-left-1.5 border-b-0 border-r-0' : '-right-1.5 border-l-0 border-t-0')} style={{ top: arrowY - 6 }} />
          <div className={cn('overflow-hidden rounded-2xl border bg-card shadow-xl motion-safe:animate-[trilha-card-pulse_2.2s_ease-in-out_infinite]', open.estado === 'atual' && 'border-primary/40')}>
            {open.capaBanner && <div className="relative h-28"><img src={open.capaBanner} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" /></div>}
            <div className="space-y-2 p-4">
              <div className="font-semibold leading-tight">{open.titulo}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {open.estado === 'concluido' ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CircleCheck className="h-3.5 w-3.5" /> Concluído</span>
                  : [open.quando, open.questoes > 0 ? `${open.questoes} questões` : null].filter(Boolean).join(' · ')}
                {open.acerto != null && <span className="inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> {open.acerto}%</span>}
                {gamAtivo && open.xp > 0 && open.estado !== 'concluido' && <span className="inline-flex items-center gap-1 font-semibold text-primary"><Zap className="h-3.5 w-3.5" /> +{open.xp} XP</span>}
                {open.estado === 'atual' && <span className="inline-flex items-center rounded-full border border-primary/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Comece aqui</span>}
              </div>
              {open.href && (
                <div className="mt-1 flex items-center gap-2">
                  <Link href={open.href} style={{ ['--btn' as any]: BTN }}
                    className="group/btn relative inline-flex flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-xl border-[1.5px] border-[var(--btn)] px-4 py-2 text-sm font-semibold text-[var(--btn)] transition-all duration-300 hover:scale-[1.02] hover:text-white">
                    <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100" style={{ background: `linear-gradient(135deg, ${BTN}, color-mix(in oklab, ${BTN} 72%, #000))` }} />
                    <span className="relative z-10 inline-flex items-center gap-1.5">{open.estado === 'atual' && <Play className="h-4 w-4" />}{open.acao}</span>
                  </Link>
                  {open.cadernoUrl && (
                    <a href={open.cadernoUrl} target="_blank" rel="noopener noreferrer" title="Baixar caderno de questões" aria-label="Baixar caderno de questões"
                      className="group/dl relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border-[1.5px] border-muted-foreground/40 text-muted-foreground transition-all hover:scale-[1.03] hover:border-white hover:text-white">
                      <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/dl:opacity-100" style={{ background: 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)' }} />
                      <Download className="relative z-10 h-4 w-4 transition-colors" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
