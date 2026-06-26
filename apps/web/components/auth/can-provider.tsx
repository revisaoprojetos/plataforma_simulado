'use client'

import { createContext, useContext, useMemo } from 'react'

interface CanContextValue {
  isAdmin: boolean
  permissions: string[]
}

const CanContext = createContext<CanContextValue>({ isAdmin: false, permissions: [] })

export function CanProvider({
  isAdmin,
  permissions,
  children,
}: {
  isAdmin: boolean
  permissions: string[]
  children: React.ReactNode
}) {
  const value = useMemo(() => ({ isAdmin, permissions }), [isAdmin, permissions])
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
