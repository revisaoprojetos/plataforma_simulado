'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useCan } from '@/components/auth/can-provider'
import { RotuloMenu, type SidebarRotulosAdmin } from '@/lib/sidebar-rotulos'
import { SETORES, resolverRota, setoresVisiveis, itensDaBarra } from '@/lib/admin/setores'

/**
 * ABAS INTERNAS da entrada atual da sidebar — renderizada pelo `<BarraSetorSlot />` (barra-setor-slot.tsx), que cada
 * cabeçalho de página posiciona ABAIXO do título/descrição e ACIMA das abas próprias/conteúdo. Mostra SÓ os itens (páginas irmãs) da aba/cluster ativa, em um único nível. A sidebar mostra
 * os clusters; esta barra mostra os irmãos (nunca duplica). Some quando: a rota não pertence a nenhum setor; o
 * cluster tem 1 item só; ou o cluster marca `abasProprias` (a tela já exibe as abas dos mesmos irmãos).
 * Visual idêntico às abas das demais áreas (ConteudosTabs): só texto, linha única `border-b`, ativa em negrito
 * com sublinhado `border-primary`.
 */
export function BarraSetor({ isSuperAdmin = false, areasBloqueadas = [], rotulos }: { isSuperAdmin?: boolean; areasBloqueadas?: string[]; rotulos?: SidebarRotulosAdmin }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const can = useCan()
  const ref = useRef<HTMLElement>(null)
  const [duplicada, setDuplicada] = useState(false)

  // Aparece UMA vez por página: se houver 2 slots montados, só a 1ª barra do documento fica visível.
  useLayoutEffect(() => {
    if (!ref.current) return
    setDuplicada(document.querySelector('[data-barra-setor]') !== ref.current)
  })

  const rota = resolverRota(pathname, search)
  // O que o usuário PODE ver (permissão, flags, super-only, manutenção).
  const itens = itensDaBarra(rota, setoresVisiveis({ can, isSuperAdmin, areasBloqueadas }, SETORES))
  if (!rota || !itens || duplicada) return null

  return (
    <nav ref={ref} data-barra-setor aria-label={`Abas de ${rota.aba.label}`} className="mb-1 print:hidden">
      <div role="tablist" className="flex w-fit max-w-full items-center gap-x-7 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {itens.map((item) => {
          const ativo = rota.item.href === item.href
          return (
            <Link
              key={item.href}
              role="tab"
              aria-selected={ativo}
              aria-current={ativo ? 'page' : undefined}
              href={item.href}
              className={cn(
                '-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[14px] tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                ativo ? 'border-primary font-extrabold text-foreground' : 'border-transparent font-semibold text-muted-foreground hover:text-foreground',
              )}
            >
              <RotuloMenu map={rotulos?.itens} chave={item.href} fallback={item.label} ativo={ativo} />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
