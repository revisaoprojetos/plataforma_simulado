'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, Gift, Check, Loader2, CalendarCheck } from 'lucide-react'
import type { DiaAtivo } from '@/lib/gamificacao/leitura'

/** Calendário da semana com a chama nos dias ativos (sequência) + baú + check-in do dia.
 * `feitoHoje` = o CHECK-IN do dia já foi feito (streak registrado hoje) — independe de atividade geral. */
export function StreakCalendario({ dias, streak, feitoHoje = false, chestXp = 0, chestCadaN = 0 }: { dias: DiaAtivo[]; streak: number; feitoHoje?: boolean; chestXp?: number; chestCadaN?: number }) {
  const [feito, setFeito] = useState(feitoHoje)
  const [busy, setBusy] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()
  // Streak exibido: se fez o check-in agora e hoje ainda não contava, soma 1 na hora.
  const streakView = streak + (feito && !feitoHoje ? 1 : 0)
  const faltam = chestCadaN > 0 ? (chestCadaN - (streakView % chestCadaN)) % chestCadaN || chestCadaN : 0

  async function checkin() {
    if (busy || feito) return
    setBusy(true)
    try {
      const r = await fetch('/api/aluno/gamificacao/ping', { method: 'POST' })
      const j = await r.json().catch(() => ({} as any))
      if (j?.ok) {
        setFeito(true)
        // XP do streak recém-concedido → celebração (pontinhos p/ a barra ou level-up).
        const rect = btnRef.current?.getBoundingClientRect()
        const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
        const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
        try { window.dispatchEvent(new CustomEvent('gam:recelebrar', { detail: { x, y } })) } catch { /* ignore */ }
        // Revalida a rota (após a animação) p/ o progresso e o "feito" persistirem ao navegar/voltar.
        setTimeout(() => { try { router.refresh() } catch { /* ignore */ } }, 3800)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Flame className="h-4 w-4 text-orange-500" /> Sequência</h3>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{streakView} {streakView === 1 ? 'dia' : 'dias'}</span>
      </div>
      <div className="flex justify-between gap-1">
        {dias.map((d, i) => {
          const aceso = d.hoje ? feito : d.ativo
          return (
            <div key={d.dia} className="flex flex-1 flex-col items-center gap-1.5">
              <span className={`text-[10px] font-medium uppercase ${d.hoje ? 'text-foreground' : 'text-muted-foreground'}`}>{d.label}</span>
              <span className={`flex h-9 w-9 items-center justify-center rounded-full border ${aceso ? 'border-orange-500 bg-gradient-to-b from-amber-400 to-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.45)]' : 'bg-muted text-muted-foreground/40'} ${d.hoje ? 'ring-2 ring-primary/40' : ''}`}>
                <Flame className="h-4 w-4" fill={aceso ? 'currentColor' : 'none'} style={aceso ? { animation: `streak-flame 1.8s ease-in-out ${i * 0.15}s infinite` } : undefined} />
              </span>
            </div>
          )
        })}
      </div>

      {/* Check-in do dia — confirma o acesso de hoje (acende a chama de hoje). */}
      {feito ? (
        <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          <Check className="h-4 w-4" /> Check-in de hoje feito
        </div>
      ) : (
        <button ref={btnRef} type="button" onClick={checkin} disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CalendarCheck className="h-4 w-4" /> Fazer check-in de hoje</>}
        </button>
      )}

      {chestXp > 0 && chestCadaN > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/30 p-2.5 text-xs">
          <Gift className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">Baú da sequência: <span className="font-semibold text-primary">+{chestXp} XP</span> — mantenha {chestCadaN} dias{faltam > 0 ? <> e ganhe · faltam <span className="font-semibold text-foreground">{faltam}</span></> : null}.</span>
        </div>
      )}
    </div>
  )
}
