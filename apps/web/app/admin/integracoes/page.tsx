import Link from 'next/link'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { ShieldAlert, DownloadCloud, CreditCard, ChevronRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

const PROVIDERS = [
  { id: 'curseduca', nome: 'Curseduca', desc: 'Importa alunos e grupos de acesso (pull).', cor: '#7c3aed', Icon: DownloadCloud },
  { id: 'guru', nome: 'Guru', desc: 'Compras e assinaturas (webhook em tempo real).', cor: '#0ea5e9', Icon: CreditCard },
] as const

export default async function IntegracoesPage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('estudantes:view') || access.permissions.includes('estudantes:create')
  if (!pode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Integrações</h1>
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300"><ShieldAlert className="h-4 w-4" /> Sem permissão.</div>
      </div>
    )
  }

  // Status por provedor (configurado/ativo).
  const svc = createAdminClient()
  const { data: cfgs } = await svc.from('simulado_integracao_config').select('provider, ativo').eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
  const statusPorProvider = new Map((cfgs ?? []).map((c: any) => [c.provider, c.ativo]))

  return (
    <div className="animate-page space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrações</h1>
        <p className="text-muted-foreground">Conecte plataformas externas (Curseduca, Guru) para importar alunos e conceder acesso automaticamente.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROVIDERS.map(({ id, nome, desc, cor, Icon }) => {
          const configurado = statusPorProvider.has(id)
          const ativo = statusPorProvider.get(id)
          return (
            <Link key={id} href={`/admin/integracoes/${id}`}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><Icon className="h-5 w-5" /></span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${!configurado ? 'bg-muted text-muted-foreground' : ativo ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}>
                  {!configurado ? 'Não configurado' : ativo ? 'Ativo' : 'Pausado'}
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold">{nome}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
              <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary">Configurar <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
