'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { rastreioDaPagina } from '@/app/admin/estudantes/rastreio-actions'
import type { RastreioLinha } from '@/lib/acessos/leitura'

export type Rastreio = RastreioLinha

export function fmtRelRastreio(iso: string | null) {
  if (!iso) return '—'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  if (m < 1440) return `há ${Math.floor(m / 60)} h`
  return `há ${Math.floor(m / 1440)} d`
}

/**
 * Busca o rastreio dos ids VISÍVEIS (página atual, ≤200) no servidor. `mapa === null` enquanto
 * não souber / sem permissão `acessos:view` → a tabela não mostra as colunas.
 */
export function useRastreioPagina(ids: string[]): { mapa: Record<string, Rastreio> | null; liberado: boolean } {
  const [mapa, setMapa] = useState<Record<string, Rastreio>>({})
  const [liberado, setLiberado] = useState(false)
  const chave = ids.join(',')
  const buscados = useRef(new Set<string>())
  useEffect(() => {
    const falta = ids.filter((i) => !buscados.current.has(i))
    if (!falta.length) return
    let vivo = true
    rastreioDaPagina(falta).then((r) => {
      if (!vivo || r == null) return
      for (const i of falta) buscados.current.add(i)
      setLiberado(true)
      setMapa((m) => ({ ...m, ...r }))
    }).catch(() => {})
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])
  return { mapa: liberado ? mapa : null, liberado }
}

export const RASTREIO_TH = { ultimo: 'Último acesso', aparelho: 'Aparelho · IP', sessoes: 'Sessões · tempo (30d)' } as const

export function RastreioUltimo({ r }: { r: Rastreio | null | undefined }) {
  if (!r) return <span className="text-muted-foreground">sem registro</span>
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <span className={cn('h-2 w-2 rounded-full', r.online ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
      <span className={r.online ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>{r.online ? 'Online' : fmtRelRastreio(r.ultimo)}</span>
    </span>
  )
}
export function RastreioAparelho({ r }: { r: Rastreio | null | undefined }) {
  if (!r) return <span className="text-muted-foreground">—</span>
  return <span className="text-xs text-muted-foreground"><span className="block truncate">{r.aparelho}</span><span className="block tabular-nums">{r.ip ?? '—'}</span></span>
}
export function RastreioSessoes({ r }: { r: Rastreio | null | undefined }) {
  if (!r) return <span className="text-muted-foreground">—</span>
  return <span className="text-xs tabular-nums"><b>{r.sessoes30d}</b> <span className="text-muted-foreground">· {r.tempo30d}</span></span>
}
