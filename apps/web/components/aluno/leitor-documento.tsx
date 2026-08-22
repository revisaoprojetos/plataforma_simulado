'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, ScrollText, BookOpen, ChevronLeft, ChevronRight, Minus, Plus,
  Sun, Moon, Coffee, CheckCircle2, Loader2, X, PanelLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DocumentoCarregado } from '@/lib/leitura/acesso'

type Modo = 'scroll' | 'flip'
type Tema = 'claro' | 'sepia' | 'escuro'
interface Secao { id: string; art: number; label: string }

const TEMAS: Record<Tema, { bg: string; fg: string; muted: string }> = {
  claro: { bg: '#ffffff', fg: '#1f2937', muted: '#6b7280' },
  sepia: { bg: '#f5ecd9', fg: '#4b3f2f', muted: '#8a7a5c' },
  escuro: { bg: '#1a1a1e', fg: '#d8d8dc', muted: '#8a8a92' },
}
const GAP = 48 // entre "páginas" no modo virar
// useLayoutEffect só faz sentido no cliente (evita warning de SSR do leitor).
const useIsoLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export function LeitorDocumento({ doc }: { doc: DocumentoCarregado }) {
  const [modo, setModo] = useState<Modo>('scroll')
  const [tema, setTema] = useState<Tema>('sepia')
  const [fonte, setFonte] = useState(18)
  const [menuAberto, setMenuAberto] = useState(true)
  const [pct, setPct] = useState(doc.progresso.pct)
  const [concluido, setConcluido] = useState(doc.progresso.concluido)
  const [concluindo, setConcluindo] = useState(false)
  const [secoes, setSecoes] = useState<Secao[]>([])

  // Modo virar-página
  const [pagina, setPagina] = useState(0)
  const [totalPag, setTotalPag] = useState(1)
  const [colW, setColW] = useState(0)

  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const artigoMaxRef = useRef(doc.progresso.artigoMax)
  const tempoRef = useRef(0)          // segundos acumulados desde o último flush
  const pctRef = useRef(doc.progresso.pct)
  const scrollRaf = useRef(0)
  const touchX = useRef<number | null>(null)
  const cores = TEMAS[tema]

  // No mobile, começa com o menu fechado (a barra de 256px cobriria a leitura).
  useEffect(() => { if (typeof window !== 'undefined' && window.innerWidth < 768) setMenuAberto(false) }, [])

  // ── Sumário (TOC) a partir das âncoras de artigo/seção ──
  useIsoLayout(() => {
    const root = contentRef.current
    if (!root) return
    const nós = Array.from(root.querySelectorAll<HTMLElement>('[data-art]'))
    setSecoes(nós.map((el) => ({
      id: el.id || `art-${el.getAttribute('data-art')}`,
      art: Number(el.getAttribute('data-art')) || 0,
      label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) || `Seção ${el.getAttribute('data-art')}`,
    })))
  }, [doc.html])

  // ── Medição do modo virar-página ──
  // 1) Largura da coluna = largura da viewport (muda em resize/modo). Ao mudar colW,
  //    o React aplica columnWidth no DOM; SÓ ENTÃO (efeito 2) medimos o total de páginas —
  //    senão o scrollWidth seria lido antes das colunas existirem (total errado = 1).
  useIsoLayout(() => {
    const medirColW = () => { const vp = viewportRef.current; if (vp) setColW(vp.clientWidth) }
    medirColW()
    const ro = new ResizeObserver(medirColW)
    if (viewportRef.current) ro.observe(viewportRef.current)
    return () => ro.disconnect()
  }, [modo])

  // 2) Total de páginas — recalcula quando colW/fonte/conteúdo mudam (colunas já no DOM).
  useIsoLayout(() => {
    if (modo !== 'flip') { setTotalPag(1); return }
    const ct = contentRef.current
    if (!ct || !colW) return
    const total = Math.max(1, Math.round(ct.scrollWidth / (colW + GAP)))
    setTotalPag(total)
    setPagina((p) => Math.min(p, total - 1))
  }, [modo, colW, fonte, doc.html])

  // ── Cálculo de progresso (%, artigo alcançado) ──
  const atualizarProgresso = useCallback(() => {
    const vp = viewportRef.current, ct = contentRef.current
    if (!vp || !ct) return
    let p = 0
    if (modo === 'scroll') {
      const max = ct.scrollHeight - vp.clientHeight
      p = max <= 0 ? 100 : Math.round((vp.scrollTop / max) * 100)
      // artigo alcançado: última âncora acima do fim da viewport
      const limite = vp.scrollTop + vp.clientHeight
      for (const el of ct.querySelectorAll<HTMLElement>('[data-art]')) {
        if (el.offsetTop <= limite) artigoMaxRef.current = Math.max(artigoMaxRef.current, Number(el.getAttribute('data-art')) || 0)
      }
    } else {
      p = totalPag <= 1 ? 100 : Math.round(((pagina + 1) / totalPag) * 100)
      const limite = (pagina + 1) * (colW + GAP)
      for (const el of ct.querySelectorAll<HTMLElement>('[data-art]')) {
        if (el.offsetLeft < limite) artigoMaxRef.current = Math.max(artigoMaxRef.current, Number(el.getAttribute('data-art')) || 0)
      }
    }
    p = Math.min(100, Math.max(0, p))
    if (p > pctRef.current) { pctRef.current = p; setPct(p) }
  }, [modo, pagina, totalPag, colW])

  useEffect(() => { atualizarProgresso() }, [pagina, atualizarProgresso])

  // Scroll é frequente → recalcula no máx. 1x por frame (rAF), sem varrer o DOM a cada pixel.
  const onScroll = useCallback(() => {
    if (scrollRaf.current) return
    scrollRaf.current = requestAnimationFrame(() => { scrollRaf.current = 0; atualizarProgresso() })
  }, [atualizarProgresso])

  // ── Heartbeat: acumula tempo de leitura (só com aba visível) e envia progresso ──
  const flush = useCallback((concluir = false) => {
    const inc = tempoRef.current; tempoRef.current = 0
    const body = JSON.stringify({ documento_id: doc.id, versao: doc.versao, pct: pctRef.current, artigo_max: artigoMaxRef.current, tempo_inc: inc, concluir })
    return fetch('/api/leitura/progresso', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  }, [doc.id, doc.versao])

  useEffect(() => {
    const tick = setInterval(() => { if (document.visibilityState === 'visible') tempoRef.current += 1 }, 1000)
    const save = setInterval(() => { if (tempoRef.current > 0) flush().catch(() => {}) }, 20000)
    // Ao esconder/fechar a aba: envia o tempo pendente via sendBeacon e ZERA (senão o próximo
    // flush contaria o mesmo tempo de novo). Listeners nomeados p/ remover no cleanup (sem leak).
    const onHide = () => {
      if (tempoRef.current <= 0) return
      const body = new Blob([JSON.stringify({ documento_id: doc.id, versao: doc.versao, pct: pctRef.current, artigo_max: artigoMaxRef.current, tempo_inc: tempoRef.current })], { type: 'application/json' })
      navigator.sendBeacon?.('/api/leitura/progresso', body)
      tempoRef.current = 0
    }
    const onVis = () => { if (document.visibilityState === 'hidden') onHide() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)
    return () => {
      clearInterval(tick); clearInterval(save)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
      flush().catch(() => {})
    }
  }, [flush, doc.id, doc.versao])

  // ── Navegação virar-página (teclado) ──
  const irPara = useCallback((p: number) => setPagina((cur) => Math.min(Math.max(0, p), totalPag - 1)), [totalPag])
  useEffect(() => {
    if (modo !== 'flip') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); irPara(pagina + 1) }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); irPara(pagina - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modo, pagina, irPara])

  // ── Swipe (mobile) no modo virar-página ──
  function onTouchStart(e: React.TouchEvent) { touchX.current = e.touches[0]?.clientX ?? null }
  function onTouchEnd(e: React.TouchEvent) {
    if (modo !== 'flip' || touchX.current == null) return
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current
    if (Math.abs(dx) > 40) irPara(pagina + (dx < 0 ? 1 : -1))
    touchX.current = null
  }

  // ── Pular para uma seção (sumário) ──
  function pular(s: Secao) {
    const el = contentRef.current?.querySelector<HTMLElement>(`#${CSS.escape(s.id)}`) ?? contentRef.current?.querySelector<HTMLElement>(`[data-art="${s.art}"]`)
    if (!el) return
    if (modo === 'scroll') { el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
    else { const alvo = Math.floor(el.offsetLeft / (colW + GAP)); irPara(alvo) }
  }

  async function concluir() {
    if (doc.desafio.exigeFim && pctRef.current < 100) { toast.error('Leia até o fim para concluir.'); return }
    setConcluindo(true)
    try {
      const r = await flush(true)
      const j = await r.json().catch(() => ({}))
      if (j?.concluido) { setConcluido(true); toast.success('Leitura concluída! 🎉') }
      else if (doc.desafio.tempoMin) toast.error(`Continue lendo por pelo menos ${doc.desafio.tempoMin} min.`)
      else toast.error('Ainda não foi possível concluir.')
    } finally { setConcluindo(false) }
  }

  const proseStyle = useMemo<React.CSSProperties>(() => ({ fontSize: fonte, lineHeight: 1.7, color: cores.fg }), [fonte, cores.fg])

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[420px] overflow-hidden rounded-2xl border shadow-sm" style={{ background: cores.bg }}>
      {/* Barra esquerda: navegação/sumário + ajustes */}
      {menuAberto && (
        <aside className="flex w-64 shrink-0 flex-col border-r" style={{ borderColor: '#0000001a', background: cores.bg }}>
          <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: '#0000001a' }}>
            <Link href="/aluno/leitura" className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: cores.muted }}>
              <ArrowLeft className="h-4 w-4" /> Biblioteca
            </Link>
            <button onClick={() => setMenuAberto(false)} className="rounded p-1" style={{ color: cores.muted }} aria-label="Fechar menu"><X className="h-4 w-4" /></button>
          </div>

          {/* Ajustes de leitura */}
          <div className="space-y-3 border-b px-3 py-3" style={{ borderColor: '#0000001a' }}>
            <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: '#0000001a' }}>
              {([['scroll', 'Rolar', ScrollText], ['flip', 'Virar', BookOpen]] as const).map(([m, label, Icon]) => (
                <button key={m} onClick={() => setModo(m)} className={cn('flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors', modo === m ? 'bg-primary text-primary-foreground' : '')} style={modo === m ? undefined : { color: cores.muted }}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: cores.muted }}>Fonte</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setFonte((f) => Math.max(13, f - 1))} className="rounded border p-1" style={{ borderColor: '#0000001a', color: cores.fg }}><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-8 text-center text-xs tabular-nums" style={{ color: cores.fg }}>{fonte}</span>
                <button onClick={() => setFonte((f) => Math.min(28, f + 1))} className="rounded border p-1" style={{ borderColor: '#0000001a', color: cores.fg }}><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: cores.muted }}>Tema</span>
              <div className="flex items-center gap-1">
                {([['claro', Sun], ['sepia', Coffee], ['escuro', Moon]] as const).map(([t, Icon]) => (
                  <button key={t} onClick={() => setTema(t)} className={cn('rounded border p-1.5 transition', tema === t && 'ring-2 ring-primary')} style={{ borderColor: '#0000001a', color: cores.fg }} aria-label={t}><Icon className="h-3.5 w-3.5" /></button>
                ))}
              </div>
            </div>
          </div>

          {/* Sumário */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: cores.muted }}>Sumário</p>
            {secoes.length === 0 ? (
              <p className="px-1 text-xs" style={{ color: cores.muted }}>Sem seções detectadas.</p>
            ) : secoes.map((s) => (
              <button key={s.id} onClick={() => pular(s)} className="block w-full truncate rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-black/5" style={{ color: cores.fg }} title={s.label}>
                {s.label}
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Área central */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topo: progresso + concluir */}
        <div className="flex items-center gap-3 border-b px-3 py-2" style={{ borderColor: '#0000001a' }}>
          {!menuAberto && (
            <button onClick={() => setMenuAberto(true)} className="rounded p-1" style={{ color: cores.muted }} aria-label="Abrir menu"><PanelLeft className="h-4 w-4" /></button>
          )}
          <span className="truncate text-sm font-semibold" style={{ color: cores.fg }}>{doc.titulo}</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <div className="h-1.5 w-28 overflow-hidden rounded-full" style={{ background: '#00000018' }}>
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs tabular-nums" style={{ color: cores.muted }}>{pct}%</span>
            </div>
            {concluido ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Concluído</span>
            ) : doc.desafio.ativo ? (
              <button onClick={concluir} disabled={concluindo} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                {concluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Concluir leitura
              </button>
            ) : null}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={viewportRef}
            onScroll={modo === 'scroll' ? onScroll : undefined}
            onTouchStart={modo === 'flip' ? onTouchStart : undefined}
            onTouchEnd={modo === 'flip' ? onTouchEnd : undefined}
            className={cn('h-full', modo === 'scroll' ? 'overflow-y-auto' : 'overflow-hidden')}
          >
            <div
              ref={contentRef}
              className="leitura-conteudo mx-auto max-w-3xl px-6 py-6 [&_a]:underline [&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-6 [&_li]:list-disc [&_p]:mb-3 [&_table]:my-3 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1"
              style={modo === 'flip'
                ? { ...proseStyle, columnWidth: colW || undefined, columnGap: GAP, columnFill: 'auto', height: '100%', maxWidth: 'none', transform: `translateX(-${pagina * (colW + GAP)}px)`, transition: 'transform 220ms ease' }
                : proseStyle}
              dangerouslySetInnerHTML={{ __html: doc.html }}
            />
          </div>

          {/* Controles de virar-página */}
          {modo === 'flip' && (
            <>
              <button onClick={() => irPara(pagina - 1)} disabled={pagina <= 0} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border bg-white/70 p-2 shadow-sm backdrop-blur transition disabled:opacity-30 dark:bg-black/40" aria-label="Página anterior"><ChevronLeft className="h-5 w-5" /></button>
              <button onClick={() => irPara(pagina + 1)} disabled={pagina >= totalPag - 1} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border bg-white/70 p-2 shadow-sm backdrop-blur transition disabled:opacity-30 dark:bg-black/40" aria-label="Próxima página"><ChevronRight className="h-5 w-5" /></button>
              <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs" style={{ color: cores.muted }}>{pagina + 1} / {totalPag}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
