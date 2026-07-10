import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { ArrowLeft, ShieldCheck, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { usuariosDoPerfil } from '../actions'
import { RbacPerfilUsuarios } from '@/components/admin/rbac-perfil-usuarios'

export const dynamic = 'force-dynamic'

function prettifica(nome: string) {
  return nome.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function RbacPerfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await usuariosDoPerfil(id)
  if (!r.ok || !r.role) notFound()
  const role = r.role

  // Permissões deste perfil (resumo por módulo).
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()
  const { data: rp } = await svc.from('simulado_role_permissions').select('permission_id').eq('role_id', id)
  const permIds = (rp ?? []).map((x: any) => x.permission_id).filter(Boolean)
  const porModulo = new Map<string, string[]>()
  if (permIds.length) {
    const { data: pms } = await svc.from('simulado_permissions').select('resource, action').in('id', permIds)
    for (const p of pms ?? []) {
      const arr = porModulo.get((p as any).resource) ?? []
      arr.push((p as any).action)
      porModulo.set((p as any).resource, arr)
    }
  }

  return (
    <div className="animate-page space-y-5">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5">
          <Link href="/admin/rbac" className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'shrink-0')}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"><ShieldCheck className="h-7 w-7" /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight">{prettifica(role.nome)}</h1>
              {role.is_sistema && <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">sistema</span>}
            </div>
            <p className="truncate text-muted-foreground">{role.descricao || `Perfil ${role.nome}`}</p>
          </div>
          <Link href={`/admin/rbac?perfil=${role.id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'ml-auto')}>
            <KeyRound className="mr-2 h-3.5 w-3.5" /> Editar permissões
          </Link>
        </div>
      </div>

      {/* Permissões (resumo) */}
      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" /> Permissões deste perfil</div>
        {porModulo.size === 0 ? (
          <p className="text-sm text-muted-foreground">Sem permissões atribuídas. Use <b>Editar permissões</b> para configurar na matriz.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {[...porModulo.entries()].sort().map(([mod, acoes]) => (
              <span key={mod} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
                <b>{mod}</b><span className="text-muted-foreground">{acoes.sort().join(', ')}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Usuários add/remover */}
      <RbacPerfilUsuarios roleId={role.id} membros={r.membros ?? []} disponiveis={r.disponiveis ?? []} />
    </div>
  )
}
