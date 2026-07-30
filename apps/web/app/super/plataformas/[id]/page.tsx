import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { PlataformaTabs } from '@/components/super/plataforma-tabs'
import { listarAdministradores } from '@/app/admin/administradores/actions'
import { ArrowLeft, Building2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PlataformaConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const svc = createAdminClient()

  const { data: t } = await svc
    .from('simulado_tenants')
    .select('id, nome, slug, plano, ativo, tema, dominio')
    .eq('id', id)
    .maybeSingle()

  if (!t) {
    return (
      <div className="space-y-4">
        <Link href="/super/plataformas" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Plataforma não encontrada.</div>
      </div>
    )
  }

  const tema = (t.tema as Record<string, unknown> | null) ?? {}
  const somenteAdmin = !!tema.somente_admin
  const somenteSuper = !!tema.somente_super

  const [{ count: usuarios }, { count: estudantes }, { count: simulados }, rbac] = await Promise.all([
    svc.from('simulado_tenant_acessos').select('user_id', { count: 'exact', head: true }).eq('tenant_id', id),
    svc.from('simulado_estudantes').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    svc.from('simulado_simulados').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    listarAdministradores(id),
  ])

  // Badge de estado (4 valores): Ativa (todos) · Só admin · Só super-admin · Oculta.
  const estado = t.ativo
    ? { label: 'Ativa', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' }
    : somenteSuper
      ? { label: 'Só super-admin', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400' }
      : somenteAdmin
        ? { label: 'Só admin', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' }
        : { label: 'Oculta', cls: 'bg-muted text-muted-foreground' }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/super/plataformas" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Plataformas</Link>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight">{t.nome}</h1>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${estado.cls}`}>{estado.label}</span>
            </div>
            <p className="font-mono text-sm text-muted-foreground">{t.slug}</p>
          </div>
        </div>
      </div>

      <PlataformaTabs
        geral={{
          id: t.id,
          nome: t.nome,
          slug: t.slug,
          plano: t.plano,
          ativo: t.ativo,
          somenteAdmin,
          somenteSuper,
          dominio: t.dominio ?? null,
          usuarios: usuarios ?? 0,
          estudantes: estudantes ?? 0,
          simulados: simulados ?? 0,
        }}
        membros={rbac.membros ?? []}
        cargos={rbac.cargos ?? []}
        rbacErro={rbac.ok ? null : (rbac.error ?? 'Não foi possível carregar os acessos.')}
      />
    </div>
  )
}
