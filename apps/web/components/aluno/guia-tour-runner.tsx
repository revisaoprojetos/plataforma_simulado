'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowRight, ArrowLeft, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Mascote } from '@/components/mascote/mascote'
import { TOURS_ALUNO, type PassoTour } from '@/lib/ajuda/tours-aluno'

const SS = 'guia-tour' // sessionStorage: { id, i }

/** Inicia (ou reinicia) o tour de um guia — chamado pelo "Iniciar passo a passo" na Ajuda. */
export function iniciarTourGuia(id: string) {
  if (typeof window === 'undefined' || !TOURS_ALUNO[id]?.length) return
  try { sessionStorage.setItem(SS, JSON.stringify({ id, i: 0 })) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('guia-tour:iniciar'))
}

/**
 * Runner GLOBAL do tour guiado (montado no layout do portal — sobrevive à navegação). Lê o tour
 * ativo do sessionStorage, navega para a página de cada passo, dá spotlight no [data-tour] e mostra
 * a Capi comentando. Passos `gamOnly` são pulados quando a gamificação está desativada.
 */
export function GuiaTourRunner({ gamAtivo = false }: { gamAtivo?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const [est, setEst] = useState<{ id: string; i: number } | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [saindo, setSaindo] = useState(false)
  const passos = est ? TOURS_ALUNO[est.id] : null
  const passo: PassoTour | null = passos && est ? passos[est.i] ?? null : null

  const ler = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(SS)
      if (!raw) { setEst(null); return }
      const p = JSON.parse(raw)
      if (TOURS_ALUNO[p?.id]) setEst({ id: p.id, i: Number(p.i) || 0 }); else setEst(null)
    } catch { setEst(null) }
  }, [])

  useEffect(() => { ler() }, [ler, pathname])
  useEffect(() => {
    const h = () => ler()
    window.addEventListener('guia-tour:iniciar', h)
    return () => window.removeEventListener('guia-tour:iniciar', h)
  }, [ler])

  const salvar = (i: number) => { try { sessionStorage.setItem(SS, JSON.stringify({ id: est!.id, i })) } catch { /* ignore */ }; setEst((s) => (s ? { ...s, i } : s)) }
  const fechar = useCallback(() => {
    setSaindo(true)
    try { sessionStorage.removeItem(SS) } catch { /* ignore */ }
    setTimeout(() => { setEst(null); setSaindo(false); setRect(null) }, 300)
  }, [])

  // Próximo índice VÁLIDO na direção (pula gamOnly quando a gamificação está off).
  const valido = useCallback((from: number, dir: 1 | -1) => {
    if (!passos) return -1
    let i = from
    while (i >= 0 && i < passos.length) {
      if (passos[i].gamOnly && !gamAtivo) { i += dir; continue }
      return i
    }
    return -1
  }, [passos, gamAtivo])

  // Entra num passo: pula gamOnly, navega se preciso, senão acha o alvo + mede (com retries).
  useEffect(() => {
    // Durante a saída (fechar/Pular/Entendi) NÃO mexe no rect: zerá-lo faria `centrado` virar true e o
    // card pular do rodapé para o modo central (Capi grande no meio) no meio da animação de saída.
    if (saindo) return
    if (!passo || !est) { setRect(null); return }
    if (passo.gamOnly && !gamAtivo) { const n = valido(est.i + 1, 1); n === -1 ? fechar() : salvar(n); return }
    const rotaPath = passo.rota?.split('?')[0]
    if (rotaPath && rotaPath !== pathname) { router.push(passo.rota!); return }
    if (!passo.alvo) { setRect(null); return }
    // Avisa a PÁGINA que um passo com alvo entrou. Telas com ABAS (ex.: maratona) escutam e trocam para a
    // aba do alvo ANTES do spotlight — o alvo só existe no DOM quando a aba certa está ativa. Additivo:
    // sem listener (tours normais) = no-op. O runner então acha o alvo (com retries) já na aba certa.
    try { window.dispatchEvent(new CustomEvent('guia-tour:passo', { detail: { id: est.id, alvo: passo.alvo } })) } catch { /* ignore */ }

    let cancel = false, tent = 0
    // Resolve o alvo no documento principal OU dentro de um iframe same-origin (ex.: o arcade do Desafio
    // de Jurisprudência, cujos blocos — MAPA, SOM, teclas, teses, abas, próximas aulas — ficam no iframe).
    // Retorna o 1º elemento VISÍVEL + o deslocamento (posição do iframe no viewport do pai) para o
    // spotlight cair no lugar certo. Com data-tour duplicado (ex.: teclas no .controls E no .dpad), pega
    // o que está visível no viewport atual (desktop → legenda; mobile → d-pad).
    const vis = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 }
    const pick = (root: Document | HTMLElement, ox: number, oy: number) => {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[data-tour="${passo.alvo}"]`))) if (vis(el)) return { el, ox, oy }
      return null
    }
    const acharAlvo = (): { el: HTMLElement; ox: number; oy: number } | null => {
      const main = pick(document, 0, 0)
      if (main) return main
      for (const ifr of Array.from(document.querySelectorAll('iframe'))) {
        try {
          const doc = ifr.contentDocument
          if (!doc) continue
          const r = ifr.getBoundingClientRect()
          const hit = pick(doc, r.left, r.top)
          if (hit) return hit
        } catch { /* cross-origin → ignora */ }
      }
      return null
    }
    const medir = (el: HTMLElement, ox: number, oy: number) => {
      const r = el.getBoundingClientRect()
      const left = r.left + ox, top = r.top + oy
      if (passo.topo) { const h = Math.min(r.height, Math.round(window.innerHeight * 0.5)); setRect(new DOMRect(left, Math.max(8, top), r.width, h)) }
      else setRect(new DOMRect(left, top, r.width, r.height))
    }
    const buscar = () => {
      if (cancel) return
      const hit = acharAlvo()
      if (hit) { hit.el.scrollIntoView({ behavior: 'smooth', block: passo.topo ? 'start' : 'center' }); setTimeout(() => !cancel && medir(hit.el, hit.ox, hit.oy), 360); return }
      if (tent++ < 15) setTimeout(buscar, 200)
      else setRect(null) // alvo ausente (ex.: oculto/gam off) → cai no card central
    }
    buscar()
    const onMove = () => { const hit = acharAlvo(); if (hit && !cancel) medir(hit.el, hit.ox, hit.oy) }
    window.addEventListener('resize', onMove); window.addEventListener('scroll', onMove, true)
    return () => { cancel = true; window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true) }
  }, [passo, pathname, saindo, est, gamAtivo, valido, fechar, router])

  // Esc pula o tour.
  useEffect(() => {
    if (!est) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [est, fechar])

  if (!est || !passo || typeof document === 'undefined') return null

  const idxAnt = valido(est.i - 1, -1)
  const idxProx = valido(est.i + 1, 1)
  const ehUltimo = idxProx === -1
  const proximo = () => (ehUltimo ? fechar() : salvar(idxProx))
  const anterior = () => idxAnt !== -1 && salvar(idxAnt)
  const centrado = !passo.alvo || !rect
  // O card (rodapé por padrão) COBRIA o alvo quando ele ficava embaixo (ex.: as teclas/controles na base
  // do gabinete). Flipa para o TOPO quando o centro do alvo está na metade de baixo da tela.
  const cardNoTopo = !centrado && !!rect && (rect.top + rect.height / 2) > window.innerHeight * 0.5

  // Progresso considerando só os passos visíveis (sem os gamOnly ocultos).
  const visiveis = passos!.map((p, k) => k).filter((k) => !(passos![k].gamOnly && !gamAtivo))
  const posAtual = visiveis.indexOf(est.i)

  const controles = (
    <div className="mt-3 flex items-center justify-between gap-3">
      {/* Progresso: bolinhas em tours curtos; barra compacta + "n/total" em tours longos (ex.: o do
          Desafio de Jurisprudência tem 13 passos → 13 bolinhas estouravam o card e empurravam os botões). */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {visiveis.length <= 8 ? (
          visiveis.map((k, n) => <span key={k} className={cn('h-1.5 rounded-full transition-all', n === posAtual ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30')} />)
        ) : (
          <>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted-foreground/20">
              <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(((posAtual + 1) / visiveis.length) * 100)}%` }} />
            </span>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">{posAtual + 1}/{visiveis.length}</span>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={fechar} className="px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">Pular</button>
        {idxAnt !== -1 && (
          <button type="button" onClick={anterior} aria-label="Anterior" className="rounded-lg border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ArrowLeft className="h-4 w-4" /></button>
        )}
        <button type="button" onClick={proximo} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
          {ehUltimo ? <><Check className="h-4 w-4" /> Entendi!</> : <>Próximo <ArrowRight className="h-4 w-4" /></>}
        </button>
      </div>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-[140]" aria-live="polite">
      <div className={cn('absolute inset-0 transition-colors', centrado ? 'bg-black/60 backdrop-blur-[1px]' : 'bg-transparent')} />

      {!centrado && rect && (
        <div className="pointer-events-none absolute rounded-2xl transition-all duration-500 ease-out"
          style={{ left: rect.left - 8, top: rect.top - 8, width: rect.width + 16, height: rect.height + 16, boxShadow: '0 0 0 9999px rgba(0,0,0,.62)', outline: '2px solid var(--brand-primary, var(--primary))', outlineOffset: 2 }} />
      )}

      {centrado ? (
        // Card central (intro/fecho ou alvo ausente).
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className={cn('w-full max-w-sm rounded-3xl border bg-card p-6 text-center shadow-2xl', saindo ? 'motion-safe:animate-[tour-out_.38s_ease-in_both]' : 'motion-safe:animate-[tour-in_.45s_cubic-bezier(.34,1.56,.64,1)_both]')}>
            <div className="flex justify-center"><Mascote key={est.i} reacao={passo.pose} tamanho={148} entra flutua={false} /></div>
            <div className="mt-1 text-lg font-extrabold text-primary">{passo.titulo}</div>
            <p className="mx-auto mt-1.5 min-h-[3.5rem] max-w-[19rem] text-sm leading-snug text-foreground"><Maquina key={est.i} texto={passo.texto} /></p>
            {controles}
          </div>
        </div>
      ) : (
        // Etapa com alvo: Capi + card no rodapé (ou no topo, quando o alvo fica embaixo — não o cobre).
        // No MOBILE (≤640px) o shell mostra a top-bar (~64px) e a down-bar (~78px); por isso o card ganha
        // folga maior (top-20/bottom-24) p/ não ficar atrás das barras — inclusive dentro da Curseduca.
        <div className={cn('absolute inset-x-0 z-[1] flex justify-center px-4', cardNoTopo ? 'top-20 sm:top-5' : 'bottom-24 sm:bottom-5', saindo ? 'motion-safe:animate-[tour-out_.38s_ease-in_both]' : 'motion-safe:animate-[tour-in_.4s_cubic-bezier(.34,1.56,.64,1)_both]')}>
          <div className={cn('flex w-full max-w-md gap-2', cardNoTopo ? 'items-start' : 'items-end')}>
            <Mascote key={`m${est.i}`} reacao={passo.pose} tamanho={92} entra flutua className="shrink-0 [&_img]:!h-[68px] sm:[&_img]:!h-[92px]" />
            <div className="min-w-0 flex-1 rounded-2xl border bg-card p-4 shadow-2xl">
              <div className="text-sm font-bold text-primary">{passo.titulo}</div>
              <p className="mt-1 min-h-[2.5rem] text-sm leading-snug text-foreground"><Maquina key={est.i} texto={passo.texto} /></p>
              {controles}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

/** Efeito máquina de escrever (revela o texto caractere a caractere). */
function Maquina({ texto }: { texto: string }) {
  const [n, setN] = useState(0)
  const ref = useRef(texto)
  ref.current = texto
  useEffect(() => {
    setN(0)
    const id = setInterval(() => setN((v) => { if (v >= ref.current.length) { clearInterval(id); return v } return v + 1 }), 18)
    return () => clearInterval(id)
  }, [texto])
  return <>{texto.slice(0, n)}<span className={cn('inline-block w-0', n < texto.length && 'animate-pulse')}> </span></>
}
