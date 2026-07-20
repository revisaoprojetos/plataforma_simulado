'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

type Estado = { inicio: string | null; avisos: number[]; agora: boolean }

/**
 * Roda no portal do aluno: consulta a manutenção periodicamente, dispara os
 * avisos (ex.: 10/5/1 min antes do início) e recarrega a página quando a
 * manutenção começa (o layout do servidor então mostra a tela de manutenção).
 * NÃO é montado no runner do simulado — quem está numa prova não é interrompido.
 */
export function MonitorManutencao({ inicial }: { inicial: { inicio: string | null; avisos: number[] } }) {
  const avisados = useRef<Set<number>>(new Set())
  const primeira = useRef(true)

  useEffect(() => {
    let vivo = true
    let estado: Estado = { inicio: inicial.inicio, avisos: inicial.avisos, agora: false }

    async function tick() {
      try {
        const r = await fetch('/api/sistema/manutencao', { cache: 'no-store' })
        if (r.ok) {
          const j = await r.json()
          estado = { inicio: j.inicio ?? null, avisos: Array.isArray(j.avisos) ? j.avisos : [], agora: !!j.agora }
        }
      } catch { /* mantém o último estado conhecido */ }
      if (!vivo) return

      if (estado.agora) { window.location.reload(); return }

      if (estado.inicio) {
        const faltaMin = (Date.parse(estado.inicio) - Date.now()) / 60000
        if (faltaMin > 0) {
          for (const n of estado.avisos) {
            if (faltaMin <= n && !avisados.current.has(n)) {
              avisados.current.add(n)
              // Na 1ª leitura só marca os limiares já vencidos (não dispara avisos "atrasados").
              if (!primeira.current) {
                toast.warning(`A plataforma entrará em manutenção em ~${n} min.`, {
                  description: 'Finalize o que estiver fazendo. Provas em andamento não são interrompidas.',
                  duration: 12000,
                })
              }
            }
          }
        }
      }
      primeira.current = false
    }

    tick()
    const id = setInterval(tick, 45000)
    return () => { vivo = false; clearInterval(id) }
  }, [inicial.inicio, inicial.avisos])

  return null
}
