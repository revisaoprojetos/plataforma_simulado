import { getCurrentAccess } from '@/lib/auth/permissions'
import { getManutencaoSistema } from '@/lib/sistema/manutencao'
import { getManutencaoAreas, getManutencaoAreasLiberados, getManutencaoAluno } from '@/lib/sistema/manutencao-areas-server'
import { getTestadoresGlobais, getWorkspaceGrupos } from '@/lib/sistema/testadores-globais'
import { resolverNomesAdmins, resolverNomesEstudantes, listarGruposWorkspace } from './actions'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'
import { SemPermissao } from '@/components/ui/alert-box'
import { SistemaTabs } from './sistema-tabs'

export const dynamic = 'force-dynamic'

export default async function SistemaPage() {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('configuracoes:view'))) {
    return (
      <div className="space-y-4">
        <CabecalhoArea titulo="Sistema" semBarraSetor />
        <SemPermissao>Sem permissão para acessar as configurações do sistema.</SemPermissao>
      </div>
    )
  }

  const [manutencao, adminAtivos, adminLiberados, alunoBloco, wsEmails, wsGrupos, wsGruposDisp] = await Promise.all([
    getManutencaoSistema(), getManutencaoAreas(), getManutencaoAreasLiberados(), getManutencaoAluno(),
    getTestadoresGlobais(), getWorkspaceGrupos(), listarGruposWorkspace(),
  ])
  const podeEditarWorkspace = access.isAdmin || access.permissions.includes('configuracoes:manage')
  // Resolve os nomes dos liberados (admins + estudantes) p/ os chips/contagens dos cards.
  const idsAdmin = [...new Set(Object.values(adminLiberados).flat())]
  const idsAluno = [...new Set(Object.values(alunoBloco.liberados).flat())]
  const [nomesAdmin, nomesAluno] = await Promise.all([resolverNomesAdmins(idsAdmin), resolverNomesEstudantes(idsAluno)])

  return (
    <div className="space-y-6">
      <CabecalhoArea titulo="Sistema" descricao="Manutenção da plataforma e funções essenciais de operação." />

      <SistemaTabs
        manutencao={manutencao}
        admin={{ ativos: adminAtivos, liberados: adminLiberados, nomes: nomesAdmin }}
        aluno={{ ativos: alunoBloco.ativos, liberados: alunoBloco.liberados, nomes: nomesAluno, modos: alunoBloco.modos }}
        workspace={{ emails: wsEmails, grupos: wsGrupos, gruposDisponiveis: wsGruposDisp, podeEditar: podeEditarWorkspace }}
      />
    </div>
  )
}
