import { checkPermission } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { listarSolicitacoes } from './actions'
import { LgpdClient } from './lgpd-client'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'

export const dynamic = 'force-dynamic'

export default async function LgpdPage() {
  if (!(await checkPermission('estudantes:view'))) return <div className="p-6"><SemPermissao>Você não tem permissão para acessar a área de LGPD.</SemPermissao></div>

  const r = await listarSolicitacoes()

  return (
    <div className="space-y-5">
      <CabecalhoArea
        titulo="LGPD — direitos do titular"
        descricao="Solicitações de acesso, portabilidade e exclusão de dados dos estudantes. Exporte os dados ou anonimize o titular; tudo é auditado."
      />
      <LgpdClient inicial={r.solicitacoes ?? []} tabelaAusente={!!r.tabelaAusente} />
    </div>
  )
}
