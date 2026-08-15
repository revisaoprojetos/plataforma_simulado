'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardList, Zap, Award, Flame, Gift, Route, Target } from 'lucide-react'
import { progressoNivel, xpAcumuladoParaNivel, tituloParaNivel } from '@/lib/gamificacao/niveis'
import { LevelUpModal, type GanhoXp } from '@/components/aluno/level-up-modal'
import type { NivelCurva } from '@/lib/gamificacao/config'

type Evento = { chave: string; xp: number; origem: string }
type Particula = { sx: number; sy: number; delay: number; dur: number; curva: number }
type Ponto = { x: number; y: number }

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const bezier = (t: number, a: number, b: number, c: number) => { const u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c }

const ICO: Record<string, React.ReactNode> = {
  simulado: <ClipboardList className="h-4 w-4" />, missao: <Target className="h-4 w-4" />, conquista: <Award className="h-4 w-4" />,
  streak: <Flame className="h-4 w-4" />, chest: <Gift className="h-4 w-4" />, pratica: <Zap className="h-4 w-4" />, trilha: <Route className="h-4 w-4" />,
}
const LABEL: Record<string, string> = {
  simulado: 'Simulados concluídos', missao: 'Missões diárias', conquista: 'Conquistas desbloqueadas',
  streak: 'Sequência diária', chest: 'Baú', pratica: 'Prática de questões', trilha: 'Bônus de trilha',
}
const COR: Record<string, string> = {
  simulado: '#38bdf8', missao: '#34d399', conquista: '#fbbf24', streak: '#fb923c', chest: '#a78bfa', pratica: '#22d3ee', trilha: '#f472b6',
}

// Monta as partículas (origem por tipo: 'missao' → card de missões; demais → canto sup. direito).
function montarParticulas(novos: Evento[]): Particula[] {
  const sum = novos.reduce((a, e) => a + e.xp, 0) || 1
  const topRight = { x: window.innerWidth - 36, y: 30 }
  const missaoEl = document.querySelector('[data-missoes-card]') as HTMLElement | null
  const missaoPt = missaoEl ? (() => { const m = missaoEl.getBoundingClientRect(); return { x: m.left + m.width / 2, y: m.top + m.height / 2 } })() : topRight
  const pontoDe = (origem: string) => (origem === 'missao' ? missaoPt : topRight)
  const porOrigem = new Map<string, number>()
  for (const e of novos) porOrigem.set(e.origem, (porOrigem.get(e.origem) ?? 0) + e.xp)
  const totalN = Math.min(46, 16 + Math.round(sum / 3))
  const out: Particula[] = []
  for (const [origem, xp] of porOrigem) {
    const p = pontoDe(origem)
    const cnt = Math.max(6, Math.round(totalN * (xp / sum)))
    for (let i = 0; i < cnt; i++) out.push({ sx: p.x + (Math.random() - 0.5) * 90, sy: p.y + (Math.random() - 0.5) * 70, delay: Math.random() * 650, dur: 1600 + Math.random() * 600, curva: (Math.random() - 0.5) * 180 })
  }
  return out
}

// Partículas a partir de um PONTO específico (ex.: baú/check-in) rumo à barra.
function montarParticulasDe(origin: Ponto, xp: number): Particula[] {
  const cnt = Math.min(46, Math.max(10, 16 + Math.round(xp / 3)))
  const out: Particula[] = []
  for (let i = 0; i < cnt; i++) out.push({ sx: origin.x + (Math.random() - 0.5) * 70, sy: origin.y + (Math.random() - 0.5) * 60, delay: Math.random() * 650, dur: 1600 + Math.random() * 600, curva: (Math.random() - 0.5) * 180 })
  return out
}

const marcar = (novos: Evento[]) => { for (const e of novos) { try { localStorage.setItem(`xpceleb:${e.chave}`, '1') } catch { /* ignore */ } } }

// Espera o pop-up de entrada (banner pós-login) fechar antes de mostrar a celebração.
function aguardarPopup(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !document.querySelector('[data-portal-popup]')) return resolve()
    let done = false
    const fim = () => { if (done) return; done = true; window.removeEventListener('portal:popup-fechado', fim); clearTimeout(t); setTimeout(resolve, 350) }
    window.addEventListener('portal:popup-fechado', fim)
    const t = setTimeout(fim, 20000)
  })
}

type Modo =
  | null
  | { tipo: 'particulas'; particulas: Particula[]; xp: number }
  | { tipo: 'levelup'; from: number; to: number; curva: NivelCurva; gains: GanhoXp[]; xpGanho: number; totalXp: number; streak: number; badges: string; logo: string | null; novos: Evento[]; jaEncheu?: boolean }

/**
 * Orquestra a celebração de XP na Início: SUBIU de nível → modal de Level Up; senão XP novo →
 * pontinhos voando para a barra. Roda no carregamento e também SOB DEMANDA (evento `gam:recelebrar`)
 * quando o aluno ganha XP na própria tela (check-in do dia, baú da trilha), com um ponto de origem.
 */
