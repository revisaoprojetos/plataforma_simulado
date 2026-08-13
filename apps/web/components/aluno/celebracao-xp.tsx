'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardList, Zap, Award, Flame, Gift, Route, Target } from 'lucide-react'
import { progressoNivel, xpAcumuladoParaNivel } from '@/lib/gamificacao/niveis'
import { LevelUpModal, type GanhoXp } from '@/components/aluno/level-up-modal'
import type { NivelCurva } from '@/lib/gamificacao/config'

type Evento = { chave: string; xp: number; origem: string }
type Particula = { sx: number; sy: number; delay: number; dur: number; curva: number }

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const bezier = (t: number, a: number, b: number, c: number) => { const u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c }

const ICO: Record<string, React.ReactNode> = {
  simulado: <ClipboardList className="h-4 w-4" />, missao: <Target className="h-4 w-4" />, conquista: <Award className="h-4 w-4" />,
  streak: <Flame className="h-4 w-4" />, chest: <Gift className="h-4 w-4" />, pratica: <Zap className="h-4 w-4" />, trilha: <Route className="h-4 w-4" />,
}
const LABEL: Record<string, string> = {
  simulado: 'Simulados concluídos', missao: 'Missões diárias', conquista: 'Conquistas desbloqueadas',
  streak: 'Sequência diária', chest: 'Baú de sequência', pratica: 'Prática de questões', trilha: 'Bônus de trilha',
}
const COR: Record<string, string> = {
  simulado: '#38bdf8', missao: '#34d399', conquista: '#fbbf24', streak: '#fb923c', chest: '#a78bfa', pratica: '#22d3ee', trilha: '#f472b6',
}

/**
 * Orquestra a celebração de XP na Início:
 *  - Se o aluno SUBIU de nível (ou é o 1º acesso pós-deploy com XP acumulado) → modal de Level Up
 *    (de → até o nível atual, com vários níveis de uma vez). Dedupe pelo "nível já celebrado" no
 *    localStorage (namespaced por aluno) — cobre o catch-up único no deploy sem migração.
 *  - Senão, se houve XP novo sem subir de nível → animação de pontinhos voando para a barra.
 * Só XP contabilizado (ledger). Retry 1x p/ o award assíncrono logo após finalizar.
 */
