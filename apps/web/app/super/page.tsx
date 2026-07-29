import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { Building2, LogIn, Share2, ServerCog, ArrowRight, ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

const AREAS = [
  { href: '/super/plataformas', label: 'Plataformas', desc: 'Criar, ativar e gerenciar as plataformas (tenants) do sistema.', icon: Building2 },
  { href: '/super/entrada', label: 'Entrada', desc: 'Aparência e comportamento da tela de login neutra, comum a todas.', icon: LogIn },
  { href: '/super/compartilhar', label: 'Compartilhar', desc: 'Copiar bancos, cadernos e estudantes de uma plataforma para outra.', icon: Share2 },
  { href: '/super/sistema', label: 'Sistema', desc: 'Prontidão do sistema e verificações gerais de saúde.', icon: ServerCog },
]

export default async function SuperHome() {
  const svc = createAdminClient()
  const { data: tenants } = await svc.from('simulado_tenants').select('id, ativo')
  const total = tenants?.length ?? 0
  const ativas = (tenants ?? []).filter((t) => t.ativo).length

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Console do super-admin</h1>
          <p className="text-muted-foreground">Manutenção, configuração e criação das plataformas — uma área independente, fora de qualquer plataforma.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Plataformas ativas</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">{ativas}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Total cadastradas</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">{total}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {AREAS.map((a) => (
          <Link key={a.href} href={a.href}
            className="group flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><a.icon className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">{a.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{a.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
