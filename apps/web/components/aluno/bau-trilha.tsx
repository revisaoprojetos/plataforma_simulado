'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy, Check, Loader2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Baú da trilha: quando TODOS os simulados da trilha estão concluídos, fica liberado para resgate,
 * pulsando. Ao clicar, abre um card com o XP da recompensa + botão "Recolher". O resgate é ÚNICO
 * (idempotente no servidor via ledger de XP, origem 'chest', ref 'trilha:<grupo>'); a UI marca o
 * estado recolhido em localStorage para não pulsar de novo.
 */
export function BauTrilha({ grupoId, xp, liberado, gamAtivo, resgatadoServidor = false }: { grupoId: string; xp: number; liberado: boolean; gamAtivo: boolean; resgatadoServidor?: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [resgatado, setResgatado] = useState(resgatadoServidor)
  const [busy, setBusy] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  useEffect(() => { if (resgatadoServidor) setResgatado(true) }, [resgatadoServidor])
  // Clique fora → recolhe o card do baú.
  useEffect(() => {
    if (!aberto) return
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [aberto])

  const podePulsar = liberado && !resgatado

  async function recolher() {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/aluno/gamificacao/bau-trilha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grupoId }) })
      const j = await r.json().catch(() => ({} as any))
      if (j?.ok) {
        setResgatado(true)
        // XP recém-concedido → celebração a partir do baú (pontinhos p/ a barra ou level-up).
        if (j.awarded && j.xp > 0) {
          const rect = btnRef.current?.getBoundingClientRect()
          const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
          const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
          try { window.dispatchEvent(new CustomEvent('gam:recelebrar', { detail: { x, y } })) } catch { /* ignore */ }
          // Revalida a rota (após a animação) p/ o baú/progresso persistirem ao navegar/voltar.
          setTimeout(() => { try { router.refresh() } catch { /* ignore */ } }, 3800)
        }
      }
    } finally {
      setBusy(false)
      setAberto(false)
    }
  }

  return (
    <div ref={rootRef} className="relative text-center">
      <button
        ref={btnRef} type="button" disabled={!liberado} onClick={() => liberado && setAberto((v) => !v)} aria-label="Baú da trilha"
        className={cn('relative mx-auto flex items-center justify-center rounded-2xl border-4 transition-transform focus:outline-none', liberado ? 'hover:scale-105' : 'cursor-default', podePulsar && 'motion-safe:animate-[bau-pulse_1.5s_ease-in-out_infinite]')}
        style={{ width: 56, height: 56, ...(resgatado ? { background: '#10b981', borderColor: '#059669', color: '#fff' } : liberado ? { background: 'var(--brand-accent, #f59e0b)', borderColor: 'color-mix(in oklab, var(--brand-accent, #f59e0b) 70%, #000)', color: '#fff' } : { background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
        {resgatado ? <Check className="h-6 w-6" /> : <Trophy className="h-6 w-6" />}
      </button>
      <div className="mt-1.5 inline-block rounded-lg border bg-background/85 px-2 py-0.5 shadow-sm backdrop-blur-sm">
        <span className="block text-xs font-semibold">Baú da trilha</span>
        <span className="block text-[11px] text-muted-foreground">
          {resgatado ? 'Recompensa recolhida ✓' : liberado ? 'Toque para resgatar 🎉' : (gamAtivo && xp > 0 ? `+${xp} XP` : 'Complete a trilha')}
        </span>
      </div>

      {aberto && liberado && (
        <div className="absolute top-7 z-30 w-[210px] -translate-y-1/2 rounded-2xl border bg-card p-3.5 text-center shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200" style={{ left: 'calc(50% + 40px)' }}>
          <span className="pointer-events-none absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border border-b-0 border-r-0 bg-card" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="inline-flex items-center gap-1 text-xl font-extrabold text-primary"><Zap className="h-5 w-5" /> +{xp} XP</span>
            <span className="text-[11px] text-muted-foreground">recompensa da trilha</span>
          </div>
          {resgatado ? (
            <div className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" /> Já recolhido</div>
          ) : (
            <button type="button" onClick={recolher} disabled={busy}
              className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trophy className="h-4 w-4" /> Recolher</>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