export function CelebracaoXp() {
  const [modo, setModo] = useState<
    | null
    | { tipo: 'particulas'; particulas: Particula[]; xp: number }
    | { tipo: 'levelup'; from: number; to: number; curva: NivelCurva; gains: GanhoXp[]; xpGanho: number; totalXp: number; streak: number; badges: string; logo: string | null }
  >(null)
  const alvoRef = useRef<HTMLElement | null>(null)
  const spanRefs = useRef<(HTMLSpanElement | null)[]>([])
  const labelRef = useRef<HTMLSpanElement | null>(null)
  const jaRodou = useRef(false)

  useEffect(() => {
    if (jaRodou.current) return
    jaRodou.current = true
    let cancelado = false
    const timers: any[] = []

    const marcar = (novos: Evento[]) => { for (const e of novos) { try { localStorage.setItem(`xpceleb:${e.chave}`, '1') } catch {} } }

    // Espera o pop-up de entrada (banner pós-login) fechar antes de mostrar a celebração.
    const aguardarPopup = (): Promise<void> => new Promise((resolve) => {
      if (cancelado || typeof document === 'undefined' || !document.querySelector('[data-portal-popup]')) return resolve()
      let done = false
      const fim = () => { if (done) return; done = true; window.removeEventListener('portal:popup-fechado', fim); clearTimeout(t); setTimeout(resolve, 350) }
      window.addEventListener('portal:popup-fechado', fim)
      const t = setTimeout(fim, 20000)
    })

    const rodar = async (): Promise<boolean> => {
      try {
        const r = await fetch('/api/aluno/gamificacao/celebracao').then((x) => x.json())
        if (cancelado || !r?.curva) return false
        const curva: NivelCurva = r.curva
        const eventos: Evento[] = r.eventos ?? []
        const novos = eventos.filter((e) => { try { return !localStorage.getItem(`xpceleb:${e.chave}`) } catch { return false } })

        const nivelKey = `nivelCeleb:${r.est ?? 'x'}`
        const atual = progressoNivel(r.xpTotal, curva).nivel
        let stored = parseInt(localStorage.getItem(nivelKey) ?? '', 10)
        if (!Number.isFinite(stored)) stored = 1 // 1º acesso: catch-up a partir do nível 1

        // ── SUBIU DE NÍVEL (inclui o catch-up do deploy) ──
        if (atual > stored) {
          const porOrigem = new Map<string, number>()
          for (const e of novos) porOrigem.set(e.origem, (porOrigem.get(e.origem) ?? 0) + e.xp)
          const gains: GanhoXp[] = [...porOrigem.entries()].map(([origem, xp]) => ({ icon: ICO[origem] ?? <Zap className="h-4 w-4" />, label: LABEL[origem] ?? 'XP', xp, cor: COR[origem] }))
          const xpGanho = gains.length ? gains.reduce((a, g) => a + g.xp, 0) : Math.max(0, r.xpTotal - xpAcumuladoParaNivel(stored, curva))
          await aguardarPopup()
          if (cancelado) return false
          marcar(novos)
          try { localStorage.setItem(nivelKey, String(atual)) } catch {}
          setModo({ tipo: 'levelup', from: stored, to: atual, curva, gains, xpGanho, totalXp: r.xpTotal, streak: r.streak ?? 0, badges: `${r.badges?.unlocked ?? 0} de ${r.badges?.total ?? 0}`, logo: r.logo ?? null })
          return true
        }

        // Mantém o baseline sincronizado (evita catch-up falso depois).
        try { localStorage.setItem(nivelKey, String(atual)) } catch {}

        // ── XP novo SEM subir de nível → pontinhos para a barra ──
        if (!novos.length) return false
        const alvo = document.querySelector('[data-nivel-alvo]') as HTMLElement | null
        if (!alvo) return false
        const sum = novos.reduce((a, e) => a + e.xp, 0)
        const de = progressoNivel(Math.max(0, r.xpTotal - sum), curva)
        const para = progressoNivel(r.xpTotal, curva)
        await aguardarPopup()
        if (cancelado) return false
        marcar(novos)
        window.dispatchEvent(new CustomEvent('nivel:encher', { detail: { de, para } }))
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true

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
            particulas.push({ sx: p.x + (Math.random() - 0.5) * 90, sy: p.y + (Math.random() - 0.5) * 70, delay: Math.random() * 650, dur: 1600 + Math.random() * 600, curva: (Math.random() - 0.5) * 180 })
          }
        }
        alvoRef.current = alvo
        spanRefs.current = []
        setModo({ tipo: 'particulas', particulas, xp: sum })
        return true
      } catch { return false }
    }

    timers.push(setTimeout(async () => {
      if (cancelado) return
      if (await rodar()) return
      timers.push(setTimeout(() => { if (!cancelado) rodar() }, 1800))
    }, 700))

    return () => { cancelado = true; timers.forEach(clearTimeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // rAF das partículas (segue a barra ao vivo).
  useEffect(() => {
    if (modo?.tipo !== 'particulas') return
    let raf = 0, t0 = 0
    const FIM = 3100
    const frame = (now: number) => {
      if (!t0) t0 = now
      const t = now - t0
      const alvo = alvoRef.current
      if (alvo) {
        const rb = alvo.getBoundingClientRect()
        const bx = rb.left + rb.width / 2, by = rb.top + rb.height / 2
        modo.particulas.forEach((p, i) => {
          const el = spanRefs.current[i]; if (!el) return
          const lt = (t - p.delay) / p.dur
          if (lt <= 0) { el.style.opacity = '0'; el.style.transform = `translate(${p.sx - 6}px, ${p.sy - 6}px)`; return }
          if (lt >= 1) { el.style.opacity = '0'; return }
          const e = easeOut(lt)
          const mx = (p.sx + bx) / 2, my = (p.sy + by) / 2
          const dx = bx - p.sx, dy = by - p.sy, len = Math.hypot(dx, dy) || 1
          const cxp = mx + (-dy / len) * p.curva, cyp = my + (dx / len) * p.curva
          const x = bezier(e, p.sx, cxp, bx), y = bezier(e, p.sy, cyp, by)
          el.style.opacity = String(lt < 0.15 ? lt / 0.15 : lt > 0.82 ? Math.max(0, (1 - lt) / 0.18) : 1)
          el.style.transform = `translate(${x - 6}px, ${y - 6}px) scale(${0.55 + 0.45 * (1 - lt)})`
        })
        const lab = labelRef.current
        if (lab) {
          const lt = t / 2600
          lab.style.transform = `translate(${bx}px, ${by - 26 - 64 * Math.min(1, lt)}px)`
          lab.style.opacity = String(lt < 0.15 ? lt / 0.15 : lt > 0.8 ? Math.max(0, (1 - lt) / 0.2) : 1)
        }
      }
      if (t < FIM) raf = requestAnimationFrame(frame)
      else setModo(null)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [modo])

  if (!modo || typeof document === 'undefined') return null

  if (modo.tipo === 'levelup') {
    return <LevelUpModal from={modo.from} to={modo.to} curva={modo.curva} gains={modo.gains} unlocked={[]} xpGanho={modo.xpGanho} totalXp={modo.totalXp} streak={modo.streak} badgesLabel={modo.badges} logo={modo.logo} onClose={() => setModo(null)} />
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[120] overflow-hidden">
      {modo.particulas.map((_, i) => (
        <span key={i} ref={(el) => { spanRefs.current[i] = el }} className="absolute left-0 top-0 h-3 w-3 rounded-full opacity-0"
          style={{ background: 'var(--brand-primary, var(--primary))', boxShadow: '0 0 12px 3px color-mix(in oklab, var(--brand-primary, var(--primary)) 70%, transparent)' }} />
      ))}
      <span ref={labelRef} className="absolute left-0 top-0 opacity-0">
        <span className="block -translate-x-1/2 whitespace-nowrap text-lg font-extrabold text-primary drop-shadow">+{modo.xp.toLocaleString('pt-BR')} XP</span>
      </span>
    </div>,
    document.body,
  )
}
