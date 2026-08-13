'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { progressoNivel } from '@/lib/gamificacao/niveis'

type Evento = { chave: string; xp: number; origem: string }
type Particula = { sx: number; sy: number; delay: number }

/**
 * Celebração de XP na Início: pontos de XP (roxos) voam até a BARRA de nível e ela enche.
 * Origem por tipo de evento: 'simulado' → canto superior direito da tela; 'missao' → card de
 * missões; demais → canto superior direito. Regras: só XP já contabilizado (ledger), dedupe por
 * evento em localStorage. O container SEGUE a barra ao vivo (rAF) → não quebra com scroll nem
 * com o layout ainda assentando.
 */
export function CelebracaoXp() {
  const [dados, setDados] = useState<{ particulas: Particula[]; xp: number } | null>(null)
  const alvoRef = useRef<HTMLElement | null>(null)
  const contRef = useRef<HTMLDivElement>(null)
  const jaRodou = useRef(false)

  useEffect(() => {
    if (jaRodou.current) return
    jaRodou.current = true
    let cancelado = false

    const timer = setTimeout(async () => {
      try {
        const r = await fetch('/api/aluno/gamificacao/celebracao').then((x) => x.json())
        if (cancelado || !r?.eventos?.length || !r.curva) return
        const novos: Evento[] = r.eventos.filter((e: Evento) => {
          try { return !localStorage.getItem(`xpceleb:${e.chave}`) } catch { return false }
        })
        if (!novos.length) return

        const alvo = document.querySelector('[data-nivel-alvo]') as HTMLElement | null
        if (!alvo) return

        const sum = novos.reduce((a, e) => a + e.xp, 0)
        const para = progressoNivel(r.xpTotal, r.curva)
        const de = progressoNivel(Math.max(0, r.xpTotal - sum), r.curva)

        for (const e of novos) { try { localStorage.setItem(`xpceleb:${e.chave}`, '1') } catch {} }

        window.dispatchEvent(new CustomEvent('nivel:encher', { detail: { de, para } }))
        const reduz = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        if (reduz) return

        // Pontos de partida por origem (coords de viewport).
        const rB = alvo.getBoundingClientRect()
        const bcx = rB.left + rB.width / 2, bcy = rB.top + rB.height / 2
        const topRight = { x: window.innerWidth - 32, y: 28 }
        const missaoEl = document.querySelector('[data-missoes-card]') as HTMLElement | null
        const missaoPt = missaoEl ? (() => { const m = missaoEl.getBoundingClientRect(); return { x: m.left + m.width / 2, y: m.top + m.height / 2 } })() : topRight
        const pontoDe = (origem: string) => (origem === 'missao' ? missaoPt : topRight)

        // Agrupa XP por origem e distribui a contagem de partículas proporcionalmente.
        const porOrigem = new Map<string, number>()
        for (const e of novos) porOrigem.set(e.origem, (porOrigem.get(e.origem) ?? 0) + e.xp)
        const totalN = Math.min(48, 18 + Math.round(sum / 3))
        const particulas: Particula[] = []
        for (const [origem, xp] of porOrigem) {
          const p = pontoDe(origem)
          const cnt = Math.max(5, Math.round(totalN * (xp / sum)))
          for (let i = 0; i < cnt; i++) {
            const jx = (rand(i, origem) - 0.5) * 80
            const jy = (rand(i + 7, origem) - 0.5) * 60
            particulas.push({ sx: (p.x - bcx) + jx, sy: (p.y - bcy) + jy, delay: (i % 9) * 55 })
          }
        }

        alvoRef.current = alvo
        setDados({ particulas, xp: sum })
        setTimeout(() => { if (!cancelado) setDados(null) }, 2700)
      } catch { /* silencioso */ }
    }, 1200)

    return () => { cancelado = true; clearTimeout(timer) }
  }, [])

  // Mantém o container centralizado na barra a cada frame → segue scroll e layout-shift.
  useEffect(() => {
    if (!dados) return
    let raf = 0
    const seguir = () => {
      const alvo = alvoRef.current, cont = contRef.current
      if (alvo && cont) {
        const r = alvo.getBoundingClientRect()
        cont.style.transform = `translate(${r.left + r.width / 2}px, ${r.top + r.height / 2}px)`
      }
      raf = requestAnimationFrame(seguir)
    }
    raf = requestAnimationFrame(seguir)
    return () => cancelAnimationFrame(raf)
  }, [dados])

  if (!dados || typeof document === 'undefined') return null
  return createPortal(
    <div ref={contRef} className="pointer-events-none fixed left-0 top-0 z-[120]">
      {dados.particulas.map((p, i) => (
        <span key={i} className="absolute -ml-[6px] -mt-[6px] h-3 w-3 rounded-full"
          style={{
            ['--sx' as any]: `${p.sx}px`, ['--sy' as any]: `${p.sy}px`,
            background: 'var(--brand-primary, var(--primary))',
            boxShadow: '0 0 12px 3px color-mix(in oklab, var(--brand-primary, var(--primary)) 70%, transparent)',
            animation: `xp-para-nivel 1200ms cubic-bezier(.45,.05,.25,1) ${p.delay}ms both`,
          }} />
      ))}
      <span className="absolute text-lg font-extrabold text-primary drop-shadow"
        style={{ animation: 'xp-label 1800ms ease-out both' }}>+{dados.xp.toLocaleString('pt-BR')} XP</span>
    </div>,
    document.body,
  )
}

// Pseudo-aleatório determinístico (evita hydration mismatch e não precisa de Math.random puro).
function rand(i: number, seed: string): number {
  let h = 2166136261 ^ i
  for (let k = 0; k < seed.length; k++) { h = Math.imul(h ^ seed.charCodeAt(k), 16777619) }
  return ((h >>> 0) % 1000) / 1000
}
