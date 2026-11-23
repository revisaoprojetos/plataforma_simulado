'use client'

import { createContext, Suspense, useContext, useMemo } from 'react'
import type { SidebarRotulosAdmin } from '@/lib/sidebar-rotulos'
import { BarraSetor } from '@/components/admin/barra-setor'

/**
 * SLOT da barra de abas do setor. O layout do /admin só monta o PROVIDER (com o que a barra precisa) em volta
 * do conteúdo da página; cada cabeçalho compartilhado (RevisaoHead, EstudioHeader, SecaoHeader…) ou página
 * posiciona `<BarraSetorSlot />` logo ABAIXO do título/descrição e ACIMA das abas próprias/conteúdo.
 *
 * - Sem provider (erro, "sem acesso", manutenção) → o slot não renderiza nada.
 * - Aparece UMA vez por página: se houver 2 slots, só o primeiro no DOM mostra a barra (o outro se oculta
 *   antes do paint, em useLayoutEffect dentro da BarraSetor — sem mismatch de hidratação, pois o 1º render é idêntico no servidor).
 * - Regra de visibilidade = a da BarraSetor (some com 1 item, `abasProprias`, rota sem setor, permissões…).
 */
interface Ctx { isSuperAdmin: boolean; areasBloqueadas: string[]; rotulos?: SidebarRotulosAdmin }

const BarraSetorCtx = createContext<Ctx | null>(null)

export function BarraSetorProvider({ isSuperAdmin = false, areasBloqueadas = [], rotulos, children }: {
  isSuperAdmin?: boolean; areasBloqueadas?: string[]; rotulos?: SidebarRotulosAdmin; children: React.ReactNode
}) {
  const valor = useMemo(() => ({ isSuperAdmin, areasBloqueadas, rotulos }), [isSuperAdmin, areasBloqueadas, rotulos])
  return <BarraSetorCtx.Provider value={valor}>{children}</BarraSetorCtx.Provider>
}

export function BarraSetorSlot() {
  const ctx = useContext(BarraSetorCtx)
  if (!ctx) return null
  return (
    <Suspense fallback={null}>
      <BarraSetor isSuperAdmin={ctx.isSuperAdmin} areasBloqueadas={ctx.areasBloqueadas} rotulos={ctx.rotulos} />
    </Suspense>
  )
}