export function CelebracaoXp({ assistenteAtivo = false }: { assistenteAtivo?: boolean }) {
  const [modo, setModo] = useState<Modo>(null)
  const alvoRef = useRef<HTMLElement | null>(null)
  const spanRefs = useRef<(HTMLSpanElement | null)[]>([])
  const labelRef = useRef<HTMLSpanElement | null>(null)
  const jaRodou = useRef(false)
  const pendingLevelupRef = useRef<Modo | null>(null) // level-up que abre DEPOIS da barra encher
  const celebrandoTourRef = useRef(false) // celebração disparada pelo tour de novidades

  // Núcleo reutilizável: decide level-up x partículas a partir do estado atual do servidor.
  const celebrar = useCallback(async (origin: Ponto | null, esperarPopup: boolean): Promise<boolean> => {
    try {
      const r = await fetch('/api/aluno/gamificacao/celebracao').then((x) => x.json())
      if (!r?.curva) return false
      const curva: NivelCurva = r.curva
      const eventos: Evento[] = r.eventos ?? []
      const novos = eventos.filter((e) => { try { return !localStorage.getItem(`xpceleb:${e.chave}`) } catch { return false } })

      const nivelKey = `nivelCeleb:${r.est ?? 'x'}`
      const atual = progressoNivel(r.xpTotal, curva).nivel
      let stored = parseInt(localStorage.getItem(nivelKey) ?? '', 10)
      if (!Number.isFinite(stored)) stored = 1 // 1º acesso: catch-up a partir do nível 1

      // ── SUBIU DE NÍVEL → modal de Level Up ──
      if (atual > stored) {
        const porOrigem = new Map<string, number>()
        for (const e of novos) porOrigem.set(e.origem, (porOrigem.get(e.origem) ?? 0) + e.xp)
        const gains: GanhoXp[] = [...porOrigem.entries()].map(([origem, xp]) => ({ icon: ICO[origem] ?? <Zap className="h-4 w-4" />, label: LABEL[origem] ?? 'XP', xp, cor: COR[origem] }))
        const xpGanho = gains.length ? gains.reduce((a, g) => a + g.xp, 0) : Math.max(0, r.xpTotal - xpAcumuladoParaNivel(stored, curva))
        const levelModo: Modo = { tipo: 'levelup', from: stored, to: atual, curva, gains, xpGanho, totalXp: r.xpTotal, streak: r.streak ?? 0, badges: `${r.badges?.unlocked ?? 0} de ${r.badges?.total ?? 0}`, logo: r.logo ?? null, novos }
        const alvo = document.querySelector('[data-nivel-alvo]') as HTMLElement | null
        const reduz = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

        // Clique no portal (com origem): enche/cruza a barra PRIMEIRO — o cargo permanece o antigo
        // (manterCargo) — e o modal de level-up abre só quando a animação termina.
        if (origin && alvo && !reduz) {
          const sum = novos.reduce((a, e) => a + e.xp, 0) || xpGanho
          const de = progressoNivel(Math.max(0, r.xpTotal - sum), curva)
          const para = progressoNivel(r.xpTotal, curva)
          marcar(novos)
          try { localStorage.setItem(nivelKey, String(atual)) } catch { /* ignore */ }
          window.dispatchEvent(new CustomEvent('nivel:encher', { detail: { de, para, manterCargo: true } }))
          alvoRef.current = alvo
          spanRefs.current = []
          pendingLevelupRef.current = { ...levelModo, jaEncheu: true }
          setModo({ tipo: 'particulas', particulas: montarParticulasDe(origin, sum), xp: sum })
          return true
        }

        // Carregamento (catch-up) / reduced motion → modal direto.
        if (esperarPopup) await aguardarPopup()
        marcar(novos)
        try { localStorage.setItem(nivelKey, String(atual)) } catch { /* ignore */ }
        setModo(levelModo)
        return true
      }

      try { localStorage.setItem(nivelKey, String(atual)) } catch { /* ignore */ }

      // ── XP novo SEM subir de nível → pontinhos para a barra ──
      if (!novos.length) return false
      const alvo = document.querySelector('[data-nivel-alvo]') as HTMLElement | null
      if (!alvo) return false
      const sum = novos.reduce((a, e) => a + e.xp, 0)
      const de = progressoNivel(Math.max(0, r.xpTotal - sum), curva)
      const para = progressoNivel(r.xpTotal, curva)
      if (esperarPopup) await aguardarPopup()
      marcar(novos)
      window.dispatchEvent(new CustomEvent('nivel:encher', { detail: { de, para } }))
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true
      alvoRef.current = alvo
      spanRefs.current = []
      setModo({ tipo: 'particulas', particulas: origin ? montarParticulasDe(origin, sum) : montarParticulas(novos), xp: sum })
      return true
    } catch { return false }
  }, [])

  // Carregamento inicial (com espera do pop-up de entrada) + 1 retry para o award assíncrono.
  useEffect(() => {
    if (jaRodou.current) return
    // No 1º acesso com o tour de novidades ativo, quem dispara a celebração (level-up) é o TOUR,
    // na hora certa — aqui NÃO auto-roda para o level-up não aparecer antes da capivara.
    const tourVaiRodar = !!assistenteAtivo && typeof localStorage !== 'undefined' && !localStorage.getItem('mascote-tour-gam:v1')
    if (tourVaiRodar) return
    jaRodou.current = true
    let cancelado = false
    const timers: any[] = []
    timers.push(setTimeout(async () => {
      if (cancelado) return
      if (await celebrar(null, true)) return
      timers.push(setTimeout(() => { if (!cancelado) celebrar(null, true) }, 1800))
    }, 700))
    return () => { cancelado = true; timers.forEach(clearTimeout) }
  }, [celebrar, assistenteAtivo])

  // Tour de novidades: dispara a celebração (level-up) na hora certa e avisa quando termina.
  useEffect(() => {
    const onTour = async () => {
      celebrandoTourRef.current = true
      const ok = await celebrar(null, false)
      if (!ok) { celebrandoTourRef.current = false; window.dispatchEvent(new CustomEvent('tour:celebrar-fim')) }
    }
    window.addEventListener('tour:celebrar', onTour)
    return () => window.removeEventListener('tour:celebrar', onTour)
  }, [celebrar])

  // Sob demanda: check-in do dia / baú da trilha recolhido (com origem dos pontinhos).
  useEffect(() => {
    const onRecelebrar = async (ev: Event) => {
      const d = (ev as CustomEvent).detail as { x?: number; y?: number } | undefined
      const origin: Ponto | null = (d && typeof d.x === 'number' && typeof d.y === 'number') ? { x: d.x, y: d.y } : null
      // O award é assíncrono; tenta algumas vezes até o cache refletir o novo XP.
      for (let i = 0; i < 4; i++) {
        if (await celebrar(origin, false)) return
        await new Promise((res) => setTimeout(res, 700))
      }
    }
    window.addEventListener('gam:recelebrar', onRecelebrar as EventListener)
    return () => window.removeEventListener('gam:recelebrar', onRecelebrar as EventListener)
  }, [celebrar])

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
      else {
        const pend = pendingLevelupRef.current
        if (pend) { pendingLevelupRef.current = null; setModo(pend) } // barra encheu → agora o level-up
        else setModo(null)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [modo])

  if (!modo || typeof document === 'undefined') return null

  if (modo.tipo === 'levelup') {
    const m = modo
    // Ao fechar o level-up: volta para a Início com XP voando p/ a barra + desbloqueio do cargo.
    const aoFechar = () => {
      // Tour de novidades: fecha o level-up e avisa o tour p/ seguir (sem os pontinhos de follow-up).
      if (celebrandoTourRef.current) {
        celebrandoTourRef.current = false
        setModo(null)
        window.dispatchEvent(new CustomEvent('tour:celebrar-fim'))
        return
      }
      // In-portal: a barra JÁ cruzou o nível durante os pontinhos; agora (depois do level-up) só
      // acontece a transformação do cargo — nunca imediatamente ao pular de nível.
      if (m.jaEncheu) {
        try {
          const cargoDepois = tituloParaNivel(m.to, m.curva.titulos)
          const cargoAntes = tituloParaNivel(m.from, m.curva.titulos)
          if (cargoDepois && cargoDepois !== cargoAntes) window.dispatchEvent(new CustomEvent('nivel:cargo', { detail: { anterior: cargoAntes, titulo: cargoDepois } }))
        } catch { /* ignore */ }
        setModo(null)
        return
      }
      try {
        const para = progressoNivel(m.totalXp, m.curva)
        const de = progressoNivel(xpAcumuladoParaNivel(m.to, m.curva), m.curva)
        window.dispatchEvent(new CustomEvent('nivel:encher', { detail: { de, para } }))
        const cargoDepois = tituloParaNivel(m.to, m.curva.titulos)
        const cargoAntes = tituloParaNivel(m.from, m.curva.titulos)
        if (cargoDepois && cargoDepois !== cargoAntes) {
          window.dispatchEvent(new CustomEvent('nivel:cargo', { detail: { anterior: cargoAntes, titulo: cargoDepois } }))
        }
        const alvo = document.querySelector('[data-nivel-alvo]') as HTMLElement | null
        const reduz = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        if (alvo && m.novos.length && !reduz) {
          alvoRef.current = alvo; spanRefs.current = []
          setModo({ tipo: 'particulas', particulas: montarParticulas(m.novos), xp: m.novos.reduce((a, e) => a + e.xp, 0) })
          return
        }
      } catch { /* ignore */ }
      setModo(null)
    }
    return <LevelUpModal from={m.from} to={m.to} curva={m.curva} gains={m.gains} unlocked={[]} xpGanho={m.xpGanho} totalXp={m.totalXp} streak={m.streak} badgesLabel={m.badges} logo={m.logo} onClose={aoFechar} mascote={assistenteAtivo} />
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
