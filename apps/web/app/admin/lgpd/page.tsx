import { checkPermission } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { ShieldCheck } from 'lucide-react'
import { listarSolicitacoes } from './actions'
import { LgpdClient } from './lgpd-client'

export const dynamic = 'force-dynamic'

export default async function LgpdPage() {
  if (!(await checkPermission('estudantes:view'))) return <div className="p-6"><SemPermissao>Você não tem permissão para acessar a área de LGPD.</SemPermissao></div>

  const r = await listarSolicitacoes()

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-1">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><ShieldCheck className="h-6 w-6 text-primary" /> LGPD — direitos do titular</h1>
        <p className="mt-1 text-sm text-muted-foreground">Solicitações de acesso, portabilidade e exclusão de dados dos estudantes. Exporte os dados ou anonimize o titular; tudo é auditado.</p>
      </div>
      <LgpdClient inicial={r.solicitacoes ?? []} tabelaAusente={!!r.tabelaAusente} />
    </div>
  )
}
