'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { X, ChevronLeft, ChevronRight, ArrowDown, ArrowUp, Check, Lightbulb, Compass } from 'lucide-react'
import type { PassoAjuda } from '@/lib/ajuda/guias'

type TourCtx = { iniciar: (titulo: string, passos: PassoAjuda[]) => void }
const Ctx = createContext<TourCtx>({ iniciar: () => {} })
export const useTour = () => useContext(Ctx)

type Alvo = { sel?: string; txt?: string }
function achar(alvo?: Alvo): HTMLElement | null {
  if (!alvo) return null
  const vis = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 }
  if (alvo.sel) {
    const els = [...document.querySelectorAll<HTMLElement>(alvo.sel)].filter(vis)
    if (alvo.txt) return els.find((e) => (e.textContent || '').includes(alvo.txt!)) ?? null
    return els[0] ?? null
  }
  if (alvo.txt) {
    const all = [...document.querySelectorAll<HTMLElement>('button, a, [role="button"], [data-slot="tabs-trigger"], input, textarea, h2, h3, [class*="cursor-pointer"]')].filter(vis)
    const t = alvo.txt
    const txtDe = (e: HTMLElement) => (e.textContent || '').trim() || (e.getAttribute('placeholder') || '')
    return all.find((e) => txtDe(e) === t) ?? all.find((e) => txtDe(e).includes(t)) ?? null
  }
  return null
}

/** Escreve num input/textarea controlado do React (setter nativo + evento input). */
function digitarEm(sel: string, valor: string) {
  const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null
  if (!el) return
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, valor)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

