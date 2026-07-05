'use client'

import { useRouter, useSearchParams } from 'next/navigation'

/** Dropdown que navega para `base?param=<id>` (mantendo os outros query params). */
export function Seletor({ opcoes, atual, param, base, placeholder }: {
  opcoes: { id: string; nome: string }[]; atual?: string; param: string; base: string; placeholder: string
}) {
  const router = useRouter()
  const sp = useSearchParams()
  return (
    <select
      value={atual ?? ''}
      onChange={(e) => {
        const p = new URLSearchParams(sp.toString())
        if (e.target.value) p.set(param, e.target.value); else p.delete(param)
        router.push(`${base}?${p.toString()}`)
      }}
      className="w-full max-w-md rounded-md border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">{placeholder}</option>
      {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
    </select>
  )
}
