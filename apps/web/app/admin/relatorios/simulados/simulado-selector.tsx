'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function SimuladoSelector({ simulados, atual }: { simulados: { id: string; titulo: string }[]; atual?: string }) {
  const router = useRouter()
  const sp = useSearchParams()
  return (
    <select
      value={atual ?? ''}
      onChange={(e) => {
        const p = new URLSearchParams(sp.toString())
        if (e.target.value) p.set('simulado', e.target.value); else p.delete('simulado')
        router.push(`/admin/relatorios/simulados?${p.toString()}`)
      }}
      className="w-full max-w-md rounded-md border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">Selecione um simulado…</option>
      {simulados.map((s) => <option key={s.id} value={s.id}>{s.titulo}</option>)}
    </select>
  )
}
