'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Check-in do dia (streak) para os homes branded. Chama o MESMO endpoint do portal
 *  (`/api/aluno/gamificacao/ping` → onAtividadeDiaria), que PERSISTE o streak e credita o XP.
 *  Antes os homes branded só faziam `setChecked(true)` local (mock): o dia não acendia de verdade
 *  e o XP nunca era somado. Dispara a celebração de XP e revalida a rota para refletir o novo total. */
export function useCheckin(checkinHoje: boolean) {
  const [checked, setChecked] = useState(checkinHoje)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function fazer(ev?: { clientX: number; clientY: number }) {
    if (busy || checked) return
    setBusy(true)
    try {
      const r = await fetch('/api/aluno/gamificacao/ping', { method: 'POST' })
      const j = await r.json().catch(() => ({} as any))
      if (j?.ok) {
        setChecked(true)
        const x = ev?.clientX ?? window.innerWidth / 2
        const y = ev?.clientY ?? window.innerHeight / 2
        try { window.dispatchEvent(new CustomEvent('gam:recelebrar', { detail: { x, y } })) } catch { /* ignore */ }
        // Após a animação, revalida p/ o streak/XP novos persistirem ao navegar/voltar.
        setTimeout(() => { try { router.refresh() } catch { /* ignore */ } }, 3800)
      }
    } finally {
      setBusy(false)
    }
  }

  return { checked, busy, fazer }
}
