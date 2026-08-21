'use client'

import { createContext, useContext, useMemo } from 'react'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'

interface CanContextValue {
  isAdmin: boolean
  permissions: string[]
  ocultarDiscursiva: boolean
}

const CanContext = createContext<CanContextValue>({ isAdmin: false, permissions: [], ocultarDiscursiva: OCULTAR_DISCURSIVA })

export function CanProvider({
  isAdmin,
  permissions,
  ocultarDiscursiva,
  children,
}: {
  isAdmin: boolean
  permissions: string[]
  ocultarDiscursiva?: boolean
  children: React.ReactNode
}) {
  // Fallback para o env global quando o layout não resolve (ex.: fora do /admin).
  const oc = ocultarDiscursiva ?? OCULTAR_DISCURSIVA
  const value = useMemo(() => ({ isAdmin, permissions, ocultarDiscursiva: oc }), [isAdmin, permissions, oc])
  return <CanContext.Provider value={value}>{children}</CanContext.Provider>
}

/**
 * Hook para esconder UI por permissão. `useCan('questoes:create')`.
 * Admin (ou permissão coringa "*") vê tudo.
 */
export function useCan() {
  const { isAdmin, permissions } = useContext(CanContext)
  return (permission?: string) => {
    if (!permission) return true
    if (isAdmin || permissions.includes('*')) return true
    return permissions.includes(permission)
  }
}

/**
 * Esconder as opções de DISCURSIVA (por-tenant). True quando a discursiva está oculta —
 * seja por env global (deploy) ou porque a área "Correção discursiva" está em manutenção.
 * O valor é resolvido no layout do /admin e distribuído por este provider.
 */
export function useOcultarDiscursiva() {
  return useContext(CanContext).ocultarDiscursiva
}
