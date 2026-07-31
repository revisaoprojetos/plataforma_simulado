import type { DestinoBanner } from '@/components/admin/banners-manager'

/**
 * Remove destinos com rótulo idêntico dentro do mesmo grupo (ex.: várias pastas homônimas
 * remanescentes). Mantém a primeira ocorrência, preservando a ordem.
 */
export function dedupePorLabel(list: DestinoBanner[]): DestinoBanner[] {
  const vistos = new Set<string>()
  return list.filter((d) => {
    const chave = `${d.grupo ?? ''}::${(d.label ?? '').trim().toLowerCase()}`
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
}
