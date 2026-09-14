import { getCurrentAccess } from '@/lib/auth/permissions'
import { getManutencaoSistema } from '@/lib/sistema/manutencao'
import { getManutencaoAreas, getManutencaoAreasLiberados, getManutencaoAluno } from '@/lib/sistema/manutencao-areas-server'
import { resolverNomesAdmins, resolverNomesEstudantes } from './actions'
import { SemPermissao } from '@/components/ui/alert-box'
import { ServerCog } from 'lucide-react'
import { SistemaTabs } from './sistema-tabs'

export const dynamic = 'force-dynamic'

export default async function SistemaPage() {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('configuracoes:view'))) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Sistema</h1>
        <SemPermissao>Sem permissão para acessar as configurações do sistema.</SemPermissao>
      </div>
    )
  }

  const [manutencao, adminAtivos, adminLiberados, alunoBloco] = await Promise.all([
    getManutencaoSistema(), getManutencaoAreas(), getManutencaoAreasLiberados(), getManutencaoAluno(),
  ])
  // Resolve os nomes dos liberados (admins + estudantes) p/ os chips/contagens dos cards.
  const idsAdmin = [...new Set(Object.values(adminLiberados).flat())]
  const idsAluno = [...new Set(Object.values(alunoBloco.liberados).flat())]
  const [nomesAdmin, nomesAluno] = await Promise.all([resolverNomesAdmins(idsAdmin), resolverNomesEstudantes(idsAluno)])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ServerCog className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sistema</h1>
          <p className="text-muted-foreground">Manutenção da plataforma e funções essenciais de operação.</p>
        </div>
      </div>

      <SistemaTabs
        manutencao={manutencao}
        admin={{ ativos: adminAtivos, liberados: adminLiberados, nomes: nomesAdmin }}
        aluno={{ ativos: alunoBloco.ativos, liberados: alunoBloco.liberados, nomes: nomesAluno }}
      />
    </div>
  )
}
