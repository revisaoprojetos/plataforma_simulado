'use client'

import { useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AbasLinha } from '@/components/ui/abas-linha'
import { useCan } from '@/components/auth/can-provider'
import { grupoDaRota, gruposVisiveis, hrefDoGrupo, modalidadePorId } from '@/lib/admin/cronogramas-nav'

/**
 * Navegação interna de Cronogramas: UMA fileira = as ABAS da modalidade ativa (5 por modalidade). A 1ª fileira
 * (Gerador | Adaptativo) é a BarraSetor, posicionada pelo CabecalhoArea. NÃO existe 3ª fileira: as telas de cada aba
 * são abas internas do conteúdo (<VistasCronograma />). Fonte dos dados/casamento: lib/admin/cronogramas-nav.ts.
 * Desempenho: a aba atual prefetcha normalmente; as outras só no hover/foco (router.prefetch).
 */
export function CronogramasNav() {
  const pathname = usePathname()
  const search = useSearchParams()
  const can = useCan()
  const router = useRouter()
  const jaPrefetch = useRef(new Set<string>())
  const rota = grupoDaRota(pathname, search)
  if (!rota) return null

  const grupos = gruposVisiveis(modalidadePorId(rota.modalidade.id), can)
  if (grupos.length < 2) return null // uma aba só não precisa de fileira

  const prefetchSob = (e: React.SyntheticEvent) => {
    const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null
    const href = a?.getAttribute('href')
    if (!href || jaPrefetch.current.has(href)) return
    jaPrefetch.current.add(href)
    router.prefetch(href)
  }

  return (
    <div onPointerOver={prefetchSob} onFocus={prefetchSob}>
      <AbasLinha
        aria-label={`Abas de ${rota.modalidade.label}`}
        ativo={rota.grupo.id}
        itens={grupos.map((g) => ({ key: g.id, label: g.label, href: hrefDoGrupo(g), prefetch: g.id === rota.grupo.id ? undefined : false }))}
      />
    </div>
  )
}
