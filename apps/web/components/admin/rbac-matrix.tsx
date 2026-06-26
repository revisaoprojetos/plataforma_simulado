'use client'

import { useState, useTransition, Fragment } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { saveRolePermissions } from '@/app/admin/rbac/actions'
import { Loader2, Save, Check, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Role {
  id: string
  nome: string
  descricao: string | null
  is_sistema: boolean
}

interface Permission {
  id: string
  resource: string
  action: string
}

interface Props {
  roles: Role[]
  permissions: Permission[]
  byResource: Record<string, Permission[]>
  initialMatrix: Record<string, string[]>
  tenantId: string
}

export function RbacMatrix({ roles, permissions, byResource, initialMatrix, tenantId }: Props) {
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>(
    Object.fromEntries(
      Object.entries(initialMatrix).map(([k, v]) => [k, new Set(v)]),
    ),
  )
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  function toggle(roleId: string, permId: string) {
    setMatrix((prev) => {
      const next = { ...prev }
      const rolePerms = new Set(next[roleId] ?? [])
      if (rolePerms.has(permId)) rolePerms.delete(permId)
      else rolePerms.add(permId)
      next[roleId] = rolePerms
      return next
    })
    setDirty((prev) => new Set([...prev, roleId]))
  }

  function saveRole(roleId: string) {
    startTransition(async () => {
      const permIds = Array.from(matrix[roleId] ?? [])
      const result = await saveRolePermissions(roleId, permIds, tenantId)
      if (result.ok) {
        setDirty((prev) => {
          const next = new Set(prev)
          next.delete(roleId)
          return next
        })
        toast.success('Permissões salvas')
      } else {
        toast.error(result.error ?? 'Erro ao salvar')
      }
    })
  }

  const resources = Object.keys(byResource).sort()

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="sticky left-0 bg-muted/30 px-4 py-3 text-left font-medium text-muted-foreground min-w-[200px]">
              Permissão
            </th>
            {roles.map((role) => (
              <th key={role.id} className="px-3 py-3 text-center min-w-[120px]">
                <div className="flex flex-col items-center gap-1">
                  <span className="font-medium capitalize">{role.nome.replace(/_/g, ' ')}</span>
                  {role.is_sistema && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">sistema</Badge>
                  )}
                  {dirty.has(role.id) && (
                    <Button
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => saveRole(role.id)}
                      disabled={isPending}
                    >
                      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Salvar
                    </Button>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resources.map((resource) => (
            <Fragment key={resource}>
              <tr className="bg-muted/20">
                <td
                  colSpan={roles.length + 1}
                  className="sticky left-0 px-4 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground"
                >
                  <ShieldCheck className="inline h-3 w-3 mr-1" />
                  {resource}
                </td>
              </tr>
              {byResource[resource].map((perm) => (
                <tr key={perm.id} className="border-b hover:bg-muted/10 transition-colors">
                  <td className="sticky left-0 bg-background px-4 py-2 text-muted-foreground">
                    <span className="font-mono text-xs">{perm.action}</span>
                  </td>
                  {roles.map((role) => {
                    const has = matrix[role.id]?.has(perm.id) ?? false
                    return (
                      <td key={role.id} className="px-3 py-2 text-center">
                        <button
                          onClick={() => toggle(role.id, perm.id)}
                          className={cn(
                            'mx-auto flex h-6 w-6 items-center justify-center rounded transition-colors',
                            has
                              ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                              : 'border border-muted-foreground/30 hover:border-primary/60',
                          )}
                          title={has ? 'Remover permissão' : 'Conceder permissão'}
                        >
                          {has && <Check className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
