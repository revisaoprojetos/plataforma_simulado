import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { PlataformaGerenciar } from '@/components/super/plataforma-gerenciar'
import { ArrowLeft, Building2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PlataformaConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const svc = createAdminClient()

  const { data: t } = await svc
    .from('simulado_tenants')
    .select('id, nome, slug, plano, ativo, dominio')
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

  const [{ count: usuarios }, { count: estudantes }, { count: simulados }] = await Promise.all([
    svc.from('simulado_tenant_acessos').select('user_id', { count: 'exact', head: true }).eq('tenant_id', id),
    svc.from('simulado_estudantes').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    svc.from('simulado_simulados').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
  ])

  return (
    <div className="space-y-6">
      <div>
        <Link href="/super/plataformas" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Plataformas</Link>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight">{t.nome}</h1>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${t.ativo ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                {t.ativo ? 'Ativa' : 'Oculta'}
              </span>
            </div>
            <p className="font-mono text-sm text-muted-foreground">{t.slug}</p>
          </div>
        </div>
      </div>

      <PlataformaGerenciar
        id={t.id}
        nome={t.nome}
        slug={t.slug}
        plano={t.plano}
        ativo={t.ativo}
        dominio={t.dominio ?? null}
        usuarios={usuarios ?? 0}
        estudantes={estudantes ?? 0}
        simulados={simulados ?? 0}
      />
    </div>
  )
}
