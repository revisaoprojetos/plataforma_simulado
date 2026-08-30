import { Package } from 'lucide-react'
import { SemPermissao } from '@/components/ui/alert-box'
import { listarPacotes } from './actions'
import { PacotesClient } from './pacotes-client'

export const dynamic = 'force-dynamic'

export default async function PacotesPage() {
  const r = await listarPacotes()

  return (
    <div className="animate-page space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Package className="h-6 w-6 text-primary" />
          Pacotes de cronogramas
        </h1>
        <p className="text-muted-foreground">
          É por aqui que o aluno recebe acesso: o pacote reúne cronogramas e é liberado para grupos de
          alunos ou para alunos avulsos.
        </p>
      </div>

      {!r.ok ? <SemPermissao>{r.error ?? 'Não foi possível carregar os pacotes.'}</SemPermissao> : <PacotesClient inicial={r.itens ?? []} />}
    </div>
  )
}
