'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { progressoNivel } from '@/lib/gamificacao/niveis'

type Evento = { chave: string; xp: number; origem: string }
type Estado = { cx: number; cy: number; n: number; xp: number }

/**
 * Celebração de XP na Início: pontos de XP voam de fora até o card de nível e a barra enche.
 * Regras: só XP já contabilizado (ledger), dedupe por evento em localStorage — então funciona
 * tanto ao "voltar ao menu" quanto quando o XP foi contabilizado sem a animação ter acontecido
 * (mostra no próximo carregamento). Vale para simulado finalizado, missões, conquistas etc.
 */
export function CelebracaoXp() {
  const [particulas, setParticulas] = useState<Estado | null>(null)
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
        if (!alvo) return // só na Início, onde o card de nível existe

        const sum = novos.reduce((a, e) => a + e.xp, 0)
        const para = progressoNivel(r.xpTotal, r.curva)
        const de = progressoNivel(Math.max(0, r.xpTotal - sum), r.curva)

        // marca tudo como celebrado antes de animar (evita repetir se recarregar no meio)
        for (const e of novos) { try { localStorage.setItem(`xpceleb:${e.chave}`, '1') } catch {} }

        const reduz = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        // enche a barra (o NivelCard escuta este evento)
        window.dispatchEvent(new CustomEvent('nivel:encher', { detail: { de, para } }))
        if (reduz) return

        const rect = alvo.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const n = Math.min(40, 16 + Math.round(sum / 3))
        setParticulas({ cx, cy, n, xp: sum })
        setTimeout(() => { if (!cancelado) setParticulas(null) }, 2600)
      } catch { /* silencioso */ }
    }, 900) // espera a página assentar e eventos recém-gravados (ping/missões) aparecerem

    return () => { cancelado = true; clearTimeout(timer) }
  }, [])

  if (!particulas || typeof document === 'undefined') return null
  const { cx, cy, n, xp } = particulas
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[120]">
      {Array.from({ length: n }).map((_, i) => {
        const ang = (i / n) * Math.PI * 2 + (i % 2 ? 0.4 : 0)
        const dist = 360 + (i % 5) * 70
        const sx = Math.cos(ang) * dist
        const sy = Math.sin(ang) * dist * 0.72
        const delay = (i % 9) * 65
        return (
          <span key={i} className="absolute -ml-1 -mt-1 h-2.5 w-2.5 rounded-full"
            style={{
              left: cx, top: cy,
              ['--sx' as any]: `${sx}px`, ['--sy' as any]: `${sy}px`,
              background: 'var(--brand-primary, var(--primary))',
              boxShadow: '0 0 9px 2px color-mix(in oklab, var(--brand-primary, var(--primary)) 60%, transparent)',
              animation: `xp-para-nivel 1150ms cubic-bezier(.45,.05,.25,1) ${delay}ms both`,
            }} />
        )
      })}
      <span className="absolute text-base font-extrabold text-primary drop-shadow"
        style={{ left: cx, top: cy - 40, animation: 'xp-label 1700ms ease-out both' }}>+{xp.toLocaleString('pt-BR')} XP</span>
    </div>,
    document.body,
  )
}
