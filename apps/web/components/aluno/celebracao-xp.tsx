'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { progressoNivel } from '@/lib/gamificacao/niveis'

type Evento = { chave: string; xp: number; origem: string }
type Particula = { sx: number; sy: number; delay: number; dur: number; curva: number }

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const bezier = (t: number, a: number, b: number, c: number) => { const u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c }

/**
 * Celebração de XP na Início: pontos roxos voam até a BARRA de nível e ela enche.
 * Origem por tipo: 'simulado' → canto superior direito da tela; 'missao' → card de missões;
 * demais → canto superior direito. Posição 100% via rAF em coordenadas de viewport, recalculando
 * a barra a cada frame → origem correta e segue o scroll sem bugar. Só XP contabilizado (ledger),
 * dedupe por evento em localStorage.
 */
export function CelebracaoXp() {
  const [ativo, setAtivo] = useState<{ particulas: Particula[]; xp: number } | null>(null)
  const alvoRef = useRef<HTMLElement | null>(null)
  const spanRefs = useRef<(HTMLSpanElement | null)[]>([])
  const labelRef = useRef<HTMLSpanElement | null>(null)
  const jaRodou = useRef(false)

  useEffect(() => {
    if (jaRodou.current) return
    jaRodou.current = true
    let cancelado = false
    const timers: any[] = []

    // Tenta rodar a celebração; retorna true se havia XP novo (mesmo que só encha a barra).
    const rodar = async (): Promise<boolean> => {
      try {
        const r = await fetch('/api/aluno/gamificacao/celebracao').then((x) => x.json())
        if (cancelado || !r?.eventos?.length || !r.curva) return false
        const novos: Evento[] = r.eventos.filter((e: Evento) => {
          try { return !localStorage.getItem(`xpceleb:${e.chave}`) } catch { return false }
        })
        if (!novos.length) return false

        const alvo = document.querySelector('[data-nivel-alvo]') as HTMLElement | null
        if (!alvo) return false

        const sum = novos.reduce((a, e) => a + e.xp, 0)
        const para = progressoNivel(r.xpTotal, r.curva)
        const de = progressoNivel(Math.max(0, r.xpTotal - sum), r.curva)
        for (const e of novos) { try { localStorage.setItem(`xpceleb:${e.chave}`, '1') } catch {} }

        window.dispatchEvent(new CustomEvent('nivel:encher', { detail: { de, para } }))
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true

        // Ponto de origem por tipo (coords de viewport).
        const topRight = { x: window.innerWidth - 36, y: 30 }
        const missaoEl = document.querySelector('[data-missoes-card]') as HTMLElement | null
        const missaoPt = missaoEl ? (() => { const m = missaoEl.getBoundingClientRect(); return { x: m.left + m.width / 2, y: m.top + m.height / 2 } })() : topRight
        const pontoDe = (origem: string) => (origem === 'missao' ? missaoPt : topRight)

        const porOrigem = new Map<string, number>()
        for (const e of novos) porOrigem.set(e.origem, (porOrigem.get(e.origem) ?? 0) + e.xp)
        const totalN = Math.min(46, 16 + Math.round(sum / 3))
        const particulas: Particula[] = []
        for (const [origem, xp] of porOrigem) {
          const p = pontoDe(origem)
          const cnt = Math.max(6, Math.round(totalN * (xp / sum)))
          for (let i = 0; i < cnt; i++) {
            particulas.push({
              sx: p.x + (Math.random() - 0.5) * 90,
              sy: p.y + (Math.random() - 0.5) * 70,
              delay: Math.random() * 650,
              dur: 1600 + Math.random() * 600,
              curva: (Math.random() - 0.5) * 180,
            })
          }
        }

        alvoRef.current = alvo
        spanRefs.current = []
        setAtivo({ particulas, xp: sum })
        return true
      } catch { return false }
    }

    // 1ª tentativa após a página assentar; se o XP ainda não foi contabilizado (award assíncrono
    // logo após finalizar), tenta de novo uma vez.
    timers.push(setTimeout(async () => {
      if (cancelado) return
      if (await rodar()) return
      timers.push(setTimeout(() => { if (!cancelado) rodar() }, 1800))
    }, 700))

    return () => { cancelado = true; timers.forEach(clearTimeout) }
  }, [])

  // Animação por rAF: cada ponto interpola (com arco) da sua origem até a barra VIVA.
  useEffect(() => {
    if (!ativo) return
    let raf = 0
    let t0 = 0
    const FIM = 3100
    const frame = (now: number) => {
      if (!t0) t0 = now
      const t = now - t0
      const alvo = alvoRef.current
      if (alvo) {
        const rb = alvo.getBoundingClientRect()
        const bx = rb.left + rb.width / 2, by = rb.top + rb.height / 2
        ativo.particulas.forEach((p, i) => {
          const el = spanRefs.current[i]
          if (!el) return
          const lt = (t - p.delay) / p.dur
          if (lt <= 0) { el.style.opacity = '0'; el.style.transform = `translate(${p.sx - 6}px, ${p.sy - 6}px)`; return }
          if (lt >= 1) { el.style.opacity = '0'; return }
          const e = easeOut(lt)
          const mx = (p.sx + bx) / 2, my = (p.sy + by) / 2
          const dx = bx - p.sx, dy = by - p.sy, len = Math.hypot(dx, dy) || 1
          const cxp = mx + (-dy / len) * p.curva, cyp = my + (dx / len) * p.curva
          const x = bezier(e, p.sx, cxp, bx), y = bezier(e, p.sy, cyp, by)
          const op = lt < 0.15 ? lt / 0.15 : lt > 0.82 ? Math.max(0, (1 - lt) / 0.18) : 1
          el.style.opacity = String(op)
          el.style.transform = `translate(${x - 6}px, ${y - 6}px) scale(${0.55 + 0.45 * (1 - lt)})`
        })
        const lab = labelRef.current
        if (lab) {
          const lt = t / 2600
          lab.style.transform = `translate(${bx}px, ${by - 26 - 64 * Math.min(1, lt)}px)`
          lab.style.opacity = lt < 0.15 ? String(lt / 0.15) : lt > 0.8 ? String(Math.max(0, (1 - lt) / 0.2)) : '1'
        }
      }
      if (t < FIM) raf = requestAnimationFrame(frame)
      else setAtivo(null)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [ativo])

  if (!ativo || typeof document === 'undefined') return null
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[120] overflow-hidden">
      {ativo.particulas.map((_, i) => (
        <span key={i} ref={(el) => { spanRefs.current[i] = el }} className="absolute left-0 top-0 h-3 w-3 rounded-full opacity-0"
          style={{
            background: 'var(--brand-primary, var(--primary))',
            boxShadow: '0 0 12px 3px color-mix(in oklab, var(--brand-primary, var(--primary)) 70%, transparent)',
          }} />
      ))}
      <span ref={labelRef} className="absolute left-0 top-0 opacity-0">
        <span className="block -translate-x-1/2 whitespace-nowrap text-lg font-extrabold text-primary drop-shadow">+{ativo.xp.toLocaleString('pt-BR')} XP</span>
      </span>
    </div>,
    document.body,
  )
}
