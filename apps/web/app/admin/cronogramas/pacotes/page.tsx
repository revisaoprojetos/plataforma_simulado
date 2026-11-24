import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { SemPermissao } from '@/components/ui/alert-box'
import { checkPermission } from '@/lib/auth/permissions'
import { listarPacotes } from './actions'
import { PacotesClient } from './pacotes-client'

export const dynamic = 'force-dynamic'

export default async function PacotesPage() {
  const [r, podeLiberar] = await Promise.all([listarPacotes(), checkPermission('cronogramas:liberar')])

  return (
    <div className="animate-page space-y-6">
      <TituloTela titulo="Acessos" descricao="É por aqui que o aluno recebe acesso: cada grupo de acesso reúne cronogramas e é liberado para grupos de alunos ou para alunos avulsos." />


      {!r.ok ? <SemPermissao>{r.error ?? 'Não foi possível carregar os pacotes.'}</SemPermissao> : <PacotesClient inicial={r.itens ?? []} podeLiberar={podeLiberar} />}
    </div>
  )
}
