'use client'

import { useEffect, useState } from 'react'

let cachedPermissions: string[] | null = null

async function loadPermissions(): Promise<string[]> {
  if (cachedPermissions !== null) return cachedPermissions

  try {
    // Cookies are sent automatically for same-origin requests
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (!res.ok) return []
    const json = await res.json()
    cachedPermissions = json.permissions ?? []
    return cachedPermissions!
  } catch {
    return []
  }
}

// Reset cache on logout or session change
export function resetPermissionsCache() {
  cachedPermissions = null
}

/**
 * Check if the current user has a specific permission.
 * Permissions are loaded once per session and cached in memory.
 *
 * @example
 * const can = useCan('simulados:create')
 */
export function useCan(permission: string): boolean {
  const [allowed, setAllowed] = useState<boolean>(false)

  useEffect(() => {
    loadPermissions().then((perms) => {
      // super_admin and admin_geral have all permissions
      const hasAll = perms.includes('*') || perms.includes('all')
      setAllowed(hasAll || perms.includes(permission))
    })
  }, [permission])

  return allowed
}

/**
 * Check multiple permissions at once.
 * Returns a map of permission → boolean.
 *
 * @example
 * const can = useCanMany(['simulados:create', 'questoes:delete'])
 * if (can['simulados:create']) { ... }
 */
export function useCanMany(permissions: string[]): Record<string, boolean> {
  const [allowed, setAllowed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    loadPermissions().then((perms) => {
      const hasAll = perms.includes('*') || perms.includes('all')
      const result: Record<string, boolean> = {}
      for (const p of permissions) {
        result[p] = hasAll || perms.includes(p)
      }
      setAllowed(result)
    })
  }, [permissions.join(',')])

  return allowed
}