type Rect = { left: number; top: number; width: number; height: number }

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [titulo, setTitulo] = useState('')
  const [passos, setPassos] = useState<PassoAjuda[] | null>(null)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const alvoRef = useRef<HTMLElement | null>(null)
  const entrouRef = useRef<Set<number>>(new Set())
  const homeRef = useRef<string | null>(null) // tela inicial da área (1ª rota do guia)

  const passo = passos ? passos[i] : null
  const total = passos?.length ?? 0

  const iniciar = useCallback((t: string, ps: PassoAjuda[]) => {
    entrouRef.current = new Set()
    homeRef.current = ps.find((p) => p.rota)?.rota ?? null
    setTitulo(t); setPassos(ps); setI(0)
  }, [])
  const sair = useCallback(() => {
    // Ao encerrar o tour, volta para a tela inicial da área que foi apresentada.
    const home = homeRef.current
    if (home && pathname !== home) router.push(home)
    setPassos(null); setRect(null); alvoRef.current = null
  }, [router, pathname])
  const proximo = useCallback(() => setI((x) => { if (x + 1 >= total) { sair(); return 0 } return x + 1 }), [total, sair])
  const anterior = () => {
    if (i <= 0) return
    // Rebobina a tela interna (ex.: assistente) clicando no "Voltar" dela, e libera o aoEntrar do passo atual.
    if (passo?.voltarClicando) { const el = achar(passo.voltarClicando); if (el) el.click() }
    entrouRef.current.delete(i)
    setI((x) => Math.max(0, x - 1))
  }

  // Navega ao entrar num passo com rota diferente.
  useEffect(() => {
    if (passo?.rota && pathname !== passo.rota) router.push(passo.rota)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, passos])

  // Ao entrar num passo, executa suas ações (ex.: avançar o assistente) — uma vez por passo.
  useEffect(() => {
    if (!passo?.aoEntrar || entrouRef.current.has(i)) return
    entrouRef.current.add(i)
    let cancel = false
    ;(async () => {
      for (const a of passo.aoEntrar!) {
        if (cancel) return
        if (a.esperar) await new Promise((r) => setTimeout(r, a.esperar))
        if (cancel) return
        if (a.clicar) { const el = achar(a.clicar); if (el) el.click() }
        if (a.digitar) digitarEm(a.digitar.sel, a.digitar.valor)
      }
    })()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, passos])

  // Acompanha a posição do alvo enquanto o passo está ativo (rola até ele, atualiza o rect).
  useEffect(() => {
    if (!passo) { setRect(null); alvoRef.current = null; return }
    let parar = false, ultimo = '', scrollado = false
    const tick = () => {
      if (parar) return
      const el = achar(passo.alvo)
      alvoRef.current = el
      if (el) {
        if (!scrollado) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); scrollado = true }
        const r = el.getBoundingClientRect()
        const chave = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`
        if (chave !== ultimo) { ultimo = chave; setRect({ left: r.left, top: r.top, width: r.width, height: r.height }) }
      } else if (ultimo !== 'nulo') { ultimo = 'nulo'; setRect(null) }
    }
    tick()
    const id = setInterval(tick, 80)
    return () => { parar = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, passos, pathname])

  // Clicar no alvo (se for botão/link/aba) avança o tour — sensação de guiamento em tempo real.
  useEffect(() => {
    const el = alvoRef.current
    if (!passo || !rect || !el) return
    const clicavel = el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button' || el.getAttribute('data-slot') === 'tabs-trigger'
    if (!clicavel) return
    const onClick = () => setTimeout(() => proximo(), 400)
    el.addEventListener('click', onClick, { once: true })
    return () => el.removeEventListener('click', onClick)
  }, [rect, i, passos, passo, proximo])

  // ESC sai.
  useEffect(() => {
    if (!passo) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') sair() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [passo, sair])

  return (
    <Ctx.Provider value={{ iniciar }}>
      {children}
      {passo && (
        <Overlay titulo={titulo} passo={passo} i={i} total={total} rect={rect}
          onAnterior={anterior} onProximo={proximo} onSair={sair} />
      )}
    </Ctx.Provider>
  )
}

const PAD = 6
function Overlay({ titulo, passo, i, total, rect, onAnterior, onProximo, onSair }: {
  titulo: string; passo: PassoAjuda; i: number; total: number; rect: Rect | null
  onAnterior: () => void; onProximo: () => void; onSair: () => void
}) {
  const ttRef = useRef<HTMLDivElement>(null)
  const [ttH, setTtH] = useState(220)
  useLayoutEffect(() => { if (ttRef.current) setTtH(ttRef.current.offsetHeight) }, [i, passo.titulo])

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900
  const R = rect ? { left: rect.left - PAD, top: rect.top - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 } : null

  const ttW = 360
  const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b)
  const maxTop = Math.max(12, vh - ttH - 12)
  const maxLeft = Math.max(12, vw - ttW - 12)
  const espacoAbaixo = R ? vh - (R.top + R.h) : 0
  const espacoAcima = R ? R.top : 0
  let ttTop: number
  let ttLeft: number
  if (!R) { ttLeft = (vw - ttW) / 2; ttTop = clamp(vh / 2 - ttH / 2, 12, maxTop) }
  else if (espacoAbaixo >= ttH + 24) { ttLeft = clamp(R.left, 12, maxLeft); ttTop = R.top + R.h + 16 }        // embaixo
  else if (espacoAcima >= ttH + 24) { ttLeft = clamp(R.left, 12, maxLeft); ttTop = R.top - ttH - 16 }         // em cima
  else if (R.left + R.w + 16 + ttW <= vw) { ttLeft = R.left + R.w + 16; ttTop = clamp(R.top, 12, maxTop) }    // à direita
  else if (R.left - ttW - 16 >= 12) { ttLeft = R.left - ttW - 16; ttTop = clamp(R.top, 12, maxTop) }          // à esquerda
  else { ttLeft = clamp(R.left, 12, maxLeft); ttTop = maxTop }                                                // travado na borda
  ttTop = clamp(ttTop, 12, maxTop)
  ttLeft = clamp(ttLeft, 12, maxLeft)

  const ultimo = i + 1 >= total
  const setaEmCima = R ? R.top > 56 : false

  return (
    <div className="fixed inset-0 z-[9998]">
      <style>{`@keyframes tourPing{0%{transform:scale(1);opacity:.65}80%,100%{transform:scale(1.7);opacity:0}}
        @keyframes tourFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(7px)}}`}</style>

      {/* Fundo escuro + borrado (com “buraco” no alvo) */}
      {R ? (
        <>
          <div className="fixed left-0 right-0 top-0 bg-black/45 backdrop-blur-[2px]" style={{ height: Math.max(0, R.top) }} />
          <div className="fixed bottom-0 left-0 right-0 bg-black/45 backdrop-blur-[2px]" style={{ top: R.top + R.h }} />
          <div className="fixed bg-black/45 backdrop-blur-[2px]" style={{ top: R.top, left: 0, width: Math.max(0, R.left), height: R.h }} />
          <div className="fixed bg-black/45 backdrop-blur-[2px]" style={{ top: R.top, left: R.left + R.w, right: 0, height: R.h }} />
          {/* Anel + pulso no alvo */}
          <div className="pointer-events-none fixed rounded-xl ring-2 ring-primary" style={{ left: R.left, top: R.top, width: R.w, height: R.h, boxShadow: '0 0 0 4px rgba(124,119,221,.35), 0 0 22px rgba(124,119,221,.55)' }} />
          <div className="pointer-events-none fixed rounded-xl border-2 border-primary" style={{ left: R.left, top: R.top, width: R.w, height: R.h, animation: 'tourPing 1.4s ease-out infinite' }} />
          {/* Seta animada apontando o alvo */}
          <div className="pointer-events-none fixed text-primary drop-shadow" style={{ left: R.left + R.w / 2 - 16, top: setaEmCima ? R.top - 42 : R.top + R.h + 8, animation: 'tourFloat 1s ease-in-out infinite' }}>
            {setaEmCima ? <ArrowDown className="h-8 w-8" strokeWidth={3} /> : <ArrowUp className="h-8 w-8" strokeWidth={3} />}
          </div>
        </>
      ) : (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-[2px]" />
      )}

      {/* Balão do passo */}
      <div ref={ttRef} className="fixed w-[360px] max-w-[calc(100vw-24px)] rounded-2xl border bg-popover p-4 text-popover-foreground shadow-2xl"
        style={{ left: ttLeft, top: ttTop }}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Compass className="h-4 w-4" /> {titulo}
          </span>
          <button type="button" onClick={onSair} className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground" title="Sair do passo a passo"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex items-start gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums">{i + 1}</span>
          <div className="min-w-0">
            <h4 className="font-semibold leading-snug">{passo.titulo}</h4>
            <p className="mt-1 text-sm text-muted-foreground">{passo.texto}</p>
            {passo.dica && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{passo.dica}</span>
              </div>
            )}
          </div>
        </div>

        {/* Progresso */}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((i + 1) / total) * 100}%` }} />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Passo {i + 1} de {total}</span>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button type="button" onClick={onAnterior} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition hover:bg-muted">
                <ChevronLeft className="h-4 w-4" /> Voltar
              </button>
            )}
            <button type="button" onClick={onProximo} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90">
              {ultimo ? <>Concluir <Check className="h-4 w-4" /></> : <>Próximo <ChevronRight className="h-4 w-4" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
